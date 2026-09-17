/**
 * Fixtures for the local-api tests — the JS half of tests/conftest.py.
 *
 * `client` stands in for Flask's test client so the ported tests read like the
 * Python ones they came from: same calls, same order, same assertions.
 */

const path = require("node:path");
const { createStore } = require(path.join(__dirname, "../../app/static/js/store.js"));
const { handleRequest } = require(path.join(__dirname, "../../app/static/js/local-api.js"));

function makeClient() {
    const store = createStore();
    const call = (method) => (url, body) => handleRequest(store, method, url, body);
    return {
        store,
        get: call("GET"),
        post: call("POST"),
        put: call("PUT"),
        delete: call("DELETE"),
    };
}

const createExercise = (store, name = "Chest Press") => store.add("exercises", { name });

const createInstance = (store, exerciseId, name = "Cybex") =>
    store.add("instances", { exercise_id: exerciseId, name, last_session_data: null });

function createRoutine(store, name = "Push Day", exerciseNames = []) {
    const routine = store.add("routines", { name, created_at: "2026-01-01T00:00:00.000" });
    exerciseNames.forEach((exName, i) => {
        let exercise = store.find("exercises", (e) => e.name === exName);
        if (!exercise) exercise = store.add("exercises", { name: exName });
        store.add("routine_exercises", {
            routine_id: routine.id,
            exercise_id: exercise.id,
            position: i,
        });
    });
    return routine;
}

/**
 * Write a dated, completed session straight to the store.
 *
 * Progress reads a *series*, and the API can only produce one session at a time
 * with whatever "now" happens to be. These tests need several sessions on known
 * dates, so they go in underneath the API — exactly as the Python fixture does.
 */
function recordSession(store, exercise, instance, sets, completedAt = null, status = "completed") {
    const session = store.add("sessions", {
        routine_id: null,
        routine_name: "Push Day",
        started_at: completedAt,
        completed_at: status === "completed" ? completedAt : null,
        status,
    });
    const entry = store.add("session_entries", {
        session_id: session.id,
        exercise_id: exercise.id,
        instance_id: instance ? instance.id : null,
        position: 0,
    });
    sets.forEach(([weight, reps], i) => {
        store.add("session_sets", {
            entry_id: entry.id,
            weight,
            reps,
            completed: false,
            position: i,
        });
    });
    return session;
}

module.exports = { makeClient, createExercise, createInstance, createRoutine, recordSession };
