/**
 * Rattlesnake — Pager
 *
 * Home and Progress are two panes of a single document, laid side by side on one
 * track. The track follows the finger through the whole drag and snaps to the
 * nearest pane on release — direct manipulation, the way a phone's tab strip
 * behaves, rather than a flick that triggers an animation afterwards.
 *
 * That is only possible because nothing navigates. Both panes are in the DOM and
 * both have already loaded their data, so there is no request to wait on, no
 * blank frame to cover, and the content under your finger is real at every point
 * in the gesture.
 *
 * The URL is kept in step with replaceState, so a reload — or opening /progress
 * directly — lands on the pane you were looking at, without filling the history
 * stack with one entry per swipe.
 */

const PANES = [
    { id: "pane-home", path: "/", title: "Rattlesnake" },
    { id: "pane-progress", path: "/progress", title: "Progress — Rattlesnake" },
];

/** A drag starting on one of these belongs to the control, not to the track. */
const PAGER_BLOCKERS =
    "button, a, input, select, textarea, .custom-select, [role='combobox']";

const DECIDE_SLOP = 8;        // px of horizontal travel before the track claims a drag
const VERTICAL_GIVE_UP = 36;  // px of vertical travel before we concede to a scroll
const VERTICAL_BIAS = 1.4;    // how decisively vertical that travel has to be
const EDGE_RESISTANCE = 0.35; // drag past the first/last pane feels like rubber

// Going further in, versus coming back. Returning is deliberately far the
// cheaper gesture — a fraction of the travel — because you leave Progress
// far more often than you enter it, usually one-handed mid-workout, and the two
// failures are not equal: an under-shot drag back strands you on a pane you were
// trying to leave, while an over-eager one only shows a chart you dismiss the
// same way. The floor on this is not the numbers below but the axis test in the
// drag handler: a gesture only counts as horizontal at all once it out-travels
// its own vertical component, so a low threshold cannot turn a scroll into a
// pane change.
const SNAP_DISTANCE = 0.22;      // fraction of a pane that counts as "gone"
const SNAP_VELOCITY = 0.45;      // px/ms — a fast flick commits on its own
// Barely more than the slop that claims the drag in the first place: any
// deliberate sideways movement is read as "take me back". The hard floor is
// DECIDE_SLOP — below that the track never claims the pointer, so no amount of
// lowering these two can commit a shorter gesture than that.
const SNAP_DISTANCE_BACK = 0.04;
const SNAP_VELOCITY_BACK = 0.12;

const pager = {
    el: null,
    track: null,
    index: 0,
    width: 0,
    dragging: false,
    decided: false,
    startX: 0,
    startY: 0,
    startedAt: 0,
};

document.addEventListener("DOMContentLoaded", initPager);

function initPager() {
    pager.el = document.getElementById("pager");
    pager.track = document.getElementById("pager-track");
    if (!pager.el || !pager.track) return;

    pager.width = pager.el.clientWidth;
    pager.index = clampIndex(Number(window.START_PANE) || 0);
    settle(pager.index, false);

    window.addEventListener("resize", () => {
        pager.width = pager.el.clientWidth;
        // A resize is not a gesture: re-place the track, do not animate it there.
        offsetTrack(restingOffset(pager.index), false);
    });

    bindDrag();
    bindKeys();
}

function clampIndex(i) {
    return Math.max(0, Math.min(PANES.length - 1, i));
}

function restingOffset(index) {
    return -index * pager.width;
}

/**
 * Place the track. `animate` marks a settled position; live drag positions must
 * not animate, or the transform chases the finger instead of tracking it.
 */
function offsetTrack(px, animate) {
    pager.track.classList.toggle("snapping", !!animate);
    pager.track.style.transform = `translate3d(${px}px, 0, 0)`;
}

