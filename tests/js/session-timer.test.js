/**
 * The rest timer, which had no tests at all until this file.
 *
 * The bug it was written for: `timer.seconds++` inside a 1s interval defines
 * elapsed time as "number of times this callback ran". iOS suspends a
 * backgrounded tab's web process outright — the callback does not run late, it
 * does not run — so pocketing the phone mid-rest made the timer silently
 * under-report, which is worse than a visibly stopped one. Every assertion
 * about a suspended tab below fails against a tick-counting timer.
 *
 * session.js only touches the DOM from inside handlers, so it loads into a
 * sandbox on its own. The clock and the interval queue are ours, so the tests
 * can pocket the phone for four minutes without waiting four minutes.
 *
 * Run with: node --test tests/js/
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SESSION_JS = path.join(__dirname, "../../app/static/js/session.js");

/** session.js in a box, with a clock and an interval queue we drive by hand. */
function loadSession() {
    const clock = { now: 1_700_000_000_000 };
    const elements = new Map();
    const noop = () => {};

    function element(id) {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
                id,
                classes,
                textContent: "",
                disabled: false,
                value: "",
                innerHTML: "",
                style: {},
                classList: {
                    add: (c) => classes.add(c),
                    remove: (c) => classes.delete(c),
                    contains: (c) => classes.has(c),
                    toggle: noop,
                },
                addEventListener: noop,
                appendChild: noop,
                prepend: noop,
                remove: noop,
                setAttribute: noop,
                getAttribute: () => null,
                querySelector: () => null,
                querySelectorAll: () => [],
                closest: () => null,
                focus: noop,
            });
        }
        return elements.get(id);
    }

    const intervals = new Map();
    let nextIntervalId = 1;

    const context = {
        console,
        // Only Date.now() is used, but subclassing keeps `new Date()` honest.
        Date: class extends Date {
            static now() {
                return clock.now;
            }
        },
        setInterval: (fn) => {
            const id = nextIntervalId++;
            intervals.set(id, fn);
            return id;
        },
        clearInterval: (id) => intervals.delete(id),
        setTimeout,
        clearTimeout,
        queueMicrotask,
        Promise,
        URLSearchParams,
        addEventListener: noop,
        location: { href: "", search: "" },
        SESSION_ID: 1,
        // Nothing here reaches the API; completeSession() only needs it to resolve.
        fetchJSON: async () => ({}),
        showError: noop,
        document: {
            addEventListener: noop,
            getElementById: element,
            querySelector: () => element("anon"),
            querySelectorAll: () => [],
            createElement: () => element("created"),
            body: element("body"),
            visibilityState: "visible",
        },
    };
    context.window = context;
    context.self = context;

    vm.createContext(context);
    vm.runInContext(fs.readFileSync(SESSION_JS, "utf8"), context, { filename: "session.js" });

    return {
        page: context,
        // `const` declarations live in the script's lexical scope, not on the
        // context object, so this one is read by evaluating it in place.
        ceiling: vm.runInContext("REST_CEILING_SECONDS", context),
        /** Pocket the phone: time passes, but no interval callback runs. */
        away: (seconds) => {
            clock.now += seconds * 1000;
        },
        /** One beat of the interval, as the browser would deliver it. */
        tick: () => {
            for (const fn of [...intervals.values()]) fn();
        },
        ticking: () => intervals.size > 0,
        display: () => element("timer-display").textContent,
        accented: () => element("timer-bar").classes.has("running"),
    };
}

