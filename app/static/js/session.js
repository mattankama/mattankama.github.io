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

    // A row left open should close as soon as attention moves elsewhere.
    document.addEventListener("pointerdown", (e) => {
        const row = e.target.closest(".set-row");
        if (!row || row.dataset.open !== "true") closeOpenRows(row);
    });
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
 * A set is written the way a lifter writes it — 185 lb x 8 reps — so the
 * units travel with their own number and there is no column header to drift
 * out of sync with the rows beneath it.
 *
 * Each row is a surface that slides left to reveal its delete action. The
 * button stays in the DOM and in the tab order, so the gesture is a shortcut
 * rather than the only way to remove a set.
 */
function renderSetsHTML(sets) {
    if (!sets || sets.length === 0) {
        return '<div class="sets-empty">Select a machine to load sets</div>';
    }

    let html = "";

    sets.forEach((s, i) => {
        html += `
            <div class="set-row ${s.completed ? "completed" : ""}" id="set-row-${s.id}" data-set-id="${s.id}">
                <div class="set-row-delete">
                    <button class="set-delete-btn" data-act="remove"
                            aria-label="Remove set ${i + 1}">Delete</button>
                </div>
                <div class="set-row-surface">
                    <span class="set-number">${i + 1}</span>
                    <div class="set-measure set-measure-weight">
                        <input type="number" class="set-input" inputmode="decimal" min="0" step="any"
                               value="${s.weight}" aria-label="Set ${i + 1} weight in pounds"
                               data-field="weight">
                        <span class="set-unit" aria-hidden="true">lb</span>
                    </div>
                    <div class="set-measure set-measure-reps">
                        <input type="number" class="set-input" inputmode="numeric" min="0"
                               value="${s.reps}" aria-label="Set ${i + 1} reps"
                               data-field="reps">
                        <span class="set-unit" aria-hidden="true">reps</span>
                    </div>
                    <button class="set-toggle" role="checkbox" data-act="toggle"
                            aria-checked="${s.completed ? "true" : "false"}"
                            aria-label="Mark set ${i + 1} complete">
                        <span class="box" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                                <path d="M5 12.5 L10 17.5 L19 6.5" stroke="currentColor"
                                      stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </button>
                </div>
            </div>
        `;
    });

    return html;
}

const SWIPE_WIDTH = 96;      // matches .set-row-delete
const SWIPE_TRIGGER = 40;    // past this, the row snaps open

/**
 * Slide one row's surface. `animate` marks a settled position (a snap); live
 * drag positions must not be recorded as open, or the next pointermove reads
 * the row as already open and jumps straight to the full offset.
 */
function setRowOffset(row, px, animate) {
    const surface = row.querySelector(".set-row-surface");
    if (!surface) return;
    row.classList.toggle("snapping", !!animate);
    surface.style.transform = px ? `translateX(${px}px)` : "";
    if (animate) row.dataset.open = px ? "true" : "false";
}

/** Close every open row except the one passed in. */
function closeOpenRows(except) {
    document.querySelectorAll('.set-row[data-open="true"]').forEach((row) => {
        if (row !== except) setRowOffset(row, 0, true);
    });
}

/** Attach the swipe gesture to a single row. */
function bindSwipe(row) {
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let decided = false;

    row.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        dragging = true;
        decided = false;
    });

    row.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Only claim the gesture once it is clearly horizontal, so vertical
        // scrolling and text selection inside the inputs still work.
        if (!decided) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            if (Math.abs(dx) <= Math.abs(dy)) {
                dragging = false;
                return;
            }
            decided = true;
            closeOpenRows(row);
            row.setPointerCapture(e.pointerId);
        }

        const open = row.dataset.open === "true" ? -SWIPE_WIDTH : 0;
        const next = Math.max(-SWIPE_WIDTH, Math.min(0, open + dx));
        setRowOffset(row, next, false);
    });

    const finish = (e) => {
        if (!dragging) return;
        dragging = false;
        if (!decided) return;
        decided = false;
        if (row.hasPointerCapture && row.hasPointerCapture(e.pointerId)) {
            row.releasePointerCapture(e.pointerId);
        }
        const dx = e.clientX - startX;
        const wasOpen = row.dataset.open === "true";
        const shouldOpen = wasOpen ? dx < SWIPE_TRIGGER : dx < -SWIPE_TRIGGER;
        setRowOffset(row, shouldOpen ? -SWIPE_WIDTH : 0, true);
    };

    row.addEventListener("pointerup", finish);
    row.addEventListener("pointercancel", finish);

    // Keyboard users never swipe: focusing the delete button opens the row.
    const del = row.querySelector('[data-act="remove"]');
    del.addEventListener("focus", () => setRowOffset(row, -SWIPE_WIDTH, true));
    del.addEventListener("blur", () => setRowOffset(row, 0, true));
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

        bindSwipe(row);
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
