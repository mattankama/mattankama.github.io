/**
 * The arithmetic under drag-to-reorder.
 *
 * The gesture itself cannot be tested here — there is no DOM in this suite and
 * a shim would only test the shim — but everything that decides *where a row
 * lands* is pure, and that is where the bugs live. Two in particular:
 *
 *   - Moving down and moving up are not symmetric. Remove-then-insert shifts
 *     the target index by one in exactly one of the two directions, and a
 *     reorderer that tests only one direction ships that bug.
 *   - The rows are wildly uneven — an exercise card with four instances is
 *     several times taller than a bare one — so any threshold expressed in
 *     "rows" rather than pixels drops in the wrong slot. Every case below uses
 *     a deliberately lumpy height array.
 *
 * Run with: node --test tests/js/
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { move, targetIndex, offsets, settleOffset, edgeSpeed, nextScroll } = require("../../app/static/js/reorder.js");

// A short card, a tall one, a short one: the shape that breaks naive maths.
const LUMPY = { heights: [50, 200, 50], gap: 10 };

test("reorder — move", async (t) => {
    await t.test("carries an item down the list", () => {
        assert.deepEqual(move(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
    });

    await t.test("carries an item up the list", () => {
        assert.deepEqual(move(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    });

    await t.test("one step each way", () => {
        assert.deepEqual(move(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
        assert.deepEqual(move(["a", "b", "c"], 1, 0), ["b", "a", "c"]);
    });

    await t.test("a move to where it already is changes nothing", () => {
        assert.deepEqual(move(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
    });

    await t.test("clamps an index off either end", () => {
        assert.deepEqual(move(["a", "b", "c"], 0, 99), ["b", "c", "a"]);
        assert.deepEqual(move(["a", "b", "c"], 2, -5), ["c", "a", "b"]);
    });

    await t.test("leaves the original array alone", () => {
        const items = ["a", "b", "c"];
        move(items, 0, 2);
        assert.deepEqual(items, ["a", "b", "c"], "the caller still holds the old order");
    });
});

test("reorder — targetIndex", async (t) => {
    await t.test("an untouched row stays where it is", () => {
        assert.equal(targetIndex({ ...LUMPY, from: 1, dy: 0 }), 1);
    });

    await t.test("a slot is claimed at the halfway point of the row being passed", () => {
        // Row 1 is 200 tall + 10 gap. Half of 210 is 105.
        assert.equal(targetIndex({ ...LUMPY, from: 0, dy: 104 }), 0);
        assert.equal(targetIndex({ ...LUMPY, from: 0, dy: 105 }), 1);
    });

    await t.test("the second slot down needs the tall row cleared first", () => {
        // Clearing row 1 costs 210; row 2 is 50 + 10, so its half is 30.
        assert.equal(targetIndex({ ...LUMPY, from: 0, dy: 239 }), 1);
        assert.equal(targetIndex({ ...LUMPY, from: 0, dy: 240 }), 2);
    });

    await t.test("moving up mirrors moving down", () => {
        assert.equal(targetIndex({ ...LUMPY, from: 2, dy: -104 }), 2);
        assert.equal(targetIndex({ ...LUMPY, from: 2, dy: -105 }), 1);
        assert.equal(targetIndex({ ...LUMPY, from: 2, dy: -239 }), 1);
        assert.equal(targetIndex({ ...LUMPY, from: 2, dy: -240 }), 0);
    });

    await t.test("a drag past either end stops at the end", () => {
        assert.equal(targetIndex({ ...LUMPY, from: 0, dy: 5000 }), 2);
        assert.equal(targetIndex({ ...LUMPY, from: 2, dy: -5000 }), 0);
    });

    await t.test("a single-row list has nowhere to go", () => {
        assert.equal(targetIndex({ heights: [80], gap: 10, from: 0, dy: 400 }), 0);
    });
});

test("reorder — offsets", async (t) => {
    await t.test("rows the lifted card passes move up by the gap it left", () => {
        // Row 0 is 50 tall + 10 gap, so rows 1 and 2 close up by 60.
        assert.deepEqual(offsets({ ...LUMPY, from: 0, to: 2 }), [0, -60, -60]);
    });

    await t.test("rows the lifted card passes going up move down", () => {
        assert.deepEqual(offsets({ ...LUMPY, from: 2, to: 0 }), [60, 60, 0]);
    });

    await t.test("only the rows between origin and target move", () => {
        assert.deepEqual(offsets({ heights: [50, 200, 50, 50], gap: 10, from: 0, to: 1 }), [0, -60, 0, 0]);
    });

    await t.test("no move, no shift", () => {
        assert.deepEqual(offsets({ ...LUMPY, from: 1, to: 1 }), [0, 0, 0]);
    });
});

test("reorder — settleOffset", async (t) => {
    await t.test("is the distance to the slot being dropped into", () => {
        // Clearing row 1 (210) then row 2 (60).
        assert.equal(settleOffset({ ...LUMPY, from: 0, to: 2 }), 270);
        assert.equal(settleOffset({ ...LUMPY, from: 2, to: 0 }), -270);
    });

    await t.test("is zero when nothing moved", () => {
        assert.equal(settleOffset({ ...LUMPY, from: 1, to: 1 }), 0);
    });
});

test("reorder — the drawing and the order never disagree", async (t) => {
    // The invariant that actually breaks in a hand-rolled reorderer: the rows
    // animate into one order and the DOM commits a different one. Laying the
    // transforms out on a ruler and reading the result off left to right has to
    // give the same answer as move().
    const heights = [50, 200, 50, 120];
    const gap = 10;

    const topOf = (i) => heights.slice(0, i).reduce((sum, h) => sum + h + gap, 0);

    for (let from = 0; from < heights.length; from++) {
        for (let to = 0; to < heights.length; to++) {
            await t.test(`row ${from} dropped at slot ${to}`, () => {
                const shift = offsets({ heights, gap, from, to });
                const settle = settleOffset({ heights, gap, from, to });

                const painted = heights
                    .map((_, i) => ({ i, top: topOf(i) + (i === from ? settle : shift[i]) }))
                    .sort((a, b) => a.top - b.top)
                    .map((row) => row.i);

                assert.deepEqual(
                    painted,
                    move([0, 1, 2, 3], from, to),
                    "what the lifter sees is what gets saved",
                );
            });
        }
    }
});

test("reorder — edge scrolling", async (t) => {
    // The zone and top speed the module ships with; passed explicitly so the
    // expected numbers below are readable rather than derived.
    const ZONE = 72;
    const MAX = 0.85;
    const speedAt = (clientY) => edgeSpeed({ clientY, viewport: 800, zone: ZONE, max: MAX });

    await t.test("the middle of the screen does not scroll", () => {
        assert.equal(speedAt(400), 0);
        assert.equal(speedAt(ZONE), 0, "the boundary itself is still still");
        assert.equal(speedAt(800 - ZONE), 0);
    });

    await t.test("eases in from nothing at the boundary", () => {
        // A linear ramp would already be at 0.12 px/ms one sixth of the way in,
        // which starts as a lurch. Squared, it is a twelfth of that.
        const justInside = speedAt(800 - ZONE + 1);
        assert.ok(justInside > 0, "it does scroll");
        assert.ok(justInside < MAX / 100, `too fast at the boundary: ${justInside}`);
    });

    await t.test("reaches full speed at the very edge", () => {
        assert.equal(+speedAt(800).toFixed(4), MAX);
        assert.equal(+speedAt(0).toFixed(4), -MAX);
    });

    await t.test("the ramp is squared, not linear", () => {
        // Halfway into the zone is a quarter of the speed, not half.
        assert.equal(+speedAt(800 - ZONE / 2).toFixed(4), +(MAX * 0.25).toFixed(4));
    });

    await t.test("scrolls up at the top and down at the bottom", () => {
        assert.ok(speedAt(10) < 0);
        assert.ok(speedAt(790) > 0);
        assert.equal(speedAt(10), -speedAt(790), "symmetric");
    });

    await t.test("past the edge of the screen does not exceed full speed", () => {
        // A finger dragged off the bottom still reports a clientY, and it is
        // off the end. Unclamped this squares to nearly six times full speed.
        assert.equal(+speedAt(900).toFixed(4), MAX);
        assert.equal(+speedAt(-200).toFixed(4), -MAX);
    });
});

test("reorder — the scroll accumulator", async (t) => {
    await t.test("keeps sub-pixel speeds instead of rounding them away", () => {
        // 0.024 px/ms is about 0.4px a frame — the speed near the boundary, and
        // the one scrollBy() used to round to 0 one frame and 1 the next.
        let at = 0;
        for (let i = 0; i < 10; i++) {
            at = nextScroll({ at, speed: 0.024, elapsed: 16.7, max: 1000 });
        }
        assert.equal(+at.toFixed(3), 4.008, "ten frames of 0.4px is 4px, not 0 and not 10");
    });

    await t.test("a long frame covers the distance it missed", () => {
        const steady = nextScroll({ at: 0, speed: 0.85, elapsed: 16.7, max: 1000 });
        const stalled = nextScroll({ at: 0, speed: 0.85, elapsed: 33.4, max: 1000 });
        assert.equal(+stalled.toFixed(4), +(steady * 2).toFixed(4));
    });

    await t.test("stops at the top and at the bottom of the document", () => {
        assert.equal(nextScroll({ at: 5, speed: -0.85, elapsed: 100, max: 1000 }), 0);
        assert.equal(nextScroll({ at: 995, speed: 0.85, elapsed: 100, max: 1000 }), 1000);
    });

    await t.test("a document with nothing to scroll stays put", () => {
        assert.equal(nextScroll({ at: 0, speed: 0.85, elapsed: 100, max: 0 }), 0);
        assert.equal(nextScroll({ at: 0, speed: 0.85, elapsed: 100, max: -40 }), 0);
    });
});
