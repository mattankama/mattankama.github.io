/**
 * Rattlesnake — Routine editor logic
 * Dynamic exercise list, autocomplete, machine management, save.
 */

let allExercises = [];
let exerciseIndex = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
    // Load existing exercises for autocomplete
    try {
        allExercises = await fetchJSON("/api/exercises");
    } catch {
        allExercises = [];
    }

    document.getElementById("add-exercise-btn").addEventListener("click", () => {
        addExerciseRow();
    });

    document.getElementById("routine-form").addEventListener("submit", saveRoutine);

    // If editing, pre-populate
    if (window.ROUTINE_ID) {
        await loadRoutine(window.ROUTINE_ID);
    } else {
        // Start with one empty exercise row
        addExerciseRow();
    }
}

async function loadRoutine(id) {
    try {
        const routine = await fetchJSON(`/api/routines/${id}`);
        document.getElementById("routine-name").value = routine.name;

        for (const exercise of routine.exercises) {
            addExerciseRow(exercise.name, exercise.machines || []);
        }
    } catch (err) {
        console.error("Failed to load routine:", err);
    }
}

function addExerciseRow(name = "", machines = []) {
    const list = document.getElementById("exercise-list");
    const idx = exerciseIndex++;
    const row = document.createElement("div");
    row.className = "exercise-row";
    row.dataset.idx = idx;

    row.innerHTML = `
        <div class="exercise-row-header">
            <div class="autocomplete-wrapper">
                <input type="text"
                       class="form-input exercise-name-input"
                       placeholder="Exercise name"
                       value="${escapeAttr(name)}"
                       data-idx="${idx}"
                       autocomplete="off">
                <div class="autocomplete-list" id="autocomplete-${idx}"></div>
            </div>
            <button type="button" class="btn btn-danger btn-small" onclick="removeExerciseRow(${idx})">×</button>
        </div>
        <div class="machine-list" id="machines-${idx}">
        </div>
        <button type="button" class="btn btn-muted btn-small" onclick="addMachineRow(${idx})">+ Machine</button>
    `;

    list.appendChild(row);

    // Add existing machines
    for (const m of machines) {
        addMachineRow(idx, m.name);
    }

    // Setup autocomplete
    const input = row.querySelector(".exercise-name-input");
    input.addEventListener("input", () => handleAutocomplete(input, idx));
    input.addEventListener("focus", () => handleAutocomplete(input, idx));
    input.addEventListener("blur", () => {
        // Delay to allow click on autocomplete item
        setTimeout(() => {
            const acList = document.getElementById(`autocomplete-${idx}`);
            if (acList) acList.classList.remove("show");
        }, 200);
    });
}

function removeExerciseRow(idx) {
    const row = document.querySelector(`.exercise-row[data-idx="${idx}"]`);
    if (row) row.remove();
}

function addMachineRow(exerciseIdx, name = "") {
    const container = document.getElementById(`machines-${exerciseIdx}`);
    const row = document.createElement("div");
    row.className = "machine-row";
    row.innerHTML = `
        <input type="text" class="machine-name-input" placeholder="Machine name" value="${escapeAttr(name)}">
        <button type="button" class="btn btn-danger btn-small" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(row);
}

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

    acList.innerHTML = matches
        .map(
            (e) =>
                `<div class="autocomplete-item" onmousedown="selectAutocomplete(${idx}, '${escapeAttr(e.name)}')">${escapeHTML(e.name)}</div>`
        )
        .join("");
    acList.classList.add("show");
}

function selectAutocomplete(idx, name) {
    const row = document.querySelector(`.exercise-row[data-idx="${idx}"]`);
    const input = row.querySelector(".exercise-name-input");
    input.value = name;

    const acList = document.getElementById(`autocomplete-${idx}`);
    acList.classList.remove("show");

    // Load machines for this exercise
    const exercise = allExercises.find(
        (e) => e.name.toLowerCase() === name.toLowerCase()
    );
    if (exercise && exercise.machines && exercise.machines.length > 0) {
        const machineContainer = document.getElementById(`machines-${idx}`);
        machineContainer.innerHTML = "";
        for (const m of exercise.machines) {
            addMachineRow(idx, m.name);
        }
    }
}

async function saveRoutine(e) {
    e.preventDefault();

    const nameInput = document.getElementById("routine-name");
    const name = nameInput.value.trim();
    if (!name) {
        // Focus the empty field instead of showing an alert
        nameInput.focus();
        return;
    }

    const exerciseRows = document.querySelectorAll(".exercise-row");
    const exercises = [];

    for (const row of exerciseRows) {
        const exName = row.querySelector(".exercise-name-input").value.trim();
        if (!exName) continue;

        const machines = [];
        const machineInputs = row.querySelectorAll(".machine-name-input");
        for (const mi of machineInputs) {
            const mName = mi.value.trim();
            if (mName) machines.push({ name: mName });
        }

        exercises.push({ name: exName, machines });
    }

    const payload = { name, exercises };

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
        console.error("Failed to save routine:", err);
    }
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
