/**
 * Rattlesnake — Progress page
 *
 * Top-set weight over time for one exercise on one instance.
 *
 * Two rules from CONTEXT.md shape this whole screen:
 *   - History is per-instance. The same number on two instances is not the same
 *     load, so there is an instance picker and exactly one line — never a line
 *     that averages incomparable scales.
 *   - The plotted value is the top set: the heaviest set of that session. No
 *     formula, nothing the lifter did not actually lift.
 *
 * The chart is hand-drawn SVG. There is no network at runtime (§3) so a chart
 * library is not an option, and §6 asks for marks drawable in a handful of path
 * commands anyway.
 */

const CHART_HEIGHT = 220;
const CHART_PAD = { top: 18, right: 14, bottom: 26, left: 46 };

const state = {
    exercises: [],
    instances: [],       // instances *with history*, most-logged first
    instanceId: null,
    instancePicker: null,
};

document.addEventListener("DOMContentLoaded", initProgress);

// Renamed from `init` — see the note in home.js. Pane movement belongs to
// pager.js now; this file only owns what is inside the Progress pane.
async function initProgress() {
    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        // The SVG is measured in real pixels rather than scaled, so a width
        // change means a redraw, not a stretch.
        resizeTimer = setTimeout(render, 120);
    });

    await loadExercises();
}

async function loadExercises() {
    const container = document.querySelector(".progress-container");

    try {
        state.exercises = await fetchJSON("/api/exercises");
        clearError(container);
    } catch (err) {
        showError(container, `Could not load exercises: ${err.message}`);
        return;
    }

    if (state.exercises.length === 0) {
        document.querySelector(".progress-pickers").style.display = "none";
        showEmpty("No exercises yet", "Add one to a routine and log a session.");
        return;
    }

    // Open on the first exercise rather than an empty picker: one less tap
    // between arriving and reading a number.
    const first = state.exercises[0];
    const mount = document.getElementById("exercise-picker");

    new CustomSelect(mount, {
        id: "exercise-picker",
        placeholder: "Select exercise",
        selectedValue: String(first.id),
        options: state.exercises.map((e) => ({
            value: String(e.id),
            label: e.name,
        })),
        onChange: (value) => loadProgress(Number(value)),
    });
    mount.querySelector(".custom-select-trigger")
        .setAttribute("aria-labelledby", "exercise-picker-label");

    loadProgress(first.id);
}

async function loadProgress(exerciseId) {
    const container = document.querySelector(".progress-container");

    let data;
    try {
        data = await fetchJSON(`/api/exercises/${exerciseId}/progress`);
        clearError(container);
    } catch (err) {
        showError(container, `Could not load progress: ${err.message}`);
        return;
    }

    state.instances = data.instances;
    state.instanceId = state.instances.length ? state.instances[0].id : null;

    mountInstancePicker();
    render();
}

/**
 * The instance picker only exists when there is a choice to make. One instance
 * means one possible answer, and a picker showing it is just another thing to
 * read mid-scroll.
 */
function mountInstancePicker() {
    const group = document.getElementById("instance-picker-group");
    const mount = document.getElementById("instance-picker");

    // This mount is reused every time the exercise changes, so the dropdown
    // that was here has to be detached, not just overwritten.
    if (state.instancePicker) {
        state.instancePicker.destroy();
        state.instancePicker = null;
    }

    if (state.instances.length < 2) {
        group.style.display = "none";
        mount.innerHTML = "";
        return;
    }

    group.style.display = "";
    state.instancePicker = new CustomSelect(mount, {
        id: "instance-picker",
        placeholder: "Select instance",
        selectedValue: String(state.instanceId),
        options: state.instances.map((m) => ({
            value: String(m.id),
            label: m.name,
        })),
        onChange: (value) => {
            state.instanceId = Number(value);
            render();
        },
    });
    mount.querySelector(".custom-select-trigger")
        .setAttribute("aria-labelledby", "instance-picker-label");
}