/** Move to a pane and make the rest of the page agree with it. */
function settle(index, animate) {
    pager.index = clampIndex(index);
    offsetTrack(restingOffset(pager.index), animate);

    const pane = PANES[pager.index];
    if (location.pathname !== pane.path) {
        history.replaceState({ pane: pager.index }, "", pane.path);
    }
    document.title = pane.title;

    // The pane you cannot see should not be reachable by tabbing into it.
    PANES.forEach((p, i) => {
        const el = document.getElementById(p.id);
        if (el) el.inert = i !== pager.index;
    });
}

function bindDrag() {
    const el = pager.el;

    el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target.closest && e.target.closest(PAGER_BLOCKERS)) return;
        pager.dragging = true;
        pager.decided = false;
        pager.startX = e.clientX;
        pager.startY = e.clientY;
        pager.startedAt = performance.now();
    });

    el.addEventListener("pointermove", (e) => {
        if (!pager.dragging) return;
        const dx = e.clientX - pager.startX;
        const dy = e.clientY - pager.startY;

        // A gesture is horizontal, vertical, or NOT YET EITHER. That third state
        // is the whole point: the first few pixels of a real swipe are noisy, and
        // judging on whichever sample happens to cross the slop first threw away
        // swipes that drifted a little up or down on the way out. Undecided costs
        // nothing — the pane keeps scrolling natively until the track claims the
        // pointer — so when in doubt, keep watching.
        if (!pager.decided) {
            // Concede only to travel that is both substantial and decisively
            // vertical. The bar is deliberately high: a short swipe crosses very
            // little horizontal ground early on, so a low one fires here while dx
            // is still tiny and kills exactly the brief, drifting gesture that
            // returning is supposed to be. Waiting longer costs nothing, because
            // claiming still needs dx to out-travel dy — which a scroll never
            // does — so this concede is only about when to stop watching.
            if (
                Math.abs(dy) >= VERTICAL_GIVE_UP &&
                Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS
            ) {
                pager.dragging = false;
                return;
            }
            // Otherwise wait for horizontal travel to get ahead, however long the
            // finger takes to commit.
            if (Math.abs(dx) < DECIDE_SLOP || Math.abs(dx) < Math.abs(dy)) return;
            pager.decided = true;
            el.setPointerCapture(e.pointerId);
        }

        offsetTrack(withResistance(restingOffset(pager.index) + dx), false);
    });

    const finish = (e) => {
        if (!pager.dragging) return;
        pager.dragging = false;
        if (!pager.decided) return;
        pager.decided = false;
        if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId);
        }

        const dx = e.clientX - pager.startX;
        const velocity = dx / Math.max(performance.now() - pager.startedAt, 1);

        // Rightward travel heads back toward Home, and asks for less to commit.
        const returning = dx > 0;
        const minDistance = pager.width *
            (returning ? SNAP_DISTANCE_BACK : SNAP_DISTANCE);
        const minVelocity = returning ? SNAP_VELOCITY_BACK : SNAP_VELOCITY;

        // Either a long enough drag or a quick enough flick commits; anything
        // shorter and slower falls back to where it came from.
        const commits =
            Math.abs(dx) > minDistance || Math.abs(velocity) > minVelocity;

        let target = pager.index;
        if (commits) target += dx < 0 ? 1 : -1;
        settle(target, true);
    };

    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
}

/** Past the first or last pane the track still moves, but grudgingly. */
function withResistance(px) {
    const max = 0;
    const min = restingOffset(PANES.length - 1);
    if (px > max) return max + (px - max) * EDGE_RESISTANCE;
    if (px < min) return min + (px - min) * EDGE_RESISTANCE;
    return px;
}

/**
 * Arrow keys move between panes. There is no visible control by design, and a
 * drag needs a pointer — without this the second pane would be unreachable to
 * anyone on a keyboard.
 */
function bindKeys() {
    document.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target.closest && e.target.closest(PAGER_BLOCKERS)) return;
        if (e.key === "ArrowRight") settle(pager.index + 1, true);
        else if (e.key === "ArrowLeft") settle(pager.index - 1, true);
    });
}
