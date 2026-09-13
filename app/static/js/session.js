/**
 * Rattlesnake — Active session logic
 * Timer, exercise entries, machine selection, set management, session completion.
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

        // Disable complete button if session is already completed
        if (session.status === "completed") {
            const btn = document.getElementById("complete-session-btn");
            btn.disabled = true;
        }
    } catch (err) {
        document.getElementById("entries-list").innerHTML =
            `<div class="empty-state"><p>Error loading session: ${err.message}</p></div>`;
    }

    document.getElementById("complete-session-btn").addEventListener("click", completeSession);
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

    const timerBar = document.getElementById("timer-bar");
    timerBar.classList.add("running");

    timer.intervalId = setInterval(() => {
        timer.seconds++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const display = document.getElementById("timer-display");
    display.textContent = formatTime(timer.seconds);
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

        // Build the dropdown options
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
                    <div class="machine-selector" style="margin-top:8px;">
                        <input type="text" id="new-machine-input-${entry.id}" placeholder="Machine name" style="flex:1;">
                        <button class="btn btn-accent btn-small" onclick="submitNewMachine(${entry.id}, ${entry.exercise ? entry.exercise.id : 'null'})">Add</button>
                        <button class="btn btn-muted btn-small" onclick="cancelNewMachine(${entry.id})">Cancel</button>
                    </div>
                </div>
            </div>
            <div class="sets-container" id="sets-${entry.id}">
                ${renderSetsHTML(entry.sets, entry.id)}
            </div>
            <div class="entry-actions">
                <button class="btn btn-secondary btn-small" onclick="addSet(${entry.id})">+ Add Set</button>
            </div>
        `;

        container.appendChild(block);

        // Initialize custom dropdown for this entry
        const dropdownContainer = document.getElementById(`machine-dropdown-${entry.id}`);
        const exerciseId = entry.exercise ? entry.exercise.id : null;

        machineDropdowns[entry.id] = new CustomSelect(dropdownContainer, {
            placeholder: "Select machine",
            options: dropdownOptions,
            selectedValue: selectedMachineId,
            id: `machine-select-${entry.id}`,
            onChange: (value) => onMachineChange(entry.id, value, exerciseId),
        });
    }
}

function renderSetsHTML(sets, entryId) {
    if (!sets || sets.length === 0) {
        return '<div class="metadata" style="padding: 8px 0;">Select a machine to load sets</div>';
    }

    let html = `
        <div class="sets-header">
            <span style="width:28px">Set</span>
            <span style="flex:1;max-width:90px">Weight</span>
            <span style="width:24px"></span>
            <span style="flex:1;max-width:90px">Reps</span>
            <span style="width:24px">✓</span>
            <span style="width:32px"></span>
        </div>
    `;

    for (let i = 0; i < sets.length; i++) {
        const s = sets[i];
        html += `
            <div class="set-row ${s.completed ? "completed" : ""}" id="set-row-${s.id}">
                <span class="set-number">${i + 1}</span>
                <input type="number" inputmode="decimal" value="${s.weight}" min="0" step="any"
                       onfocus="this.select()"
                       onchange="updateSet(${s.id}, 'weight', this.value)"
                       onblur="updateSet(${s.id}, 'weight', this.value)">
                <span class="set-unit">lbs</span>
                <input type="number" inputmode="numeric" value="${s.reps}" min="0"
                       onfocus="this.select()"
                       onchange="updateSet(${s.id}, 'reps', this.value)"
                       onblur="updateSet(${s.id}, 'reps', this.value)">
                <input type="checkbox" class="set-checkbox" ${s.completed ? "checked" : ""}
                       onchange="toggleSetComplete(${s.id}, this.checked, ${entryId})">
                <button class="btn-remove-set" onclick="removeSet(${s.id}, ${entryId})">×</button>
            </div>
        `;
    }

    return html;
}

// ---------------------------------------------------------------------------
// Machine selection
// ---------------------------------------------------------------------------

async function onMachineChange(entryId, value, exerciseId) {
    if (value === "__new__") {
        // Show inline input instead of prompt()
        const inlineEl = document.getElementById(`new-machine-inline-${entryId}`);
        inlineEl.style.display = "block";
        const input = document.getElementById(`new-machine-input-${entryId}`);
        input.value = "";
        input.focus();

        // Reset dropdown back to placeholder
        const dropdown = machineDropdowns[entryId];
        if (dropdown) {
            dropdown.setValue("");
        }
    } else if (value) {
        await prefillSets(entryId, parseInt(value));
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
        // Create machine
        const machine = await fetchJSON(`/api/exercises/${exerciseId}/machines`, {
            method: "POST",
            body: JSON.stringify({ name }),
        });

        // Add to custom dropdown and select it
        const dropdown = machineDropdowns[entryId];
        if (dropdown) {
            dropdown.addOption(String(machine.id), machine.name);
            dropdown.select(String(machine.id));
        }

        // Hide inline input
        document.getElementById(`new-machine-inline-${entryId}`).style.display = "none";

        // Prefill sets
        await prefillSets(entryId, machine.id);
    } catch (err) {
        console.error("Failed to create machine:", err);
    }
}

function cancelNewMachine(entryId) {
    document.getElementById(`new-machine-inline-${entryId}`).style.display = "none";
    const dropdown = machineDropdowns[entryId];
    if (dropdown) {
        dropdown.setValue("");
    }
}

async function prefillSets(entryId, machineId) {
    try {
        const entry = await fetchJSON(`/api/session-entries/${entryId}/prefill`, {
            method: "POST",
            body: JSON.stringify({ machine_id: machineId }),
        });

        const setsContainer = document.getElementById(`sets-${entryId}`);
        setsContainer.innerHTML = renderSetsHTML(entry.sets, entryId);
    } catch (err) {
        console.error("Failed to load sets:", err);
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
        payload.reps = parseInt(value) || 0;
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

        // Update row styling
        const row = document.getElementById(`set-row-${setId}`);
        if (row) {
            row.classList.toggle("completed", completed);
        }

        // Reset and start timer when a set is completed
        if (completed) {
            resetAndStartTimer();
        }
    } catch (err) {
        console.error("Failed to toggle set:", err);
    }
}

async function addSet(entryId) {
    try {
        const newSet = await fetchJSON(`/api/session-entries/${entryId}/sets`, {
            method: "POST",
            body: JSON.stringify({ weight: 0, reps: 0 }),
        });

        // Reload entry sets
        const session = await fetchJSON(`/api/sessions/${window.SESSION_ID}`);
        const entry = session.entries.find((e) => e.id === entryId);
        if (entry) {
            const setsContainer = document.getElementById(`sets-${entryId}`);
            setsContainer.innerHTML = renderSetsHTML(entry.sets, entryId);
        }
    } catch (err) {
        console.error("Failed to add set:", err);
    }
}

async function removeSet(setId, entryId) {
    try {
        await fetchJSON(`/api/session-sets/${setId}`, { method: "DELETE" });

        // Reload entry sets
        const session = await fetchJSON(`/api/sessions/${window.SESSION_ID}`);
        const entry = session.entries.find((e) => e.id === entryId);
        if (entry) {
            const setsContainer = document.getElementById(`sets-${entryId}`);
            setsContainer.innerHTML = renderSetsHTML(entry.sets, entryId);
        }
    } catch (err) {
        console.error("Failed to remove set:", err);
    }
}

// ---------------------------------------------------------------------------
// Complete session
// ---------------------------------------------------------------------------

async function completeSession() {
    const btn = document.getElementById("complete-session-btn");
    if (btn.disabled) return;

    // Disable immediately to prevent double-tap
    btn.disabled = true;

    try {
        await fetchJSON(`/api/sessions/${window.SESSION_ID}/complete`, {
            method: "PUT",
        });
        window.location.href = "/";
    } catch (err) {
        btn.disabled = false;
        console.error("Failed to complete session:", err);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
