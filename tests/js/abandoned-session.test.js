/**
 * Abandoned sessions — a workout the lifter edited and then walked away from.
 *
 * The bug: iOS kills a backgrounded tab, the installed app relaunches to Home,
 * and the session's URL is gone. The row is still in IndexedDB, but nothing can
 * reach it, so a workout that was lifted and never Completed was as good as
 * lost. Now an edited session left open is completed for the lifter — once it
 * has sat an hour, or the moment another session is started.
 *
 * Two things this must never do, and the last group pins both down: auto-save
 * a session nobody touched (it is pre-filled from lastSession, so saving it
 * would plot lifts that never happened), and alter anything already on the
 * phone when this build first runs.
 *
 * Run with: node --test tests/js/
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { makeClient, createExercise, createRoutine, recordSession } = require("./helpers.js");

const { createStore } = require(path.join(__dirname, "../../app/static/js/store.js"));
const { handleRequest, nowISO } = require(path.join(__dirname, "../../app/static/js/local-api.js"));

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// 7pm local, built from local parts. Every expected timestamp below is derived
// through nowISO, never hardcoded from a UTC epoch, so the suite reads the same
// on a Pacific laptop and a UTC CI runner.
const SEVEN_PM = new Date(2026, 9, 5, 19, 0).getTime();
const localISO = (ms) => nowISO(() => ms);

/** Freeze the clock at `ms`; `t.mock.timers.tick` moves it from there. */
const clockAt = (t, ms = SEVEN_PM) => t.mock.timers.enable({ apis: ["Date"], now: ms });

/** One exercise with one instance that has history, in a routine. */
function gym(c, lastSession = [{ weight: 135, reps: 10 }]) {
    const exercise = createExercise(c.store, "Chest Press");
    const instance = c.store.add("instances", {
        exercise_id: exercise.id,
        name: "Cybex",
        last_session_data: lastSession,
    });
    const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);
    return { exercise, instance, routine };
}

const start = (c, routine) => c.post("/api/sessions", { routine_id: routine.id }).body;
const sweep = (c) => c.post("/api/sessions/complete-abandoned").body.sessions;
const row = (c, id) => c.store.get("sessions", id);
const lastSessionOf = (c, instance) => c.store.get("instances", instance.id).last_session_data;
const firstSetId = (session) => session.entries[0].sets[0].id;

