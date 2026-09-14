/**
 * Rattlesnake — Routine editor logic
 * Dynamic exercise list, autocomplete, machine management, save, delete.
 *
 * Rows are built with DOM APIs rather than interpolated HTML strings: an
 * exercise name containing an apostrophe used to break the inline handler,
 * because the attribute-escaped &#39; decoded back to ' before JS parsed it.
 */

let allExercises = [];
let exerciseIndex = 0;
let routineName = "";

document.addEventListener("DOMContentLoaded", init);

async function init() {
    try {
        allExercises = await fetchJSON("/api/exercises");
    } catch {
        allExercises = [];
    }

    document.getElementById("add-exercise-btn").addEventListener("click", () => {
        addExerciseRow();
    });

    document.getElementById("routine-form").addEventListener("submit", saveRoutine);

    const deleteBtn = document.getElementById("delete-routine-btn");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", showDeleteConfirm);
        document.getElementById("delete-cancel-btn")
            .addEventListener("click", hideDeleteConfirm);
        document.getElementById("delete-confirm-btn")
            .addEventListener("click", deleteRoutine);
    }

    if (window.ROUTINE_ID) {
        await loadRoutine(window.ROUTINE_ID);
    } else {
        addExerciseRow();
    }
}

async function loadRoutine(id) {
    try {
        const routine = await fetchJSON(`/api/routines/${id}`);
        routineName = routine.name;
        document.getElementById("routine-name").value = routine.name;

        const msg = document.getElementById("delete-confirm-message");
        if (msg) {
            msg.textContent = `Delete "${routine.name}"? This can't be undone.`;
        }

        for (const exercise of routine.exercises) {
            addExerciseRow(exercise.name, exercise.machines || []);
        }
    } catch (err) {
        showError(
            document.querySelector(".routine-container"),
            `Could not load this routine: ${err.message}`
        );
    }
}

// ---------------------------------------------------------------------------
// Exercise rows
// ---------------------------------------------------------------------------

function addExerciseRow(name = "", machines = []) {
    const list = document.getElementById("exercise-list");
    const idx = exerciseIndex++;

    const row = document.createElement("div");
    row.className = "exercise-row";
    row.dataset.idx = idx;

    // Header: name input + autocomplete + remove
    const header = document.createElement("div");
    header.className = "exercise-row-header";

    const wrapper = document.createElement("div");
    wrapper.className = "autocomplete-wrapper";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-input exercise-name-input";
    input.placeholder = "Exercise name";
    // Placeholders are Muted per §2, so they are decorative only; every field
    // carries its own accessible name.
    input.setAttribute("aria-label", "Exercise name");
    input.autocomplete = "off";
    input.dataset.idx = idx;
    input.value = name;

    const acList = document.createElement("div");
    acList.className = "autocomplete-list";
    acList.id = `autocomplete-${idx}`;

    wrapper.append(input, acList);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-text";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute("aria-label", "Remove exercise");
    removeBtn.addEventListener("click", () => row.remove());

    header.append(wrapper, removeBtn);

    // Machines, visibly nested under their exercise
    const machineGroup = document.createElement("div");
    machineGroup.className = "machine-group";

    const machineLabel = document.createElement("span");
    machineLabel.className = "field-label";
    machineLabel.textContent = "Machines";

    const machineList = document.createElement("div");
    machineList.className = "machine-list";
    machineList.id = `machines-${idx}`;

    const addMachineBtn = document.createElement("button");
    addMachineBtn.type = "button";
    addMachineBtn.className = "btn btn-muted btn-small";
    addMachineBtn.textContent = "+ Machine";
    addMachineBtn.addEventListener("click", () => addMachineRow(idx));

    machineGroup.append(machineLabel, machineList, addMachineBtn);
    row.append(header, machineGroup);
    list.appendChild(row);

    for (const m of machines) {
        addMachineRow(idx, m.name);
    }

    input.addEventListener("input", () => handleAutocomplete(input, idx));
    input.addEventListener("focus", () => handleAutocomplete(input, idx));
    input.addEventListener("blur", () => {
        // delay so a click on an autocomplete item still registers
        setTimeout(() => acList.classList.remove("show"), 200);
    });
}

