/**
 * Tests for the on-device API — the JS port of tests/test_api.py.
 *
 * Kept case-for-case with the Python suite on purpose. These two files are how
 * we know app/static/js/local-api.js and app/routes/api.py still answer alike;
 * a test that exists on one side and not the other is a gap, not a style.
 *
 * Run with: node --test tests/js/
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    makeClient,
    createExercise,
    createInstance,
    createRoutine,
    recordSession,
} = require("./helpers.js");

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

test("exercises API", async (t) => {
    await t.test("list is empty to begin with", () => {
        const c = makeClient();
        const resp = c.get("/api/exercises");
        assert.equal(resp.status, 200);
        assert.deepEqual(resp.body, []);
    });

    await t.test("create", () => {
        const c = makeClient();
        const resp = c.post("/api/exercises", { name: "Bench Press" });
        assert.equal(resp.status, 201);
        assert.equal(resp.body.name, "Bench Press");
        assert.deepEqual(resp.body.instances, []);
    });

    await t.test("create is idempotent, case-insensitively", () => {
        const c = makeClient();
        c.post("/api/exercises", { name: "Bench Press" });
        const resp = c.post("/api/exercises", { name: "bench press" });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.name, "Bench Press");
    });

    await t.test("create with no name", () => {
        assert.equal(makeClient().post("/api/exercises", {}).status, 400);
    });

    await t.test("create with empty name", () => {
        assert.equal(makeClient().post("/api/exercises", { name: "  " }).status, 400);
    });

    await t.test("list", () => {
        const c = makeClient();
        c.post("/api/exercises", { name: "Bench Press" });
        c.post("/api/exercises", { name: "Squat" });
        assert.equal(c.get("/api/exercises").body.length, 2);
    });

    await t.test("list is ordered by name", () => {
        const c = makeClient();
        c.post("/api/exercises", { name: "Squat" });
        c.post("/api/exercises", { name: "Bench Press" });
        assert.deepEqual(
            c.get("/api/exercises").body.map((e) => e.name),
            ["Bench Press", "Squat"],
        );
    });

    await t.test("delete", () => {
        const c = makeClient();
        const id = c.post("/api/exercises", { name: "Bench Press" }).body.id;
        assert.equal(c.delete(`/api/exercises/${id}`).status, 204);
        assert.deepEqual(c.get("/api/exercises").body, []);
    });

    await t.test("delete, not found", () => {
        assert.equal(makeClient().delete("/api/exercises/9999").status, 404);
    });

    await t.test("delete takes its instances but leaves past entries standing", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const inst = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, inst, [[185, 8]], "2026-03-03T00:00:00");

        c.delete(`/api/exercises/${ex.id}`);

        assert.equal(c.store.all("instances").length, 0);
        const entry = c.store.all("session_entries")[0];
        assert.equal(entry.exercise_id, null);
        assert.equal(entry.instance_id, null);
    });
});

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

test("instances API", async (t) => {
    const withExercise = () => {
        const c = makeClient();
        const ex = c.post("/api/exercises", { name: "Chest Press" }).body;
        return { c, ex };
    };

    await t.test("create", () => {
        const { c, ex } = withExercise();
        const resp = c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" });
        assert.equal(resp.status, 201);
        assert.equal(resp.body.name, "Cybex");
        assert.equal(resp.body.exercise_id, ex.id);
        assert.equal(resp.body.last_session, null);
    });

    await t.test("create, exercise not found", () => {
        const c = makeClient();
        assert.equal(c.post("/api/exercises/9999/instances", { name: "Cybex" }).status, 404);
    });

    await t.test("create with no name", () => {
        const { c, ex } = withExercise();
        assert.equal(c.post(`/api/exercises/${ex.id}/instances`, {}).status, 400);
    });

    await t.test("create duplicate is idempotent", () => {
        const { c, ex } = withExercise();
        c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" });
        assert.equal(c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" }).status, 200);
    });

    await t.test("delete", () => {
        const { c, ex } = withExercise();
        const m = c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" }).body;
        assert.equal(c.delete(`/api/instances/${m.id}`).status, 204);
    });

    await t.test("delete, not found", () => {
        assert.equal(makeClient().delete("/api/instances/9999").status, 404);
    });

    await t.test("delete releases the entries that used it", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const inst = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, inst, [[185, 8]], "2026-03-03T00:00:00");

        c.delete(`/api/instances/${inst.id}`);

        assert.equal(c.store.all("session_entries")[0].instance_id, null);
    });

    await t.test("last-session with no data", () => {
        const { c, ex } = withExercise();
        const m = c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" }).body;
        assert.deepEqual(c.get(`/api/instances/${m.id}/last-session`).body.sets, []);
    });

    await t.test("last-session with data", () => {
        const { c, ex } = withExercise();
        const m = c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" }).body;
        c.store.put("instances", {
            ...c.store.get("instances", m.id),
            last_session_data: [{ weight: 135, reps: 10 }, { weight: 145, reps: 8 }],
        });

        const resp = c.get(`/api/instances/${m.id}/last-session`);
        assert.equal(resp.status, 200);
        assert.deepEqual(resp.body.sets, [
            { weight: 135, reps: 10 },
            { weight: 145, reps: 8 },
        ]);
    });

    await t.test("last-session, not found", () => {
        assert.equal(makeClient().get("/api/instances/9999/last-session").status, 404);
    });
});

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

test("routines API", async (t) => {
    await t.test("list is empty to begin with", () => {
        const resp = makeClient().get("/api/routines");
        assert.equal(resp.status, 200);
        assert.deepEqual(resp.body, []);
    });

    await t.test("create", () => {
        const c = makeClient();
        const resp = c.post("/api/routines", {
            name: "Push Day",
            exercises: [
                { name: "Bench Press", instances: [{ name: "Flat Bench" }] },
                { name: "Shoulder Press" },
            ],
        });
        assert.equal(resp.status, 201);
        assert.equal(resp.body.name, "Push Day");
        assert.equal(resp.body.exercises.length, 2);
        assert.equal(resp.body.exercises[0].name, "Bench Press");
        assert.equal(resp.body.exercises[0].instances.length, 1);
    });

    await t.test("create with no name", () => {
        assert.equal(makeClient().post("/api/routines", {}).status, 400);
    });

    await t.test("create skips a blank exercise name", () => {
        const c = makeClient();
        const resp = c.post("/api/routines", { name: "Push Day", exercises: [{ name: "  " }] });
        assert.equal(resp.status, 201);
        assert.equal(resp.body.exercises.length, 0);
    });

    await t.test("create reuses an existing exercise", () => {
        const c = makeClient();
        c.post("/api/exercises", { name: "Bench Press" });
        const resp = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        });
        assert.equal(resp.body.exercises.length, 1);
        assert.equal(c.get("/api/exercises").body.length, 1);
    });

    await t.test("create reuses an existing instance", () => {
        const c = makeClient();
        const ex = c.post("/api/exercises", { name: "Bench Press" }).body;
        c.post(`/api/exercises/${ex.id}/instances`, { name: "Flat Bench" });

        const resp = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press", instances: [{ name: "Flat Bench" }] }],
        });
        assert.equal(resp.body.exercises.length, 1);
        assert.equal(resp.body.exercises[0].instances.length, 1);

        const exercises = c.get("/api/exercises").body;
        assert.equal(exercises.length, 1);
        assert.equal(exercises[0].instances.length, 1);
        assert.equal(exercises[0].instances[0].name, "Flat Bench");
    });

    await t.test("list", () => {
        const c = makeClient();
        c.post("/api/routines", { name: "Push Day", exercises: [] });
        c.post("/api/routines", { name: "Pull Day", exercises: [] });
        assert.equal(c.get("/api/routines").body.length, 2);
    });

    await t.test("list puts the newest routine first", () => {
        const c = makeClient();
        c.post("/api/routines", { name: "Push Day", exercises: [] });
        c.post("/api/routines", { name: "Pull Day", exercises: [] });
        assert.deepEqual(
            c.get("/api/routines").body.map((r) => r.name),
            ["Pull Day", "Push Day"],
        );
    });

    await t.test("list carries a count, not the exercises", () => {
        const c = makeClient();
        c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }, { name: "Shoulder Press" }],
        });
        const [routine] = c.get("/api/routines").body;
        assert.equal(routine.exercise_count, 2);
        assert.equal("exercises" in routine, false);
    });

    await t.test("get", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;
        const resp = c.get(`/api/routines/${r.id}`);
        assert.equal(resp.status, 200);
        assert.equal(resp.body.name, "Push Day");
        assert.equal(resp.body.exercises.length, 1);
    });

    await t.test("get, not found", () => {
        assert.equal(makeClient().get("/api/routines/9999").status, 404);
    });

    await t.test("update", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;

        const resp = c.put(`/api/routines/${r.id}`, {
            name: "Push Day Updated",
            exercises: [{ name: "Bench Press" }, { name: "Shoulder Press" }],
        });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.name, "Push Day Updated");
        assert.equal(resp.body.exercises.length, 2);
    });

    await t.test("update keeps the order the lifter set", () => {
        const c = makeClient();
        const r = c.post("/api/routines", { name: "Push Day", exercises: [] }).body;
        c.put(`/api/routines/${r.id}`, {
            name: "Push Day",
            exercises: [{ name: "Squat" }, { name: "Bench Press" }, { name: "Row" }],
        });
        assert.deepEqual(
            c.get(`/api/routines/${r.id}`).body.exercises.map((e) => e.name),
            ["Squat", "Bench Press", "Row"],
        );
    });

    await t.test("update skips blank exercise names", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;

        const resp = c.put(`/api/routines/${r.id}`, {
            name: "Push Day Updated",
            exercises: [{ name: "Bench Press" }, { name: " " }, { name: "" }, {}],
        });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.exercises.length, 1);
        assert.equal(resp.body.exercises[0].name, "Bench Press");
    });

    await t.test("update, not found", () => {
        assert.equal(makeClient().put("/api/routines/9999", { name: "X" }).status, 404);
    });

    await t.test("delete removes the definition only", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;

        assert.equal(c.delete(`/api/routines/${r.id}`).status, 204);
        assert.equal(c.get(`/api/routines/${r.id}`).status, 404);

        const exercises = c.get("/api/exercises").body;
        assert.equal(exercises.length, 1);
        assert.equal(exercises[0].name, "Bench Press");
    });

    await t.test("delete leaves past sessions in the log", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;
        const s = c.post("/api/sessions", { routine_id: r.id }).body;

        c.delete(`/api/routines/${r.id}`);

        const session = c.get(`/api/sessions/${s.id}`);
        assert.equal(session.status, 200);
        assert.equal(session.body.routine_id, null);
        assert.equal(session.body.routine_name, "Push Day");
    });

    await t.test("delete, not found", () => {
        assert.equal(makeClient().delete("/api/routines/9999").status, 404);
    });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

test("sessions API", async (t) => {
    await t.test("start", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }, { name: "Shoulder Press" }],
        }).body;

        const resp = c.post("/api/sessions", { routine_id: r.id });
        assert.equal(resp.status, 201);
        assert.equal(resp.body.routine_name, "Push Day");
        assert.equal(resp.body.status, "in_progress");
        assert.equal(resp.body.entries.length, 2);
    });

    await t.test("start with no routine", () => {
        assert.equal(makeClient().post("/api/sessions", {}).status, 400);
    });

    await t.test("start, routine not found", () => {
        assert.equal(makeClient().post("/api/sessions", { routine_id: 9999 }).status, 404);
    });

    await t.test("get", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;
        const s = c.post("/api/sessions", { routine_id: r.id }).body;

        const resp = c.get(`/api/sessions/${s.id}`);
        assert.equal(resp.status, 200);
        assert.equal(resp.body.routine_name, "Push Day");
    });

    await t.test("get, not found", () => {
        assert.equal(makeClient().get("/api/sessions/9999").status, 404);
    });

    await t.test("complete writes back the instance's lastSession", () => {
        const c = makeClient();
        const ex = c.post("/api/exercises", { name: "Bench Press" }).body;
        const m = c.post(`/api/exercises/${ex.id}/instances`, { name: "Flat Bench" }).body;
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;
        const s = c.post("/api/sessions", { routine_id: r.id }).body;
        const entryId = s.entries[0].id;

        c.post(`/api/session-entries/${entryId}/prefill`, { instance_id: m.id });
        c.post(`/api/session-entries/${entryId}/sets`, { weight: 135, reps: 10 });

        const resp = c.put(`/api/sessions/${s.id}/complete`);
        assert.equal(resp.status, 200);
        assert.equal(resp.body.status, "completed");
        assert.notEqual(resp.body.completed_at, null);

        const ls = c.get(`/api/instances/${m.id}/last-session`).body;
        assert.ok(ls.sets.length > 0);
    });

    await t.test("complete stores every set, in order", () => {
        const c = makeClient();
        const ex = c.post("/api/exercises", { name: "Bench Press" }).body;
        const m = c.post(`/api/exercises/${ex.id}/instances`, { name: "Flat Bench" }).body;
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Bench Press" }],
        }).body;
        const s = c.post("/api/sessions", { routine_id: r.id }).body;
        const entryId = s.entries[0].id;

        // The sole instance auto-assigned one blank row; fill it, then add more.
        const blank = c.get(`/api/sessions/${s.id}`).body.entries[0].sets[0];
        c.put(`/api/session-sets/${blank.id}`, { weight: 135, reps: 10 });
        c.post(`/api/session-entries/${entryId}/sets`, { weight: 145, reps: 8 });
        c.post(`/api/session-entries/${entryId}/sets`, { weight: 155, reps: 6 });

        c.put(`/api/sessions/${s.id}/complete`);

        assert.deepEqual(c.get(`/api/instances/${m.id}/last-session`).body.sets, [
            { weight: 135, reps: 10 },
            { weight: 145, reps: 8 },
            { weight: 155, reps: 6 },
        ]);
    });

    await t.test("complete twice", () => {
        const c = makeClient();
        const r = c.post("/api/routines", { name: "Push Day", exercises: [] }).body;
        const s = c.post("/api/sessions", { routine_id: r.id }).body;
        c.put(`/api/sessions/${s.id}/complete`);
        assert.equal(c.put(`/api/sessions/${s.id}/complete`).status, 400);
    });

    await t.test("complete, not found", () => {
        assert.equal(makeClient().put("/api/sessions/9999/complete").status, 404);
    });
});

// ---------------------------------------------------------------------------
// Session entries
// ---------------------------------------------------------------------------

function setupSession() {
    const c = makeClient();
    const ex = c.post("/api/exercises", { name: "Chest Press" }).body;
    const m = c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" }).body;
    const r = c.post("/api/routines", {
        name: "Push Day",
        exercises: [{ name: "Chest Press" }],
    }).body;
    const s = c.post("/api/sessions", { routine_id: r.id }).body;
    return { c, ex, m, r, s, entryId: s.entries[0].id };
}

test("session entries API", async (t) => {
    await t.test("switch instance", () => {
        const { c, m, entryId } = setupSession();
        const resp = c.put(`/api/session-entries/${entryId}/instance`, { instance_id: m.id });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.entry.instance.name, "Cybex");
    });

    await t.test("switch instance hands back that instance's lastSession", () => {
        const { c, ex, entryId } = setupSession();
        const other = c.post(`/api/exercises/${ex.id}/instances`, { name: "Hammer" }).body;
        c.store.put("instances", {
            ...c.store.get("instances", other.id),
            last_session_data: [{ weight: 90, reps: 12 }],
        });

        const resp = c.put(`/api/session-entries/${entryId}/instance`, { instance_id: other.id });
        assert.deepEqual(resp.body.last_session, [{ weight: 90, reps: 12 }]);
    });

    await t.test("switch instance, entry not found", () => {
        const c = makeClient();
        assert.equal(c.put("/api/session-entries/9999/instance", { instance_id: 1 }).status, 404);
    });

    await t.test("switch instance with no instance_id", () => {
        const { c, entryId } = setupSession();
        assert.equal(c.put(`/api/session-entries/${entryId}/instance`, {}).status, 400);
    });

    await t.test("switch instance, instance not found", () => {
        const { c, entryId } = setupSession();
        assert.equal(
            c.put(`/api/session-entries/${entryId}/instance`, { instance_id: 9999 }).status,
            404,
        );
    });

    await t.test("prefill with no history gives one blank row", () => {
        const { c, m, entryId } = setupSession();
        const resp = c.post(`/api/session-entries/${entryId}/prefill`, { instance_id: m.id });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.instance.name, "Cybex");
        assert.equal(resp.body.sets.length, 1);
        assert.equal(resp.body.sets[0].weight, 0);
    });

    await t.test("prefill with history lays out last time's sets", () => {
        const { c, m, entryId } = setupSession();
        c.store.put("instances", {
            ...c.store.get("instances", m.id),
            last_session_data: [{ weight: 135, reps: 10 }, { weight: 145, reps: 8 }],
        });

        const resp = c.post(`/api/session-entries/${entryId}/prefill`, { instance_id: m.id });
        assert.equal(resp.body.sets.length, 2);
        assert.equal(resp.body.sets[0].weight, 135);
        assert.equal(resp.body.sets[1].weight, 145);
    });

    await t.test("prefill replaces the rows that were there", () => {
        const { c, m, entryId } = setupSession();
        c.post(`/api/session-entries/${entryId}/sets`, { weight: 999, reps: 1 });
        c.store.put("instances", {
            ...c.store.get("instances", m.id),
            last_session_data: [{ weight: 135, reps: 10 }],
        });

        const resp = c.post(`/api/session-entries/${entryId}/prefill`, { instance_id: m.id });
        assert.deepEqual(
            resp.body.sets.map((s) => s.weight),
            [135],
        );
    });

    await t.test("prefill, entry not found", () => {
        const c = makeClient();
        assert.equal(c.post("/api/session-entries/9999/prefill", { instance_id: 1 }).status, 404);
    });

    await t.test("prefill with no instance_id", () => {
        const { c, entryId } = setupSession();
        assert.equal(c.post(`/api/session-entries/${entryId}/prefill`, {}).status, 400);
    });

    await t.test("prefill, instance not found", () => {
        const { c, entryId } = setupSession();
        assert.equal(
            c.post(`/api/session-entries/${entryId}/prefill`, { instance_id: 9999 }).status,
            404,
        );
    });

    await t.test("add set", () => {
        const { c, entryId } = setupSession();
        const resp = c.post(`/api/session-entries/${entryId}/sets`, { weight: 100, reps: 12 });
        assert.equal(resp.status, 201);
        assert.equal(resp.body.weight, 100);
        assert.equal(resp.body.reps, 12);
    });

    await t.test("add set lands after the rows already there", () => {
        const { c, entryId } = setupSession();
        // The sole instance already laid out one blank row at position 0.
        const added = c.post(`/api/session-entries/${entryId}/sets`, { weight: 100, reps: 12 }).body;
        assert.equal(added.position, 1);
    });

    await t.test("add set to an empty entry starts at position 0", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);
        const s = c.post("/api/sessions", { routine_id: routine.id }).body;
        const added = c.post(`/api/session-entries/${s.entries[0].id}/sets`, {}).body;
        assert.equal(added.position, 0);
        assert.equal(added.weight, 0);
        assert.equal(added.reps, 0);
        assert.equal(ex.id, c.store.all("exercises")[0].id);
    });

    await t.test("add set, not found", () => {
        const c = makeClient();
        assert.equal(c.post("/api/session-entries/9999/sets", { weight: 100, reps: 12 }).status, 404);
    });
});

// ---------------------------------------------------------------------------
// Session sets
// ---------------------------------------------------------------------------

function setupSet() {
    const { c, entryId } = setupSession();
    const s = c.post(`/api/session-entries/${entryId}/sets`, { weight: 100, reps: 10 }).body;
    return { c, s, entryId };
}

test("session sets API", async (t) => {
    await t.test("update weight", () => {
        const { c, s } = setupSet();
        const resp = c.put(`/api/session-sets/${s.id}`, { weight: 135 });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.weight, 135);
    });

    await t.test("update reps", () => {
        const { c, s } = setupSet();
        const resp = c.put(`/api/session-sets/${s.id}`, { reps: 8 });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.reps, 8);
    });

    await t.test("update completed", () => {
        const { c, s } = setupSet();
        const resp = c.put(`/api/session-sets/${s.id}`, { completed: true });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.completed, true);
    });

    await t.test("update leaves the fields it wasn't given", () => {
        const { c, s } = setupSet();
        c.put(`/api/session-sets/${s.id}`, { completed: true });
        const resp = c.put(`/api/session-sets/${s.id}`, { weight: 135 });
        assert.equal(resp.body.weight, 135);
        assert.equal(resp.body.reps, 10);
        assert.equal(resp.body.completed, true);
    });

    await t.test("update, not found", () => {
        assert.equal(makeClient().put("/api/session-sets/9999", { weight: 100 }).status, 404);
    });

    await t.test("delete", () => {
        const { c, s } = setupSet();
        assert.equal(c.delete(`/api/session-sets/${s.id}`).status, 204);
    });

    await t.test("delete, not found", () => {
        assert.equal(makeClient().delete("/api/session-sets/9999").status, 404);
    });
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

test("exercise progress API", async (t) => {
    const series = (c, exerciseId) => {
        const resp = c.get(`/api/exercises/${exerciseId}/progress`);
        assert.equal(resp.status, 200);
        return resp.body;
    };

    await t.test("exercise not found", () => {
        const resp = makeClient().get("/api/exercises/9999/progress");
        assert.equal(resp.status, 404);
        assert.equal(resp.body.error, "Exercise not found");
    });

    await t.test("no history", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        createInstance(c.store, ex.id, "Cybex");
        const data = series(c, ex.id);
        assert.equal(data.exercise.name, "Chest Press");
        assert.deepEqual(data.instances, []);
    });

    await t.test("the exercise summary omits instances", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        assert.equal("instances" in series(c, ex.id).exercise, false);
    });

    await t.test("plots the top set", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const m = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, m, [[185, 8], [195, 6], [185, 5]], "2026-03-03T00:00:00");

        const points = series(c, ex.id).instances[0].points;
        assert.equal(points.length, 1);
        assert.equal(points[0].weight, 195);
        assert.equal(points[0].reps, 6);
        assert.equal(points[0].date, "2026-03-03");
    });

    await t.test("a point carries the time of day", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const m = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, m, [[185, 8]], "2026-03-03T07:30:00");
        recordSession(c.store, ex, m, [[190, 6]], "2026-03-03T18:15:00");

        const points = series(c, ex.id).instances[0].points;
        assert.deepEqual(points.map((p) => p.date), ["2026-03-03", "2026-03-03"]);
        assert.equal(points[0].at, "2026-03-03T07:30:00");
        assert.equal(points[1].at, "2026-03-03T18:15:00");
    });

    await t.test("a weight tie breaks to the higher rep count", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const m = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, m, [[185, 5], [185, 9], [185, 7]], "2026-03-03T00:00:00");

        assert.equal(series(c, ex.id).instances[0].points[0].reps, 9);
    });

    await t.test("blank sets are skipped", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const m = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, m, [[0, 0], [140, 10], [0, 0]], "2026-03-03T00:00:00");

        assert.equal(series(c, ex.id).instances[0].points[0].weight, 140);
    });

    await t.test("an entry of only blank sets yields no point", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const m = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, m, [[0, 0], [0, 0]], "2026-03-03T00:00:00");

        assert.deepEqual(series(c, ex.id).instances, []);
    });

    await t.test("in-progress sessions are excluded", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const m = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, m, [[185, 8]], null, "in_progress");

        assert.deepEqual(series(c, ex.id).instances, []);
    });

    await t.test("points ascend by date", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const m = createInstance(c.store, ex.id, "Cybex");
        recordSession(c.store, ex, m, [[195, 6]], "2026-03-03T00:00:00");
        recordSession(c.store, ex, m, [[175, 8]], "2026-01-08T00:00:00");
        recordSession(c.store, ex, m, [[185, 7]], "2026-02-17T00:00:00");

        const points = series(c, ex.id).instances[0].points;
        assert.deepEqual(points.map((p) => p.date), ["2026-01-08", "2026-02-17", "2026-03-03"]);
        assert.deepEqual(points.map((p) => p.weight), [175, 185, 195]);
    });

    await t.test("instances stay separate", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const cybex = createInstance(c.store, ex.id, "Cybex");
        const hammer = createInstance(c.store, ex.id, "Hammer");
        recordSession(c.store, ex, cybex, [[195, 6]], "2026-03-03T00:00:00");
        recordSession(c.store, ex, hammer, [[90, 10]], "2026-03-04T00:00:00");

        const byName = Object.fromEntries(series(c, ex.id).instances.map((m) => [m.name, m]));
        assert.equal(byName["Cybex"].points[0].weight, 195);
        assert.equal(byName["Hammer"].points[0].weight, 90);
    });

    await t.test("the most-logged instance comes first", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const cybex = createInstance(c.store, ex.id, "Cybex");
        const hammer = createInstance(c.store, ex.id, "Hammer");
        recordSession(c.store, ex, hammer, [[90, 10]], "2026-03-04T00:00:00");
        recordSession(c.store, ex, cybex, [[195, 6]], "2026-03-03T00:00:00");
        recordSession(c.store, ex, cybex, [[200, 5]], "2026-03-10T00:00:00");

        assert.deepEqual(series(c, ex.id).instances.map((m) => m.name), ["Cybex", "Hammer"]);
    });

    await t.test("other exercises are ignored", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const other = createExercise(c.store, "Squat");
        const m = createInstance(c.store, ex.id, "Cybex");
        const otherM = createInstance(c.store, other.id, "Rack");
        recordSession(c.store, ex, m, [[195, 6]], "2026-03-03T00:00:00");
        recordSession(c.store, other, otherM, [[315, 5]], "2026-03-03T00:00:00");

        const instances = series(c, ex.id).instances;
        assert.equal(instances.length, 1);
        assert.equal(instances[0].name, "Cybex");
    });

    await t.test("entries with no instance are ignored", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        recordSession(c.store, ex, null, [[185, 8]], "2026-03-03T00:00:00");

        assert.deepEqual(series(c, ex.id).instances, []);
    });
});

// ---------------------------------------------------------------------------
// Sole-instance auto-load
// ---------------------------------------------------------------------------

test("sole instance auto-load", async (t) => {
    const entryFor = (session, exerciseName) =>
        session.entries.find((e) => e.exercise.name === exerciseName);

    await t.test("a sole instance is assigned on start", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const inst = createInstance(c.store, ex.id, "Cybex");
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);

        const session = c.post("/api/sessions", { routine_id: routine.id }).body;
        const entry = entryFor(session, "Chest Press");
        assert.equal(entry.instance.id, inst.id);
        assert.equal(entry.instance.name, "Cybex");
    });

    await t.test("a sole instance prefills last session", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const inst = createInstance(c.store, ex.id, "Cybex");
        c.store.put("instances", {
            ...inst,
            last_session_data: [{ weight: 185, reps: 8 }, { weight: 195, reps: 6 }],
        });
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);

        const session = c.post("/api/sessions", { routine_id: routine.id }).body;
        assert.deepEqual(
            entryFor(session, "Chest Press").sets.map((s) => [s.weight, s.reps]),
            [[185, 8], [195, 6]],
        );
    });

    await t.test("a sole instance with no history gets one blank set", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        createInstance(c.store, ex.id, "Cybex");
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);

        const session = c.post("/api/sessions", { routine_id: routine.id }).body;
        const sets = entryFor(session, "Chest Press").sets;
        assert.equal(sets.length, 1);
        assert.deepEqual([sets[0].weight, sets[0].reps], [0, 0]);
    });

    await t.test("two instances are left to the lifter", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        createInstance(c.store, ex.id, "Cybex");
        createInstance(c.store, ex.id, "Hammer");
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);

        const entry = entryFor(c.post("/api/sessions", { routine_id: routine.id }).body, "Chest Press");
        assert.equal(entry.instance, null);
        assert.deepEqual(entry.sets, []);
    });

    await t.test("no instances leaves the entry empty", () => {
        const c = makeClient();
        createExercise(c.store, "Chest Press");
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);

        const entry = entryFor(c.post("/api/sessions", { routine_id: routine.id }).body, "Chest Press");
        assert.equal(entry.instance, null);
        assert.deepEqual(entry.sets, []);
    });

    await t.test("each exercise is decided independently", () => {
        const c = makeClient();
        const solo = createExercise(c.store, "Chest Press");
        const soloInst = createInstance(c.store, solo.id, "Cybex");
        c.store.put("instances", { ...soloInst, last_session_data: [{ weight: 185, reps: 8 }] });
        const choice = createExercise(c.store, "Row");
        createInstance(c.store, choice.id, "Cable");
        createInstance(c.store, choice.id, "T-Bar");
        const routine = createRoutine(c.store, "Push Day", ["Chest Press", "Row"]);

        const session = c.post("/api/sessions", { routine_id: routine.id }).body;
        assert.equal(entryFor(session, "Chest Press").instance.name, "Cybex");
        assert.equal(entryFor(session, "Chest Press").sets.length, 1);
        assert.equal(entryFor(session, "Row").instance, null);
        assert.deepEqual(entryFor(session, "Row").sets, []);
    });

    await t.test("switching away from the auto-pick still works", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        const auto = createInstance(c.store, ex.id, "Cybex");
        c.store.put("instances", { ...auto, last_session_data: [{ weight: 185, reps: 8 }] });
        const routine = createRoutine(c.store, "Push Day", ["Chest Press"]);

        const session = c.post("/api/sessions", { routine_id: routine.id }).body;
        const entry = entryFor(session, "Chest Press");
        assert.equal(entry.instance.id, auto.id);

        const added = c.post(`/api/exercises/${ex.id}/instances`, { name: "Hammer" }).body;
        const resp = c.post(`/api/session-entries/${entry.id}/prefill`, { instance_id: added.id });
        assert.equal(resp.status, 200);
        assert.equal(resp.body.instance.name, "Hammer");
    });
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

test("routing", async (t) => {
    await t.test("an unknown endpoint is a 404, not a crash", () => {
        assert.equal(makeClient().get("/api/nonsense").status, 404);
    });

    await t.test("a non-numeric id is a 404, not a crash", () => {
        assert.equal(makeClient().get("/api/routines/abc").status, 404);
    });

    await t.test("a query string is ignored", () => {
        const c = makeClient();
        c.post("/api/exercises", { name: "Bench Press" });
        assert.equal(c.get("/api/exercises?cachebust=1").status, 200);
    });
});

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

test("wire shapes", async (t) => {
    // These were the to_dict() tests in tests/test_models.py. The models are gone,
    // but the shapes they pinned down are the contract home.js, routine.js,
    // session.js and progress.js read — so they are pinned down here instead.

    const keysOf = (obj) => Object.keys(obj).sort();

    await t.test("an exercise", () => {
        const c = makeClient();
        const ex = c.post("/api/exercises", { name: "Chest Press" }).body;
        assert.deepEqual(keysOf(ex), ["id", "instances", "name"]);
    });

    await t.test("an exercise inside a progress payload drops its instances", () => {
        const c = makeClient();
        const ex = createExercise(c.store, "Chest Press");
        assert.deepEqual(keysOf(c.get(`/api/exercises/${ex.id}/progress`).body.exercise), ["id", "name"]);
    });

    await t.test("an instance", () => {
        const c = makeClient();
        const ex = c.post("/api/exercises", { name: "Chest Press" }).body;
        const m = c.post(`/api/exercises/${ex.id}/instances`, { name: "Cybex" }).body;
        assert.deepEqual(keysOf(m), ["exercise_id", "id", "last_session", "name"]);
        assert.equal(m.last_session, null, "a new instance has no history, not an empty one");
    });

    await t.test("a routine, listed", () => {
        const c = makeClient();
        c.post("/api/routines", { name: "Push Day", exercises: [{ name: "Bench Press" }] });
        assert.deepEqual(keysOf(c.get("/api/routines").body[0]),
            ["created_at", "exercise_count", "id", "name"]);
    });

    await t.test("a routine, fetched", () => {
        const c = makeClient();
        const r = c.post("/api/routines", { name: "Push Day", exercises: [{ name: "Bench Press" }] }).body;
        assert.deepEqual(keysOf(c.get(`/api/routines/${r.id}`).body),
            ["created_at", "exercise_count", "exercises", "id", "name"]);
    });

    await t.test("a session", () => {
        const c = makeClient();
        const r = c.post("/api/routines", { name: "Push Day", exercises: [] }).body;
        const s = c.post("/api/sessions", { routine_id: r.id }).body;
        assert.deepEqual(keysOf(s),
            ["completed_at", "entries", "id", "routine_id", "routine_name", "started_at", "status"]);
        assert.equal(s.status, "in_progress");
        assert.equal(s.completed_at, null);
    });

    await t.test("a session entry", () => {
        const { c, s } = setupSession();
        assert.deepEqual(keysOf(s.entries[0]), ["exercise", "id", "instance", "sets"]);
        assert.equal(c.get(`/api/sessions/${s.id}`).status, 200);
    });

    await t.test("a set", () => {
        const { c, entryId } = setupSession();
        const added = c.post(`/api/session-entries/${entryId}/sets`, { weight: 100, reps: 12 }).body;
        assert.deepEqual(keysOf(added), ["completed", "id", "position", "reps", "weight"]);
        assert.equal(added.completed, false, "a new set is not already done");
    });

    await t.test("a routine name is snapshotted onto its sessions", () => {
        // The routine can be renamed or deleted; the session keeps the name it
        // was performed under.
        const c = makeClient();
        const r = c.post("/api/routines", { name: "Push Day", exercises: [] }).body;
        const s = c.post("/api/sessions", { routine_id: r.id }).body;

        c.put(`/api/routines/${r.id}`, { name: "Renamed" });

        assert.equal(c.get(`/api/sessions/${s.id}`).body.routine_name, "Push Day");
    });

    await t.test("timestamps are local wall clock, with no zone suffix", () => {
        // progress.js parses `at` with new Date(), which reads a bare timestamp
        // as local. A "Z" here would file an evening lift under the next day.
        const c = makeClient();
        const r = c.post("/api/routines", { name: "Push Day", exercises: [] }).body;
        const started = c.post("/api/sessions", { routine_id: r.id }).body.started_at;

        assert.match(started, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });
});
