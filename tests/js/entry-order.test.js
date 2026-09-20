/**
 * Reordering — the half of drag-to-reorder that persists.
 *
 * Two surfaces share one idea. In the routine editor the order is whatever the
 * form says at Save, so `PUT /api/routines/:id` already carries it and there is
 * nothing new to write. Mid-session there is no Save — every other edit on that
 * screen lands immediately — so dragging an exercise there goes straight to the
 * store, and writes back to the routine it came from.
 *
 * Run with: node --test tests/js/
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { makeClient } = require("./helpers.js");

/** A routine with `names` in order, plus a session started from it. */
function started(c, names) {
    const routine = c.post("/api/routines", {
        name: "Push Day",
        exercises: names.map((name) => ({ name })),
    }).body;
    const session = c.post("/api/sessions", { routine_id: routine.id }).body;
    return { routine, session };
}

const entryNames = (session) => session.entries.map((e) => e.exercise.name);

const routineNames = (c, routineId) =>
    c.get(`/api/routines/${routineId}`).body.exercises.map((e) => e.name);

test("routine order survives a save", async (t) => {
    await t.test("a reordered payload rewrites the stored positions", () => {
        const c = makeClient();
        const r = c.post("/api/routines", {
            name: "Push Day",
            exercises: [{ name: "Squat" }, { name: "Bench" }, { name: "Row" }],
        }).body;

        c.put(`/api/routines/${r.id}`, {
            name: "Push Day",
            exercises: [{ name: "Row" }, { name: "Squat" }, { name: "Bench" }],
        });

        assert.deepEqual(routineNames(c, r.id), ["Row", "Squat", "Bench"]);
        assert.deepEqual(
            c.store
                .filter("routine_exercises", (l) => l.routine_id === r.id)
                .map((l) => l.position)
                .sort(),
            [0, 1, 2],
            "positions stay a clean 0..n-1 run",
        );
    });

    await t.test("a link written without a position still sorts by id", () => {
        // The guarantee that makes "no migration" true: byPosition falls
        // through to the id when position is undefined, so data written before
        // the field existed still comes back in insertion order.
        const c = makeClient();
        const r = c.post("/api/routines", { name: "Push Day", exercises: [] }).body;
        const squat = c.store.add("exercises", { name: "Squat" });
        const row = c.store.add("exercises", { name: "Row" });
        c.store.add("routine_exercises", { routine_id: r.id, exercise_id: squat.id });
        c.store.add("routine_exercises", { routine_id: r.id, exercise_id: row.id });

        assert.deepEqual(routineNames(c, r.id), ["Squat", "Row"]);
    });
});

test("session entry order", async (t) => {
    await t.test("reorders the session's own entries", () => {
        const c = makeClient();
        const { session } = started(c, ["Squat", "Bench", "Row"]);
        const [squat, bench, row] = session.entries.map((e) => e.id);

        const resp = c.put(`/api/sessions/${session.id}/entry-order`, {
            entry_ids: [row, squat, bench],
        });

        assert.equal(resp.status, 200);
        assert.deepEqual(entryNames(resp.body), ["Row", "Squat", "Bench"]);
        assert.deepEqual(entryNames(c.get(`/api/sessions/${session.id}`).body), [
            "Row",
            "Squat",
            "Bench",
        ]);
    });

    await t.test("writes the new order back to the routine", () => {
        const c = makeClient();
        const { routine, session } = started(c, ["Squat", "Bench", "Row"]);
        const [squat, bench, row] = session.entries.map((e) => e.id);

        c.put(`/api/sessions/${session.id}/entry-order`, { entry_ids: [row, squat, bench] });

        assert.deepEqual(routineNames(c, routine.id), ["Row", "Squat", "Bench"]);
    });

    await t.test("the next session started from that routine inherits the order", () => {
        const c = makeClient();
        const { routine, session } = started(c, ["Squat", "Bench", "Row"]);
        const [squat, bench, row] = session.entries.map((e) => e.id);

        c.put(`/api/sessions/${session.id}/entry-order`, { entry_ids: [row, squat, bench] });
        const next = c.post("/api/sessions", { routine_id: routine.id }).body;

        assert.deepEqual(entryNames(next), ["Row", "Squat", "Bench"]);
    });

    await t.test("an exercise the session does not have never moves", () => {
        // The routine gained an exercise after the session started. Only the
        // slots the dragged exercises already occupied get redistributed, so
        // the untouched one keeps its place rather than being shuffled to the
        // end of the list by a wholesale rewrite.
        const c = makeClient();
        const { routine, session } = started(c, ["Squat", "Bench", "Row"]);
        c.put(`/api/routines/${routine.id}`, {
            name: "Push Day",
            exercises: [{ name: "Squat" }, { name: "Curl" }, { name: "Bench" }, { name: "Row" }],
        });
        const [squat, bench, row] = session.entries.map((e) => e.id);

        c.put(`/api/sessions/${session.id}/entry-order`, { entry_ids: [row, bench, squat] });

        assert.deepEqual(routineNames(c, routine.id), ["Row", "Curl", "Bench", "Squat"]);
    });

    await t.test("a session whose routine was deleted still reorders itself", () => {
        const c = makeClient();
        const { routine, session } = started(c, ["Squat", "Bench"]);
        c.delete(`/api/routines/${routine.id}`);
        const [squat, bench] = session.entries.map((e) => e.id);

        const resp = c.put(`/api/sessions/${session.id}/entry-order`, {
            entry_ids: [bench, squat],
        });

        assert.equal(resp.status, 200);
        assert.deepEqual(entryNames(resp.body), ["Bench", "Squat"]);
    });

    await t.test("leaves instances and set history alone", () => {
        const c = makeClient();
        const { session } = started(c, ["Squat", "Bench"]);
        const before = c.store.all("instances").map((m) => ({ ...m }));
        const setsBefore = c.store.all("session_sets").map((s) => ({ ...s }));
        const [squat, bench] = session.entries.map((e) => e.id);

        c.put(`/api/sessions/${session.id}/entry-order`, { entry_ids: [bench, squat] });

        assert.deepEqual(c.store.all("instances"), before);
        assert.deepEqual(c.store.all("session_sets"), setsBefore);
    });

    await t.test("an unknown session is a 404", () => {
        const c = makeClient();
        assert.equal(c.put("/api/sessions/999/entry-order", { entry_ids: [] }).status, 404);
    });

    await t.test("a list that is not exactly this session's entries is a 400", () => {
        const c = makeClient();
        const { session } = started(c, ["Squat", "Bench", "Row"]);
        const [squat, bench, row] = session.entries.map((e) => e.id);
        const bad = (entry_ids) =>
            c.put(`/api/sessions/${session.id}/entry-order`, { entry_ids }).status;

        assert.equal(bad([row, squat]), 400, "one short");
        assert.equal(bad([row, squat, bench, 9999]), 400, "one too many");
        assert.equal(bad([row, row, squat]), 400, "the same entry twice");
        assert.equal(bad(undefined), 400, "nothing at all");
    });

    await t.test("an entry from another session cannot be smuggled in", () => {
        const c = makeClient();
        const first = started(c, ["Squat", "Bench"]);
        const second = started(c, ["Row", "Curl"]);
        const mine = first.session.entries.map((e) => e.id);
        const theirs = second.session.entries[0].id;

        assert.equal(
            c.put(`/api/sessions/${first.session.id}/entry-order`, {
                entry_ids: [mine[0], theirs],
            }).status,
            400,
        );
    });
});
