# 0001 — The session screen's accent moves rather than duplicating

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

`design_guidelines.md` §2 states that Copper (`--color-accent`, `#B87D4B`) "appears at
most once per screen — reserve it for the single most important action or state."

§5's component notes then assign Accent to two different elements on the *same* screen:

> **Rest timer bar** — Large, bold, tabular numerals in Ink; **switches to Accent only
> while running.**
>
> **Complete Workout button** — Pinned to the bottom of the screen. **Solid Accent fill**,
> bold label, full width.

During an active workout both conditions hold at once, so the guidelines contradict
themselves: honouring §5 literally puts two Accent elements on screen, violating §2.

A second fact constrains the resolution. Per `CONTEXT.md`, the rest timer is a pure
count-up with no pause and no countdown mode: `session.js` sets `timer.running = true` and
adds the `running` class, and nothing ever reverses either. Once the first set is checked,
the timer runs for the remainder of the session.

## Decision

The session screen's single Accent **moves** between the two elements, one-way:

| State | Accent | Complete button |
|---|---|---|
| No set completed yet | Complete Session button — solid Accent fill, Surface label | — |
| Any set completed | Rest timer readout | Ink on Elevated, `--elev-2` |

Exactly one Accent element is on screen at every instant, so §2 holds literally, and each
half of §5's guidance holds in the state it describes.

Implementation is one class plus one CSS rule: `resetAndStartTimer()` adds
`timer-running` to `<body>` alongside the existing `running` class on the timer bar, and
`body.timer-running .complete-bar .btn-accent` demotes the button. No JavaScript computes
colour.

## Alternatives considered

- **Complete button permanently Accent, timer always Ink.** Simplest, and it keeps Copper
  on the terminal action. Rejected: it discards §5's explicit statement that the timer
  switches to Accent while running, and the running state then has no colour cue at all.
- **Timer permanently owns Accent; Complete button never Accent.** Also §2-compliant, but
  it leaves the screen's primary action with no distinction before any set is logged.
- **A bounded rest window** (Copper returns to the button after ~90 s). This would make
  Copper mean "resting right now" and give the button the accent whenever the user is
  likely to press it. Rejected as out of scope: it introduces a "rest is over" concept that
  `CONTEXT.md` does not define, and its non-goals explicitly exclude timer alerts and
  countdown modes.

## Consequences

- Copper sits on the Complete button only before the first completed set. For most of a
  workout the timer owns it and the button is Ink on Elevated — still full width, pinned
  and bold, so its affordance does not depend on colour.
- The swap is one-way within a session. Reloading the page resets it, since timer state is
  not persisted.
- Adding a rest window later means changing only when `timer-running` is removed; nothing
  else depends on it.
- §2 of `design_guidelines.md` has been amended to describe this rule, so the two documents
  no longer disagree.