function render() {
    const result = document.getElementById("progress-result");
    const instance = state.instances.find((m) => m.id === state.instanceId);

    if (!instance || instance.points.length === 0) {
        result.innerHTML = "";
        showEmpty(
            "Nothing logged yet",
            "Complete a session on an instance and it lands here."
        );
        return;
    }

    hideEmpty();
    result.innerHTML = "";
    result.appendChild(buildReadout(instance));
    result.appendChild(buildChartCard(instance));
    result.appendChild(buildList(instance));
}

/** The current number, at display size — the one thing worth reading first. */
function buildReadout(instance) {
    const points = instance.points;
    const latest = points[points.length - 1];
    const first = points[0];

    const el = document.createElement("div");
    el.className = "progress-readout";

    const value = document.createElement("div");
    value.className = "progress-value";
    value.textContent = `${fmtWeight(latest.weight)} lb`;
    el.appendChild(value);

    const meta = document.createElement("div");
    meta.className = "progress-meta";
    meta.textContent = `Top set · ${latest.reps} reps · ${shortDate(latest.date)}`;
    el.appendChild(meta);

    if (points.length > 1) {
        const delta = latest.weight - first.weight;
        const trend = document.createElement("div");
        trend.className = "progress-trend";
        const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
        trend.textContent = delta === 0
            ? `Level since ${shortDate(first.date)}`
            : `${sign}${fmtWeight(Math.abs(delta))} lb since ${shortDate(first.date)}`;
        el.appendChild(trend);
    }

    return el;
}

function buildChartCard(instance) {
    const card = document.createElement("div");
    card.className = "progress-chart-card";

    if (instance.points.length === 1) {
        const note = document.createElement("p");
        note.className = "progress-chart-note";
        note.textContent = "One session logged. A second one draws the line.";
        card.appendChild(note);
        return card;
    }

    // The SVG is sized from the card's real width, so it is drawn once it is in
    // the document — hence the append-then-draw order.
    const holder = document.createElement("div");
    holder.className = "progress-chart";
    card.appendChild(holder);
    requestAnimationFrame(() => drawChart(holder, instance));
    return card;
}

function svgEl(name, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}

/**
 * Draw the series.
 *
 * The y-axis is deliberately not zero-based — a 0 baseline flattens every real
 * gain into a wobble near the top of the box. Both the floor and the ceiling are
 * labelled instead, so the scale is stated rather than implied.
 *
 * The x-axis is real time, so a month away from the gym reads as a month.
 */