test("what counts as an edit", async (t) => {
    await t.test("an untouched session is never saved, and never deleted", (t) => {
        clockAt(t);
        const c = makeClient();
        const { instance, routine } = gym(c);
        const session = start(c, routine);

        t.mock.timers.tick(30 * DAY);

        assert.deepEqual(sweep(c), []);
        assert.equal(row(c, session.id).status, "in_progress");
        assert.equal(row(c, session.id).completed_at, null);
        assert.deepEqual(lastSessionOf(c, instance), [{ weight: 135, reps: 10 }]);
        assert.equal(c.get(`/api/sessions/${session.id}`).body.entries[0].sets.length, 1);
    });

    const edits = {
        "changing a weight": (c, s) => c.put(`/api/session-sets/${firstSetId(s)}`, { weight: 140 }),
        "changing reps": (c, s) => c.put(`/api/session-sets/${firstSetId(s)}`, { reps: 8 }),
        "ticking a set": (c, s) => c.put(`/api/session-sets/${firstSetId(s)}`, { completed: true }),
        "adding a set": (c, s) => c.post(`/api/session-entries/${s.entries[0].id}/sets`, { weight: 0, reps: 0 }),
        "removing a set": (c, s) => c.delete(`/api/session-sets/${firstSetId(s)}`),
    };

    for (const [name, edit] of Object.entries(edits)) {
        await t.test(`${name} counts`, (t) => {
            clockAt(t);
            const c = makeClient();
            const { routine } = gym(c);
            const session = start(c, routine);

            edit(c, session);
            t.mock.timers.tick(61 * MINUTE);

            assert.deepEqual(sweep(c).map((s) => s.id), [session.id]);
            assert.equal(row(c, session.id).status, "completed");
        });
    }

    await t.test("re-sending a set's own values does not count", (t) => {
        // session.js commits on blur as well as change, so tapping into a
        // field and out again sends a PUT with the value already there.
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);

        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 135 });
        c.put(`/api/session-sets/${firstSetId(session)}`, { reps: 10 });
        c.put(`/api/session-sets/${firstSetId(session)}`, { completed: false });
        t.mock.timers.tick(2 * HOUR);

        assert.deepEqual(sweep(c), []);
        assert.equal(row(c, session.id).last_edited_at, null);
    });

    await t.test("a blur after a real edit does not move the edit time", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);

        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });
        t.mock.timers.tick(10 * MINUTE);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });

        assert.equal(row(c, session.id).last_edited_at, localISO(SEVEN_PM));
    });

    await t.test("choosing an instance does not count", (t) => {
        // It lays out last time's numbers and nothing else: a session left in
        // that state records no lift. The UI calls prefill; switch is the
        // older route to the same place.
        clockAt(t);
        const c = makeClient();
        const exercise = createExercise(c.store, "Chest Press");
        const cybex = c.store.add("instances", {
            exercise_id: exercise.id, name: "Cybex", last_session_data: [{ weight: 135, reps: 10 }],
        });
        const hammer = c.store.add("instances", {
            exercise_id: exercise.id, name: "Hammer", last_session_data: [{ weight: 90, reps: 12 }],
        });
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);
        const session = start(c, routine);
        const entryId = session.entries[0].id;

        c.post(`/api/session-entries/${entryId}/prefill`, { instance_id: cybex.id });
        c.put(`/api/session-entries/${entryId}/instance`, { instance_id: hammer.id });
        t.mock.timers.tick(2 * HOUR);

        assert.deepEqual(sweep(c), []);
        assert.equal(row(c, session.id).last_edited_at, null);
    });

    await t.test("reordering does not count", (t) => {
        clockAt(t);
        const c = makeClient();
        const routine = createRoutine(c.store, "Push Day", ["Squat", "Bench"]);
        const session = start(c, routine);
        const [squat, bench] = session.entries.map((e) => e.id);

        c.put(`/api/sessions/${session.id}/entry-order`, { entry_ids: [bench, squat] });
        t.mock.timers.tick(2 * HOUR);

        assert.deepEqual(sweep(c), []);
        assert.equal(row(c, session.id).last_edited_at, null);
    });

    await t.test("editing a completed session leaves its row alone", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);
        c.put(`/api/sessions/${session.id}/complete`);
        const before = { ...row(c, session.id) };

        t.mock.timers.tick(5 * MINUTE);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });

        assert.deepEqual(row(c, session.id), before);
    });
});

test("when it is saved", async (t) => {
    await t.test("an hour after the last edit, not before", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });

        t.mock.timers.tick(59 * MINUTE);
        assert.deepEqual(sweep(c), []);

        t.mock.timers.tick(2 * MINUTE);
        assert.deepEqual(sweep(c).map((s) => s.id), [session.id]);
    });

    await t.test("the hour runs from the last edit, not from the start", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);

        t.mock.timers.tick(50 * MINUTE);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });
        t.mock.timers.tick(40 * MINUTE);

        assert.deepEqual(sweep(c), []);
    });

    await t.test("starting another session saves an edited one straight away", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const first = start(c, routine);
        c.put(`/api/session-sets/${firstSetId(first)}`, { weight: 140 });

        t.mock.timers.tick(MINUTE);
        start(c, routine);

        assert.equal(row(c, first.id).status, "completed");
    });

    await t.test("starting another session leaves an untouched one alone", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const first = start(c, routine);

        start(c, routine);

        assert.equal(row(c, first.id).status, "in_progress");
    });

    await t.test("the next session is pre-filled from the one just saved", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const first = start(c, routine);
        c.put(`/api/session-sets/${firstSetId(first)}`, { weight: 140 });

        const second = start(c, routine);

        assert.equal(second.entries[0].sets[0].weight, 140);
    });

    await t.test("a start that fails saves nothing", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });

        assert.equal(c.post("/api/sessions", { routine_id: 9999 }).status, 404);
        assert.equal(row(c, session.id).status, "in_progress");
    });

    await t.test("sweeping twice saves once", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });
        t.mock.timers.tick(2 * HOUR);

        sweep(c);
        const after = { ...row(c, session.id) };
        t.mock.timers.tick(DAY);

        assert.deepEqual(sweep(c), []);
        assert.deepEqual(row(c, session.id), after);
    });

    await t.test("a session whose routine was deleted is still saved", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });
        c.delete(`/api/routines/${routine.id}`);
        t.mock.timers.tick(2 * HOUR);

        assert.deepEqual(sweep(c).map((s) => s.id), [session.id]);
    });
});

