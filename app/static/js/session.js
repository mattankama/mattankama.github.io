/**
 * Rattlesnake — Active session logic
 * Timer, exercise entries, machine selection, set management, completion.
 */

// Timer state
const timer = {
    running: false,
    seconds: 0,
    intervalId: null,
};

// Track custom dropdown instances by entry ID
const machineDropdowns = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
    try {
        const session = await fetchJSON(`/api/sessions/${window.SESSION_ID}`);
        document.getElementById("session-title").textContent = session.routine_name;
        renderEntries(session.entries);

        if (session.status === "completed") {
            const btn = document.getElementById("complete-session-btn");
            btn.disabled = true;
            btn.textContent = "Session Complete";
        }
    } catch (err) {
        showError(
            document.getElementById("session-content"),
            `Could not load this session: ${err.message}`
        );
    }

    document
        .getElementById("complete-session-btn")
        .addEventListener("click", completeSession);
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

function resetAndStartTimer() {
    if (timer.intervalId) {
        clearInterval(timer.intervalId);
    }
    timer.seconds = 0;
    timer.running = true;
    updateTimerDisplay();

    // The running timer is the screen's only accent (ADR 0001).
    document.getElementById("timer-bar").classList.add("running");

    timer.intervalId = setInterval(() => {
        timer.seconds++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    document.getElementById("timer-display").textContent = formatTime(timer.seconds);
}

function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Entries rendering
// ---------------------------------------------------------------------------

function renderEntries(entries) {
    const container = document.getElementById("entries-list");
    container.innerHTML = "";

    for (const entry of entries) {
        const block = document.createElement("div");
        block.className = "entry-block";
        block.id = `entry-${entry.id}`;

        const exerciseName = entry.exercise ? entry.exercise.name : "Unknown";
        const machines = entry.exercise ? entry.exercise.machines || [] : [];
        const exerciseId = entry.exercise ? entry.exercise.id : null;

        const dropdownOptions = machines.map((m) => ({
            value: String(m.id),
            label: m.name,
        }));
        dropdownOptions.push({
            value: "__new__",
            label: "+ Add new machine",
            isAction: true,
        });

        const selectedMachineId = entry.machine ? String(entry.machine.id) : "";

        block.innerHTML = `
            <div class="entry-header">
                <div class="exercise-title">${escapeHTML(exerciseName)}</div>
                <div class="machine-selector">
                    <div id="machine-dropdown-${entry.id}"></div>
                </div>
                <div class="new-machine-inline" id="new-machine-inline-${entry.id}" style="display:none;">
                    <div class="machine-selector">
                        <input type="text" id="new-machine-input-${entry.id}" placeholder="Machine name" aria-label="New machine name">
                        <button class="btn btn-secondary btn-small" data-act="add-machine">Add</button>
                        <button class="btn btn-muted btn-small" data-act="cancel-machine">Cancel</button>
                    </div>
                </div>
            </div>
            <div class="sets-container" id="sets-${entry.id}">
                ${renderSetsHTML(entry.sets)}
            </div>
            <div class="entry-actions">
                <button class="btn btn-secondary btn-small" data-act="add-set">+ Add Set</button>
            </div>
        `;

        container.appendChild(block);

        block.querySelector('[data-act="add-machine"]')
            .addEventListener("click", () => submitNewMachine(entry.id, exerciseId));
        block.querySelector('[data-act="cancel-machine"]')
            .addEventListener("click", () => cancelNewMachine(entry.id));
        block.querySelector('[data-act="add-set"]')
            .addEventListener("click", () => addSet(entry.id));

        bindSetHandlers(entry.id);

        machineDropdowns[entry.id] = new CustomSelect(
            document.getElementById(`machine-dropdown-${entry.id}`),
            {
                placeholder: "Select machine",
                options: dropdownOptions,
                selectedValue: selectedMachineId,
                id: `machine-select-${entry.id}`,
                onChange: (value) => onMachineChange(entry.id, value, exerciseId),
            }
        );
    }
}

/**
 * One grid definition drives both the header and every row, so the two can
 * never drift. Units live in the header, not in each row (§4).
 */
function renderSetsHTML(sets) {
    if (!sets || sets.length === 0) {
        return '<div class="sets-empty">Select a machine to load sets</div>';
    }

    let html = `
        <div class="sets-header">
            <span>Set</span>
            <span>Weight (lbs)</span>
            <span>Reps</span>
            <span>Done</span>
            <span>Remove</span>
        </div>
    `;

    sets.forEach((s, i) => {
        html += `
            <div class="set-row ${s.completed ? "completed" : ""}" id="set-row-${s.id}" data-set-id="${s.id}">
                <span class="set-number">${i + 1}</span>
                <input type="number" class="set-input" inputmode="decimal" min="0" step="any"
                       value="${s.weight}" aria-label="Set ${i + 1} weight in pounds"
                       data-field="weight">
                <input type="number" class="set-input" inputmode="numeric" min="0"
                       value="${s.reps}" aria-label="Set ${i + 1} reps"
                       data-field="reps">
                <button class="set-toggle" role="checkbox" data-act="toggle"
                        aria-checked="${s.completed ? "true" : "false"}"
                        aria-label="Mark set ${i + 1} complete">
                    <span class="box" aria-hidden="true">✓</span>
                </button>
                <button class="btn-remove-set" data-act="remove"
                        aria-label="Remove set ${i + 1}">×</button>
            </div>
        `;
    });

    return html;
}

/** Wire the set controls inside one entry's sets container. */
function bindSetHandlers(entryId) {
    const container = document.getElementById(`sets-${entryId}`);
    if (!container) return;

    container.querySelectorAll(".set-row").forEach((row) => {
        const setId = Number(row.dataset.setId);

        row.querySelectorAll(".set-input").forEach((input) => {
            input.addEventListener("focus", () => input.select());
            const commit = () => updateSet(setId, input.dataset.field, input.value);
            input.addEventListener("change", commit);
            input.addEventListener("blur", commit);
        });

        row.querySelector('[data-act="toggle"]').addEventListener("click", (e) => {
            const btn = e.currentTarget;
            const next = btn.getAttribute("aria-checked") !== "true";
            toggleSetComplete(setId, next, entryId);
        });

        row.querySelector('[data-act="remove"]').addEventListener("click", () =>
            removeSet(setId, entryId)
        );
    });
}

/** Re-render one entry's sets from the server and rebind its handlers. */
async function refreshEntrySets(entryId) {
    const session = await fetchJSON(`/api/sessions/${window.SESSION_ID}`);
    const entry = session.entries.find((e) => e.id === entryId);
    if (!entry) return;
    document.getElementById(`sets-${entryId}`).innerHTML = renderSetsHTML(entry.sets);
    bindSetHandlers(entryId);
}

// ---------------------------------------------------------------------------
// Machine selection
// ---------------------------------------------------------------------------

async function onMachineChange(entryId, value, exerciseId) {
    if (value === "__new__") {
        const inlineEl = document.getElementById(`new-machine-inline-${entryId}`);
        inlineEl.style.display = "block";
        const input = document.getElementById(`new-machine-input-${entryId}`);
        input.value = "";
        input.focus();

        const dropdown = machineDropdowns[entryId];
        if (dropdown) dropdown.setValue("");
    } else if (value) {
        await prefillSets(entryId, parseInt(value, 10));
    }
}

async function submitNewMachine(entryId, exerciseId) {
    const input = document.getElementById(`new-machine-input-${entryId}`);
    const name = input.value.trim();
    if (!name) {
        input.focus();
        return;
    }

    try {
        const machine = await fetchJSON(`/api/exercises/${exerciseId}/machines`, {
            method: "POST",
            body: JSON.stringify({ name }),
        });

        const dropdown = machineDropdowns[entryId];
        if (dropdown) {
            dropdown.addOption(String(machine.id), machine.name);
            dropdown.select(String(machine.id));
        }

        document.getElementById(`new-machine-inline-${entryId}`).style.display = "none";
        await prefillSets(entryId, machine.id);
    } catch (err) {
        showError(
            document.getElementById(`entry-${entryId}`),
            `Could not add that machine: ${err.message}`
        );
    }
}

function cancelNewMachine(entryId) {
    document.getElementById(`new-machine-inline-${entryId}`).style.display = "none";
    const dropdown = machineDropdowns[entryId];
    if (dropdown) dropdown.setValue("");
}

async function prefillSets(entryId, machineId) {
    try {
        const entry = await fetchJSON(`/api/session-entries/${entryId}/prefill`, {
            method: "POST",
            body: JSON.stringify({ machine_id: machineId }),
        });

        document.getElementById(`sets-${entryId}`).innerHTML = renderSetsHTML(entry.sets);
        bindSetHandlers(entryId);
        clearError(document.getElementById(`entry-${entryId}`));
    } catch (err) {
        showError(
            document.getElementById(`entry-${entryId}`),
            `Could not load sets: ${err.message}`
        );
    }
}

// ---------------------------------------------------------------------------
// Set interactions
// ---------------------------------------------------------------------------

async function updateSet(setId, field, value) {
    const payload = {};
    if (field === "weight") {
        payload.weight = parseFloat(value) || 0;
    } else if (field === "reps") {
        payload.reps = parseInt(value, 10) || 0;
    }

    try {
        await fetchJSON(`/api/session-sets/${setId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error("Failed to update set:", err);
    }
}

async function toggleSetComplete(setId, completed, entryId) {
    try {
        await fetchJSON(`/api/session-sets/${setId}`, {
            method: "PUT",
            body: JSON.stringify({ completed }),
        });

        const row = document.getElementById(`set-row-${setId}`);
        if (row) {
            row.classList.toggle("completed", completed);
            const toggle = row.querySelector('[data-act="toggle"]');
            if (toggle) toggle.setAttribute("aria-checked", String(completed));
        }

        if (completed) {
            resetAndStartTimer();
        }
    } catch (err) {
        showError(
            document.getElementById(`entry-${entryId}`),
            `Could not update that set: ${err.message}`
        );
    }
}

async function addSet(entryId) {
    try {
        await fetchJSON(`/api/session-entries/${entryId}/sets`, {
            method: "POST",
            body: JSON.stringify({ weight: 0, reps: 0 }),
        });
        await refreshEntrySets(entryId);
    } catch (err) {
        showError(
            document.getElementById(`entry-${entryId}`),
            `Could not add a set: ${err.message}`
        );
    }
}

async function removeSet(setId, entryId) {
    try {
        await fetchJSON(`/api/session-sets/${setId}`, { method: "DELETE" });
        await refreshEntrySets(entryId);
    } catch (err) {
        showError(
            document.getElementById(`entry-${entryId}`),
            `Could not remove that set: ${err.message}`
        );
    }
}

// ---------------------------------------------------------------------------
// Complete session
// ---------------------------------------------------------------------------

async function completeSession() {
    const btn = document.getElementById("complete-session-btn");
    if (btn.disabled) return;

    btn.disabled = true;

    try {
        await fetchJSON(`/api/sessions/${window.SESSION_ID}/complete`, {
            method: "PUT",
        });
        window.location.href = "/";
    } catch (err) {
        btn.disabled = false;
        showError(
            document.getElementById("session-content"),
            `Could not complete this session: ${err.message}`
        );
    }
}