function drawChart(holder, instance) {
    const points = instance.points;
    const width = holder.clientWidth;
    if (!width) return;

    holder.innerHTML = "";

    const plotW = width - CHART_PAD.left - CHART_PAD.right;
    const plotH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;

    const weights = points.map((p) => p.weight);
    const rawLo = Math.min(...weights);
    const rawHi = Math.max(...weights);
    // A flat series has no range to scale by; give it one so the line sits in
    // the middle of the box instead of dividing by zero.
    const span = rawHi - rawLo;
    const pad = span === 0 ? Math.max(rawHi * 0.1, 5) : span * 0.15;
    const lo = rawLo - pad;
    const hi = rawHi + pad;

    // Position by the full timestamp, not the date: two sessions on one day are
    // two points, and collapsing them onto a single x hides one of them.
    const times = points.map((p) => timeValue(p));
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const tSpan = tMax - tMin;

    // Several sessions on one day carry no time information, so they fall back
    // to even spacing rather than stacking on a single x.
    const x = (i) => CHART_PAD.left + (tSpan === 0
        ? (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
        : ((times[i] - tMin) / tSpan) * plotW);
    const y = (w) => CHART_PAD.top + (1 - (w - lo) / (hi - lo)) * plotH;

    const svg = svgEl("svg", {
        width,
        height: CHART_HEIGHT,
        viewBox: `0 0 ${width} ${CHART_HEIGHT}`,
        class: "progress-svg",
        role: "img",
        "aria-label":
            `${instance.name}: top set from ${fmtWeight(points[0].weight)} lb on ` +
            `${shortDate(points[0].date)} to ` +
            `${fmtWeight(points[points.length - 1].weight)} lb on ` +
            `${shortDate(points[points.length - 1].date)}.`,
    });

    // Floor and ceiling, labelled. Chart furniture, not a content divider (§1).
    // A flat series has one level, not two identical ones.
    const levels = span === 0 ? [rawHi] : [rawHi, rawLo];
    for (const w of levels) {
        svg.appendChild(svgEl("line", {
            class: "progress-grid",
            x1: CHART_PAD.left, x2: CHART_PAD.left + plotW,
            y1: y(w), y2: y(w),
        }));
        const label = svgEl("text", {
            class: "progress-axis",
            x: CHART_PAD.left - 8,
            y: y(w) + 4,
            "text-anchor": "end",
        });
        label.textContent = fmtWeight(w);
        svg.appendChild(label);
    }

    svg.appendChild(svgEl("polyline", {
        class: "progress-line",
        points: points.map((p, i) => `${x(i)},${y(p.weight)}`).join(" "),
    }));

    points.forEach((p, i) => {
        svg.appendChild(svgEl("circle", {
            class: i === points.length - 1 ? "progress-dot latest" : "progress-dot",
            cx: x(i),
            cy: y(p.weight),
            r: i === points.length - 1 ? 5.5 : 3.5,
        }));
    });

    const firstLabel = svgEl("text", {
        class: "progress-axis",
        x: CHART_PAD.left,
        y: CHART_HEIGHT - 8,
    });
    firstLabel.textContent = shortDate(points[0].date);
    svg.appendChild(firstLabel);

    const lastLabel = svgEl("text", {
        class: "progress-axis",
        x: CHART_PAD.left + plotW,
        y: CHART_HEIGHT - 8,
        "text-anchor": "end",
    });
    lastLabel.textContent = shortDate(points[points.length - 1].date);
    svg.appendChild(lastLabel);

    holder.appendChild(svg);
}

/**
 * The exact numbers. A dense line cannot carry 44x44 tap targets without lying
 * about them, so the chart stays a glance and the values live here, newest
 * first — the way you would read back a log.
 */
function buildList(instance) {
    const list = document.createElement("div");
    list.className = "progress-list";

    [...instance.points].reverse().forEach((p) => {
        const row = document.createElement("div");
        row.className = "progress-row";

        const date = document.createElement("span");
        date.className = "progress-row-date";
        date.textContent = shortDate(p.date);
        row.appendChild(date);

        const value = document.createElement("span");
        value.className = "progress-row-value";
        value.textContent = `${fmtWeight(p.weight)} lb × ${p.reps} reps`;
        row.appendChild(value);

        list.appendChild(row);
    });

    return list;
}

function showEmpty(title, hint) {
    const empty = document.getElementById("progress-empty");
    empty.querySelector(".empty-state-title").textContent = title;
    empty.querySelector(".empty-state-hint").textContent = hint;
    empty.style.display = "block";
}

function hideEmpty() {
    document.getElementById("progress-empty").style.display = "none";
}

/** Parse YYYY-MM-DD as a local date — `new Date(iso)` lands on UTC midnight,
 *  which reads as the previous day anywhere west of Greenwich. */
function dateValue(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
}

/** X position for a point. Only relative spacing matters here, so it is enough
 *  that every point is read the same way. Falls back to the date alone. */
function timeValue(point) {
    if (point.at) {
        const t = new Date(point.at).getTime();
        if (!Number.isNaN(t)) return t;
    }
    return dateValue(point.date);
}

function shortDate(iso) {
    const date = new Date(dateValue(iso));
    const opts = { month: "short", day: "numeric" };
    if (date.getFullYear() !== new Date().getFullYear()) {
        opts.year = "numeric";
    }
    return date.toLocaleDateString(undefined, opts);
}

/** 195.0 reads as "195"; 2.5 stays "2.5". */
function fmtWeight(value) {
    const n = Number(value);
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}