test("what an auto-save writes", async (t) => {
    await t.test("it is dated at the last edit, not when it was found", (t) => {
        clockAt(t);
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);
        t.mock.timers.tick(10 * MINUTE);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });

        t.mock.timers.tick(3 * DAY);
        const [saved] = sweep(c);

        assert.equal(saved.completed_at, localISO(SEVEN_PM + 10 * MINUTE));
        assert.equal(saved.status, "completed");
    });

    await t.test("it writes lastSession the way Complete does", (t) => {
        // Every set as laid out, ticked or not — CONTEXT.md flow 4.
        clockAt(t);
        const c = makeClient();
        const { instance, routine } = gym(c, [{ weight: 135, reps: 10 }, { weight: 135, reps: 8 }]);
        const session = start(c, routine);
        const [top, back] = session.entries[0].sets.map((s) => s.id);
        c.put(`/api/session-sets/${top}`, { weight: 145, completed: true });
        c.put(`/api/session-sets/${back}`, { reps: 6 });

        t.mock.timers.tick(2 * HOUR);
        sweep(c);

        assert.deepEqual(lastSessionOf(c, instance), [
            { weight: 145, reps: 10 },
            { weight: 135, reps: 6 },
        ]);
    });

    await t.test("Progress plots it at the last edit, in order", (t) => {
        clockAt(t);
        const c = makeClient();
        const { exercise, instance, routine } = gym(c);
        recordSession(c.store, exercise, instance, [[130, 10]], localISO(SEVEN_PM - DAY));
        const session = start(c, routine);
        t.mock.timers.tick(10 * MINUTE);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });
        t.mock.timers.tick(2 * DAY);
        recordSession(c.store, exercise, instance, [[150, 5]], localISO(Date.now()));

        sweep(c);
        const points = c.get(`/api/exercises/${exercise.id}/progress`).body.instances[0].points;

        assert.deepEqual(points.map((p) => p.weight), [130, 140, 150]);
        assert.equal(points[1].at, localISO(SEVEN_PM + 10 * MINUTE));
    });

    await t.test("it never overwrites a newer lastSession", (t) => {
        clockAt(t);
        const c = makeClient();
        const { exercise, instance, routine } = gym(c);
        const session = start(c, routine);
        t.mock.timers.tick(10 * MINUTE);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });

        // A later workout on the same instance was completed meanwhile.
        recordSession(c.store, exercise, instance, [[150, 5]], localISO(SEVEN_PM + HOUR));
        c.store.put("instances", {
            ...c.store.get("instances", instance.id),
            last_session_data: [{ weight: 150, reps: 5 }],
        });

        t.mock.timers.tick(2 * HOUR);
        sweep(c);

        assert.equal(row(c, session.id).status, "completed");
        assert.deepEqual(lastSessionOf(c, instance), [{ weight: 150, reps: 5 }]);
    });

    await t.test("it does write when its edit is the newest", (t) => {
        clockAt(t);
        const c = makeClient();
        const { exercise, instance, routine } = gym(c);
        recordSession(c.store, exercise, instance, [[135, 10]], localISO(SEVEN_PM - HOUR));
        const session = start(c, routine);
        c.put(`/api/session-sets/${firstSetId(session)}`, { weight: 140 });

        t.mock.timers.tick(2 * HOUR);
        sweep(c);

        assert.deepEqual(lastSessionOf(c, instance), [{ weight: 140, reps: 10 }]);
    });

    await t.test("two abandoned sessions end on the newer one's numbers", (t) => {
        // The newer edit sits on the lower id, so processing in id order would
        // leave the older numbers behind.
        clockAt(t);
        const c = makeClient();
        const { exercise, instance } = gym(c);
        abandoned(c.store, exercise, instance, [[145, 8]], localISO(SEVEN_PM + 30 * MINUTE));
        abandoned(c.store, exercise, instance, [[140, 10]], localISO(SEVEN_PM + 10 * MINUTE));

        t.mock.timers.tick(3 * HOUR);

        assert.equal(sweep(c).length, 2);
        assert.deepEqual(lastSessionOf(c, instance), [{ weight: 145, reps: 8 }]);
    });
});

