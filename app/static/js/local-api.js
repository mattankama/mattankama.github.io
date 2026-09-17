/**
 * Rattlesnake — the API, running on the phone.
 *
 * This is a port of app/routes/api.py. It answers the same twenty routes with
 * the same JSON and the same status codes, so the screens in home.js,
 * routine.js, session.js and progress.js cannot tell the difference — they
 * still "call the API", the call just never leaves the device.
 *
 * Read .claude/CONTEXT.md before changing anything here: exercise, instance,
 * routine, session, set and lastSession are defined terms, and the rules about
 * what a deletion takes with it live there rather than in this file.
 *
 * Kept deliberately parallel to api.py — same order, same helper names — so the
 * two can be read side by side and a drift between them is obvious.
 */
// Wrapped so none of these names reach the page's shared script scope.
//
// Every file here is a plain <script>, and the screen scripts declare functions
// of their own called updateSet, addSet, completeSession and deleteRoutine —
// exactly the names this module uses. They load last, so their definitions won
// and four API routes quietly ran UI code instead. A namespace per file, and
// the two sets of names can never see each other again.
(function (root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    else root.RattlesnakeAPI = exported;
})(typeof self !== "undefined" ? self : globalThis, function () {
"use strict";
// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/**
 * Local wall-clock time as `YYYY-MM-DDTHH:MM:SS.mmm`, with no zone suffix.
 *
 * The format matches what Flask+SQLite handed back (a naive datetime), which is
 * what progress.js already knows how to parse. Local rather than UTC is the
 * deliberate part: this database never leaves the phone that wrote it, so a
 * session finished at 9pm Tuesday should be dated Tuesday. Stamping it UTC
 * would file that lift under Wednesday for every lifter west of Greenwich.
 */
function nowISO(clock = Date.now) {
    const d = new Date(clock());
    const p = (n, width = 2) => String(n).padStart(width, "0");
    return (
        `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
        `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
        `.${p(d.getMilliseconds(), 3)}`
    );
}

// ---------------------------------------------------------------------------
// Serialisers — the to_dict() methods from app/models.py
// ---------------------------------------------------------------------------

const byId = (a, b) => a.id - b.id;
const byPosition = (a, b) => a.position - b.position || a.id - b.id;

/** Code-point ordering, to match SQLite's BINARY collation on ORDER BY name. */
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

function instanceDict(instance) {
    return {
        id: instance.id,
        name: instance.name,
        exercise_id: instance.exercise_id,
        last_session: instance.last_session_data ?? null,
    };
}

function instancesOf(store, exerciseId) {
    return store.filter("instances", (m) => m.exercise_id === exerciseId).sort(byId);
}

function exerciseDict(store, exercise, includeInstances = true) {
    const data = { id: exercise.id, name: exercise.name };
    if (includeInstances) {
        data.instances = instancesOf(store, exercise.id).map(instanceDict);
    }
    return data;
}

/** The exercises of a routine, in the order the lifter arranged them. */
function routineExercises(store, routineId) {
    return store
        .filter("routine_exercises", (link) => link.routine_id === routineId)
        .sort(byPosition)
        .map((link) => store.get("exercises", link.exercise_id))
        .filter(Boolean);
}

function routineDict(store, routine, includeExercises = true) {
    const data = {
        id: routine.id,
        name: routine.name,
        created_at: routine.created_at ?? null,
    };
    if (includeExercises) {
        data.exercises = routineExercises(store, routine.id).map((e) => exerciseDict(store, e));
        data.exercise_count = data.exercises.length;
    } else {
        data.exercise_count = store.filter(
            "routine_exercises",
            (link) => link.routine_id === routine.id,
        ).length;
    }
    return data;
}

function setDict(s) {
    return {
        id: s.id,
        weight: s.weight,
        reps: s.reps,
        completed: s.completed,
        position: s.position,
    };
}

function setsOf(store, entryId) {
    return store.filter("session_sets", (s) => s.entry_id === entryId).sort(byPosition);
}

function entryDict(store, entry) {
    const exercise = entry.exercise_id ? store.get("exercises", entry.exercise_id) : null;
    const instance = entry.instance_id ? store.get("instances", entry.instance_id) : null;
    return {
        id: entry.id,
        exercise: exercise ? exerciseDict(store, exercise, true) : null,
        instance: instance ? instanceDict(instance) : null,
        sets: setsOf(store, entry.id).map(setDict),
    };
}

function entriesOf(store, sessionId) {
    return store.filter("session_entries", (e) => e.session_id === sessionId).sort(byPosition);
}

function sessionDict(store, session) {
    return {
        id: session.id,
        routine_id: session.routine_id,
        routine_name: session.routine_name,
        status: session.status,
        started_at: session.started_at ?? null,
        completed_at: session.completed_at ?? null,
        entries: entriesOf(store, session.id).map((e) => entryDict(store, e)),
    };
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

const ok = (body, status = 200) => ({ status, body });
const noContent = () => ({ status: 204, body: null });
const fail = (message, status) => ({ status, body: { error: message } });

/** Thrown by the get-or-404 helpers and turned into a reply by handleRequest. */
class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

function getOr404(store, table, id, message) {
    const row = store.get(table, id);
    if (!row) throw new ApiError(message, 404);
    return row;
}

const getExerciseOr404 = (store, id) => getOr404(store, "exercises", id, "Exercise not found");
const getInstanceOr404 = (store, id) => getOr404(store, "instances", id, "Instance not found");
const getRoutineOr404 = (store, id) => getOr404(store, "routines", id, "Routine not found");
const getSessionOr404 = (store, id) => getOr404(store, "sessions", id, "Session not found");
const getEntryOr404 = (store, id) =>
    getOr404(store, "session_entries", id, "Session entry not found");
const getSetOr404 = (store, id) => getOr404(store, "session_sets", id, "Set not found");

const trimmed = (value) => String(value ?? "").trim();

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

function listExercises(store) {
    const exercises = store.all("exercises").sort(byName);
    return ok(exercises.map((e) => exerciseDict(store, e)));
}

/** Create an exercise. Idempotent: returns the existing one if the name matches. */
function createExercise(store, body) {
    const name = trimmed(body.name);
    if (!name) return fail("Exercise name is required", 400);

    const existing = store.find("exercises", (e) => e.name.toLowerCase() === name.toLowerCase());
    if (existing) return ok(exerciseDict(store, existing), 200);

    return ok(exerciseDict(store, store.add("exercises", { name })), 201);
}

/**
 * Delete an exercise and its instances.
 *
 * The foreign keys did this in SQLite; here it is spelled out. Session entries
 * survive the deletion but lose their references, which is the rule in
 * CONTEXT.md: past sessions stay in the log, they just stop being comparable.
 */
function deleteExercise(store, exerciseId) {
    const exercise = getExerciseOr404(store, exerciseId);

    for (const instance of instancesOf(store, exercise.id)) {
        detachInstance(store, instance.id);
        store.remove("instances", instance.id);
    }
    for (const entry of store.filter("session_entries", (e) => e.exercise_id === exercise.id)) {
        store.put("session_entries", { ...entry, exercise_id: null });
    }
    store.removeWhere("routine_exercises", (link) => link.exercise_id === exercise.id);
    store.remove("exercises", exercise.id);

    return noContent();
}

/**
 * The heaviest set of an entry — the value Progress plots.
 *
 * Blank rows (weight 0) are an artifact of the set editor, not a lift, so they
 * never become a data point. A tie on weight breaks to the higher rep count:
 * of two sets at the same load, the longer one is the harder one.
 */
function topSet(sets) {
    let best = null;
    for (const s of sets) {
        if (!(s.weight > 0)) continue;
        if (best === null || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
            best = s;
        }
    }
    return best;
}

/**
 * Top-set weight over time for one exercise, split by instance.
 *
 * The split is not a display choice — per CONTEXT.md, history is per-instance,
 * because the same weight on two instances is not the same load. A single line
 * across instances would read an instance switch as a PR or a plateau.
 *
 * Only completed sessions count: an in-progress session is pre-filled from the
 * instance's lastSession, so charting it would plot a lift that hasn't happened.
 *
 * The whole exercise ships in one payload, so switching instances on the client
 * costs nothing.
 */
function exerciseProgress(store, exerciseId) {
    const exercise = getExerciseOr404(store, exerciseId);

    const rows = store
        .filter("session_entries", (entry) => entry.exercise_id === exercise.id && entry.instance_id)
        .map((entry) => ({ entry, session: store.get("sessions", entry.session_id) }))
        .filter(({ session }) => session && session.status === "completed")
        .sort((a, b) => {
            const left = a.session.completed_at || "";
            const right = b.session.completed_at || "";
            return left < right ? -1 : left > right ? 1 : a.session.id - b.session.id;
        });

    const series = new Map();
    for (const { entry, session } of rows) {
        const top = topSet(setsOf(store, entry.id));
        const instance = store.get("instances", entry.instance_id);
        if (top === null || !instance) continue;

        if (!series.has(instance.id)) {
            series.set(instance.id, { id: instance.id, name: instance.name, points: [] });
        }
        series.get(instance.id).points.push({
            session_id: entry.session_id,
            // `date` is what gets labelled; `at` carries the time of day, which
            // is what keeps two sessions logged on one day from landing on the
            // same point of the x-axis.
            date: session.completed_at ? session.completed_at.slice(0, 10) : null,
            at: session.completed_at || null,
            weight: top.weight,
            reps: top.reps,
        });
    }

    // Most-logged instance first: the client picks series[0] and is right by
    // default, without having to decide anything itself.
    const instances = [...series.values()].sort(
        (a, b) => b.points.length - a.points.length || byName(a, b),
    );

    return ok({ exercise: exerciseDict(store, exercise, false), instances });
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

function createInstance(store, exerciseId, body) {
    const exercise = getExerciseOr404(store, exerciseId);

    const name = trimmed(body.name);
    if (!name) return fail("Instance name is required", 400);

    const existing = store.find(
        "instances",
        (m) => m.exercise_id === exercise.id && m.name === name,
    );
    if (existing) return ok(instanceDict(existing), 200);

    const instance = store.add("instances", {
        exercise_id: exercise.id,
        name,
        last_session_data: null,
    });
    return ok(instanceDict(instance), 201);
}

/** Clear every session entry pointing at an instance that is about to go. */
function detachInstance(store, instanceId) {
    for (const entry of store.filter("session_entries", (e) => e.instance_id === instanceId)) {
        store.put("session_entries", { ...entry, instance_id: null });
    }
}

function deleteInstance(store, instanceId) {
    const instance = getInstanceOr404(store, instanceId);
    detachInstance(store, instance.id);
    store.remove("instances", instance.id);
    return noContent();
}

function getInstanceLastSession(store, instanceId) {
    const instance = getInstanceOr404(store, instanceId);
    return ok({ instance_id: instance.id, sets: instance.last_session_data || [] });
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

/** Find-or-create each exercise, add any new instances, and link them in order. */
function addExercisesToRoutine(store, routine, exercisesData) {
    exercisesData.forEach((exData, i) => {
        const exName = trimmed(exData && exData.name);
        if (!exName) return;

        let exercise = store.find("exercises", (e) => e.name.toLowerCase() === exName.toLowerCase());
        if (!exercise) exercise = store.add("exercises", { name: exName });

        const existingInstances = new Set(instancesOf(store, exercise.id).map((m) => m.name));
        for (const mData of (exData.instances || [])) {
            const mName = trimmed(mData && mData.name);
            if (mName && !existingInstances.has(mName)) {
                store.add("instances", {
                    exercise_id: exercise.id,
                    name: mName,
                    last_session_data: null,
                });
                existingInstances.add(mName);
            }
        }

        // One exercise cannot sit in the same routine twice — it was a unique
        // constraint in SQLite. Listing it twice is a mistake in the form, not a
        // reason to refuse the whole save.
        const alreadyLinked = store.find(
            "routine_exercises",
            (link) => link.routine_id === routine.id && link.exercise_id === exercise.id,
        );
        if (!alreadyLinked) {
            store.add("routine_exercises", {
                routine_id: routine.id,
                exercise_id: exercise.id,
                position: i,
            });
        }
    });
}

function listRoutines(store) {
    const routines = store.all("routines").sort((a, b) => {
        const left = a.created_at || "";
        const right = b.created_at || "";
        return left < right ? 1 : left > right ? -1 : b.id - a.id;
    });
    return ok(routines.map((r) => routineDict(store, r, false)));
}

function createRoutine(store, body) {
    const name = trimmed(body.name);
    if (!name) return fail("Routine name is required", 400);

    const routine = store.add("routines", { name, created_at: nowISO() });
    addExercisesToRoutine(store, routine, body.exercises || []);
    return ok(routineDict(store, routine), 201);
}

function getRoutine(store, routineId) {
    return ok(routineDict(store, getRoutineOr404(store, routineId)));
}

function updateRoutine(store, routineId, body) {
    const routine = getRoutineOr404(store, routineId);

    const name = trimmed(body.name);
    if (name) store.put("routines", { ...routine, name });

    if ("exercises" in body) {
        store.removeWhere("routine_exercises", (link) => link.routine_id === routine.id);
        addExercisesToRoutine(store, routine, body.exercises || []);
    }

    return ok(routineDict(store, store.get("routines", routine.id)));
}

/** Delete the routine definition only — exercises, instances, stats and sessions stay. */
function deleteRoutine(store, routineId) {
    const routine = getRoutineOr404(store, routineId);

    store.removeWhere("routine_exercises", (link) => link.routine_id === routine.id);
    for (const session of store.filter("sessions", (s) => s.routine_id === routine.id)) {
        store.put("sessions", { ...session, routine_id: null });
    }
    store.remove("routines", routine.id);

    return noContent();
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Replace an entry's sets with the instance's lastSession.
 *
 * An instance with no history still gets one blank row, so there is always
 * something to type into rather than an empty container.
 */
function layOutSetsFromInstance(store, entry, instance) {
    store.removeWhere("session_sets", (s) => s.entry_id === entry.id);

    const lastData = instance.last_session_data || [];
    if (lastData.length === 0) {
        store.add("session_sets", {
            entry_id: entry.id,
            weight: 0,
            reps: 0,
            completed: false,
            position: 0,
        });
        return;
    }

    lastData.forEach((setData, i) => {
        store.add("session_sets", {
            entry_id: entry.id,
            weight: setData.weight ?? 0,
            reps: setData.reps ?? 0,
            completed: false,
            position: i,
        });
    });
}

function startSession(store, body) {
    const routineId = body.routine_id;
    if (!routineId) return fail("routine_id is required", 400);

    const routine = getRoutineOr404(store, routineId);

    const session = store.add("sessions", {
        routine_id: routine.id,
        routine_name: routine.name,
        started_at: nowISO(),
        completed_at: null,
        status: "in_progress",
    });

    routineExercises(store, routine.id).forEach((exercise, i) => {
        const entry = store.add("session_entries", {
            session_id: session.id,
            exercise_id: exercise.id,
            instance_id: null,
            position: i,
        });

        // One instance is not a choice, it is the answer. Assign it and lay the
        // sets out now, so the lifter arrives at a screen they can lift from
        // instead of one asking them to confirm the only option there is.
        const instances = instancesOf(store, exercise.id);
        if (instances.length === 1) {
            store.put("session_entries", { ...entry, instance_id: instances[0].id });
            layOutSetsFromInstance(store, entry, instances[0]);
        }
    });

    return ok(sessionDict(store, session), 201);
}

function getSession(store, sessionId) {
    return ok(sessionDict(store, getSessionOr404(store, sessionId)));
}

/** Complete a session, writing each instance's sets back as its new lastSession. */
function completeSession(store, sessionId) {
    const session = getSessionOr404(store, sessionId);

    if (session.status === "completed") return fail("Session already completed", 400);

    store.put("sessions", { ...session, status: "completed", completed_at: nowISO() });

    for (const entry of entriesOf(store, session.id)) {
        const sets = setsOf(store, entry.id);
        if (!entry.instance_id || sets.length === 0) continue;

        const instance = store.get("instances", entry.instance_id);
        if (!instance) continue;

        store.put("instances", {
            ...instance,
            last_session_data: sets.map((s) => ({ weight: s.weight, reps: s.reps })),
        });
    }

    return ok(sessionDict(store, store.get("sessions", session.id)));
}

// ---------------------------------------------------------------------------
// Session entries
// ---------------------------------------------------------------------------

function switchEntryInstance(store, entryId, body) {
    const entry = getEntryOr404(store, entryId);

    const instanceId = body.instance_id;
    if (!instanceId) return fail("instance_id is required", 400);

    const instance = getInstanceOr404(store, instanceId);
    store.put("session_entries", { ...entry, instance_id: instance.id });

    return ok({
        entry: entryDict(store, store.get("session_entries", entry.id)),
        last_session: instance.last_session_data || [],
    });
}

function prefillEntry(store, entryId, body) {
    const entry = getEntryOr404(store, entryId);

    const instanceId = body.instance_id;
    if (!instanceId) return fail("instance_id is required", 400);

    const instance = getInstanceOr404(store, instanceId);
    store.put("session_entries", { ...entry, instance_id: instance.id });
    layOutSetsFromInstance(store, entry, instance);

    return ok(entryDict(store, store.get("session_entries", entry.id)));
}

function addSet(store, entryId, body) {
    const entry = getEntryOr404(store, entryId);

    const sets = setsOf(store, entry.id);
    const position = sets.length === 0 ? 0 : Math.max(...sets.map((s) => s.position)) + 1;

    const created = store.add("session_sets", {
        entry_id: entry.id,
        weight: body.weight ?? 0,
        reps: body.reps ?? 0,
        completed: false,
        position,
    });
    return ok(setDict(created), 201);
}

// ---------------------------------------------------------------------------
// Session sets
// ---------------------------------------------------------------------------

function updateSet(store, setId, body) {
    const s = getSetOr404(store, setId);

    const updated = { ...s };
    if ("weight" in body) updated.weight = body.weight;
    if ("reps" in body) updated.reps = body.reps;
    if ("completed" in body) updated.completed = body.completed;

    return ok(setDict(store.put("session_sets", updated)));
}

function deleteSet(store, setId) {
    const s = getSetOr404(store, setId);
    store.remove("session_sets", s.id);
    return noContent();
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

// Same twenty routes as api.py, in the same order. `:id` matches one path
// segment and arrives as a number.
const ROUTES = [
    ["GET", "/api/exercises", (st) => listExercises(st)],
    ["POST", "/api/exercises", (st, _p, body) => createExercise(st, body)],
    ["DELETE", "/api/exercises/:id", (st, p) => deleteExercise(st, p.id)],
    ["GET", "/api/exercises/:id/progress", (st, p) => exerciseProgress(st, p.id)],
    ["POST", "/api/exercises/:id/instances", (st, p, body) => createInstance(st, p.id, body)],
    ["DELETE", "/api/instances/:id", (st, p) => deleteInstance(st, p.id)],
    ["GET", "/api/instances/:id/last-session", (st, p) => getInstanceLastSession(st, p.id)],
    ["GET", "/api/routines", (st) => listRoutines(st)],
    ["POST", "/api/routines", (st, _p, body) => createRoutine(st, body)],
    ["GET", "/api/routines/:id", (st, p) => getRoutine(st, p.id)],
    ["PUT", "/api/routines/:id", (st, p, body) => updateRoutine(st, p.id, body)],
    ["DELETE", "/api/routines/:id", (st, p) => deleteRoutine(st, p.id)],
    ["POST", "/api/sessions", (st, _p, body) => startSession(st, body)],
    ["GET", "/api/sessions/:id", (st, p) => getSession(st, p.id)],
    ["PUT", "/api/sessions/:id/complete", (st, p) => completeSession(st, p.id)],
    ["PUT", "/api/session-entries/:id/instance", (st, p, body) => switchEntryInstance(st, p.id, body)],
    ["POST", "/api/session-entries/:id/prefill", (st, p, body) => prefillEntry(st, p.id, body)],
    ["POST", "/api/session-entries/:id/sets", (st, p, body) => addSet(st, p.id, body)],
    ["PUT", "/api/session-sets/:id", (st, p, body) => updateSet(st, p.id, body)],
    ["DELETE", "/api/session-sets/:id", (st, p) => deleteSet(st, p.id)],
];

function matchRoute(method, pathname) {
    const parts = pathname.replace(/\/+$/, "").split("/");
    for (const [routeMethod, pattern, handler] of ROUTES) {
        if (routeMethod !== method) continue;
        const patternParts = pattern.split("/");
        if (patternParts.length !== parts.length) continue;

        const params = {};
        let matched = true;
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i] === ":id") {
                const value = Number(parts[i]);
                if (!Number.isInteger(value)) {
                    matched = false;
                    break;
                }
                params.id = value;
            } else if (patternParts[i] !== parts[i]) {
                matched = false;
                break;
            }
        }
        if (matched) return { handler, params };
    }
    return null;
}

/**
 * Answer one API call. The single entry point this module exposes: give it a
 * store and a request, get back `{status, body}` — the same pair Flask used to
 * put on the wire.
 */
function handleRequest(store, method, url, body = {}) {
    const pathname = String(url).split("?")[0];
    const match = matchRoute(String(method).toUpperCase(), pathname);
    if (!match) return fail(`No such endpoint: ${method} ${pathname}`, 404);

    try {
        return match.handler(store, match.params, body || {});
    } catch (err) {
        if (err instanceof ApiError) return fail(err.message, err.status);
        throw err;
    }
}

return { handleRequest, nowISO, ApiError };
});
