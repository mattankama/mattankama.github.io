/**
 * Rattlesnake — Home page logic
 * Fetches routines, renders the list, starts sessions.
 *
 * This screen carries no accent (§2): hierarchy comes from weight, size and
 * extrusion. Deleting a routine lives in the routine editor, behind a confirm.
 */

document.addEventListener("DOMContentLoaded", init);

async function init() {
    await loadRoutines();
}

async function loadRoutines() {
    const container = document.querySelector(".home-container");
    const list = document.getElementById("routines-list");
    const emptyState = document.getElementById("empty-state");

    try {
        const routines = await fetchJSON("/api/routines");
        clearError(container);

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
                    <button class="btn btn-primary btn-small" data-action="start" data-id="${r.id}">Start</button>
                    <a href="/routine/${r.id}/edit" class="btn-text">Edit</a>
                </div>
            </div>
        `
            )
            .join("");

        list.querySelectorAll('[data-action="start"]').forEach((btn) => {
            btn.addEventListener("click", () =>
                startRoutine(Number(btn.dataset.id), btn)
            );
        });
    } catch (err) {
        list.innerHTML = "";
        emptyState.style.display = "none";
        showError(container, `Could not load routines: ${err.message}`);
    }
}

async function startRoutine(routineId, btn) {
    const container = document.querySelector(".home-container");
    if (btn) btn.disabled = true;

    try {
        const session = await fetchJSON("/api/sessions", {
            method: "POST",
            body: JSON.stringify({ routine_id: routineId }),
        });
        window.location.href = `/session/${session.id}`;
    } catch (err) {
        if (btn) btn.disabled = false;
        showError(container, `Could not start the session: ${err.message}`);
    }
}