test("data already on the phone", async (t) => {
    await t.test("a session started before this build is never auto-saved", (t) => {
        clockAt(t);
        const c = makeClient();
        const { exercise, instance } = gym(c);
        // Exactly the row the previous build wrote: no last_edited_at key at
        // all — and these sets were plainly edited, which is the point. There
        // is no telling an edited old row from an untouched one.
        const old = recordSession(c.store, exercise, instance, [[140, 10]], null, "in_progress");
        const before = { ...row(c, old.id) };

        t.mock.timers.tick(30 * DAY);

        assert.deepEqual(sweep(c), []);
        assert.deepEqual(row(c, old.id), before);
        assert.deepEqual(lastSessionOf(c, instance), [{ weight: 135, reps: 10 }]);
    });

    await t.test("editing one does not make it eligible", (t) => {
        clockAt(t);
        const c = makeClient();
        const { exercise, instance } = gym(c);
        const old = recordSession(c.store, exercise, instance, [[140, 10]], null, "in_progress");
        const setId = c.get(`/api/sessions/${old.id}`).body.entries[0].sets[0].id;

        c.put(`/api/session-sets/${setId}`, { weight: 150 });
        t.mock.timers.tick(2 * HOUR);

        assert.deepEqual(sweep(c), []);
        assert.equal("last_edited_at" in row(c, old.id), false);
        assert.equal(row(c, old.id).status, "in_progress");
    });

    await t.test("starting a session leaves one from before this build alone", (t) => {
        clockAt(t);
        const c = makeClient();
        const { exercise, instance, routine } = gym(c);
        const old = recordSession(c.store, exercise, instance, [[140, 10]], null, "in_progress");
        const before = { ...row(c, old.id) };

        start(c, routine);

        assert.deepEqual(row(c, old.id), before);
    });

    await t.test("the first launch of this build writes nothing", () => {
        // Boot the store the way persist.js does — load, not add — from a
        // database the previous build could have written, then make every call
        // Home and Progress make on first paint. Not one write may come out.
        const writes = [];
        const store = createStore((table, op, record) => writes.push({ table, op, record }));
        const tables = previousBuildDatabase();
        for (const [name, records] of Object.entries(tables)) store.load(name, records);
        const snapshot = JSON.parse(JSON.stringify(tables));

        const sweepResponse = handleRequest(store, "POST", "/api/sessions/complete-abandoned");
        handleRequest(store, "GET", "/api/routines");
        handleRequest(store, "GET", "/api/exercises");
        handleRequest(store, "GET", "/api/exercises/1/progress");

        assert.deepEqual(sweepResponse.body, { sessions: [] });
        assert.deepEqual(writes, []);
        for (const name of Object.keys(tables)) {
            assert.deepEqual(store.all(name), snapshot[name], `${name} is unchanged`);
        }
    });

    await t.test("nothing is ever deleted", (t) => {
        clockAt(t);
        const writes = [];
        const store = createStore((table, op) => writes.push({ table, op }));
        const c = {
            store,
            post: (url, body) => handleRequest(store, "POST", url, body),
            put: (url, body) => handleRequest(store, "PUT", url, body),
        };
        const { routine } = gym(c);

        const edited = start(c, routine);
        start(c, routine); // an untouched one, left behind
        c.put(`/api/session-sets/${firstSetId(edited)}`, { weight: 140 });
        t.mock.timers.tick(MINUTE);
        start(c, routine);
        t.mock.timers.tick(30 * DAY);
        sweep(c);

        assert.deepEqual(writes.filter((w) => w.op === "delete"), []);
        assert.equal(store.all("sessions").length, 3);
    });

    await t.test("a new session is tracked from the start", () => {
        const c = makeClient();
        const { routine } = gym(c);
        const session = start(c, routine);

        assert.equal(Object.prototype.hasOwnProperty.call(row(c, session.id), "last_edited_at"), true);
        assert.equal(row(c, session.id).last_edited_at, null);
    });
});

