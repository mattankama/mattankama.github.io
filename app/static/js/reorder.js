/**
 * Rattlesnake — drag a card up or down a list to reorder it.
 *
 * Namespaced for the same reason store.js is: every file ships as a plain
 * <script> into one shared scope, and a bare `move` would be a collision
 * waiting to happen. See tests/js/script-scope.test.js.
 *
 * Two decisions worth knowing before reading the gesture code.
 *
 * **HTML5 drag-and-drop is not an option.** `draggable="true"` is a mouse API
 * that was never wired to touch: Android Chrome synthesises no drag events from
 * a finger at all, and iOS only produces them through the system drag session.
 * Its drag image is a browser-rendered snapshot that cannot be styled, so it
 * could never look like anything else in this app. Pointer events it is, the
 * same way the pager and the set-row swipe already work.
 *
 * **The list is never re-ordered mid-drag, only transformed.** An exercise card
 * with four instances is several times taller than a bare one, so moving a node
 * while a finger is on it re-lays-out everything underneath and invalidates
 * every offset the animation is halfway through. The siblings slide on
 * transforms, and exactly one insertBefore runs after the drop has landed — by
 * which point the row is already sitting where it will end up, so the commit
 * moves nothing visible.
 */
(function (root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    else root.RattlesnakeReorder = exported;
})(typeof self !== "undefined" ? self : globalThis, function () {
"use strict";

// ---------------------------------------------------------------------------
// The arithmetic — pure, and the only part with tests
// ---------------------------------------------------------------------------

/** A copy of `items` with the one at `from` moved to `to`. Indices clamp. */
function move(items, from, to) {
    const next = [...items];
    if (next.length === 0) return next;
    const clamp = (i) => Math.min(Math.max(i, 0), next.length - 1);
    next.splice(clamp(to), 0, next.splice(clamp(from), 1)[0]);
    return next;
}

/**
 * Which slot a drag of `dy` pixels from row `from` resolves to.
 *
 * A slot is claimed once the lifted row is past the halfway mark of the row it
 * is passing — measured in pixels off the real heights, because "half a row"
 * means something different for every card in these lists.
 */
function targetIndex({ heights, gap, from, dy }) {
    const step = (i) => heights[i] + gap;
    let travelled = 0;
    let target = from;

    if (dy > 0) {
        for (let i = from + 1; i < heights.length; i++) {
            travelled += step(i);
            if (dy < travelled - step(i) / 2) break;
            target = i;
        }
    } else if (dy < 0) {
        for (let i = from - 1; i >= 0; i--) {
            travelled += step(i);
            if (-dy < travelled - step(i) / 2) break;
            target = i;
        }
    }
    return target;
}

/** The translateY each row needs so the gap follows the finger. */
function offsets({ heights, gap, from, to }) {
    const shift = heights.map(() => 0);
    const lifted = heights[from] + gap;

    if (to > from) for (let i = from + 1; i <= to; i++) shift[i] = -lifted;
    else if (to < from) for (let i = to; i < from; i++) shift[i] = lifted;

    return shift;
}

/**
 * Signed pixels-per-millisecond the page should scroll, from where the finger
 * is relative to the screen edges.
 *
 * Squared rather than linear: a linear ramp starts at a visible speed the
 * instant the finger crosses into the zone, which reads as a lurch. Squared, it
 * eases in from nothing at the boundary and still reaches full speed at the
 * edge.
 */
function edgeSpeed({ clientY, viewport, zone = EDGE_PX, max = EDGE_SPEED }) {
    const fromBottom = viewport - clientY;
    let depth = 0;
    if (clientY < zone) depth = -(1 - clientY / zone);
    else if (fromBottom < zone) depth = 1 - fromBottom / zone;

    // Clamped before squaring. A finger dragged past the edge of the screen
    // still reports a clientY, and it is off the end: unclamped, a touch 100px
    // below the viewport squares to nearly six times full speed and the page
    // bolts. Holding at the edge is the fastest the scroll ever goes.
    depth = Math.max(-1, Math.min(1, depth));
    return Math.sign(depth) * depth * depth * max;
}

/**
 * Where the scroll lands after `elapsed` ms at `speed`, as a float.
 *
 * Kept as a float on purpose. `scrollBy()` rounds every call, so a speed below
 * one pixel per frame — which is most of the zone — lands on 0 one frame and 1
 * the next, and that rounding is the stutter. Accumulating here and setting the
 * position absolutely moves by the same amount every frame.
 */
function nextScroll({ at, speed, elapsed, max }) {
    return Math.min(Math.max(at + speed * elapsed, 0), Math.max(max, 0));
}

/** The translateY the lifted row settles to so it lands in slot `to`. */
function settleOffset({ heights, gap, from, to }) {
    let distance = 0;
    if (to > from) for (let i = from + 1; i <= to; i++) distance += heights[i] + gap;
    else if (to < from) for (let i = to; i < from; i++) distance -= heights[i] + gap;
    return distance;
}

// ---------------------------------------------------------------------------
// The gesture
// ---------------------------------------------------------------------------

const HOLD_MS = 400;
const SLOP_PX = 10;
const SETTLE_MS = 220; // --dur 180 plus room for the spring to stop ringing
const EDGE_PX = 72;
// Pixels per millisecond at the very edge, not per frame: a fixed step scrolls
// twice as fast on a 120Hz phone as a 60Hz one, and shows a dropped frame as a
// jump. 0.85 px/ms is the old 14px at 60Hz.
const EDGE_SPEED = 0.85;

/**
 * Make `list`'s children draggable by press-and-hold.
 *
 * `hold` names the part of a card where a 400ms press picks it up; anything
 * matching `never` inside it is left alone, because iOS owns long-press on a
 * text input — it opens the selection magnifier and the callout — and that is
 * not a fight worth having.
 *
 * There is no grip. That puts the whole weight of the gesture on the hold
 * timer, and with it on the non-passive touchmove listener at the foot of this
 * function: a card has to stay scrollable right up until the press succeeds, so
 * nothing here can take `touch-action` away from the browser in advance.
 *
 * `onDrop(from, to)` runs after the single DOM move, and only when the row
 * actually changed slots.
 */
function bind(list, { item: itemSelector, hold, never, onDrop }) {
    let drag = null;
    let pending = null;
    let swallowClick = false;

    const items = () => [...list.querySelectorAll(itemSelector)];

    function cancelPending() {
        if (!pending) return;
        clearTimeout(pending.timerId);
        pending = null;
    }

    function pickUp(item, pointerId, clientY) {
        const all = items();
        if (all.length < 2) return;

        const styles = getComputedStyle(list);
        const gap = parseFloat(styles.rowGap) || 0;
        const heights = all.map((el) => el.offsetHeight);
        const from = all.indexOf(item);

        drag = {
            pointerId,
            item,
            all,
            heights,
            gap,
            from,
            to: from,
            clientY,
            // Page coordinates, so an auto-scroll moves the drag even though
            // the finger is holding still. Without this the row follows the
            // finger but drops a slot or two off, which is the classic
            // "auto-scrolls but lands in the wrong place" bug.
            startPageY: clientY + window.scrollY,
            dy: 0,
            raf: null,
            // Cached because reading them per frame forces a layout mid-drag,
            // which is its own source of stutter. Neither can change while a
            // card is up: the list only transforms, and scrolling is ours.
            viewport: window.innerHeight,
            maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            // The scroll position as a float. See edgeScroll().
            scrollAt: window.scrollY,
            lastFrame: 0,
        };

        list.classList.add("reordering");
        // The press that picks a card up is the same press that starts a text
        // selection, and by now iOS may already have made one. `user-select`
        // does not retract a selection that exists, so it has to be cleared.
        document.body.classList.add("reordering");
        const selection = window.getSelection && window.getSelection();
        if (selection) selection.removeAllRanges();
        item.classList.add("lifted");
        // A live drag must never carry a transition, or the transform chases
        // the finger instead of landing on it (design_guidelines.md §7).
        item.style.transition = "none";
        paint(true);

        try {
            list.setPointerCapture(pointerId);
        } catch {
            // Capture is a convenience; the listeners are on the list either way.
        }
        drag.raf = requestAnimationFrame(edgeScroll);
    }

    /**
     * The lifted card follows the finger every frame; the siblings only move
     * when the slot changes. Rewriting their transforms on every frame of an
     * edge scroll restyles the whole list sixty times a second to say what it
     * already said.
     */
    function paint(slotChanged) {
        const { item, heights, gap, from, to, dy, all } = drag;

        if (slotChanged) {
            const shift = offsets({ heights, gap, from, to });
            all.forEach((el, i) => {
                if (el === item) return;
                el.classList.add("shifting");
                el.style.transform = shift[i] ? `translateY(${shift[i]}px)` : "";
            });
        }
        item.style.transform = `translateY(${dy}px) scale(1.02)`;
    }

    function track() {
        drag.dy = drag.clientY + window.scrollY - drag.startPageY;
        const to = targetIndex({
            heights: drag.heights,
            gap: drag.gap,
            from: drag.from,
            dy: drag.dy,
        });
        const slotChanged = to !== drag.to;
        drag.to = to;
        paint(slotChanged);
    }

    /**
     * Scroll when the card is held against the top or bottom of the screen.
     *
     * The speed curve and the float accumulator are in edgeSpeed() and
     * nextScroll(); what is left here is frame bookkeeping.
     */
    function edgeScroll(now) {
        if (!drag) return;

        // A step scaled by the real frame time, so a dropped frame covers the
        // distance it missed instead of showing as a hitch — and a 120Hz phone
        // scrolls at the same speed as a 60Hz one. First frame has no previous
        // timestamp; 16.7ms is the honest guess. The cap keeps a stalled tab
        // from lurching the length of the pause when it comes back.
        const elapsed = drag.lastFrame ? Math.min(now - drag.lastFrame, 50) : 16.7;
        drag.lastFrame = now;

        const speed = edgeSpeed({ clientY: drag.clientY, viewport: drag.viewport });

        if (speed) {
            drag.scrollAt = nextScroll({
                at: drag.scrollAt,
                speed,
                elapsed,
                max: drag.maxScroll,
            });
            // `instant` rather than the default, which would honour a
            // `scroll-behavior: smooth` and animate against us every frame.
            window.scrollTo({ top: drag.scrollAt, behavior: "instant" });
            // The finger has not moved but the document has, so the drop target
            // has. Recomputing here is what keeps the card from landing a slot
            // or two off what the gap showed.
            track();
        } else {
            // Not driving the scroll, so the page is the authority on where it is.
            drag.scrollAt = window.scrollY;
        }

        drag.raf = requestAnimationFrame(edgeScroll);
    }

    function drop(commit) {
        const { item, heights, gap, from, all, raf } = drag;
        const to = commit ? drag.to : from;

        cancelAnimationFrame(raf);
        // A drag that ends over a control must not also read as a tap on it.
        swallowClick = true;
        try {
            list.releasePointerCapture(drag.pointerId);
        } catch {
            // Already released, or never captured.
        }
        drag = null;

        // Animate the lifted row into the gap the siblings have been holding
        // open, then commit. The DOM move is a no-op visually because the row
        // is already there.
        const shift = offsets({ heights, gap, from, to });
        all.forEach((el, i) => {
            if (el === item) return;
            el.style.transform = shift[i] ? `translateY(${shift[i]}px)` : "";
        });

        item.classList.add("settling");
        item.style.transition = "";
        item.style.transform = `translateY(${settleOffset({ heights, gap, from, to })}px)`;

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            item.removeEventListener("transitionend", finish);

            for (const el of all) {
                el.style.transform = "";
                el.style.transition = "";
                el.classList.remove("lifted", "shifting", "settling");
            }
            list.classList.remove("reordering");
            document.body.classList.remove("reordering");

            if (to !== from) {
                if (to > from) list.insertBefore(item, all[to].nextSibling);
                else list.insertBefore(item, all[to]);
                if (onDrop) onDrop(from, to);
            }
        };

        item.addEventListener("transitionend", finish);
        // prefers-reduced-motion collapses the transition to 0.01ms, and an
        // unchanged transform fires no transitionend at all, so neither case
        // can be left waiting on an event that is not coming.
        setTimeout(finish, SETTLE_MS);
    }

    list.addEventListener("pointerdown", (e) => {
        swallowClick = false;
        if (drag || e.button > 0) return;

        const item = e.target.closest(itemSelector);
        if (!item || !list.contains(item)) return;

        if (!hold || !e.target.closest(hold)) return;
        if (never && e.target.closest(never)) return;

        pending = {
            item,
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            timerId: setTimeout(() => {
                const at = pending;
                pending = null;
                if (at) pickUp(at.item, at.pointerId, at.y);
            }, HOLD_MS),
        };
    });

    list.addEventListener("pointermove", (e) => {
        if (pending && e.pointerId === pending.pointerId) {
            // Movement this early is a scroll or a swipe, not a press.
            if (Math.abs(e.clientX - pending.x) > SLOP_PX || Math.abs(e.clientY - pending.y) > SLOP_PX) {
                cancelPending();
            }
            return;
        }
        if (!drag || e.pointerId !== drag.pointerId) return;

        drag.clientY = e.clientY;
        track();
        // touch-action: pan-y leaves the browser free to claim a scroll at any
        // point in a touch, not only at its start — and a claimed scroll ends
        // the drag. Every move we own is refused to the scroller.
        e.preventDefault();
    });

    const release = (commit) => (e) => {
        if (pending && e.pointerId === pending.pointerId) cancelPending();
        if (drag && e.pointerId === drag.pointerId) drop(commit);
    };

    list.addEventListener("pointerup", release(true));
    // Something else took the gesture. A reorder nobody asked for is worse than
    // the order they already had, so this reverts rather than commits — the
    // same rule the pager applies to a pane change.
    list.addEventListener("pointercancel", release(false));

    // Registered once, up front: iOS needs a non-passive touchmove listener in
    // place *before* the touch sequence starts for preventDefault to stop the
    // pan. Switching touch-action mid-gesture is not honoured for the touch
    // already in flight.
    list.addEventListener(
        "touchmove",
        (e) => {
            if (drag) e.preventDefault();
        },
        { passive: false },
    );

    // A press long enough to pick up a card is also long enough for iOS to
    // offer its own callout.
    list.addEventListener("contextmenu", (e) => {
        if (drag) e.preventDefault();
    });

    // On the document, not the list: a card dragged over other content would
    // otherwise start a selection there, and the CSS alone cannot refuse one
    // that a native long-press has already begun.
    document.addEventListener("selectstart", (e) => {
        if (drag) e.preventDefault();
    });

    list.addEventListener(
        "click",
        (e) => {
            if (!swallowClick) return;
            swallowClick = false;
            e.stopPropagation();
            e.preventDefault();
        },
        true,
    );
}

return { move, targetIndex, offsets, settleOffset, edgeSpeed, nextScroll, bind };
});