function addMachineRow(exerciseIdx, name = "") {
    const container = document.getElementById(`machines-${exerciseIdx}`);
    const row = document.createElement("div");
    row.className = "machine-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "machine-name-input";
    input.placeholder = "Machine name";
    input.setAttribute("aria-label", "Machine name");
    input.value = name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-text";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute("aria-label", "Remove machine");
    removeBtn.addEventListener("click", () => row.remove());

    row.append(input, removeBtn);
    container.appendChild(row);
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

function handleAutocomplete(input, idx) {
    const query = input.value.trim().toLowerCase();
    const acList = document.getElementById(`autocomplete-${idx}`);

    if (!query) {
        acList.classList.remove("show");
        return;
    }

    const matches = allExercises.filter((e) =>
        e.name.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
        acList.classList.remove("show");
        return;
    }

    acList.innerHTML = "";
    for (const exercise of matches) {
        const item = document.createElement("div");
        item.className = "autocomplete-item";
        item.setAttribute("role", "option");
        item.textContent = exercise.name;
        // mousedown fires before blur, so the suggestion survives the blur handler
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            selectAutocomplete(idx, exercise.name);
        });
        acList.appendChild(item);
    }
    acList.classList.add("show");
}

function selectAutocomplete(idx, name) {
    const row = document.querySelector(`.exercise-row[data-idx="${idx}"]`);
    const input = row.querySelector(".exercise-name-input");
    input.value = name;

    document.getElementById(`autocomplete-${idx}`).classList.remove("show");

    const exercise = allExercises.find(
        (e) => e.name.toLowerCase() === name.toLowerCase()
    );
    if (exercise && exercise.machines && exercise.machines.length > 0) {
        document.getElementById(`machines-${idx}`).innerHTML = "";
        for (const m of exercise.machines) {
            addMachineRow(idx, m.name);
        }
    }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function saveRoutine(e) {
    e.preventDefault();

    const container = document.querySelector(".routine-container");
    const nameInput = document.getElementById("routine-name");
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        return;
    }

    const exercises = [];
    for (const row of document.querySelectorAll(".exercise-row")) {
        const exName = row.querySelector(".exercise-name-input").value.trim();
        if (!exName) continue;

        const machines = [];
        for (const mi of row.querySelectorAll(".machine-name-input")) {
            const mName = mi.value.trim();
            if (mName) machines.push({ name: mName });
        }

        exercises.push({ name: exName, machines });
    }

    const payload = { name, exercises };
    const saveBtn = document.getElementById("save-routine-btn");
    saveBtn.disabled = true;

    try {
        if (window.ROUTINE_ID) {
            await fetchJSON(`/api/routines/${window.ROUTINE_ID}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
        } else {
            await fetchJSON("/api/routines", {
                method: "POST",
                body: JSON.stringify(payload),
            });
        }
        window.location.href = "/";
    } catch (err) {
        saveBtn.disabled = false;
        showError(container, `Could not save this routine: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Delete — in-page confirm, never a native confirm() dialog
// ---------------------------------------------------------------------------

function showDeleteConfirm() {
    document.getElementById("delete-routine-btn").style.display = "none";
    document.getElementById("delete-confirm").style.display = "block";
    document.getElementById("delete-cancel-btn").focus();
}

function hideDeleteConfirm() {
    document.getElementById("delete-confirm").style.display = "none";
    const btn = document.getElementById("delete-routine-btn");
    btn.style.display = "";
    btn.focus();
}

async function deleteRoutine() {
    const container = document.querySelector(".routine-container");
    const btn = document.getElementById("delete-confirm-btn");
    btn.disabled = true;

    try {
        await fetchJSON(`/api/routines/${window.ROUTINE_ID}`, { method: "DELETE" });
        window.location.href = "/";
    } catch (err) {
        btn.disabled = false;
        hideDeleteConfirm();
        showError(container, `Could not delete this routine: ${err.message}`);
    }
}