/** An in-progress, tracked session last edited at `editedAt`, written straight to the store. */
function abandoned(store, exercise, instance, sets, editedAt) {
    const session = recordSession(store, exercise, instance, sets, null, "in_progress");
    return store.put("sessions", { ...session, started_at: editedAt, last_edited_at: editedAt });
}

/**
 * Rows the previous build could have left behind: two routines, history on two
 * instances, a completed session, and two in-progress sessions — one whose sets
 * were edited and ticked, one untouched — neither carrying last_edited_at,
 * because no build before this one wrote it.
 */
function previousBuildDatabase() {
    return {
        exercises: [
            { id: 1, name: "Chest Press" },
            { id: 2, name: "Row" },
        ],
        instances: [
            { id: 1, exercise_id: 1, name: "Cybex", last_session_data: [{ weight: 135, reps: 10 }] },
            { id: 2, exercise_id: 2, name: "Cable", last_session_data: [{ weight: 90, reps: 12 }] },
        ],
        routines: [
            { id: 1, name: "Push Day", created_at: "2026-09-01T08:00:00.000" },
            { id: 2, name: "Pull Day", created_at: "2026-09-02T08:00:00.000" },
        ],
        routine_exercises: [
            { id: 1, routine_id: 1, exercise_id: 1, position: 0 },
            { id: 2, routine_id: 2, exercise_id: 2, position: 0 },
        ],
        sessions: [
            {
                id: 1, routine_id: 1, routine_name: "Push Day",
                started_at: "2026-09-20T18:00:00.000", completed_at: "2026-09-20T19:00:00.000",
                status: "completed",
            },
            {
                id: 2, routine_id: 1, routine_name: "Push Day",
                started_at: "2026-09-27T18:00:00.000", completed_at: null, status: "in_progress",
            },
            {
                id: 3, routine_id: 2, routine_name: "Pull Day",
                started_at: "2026-09-28T18:00:00.000", completed_at: null, status: "in_progress",
            },
        ],
        session_entries: [
            { id: 1, session_id: 1, exercise_id: 1, instance_id: 1, position: 0 },
            { id: 2, session_id: 2, exercise_id: 1, instance_id: 1, position: 0 },
            { id: 3, session_id: 3, exercise_id: 2, instance_id: 2, position: 0 },
        ],
        session_sets: [
            { id: 1, entry_id: 1, weight: 135, reps: 10, completed: true, position: 0 },
            { id: 2, entry_id: 2, weight: 145, reps: 8, completed: true, position: 0 },
            { id: 3, entry_id: 3, weight: 90, reps: 12, completed: false, position: 0 },
        ],
    };
}