test("rest timer", async (t) => {
    await t.test("elapsedSeconds reads a wall clock", () => {
        const { page } = loadSession();
        const start = 1_000_000;

        assert.equal(page.elapsedSeconds(start, start), 0);
        assert.equal(page.elapsedSeconds(start, start + 1_000), 1);
        assert.equal(page.elapsedSeconds(start, start + 90_500), 90, "part seconds floor");
        assert.equal(page.elapsedSeconds(null, start), 0, "a timer that never started is at zero");
    });

    await t.test("elapsedSeconds clamps a clock that ran backwards", () => {
        const { page } = loadSession();
        // Crossing a timezone mid-session, or the phone correcting its clock.
        assert.equal(page.elapsedSeconds(2_000_000, 1_000_000), 0);
    });

    await t.test("formatTime pads to MM:SS", () => {
        const { page } = loadSession();

        assert.equal(page.formatTime(0), "00:00");
        assert.equal(page.formatTime(9), "00:09");
        assert.equal(page.formatTime(60), "01:00");
        assert.equal(page.formatTime(599), "09:59");
    });

    await t.test("starting resets to zero and lights the bar", () => {
        const t = loadSession();
        t.page.resetAndStartTimer();

        assert.equal(t.display(), "00:00");
        assert.equal(t.accented(), true, "a running timer is the screen's only accent (ADR 0001)");
        assert.equal(t.ticking(), true);
    });

    await t.test("counts up a second at a time while the app is open", () => {
        const t = loadSession();
        t.page.resetAndStartTimer();

        for (let i = 0; i < 5; i++) {
            t.away(1);
            t.tick();
        }
        assert.equal(t.display(), "00:05");
    });

    await t.test("a suspended tab catches up on its first tick back", () => {
        const t = loadSession();
        t.page.resetAndStartTimer();

        // Three minutes in a pocket. iOS ran the callback exactly zero times.
        t.away(180);
        t.tick();

        assert.equal(t.display(), "03:00", "a tick-counting timer would say 00:01 here");
        assert.equal(t.ticking(), true);
    });

    await t.test("returning to the app catches up without waiting for a tick", () => {
        const t = loadSession();
        t.page.resetAndStartTimer();

        t.away(240);
        t.page.resumeTimer();

        assert.equal(t.display(), "04:00");
        assert.equal(t.ticking(), true, "a suspended interval may never resume; resume restarts it");
    });

    await t.test("rest past the ceiling stops the timer and clears the bar", () => {
        const t = loadSession();
        t.page.resetAndStartTimer();

        t.away(t.ceiling + 1);
        t.tick();

        assert.equal(t.display(), "00:00", "a frozen number reads as a live one in bad light");
        assert.equal(t.accented(), false);
        assert.equal(t.ticking(), false, "nothing keeps counting once rest is over");
    });

    await t.test("the ceiling holds on the way back in, too", () => {
        const t = loadSession();
        t.page.resetAndStartTimer();

        t.away(t.ceiling + 600);
        t.page.resumeTimer();

        assert.equal(t.display(), "00:00");
        assert.equal(t.accented(), false);
        assert.equal(t.ticking(), false);
    });

    await t.test("the last second under the ceiling still counts", () => {
        const t = loadSession();
        t.page.resetAndStartTimer();

        t.away(t.ceiling - 1);
        t.tick();

        assert.equal(t.display(), "09:59");
        assert.equal(t.ticking(), true);
    });

    await t.test("completing the session stops the timer", async () => {
        const t = loadSession();
        t.page.resetAndStartTimer();
        t.away(30);
        t.tick();
        assert.equal(t.display(), "00:30");

        await t.page.completeSession();

        assert.equal(t.ticking(), false);
        assert.equal(t.accented(), false);
        assert.equal(t.display(), "00:00");
    });

    await t.test("a set checked on a completed session does not restart it", async () => {
        const t = loadSession();
        await t.page.completeSession();

        t.page.resetAndStartTimer();

        assert.equal(t.ticking(), false, "the session is over; there is no rest to time");
        assert.equal(t.accented(), false);
    });

    await t.test("resuming a stopped timer leaves it stopped", () => {
        const t = loadSession();

        t.page.resumeTimer();

        assert.equal(t.ticking(), false);
        assert.equal(t.accented(), false);
    });
});
