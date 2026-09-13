/**
 * Rattlesnake — Home page logic
 * Fetches routines, renders list, handles start/edit/delete.
 */

document.addEventListener("DOMContentLoaded", init);

async function init() {
    await loadRoutines();
}

async function loadRoutines() {
    const list = document.getElementById("routines-list");
    const emptyState = document.getElementById("empty-state");

    try {
        const routines = await fetchJSON("/api/routines");

        if (routines.length === 0) {
            list.innerHTML = "";
            emptyState.style.display = "block";
            return;
        }

        emptyState.style.display = "none";
        list.innerHTML = routines
            .map(
                (r) => `
            <div class="routine-card" data-id="${r.id}">
                <div class="routine-card-info">
                    <div class="routine-card-name">${escapeHTML(r.name)}</div>
                    <div class="routine-card-meta">${r.exercise_count} exercise${r.exercise_count !== 1 ? "s" : ""}</div>
                </div>
                <div class="routine-card-actions">
                    <button class="btn btn-accent btn-small" onclick="startRoutine(${r.id})">Start</button>
                    <a href="/routine/${r.id}/edit" class="btn btn-secondary btn-small">Edit</a>
                    <button class="btn btn-danger btn-small" onclick="deleteRoutine(${r.id})">Delete</button>
                </div>
            </div>
        `
            )
            .join("");
    } catch (err) {
        list.innerHTML = `<div class="empty-state"><p>Error loading routines: ${escapeHTML(err.message)}</p></div>`;
    }
}

async function startRoutine(routineId) {
    try {
        const session = await fetchJSON("/api/sessions", {
            method: "POST",
            body: JSON.stringify({ routine_id: routineId }),
        });
        window.location.href = `/session/${session.id}`;
    } catch (err) {
        console.error("Failed to start session:", err);
    }
}

async function deleteRoutine(routineId) {
    try {
        await fetchJSON(`/api/routines/${routineId}`, { method: "DELETE" });
        await loadRoutines();
    } catch (err) {
        console.error("Failed to delete routine:", err);
    }
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
