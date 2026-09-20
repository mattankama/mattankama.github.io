# 0001 — The rest timer is the session screen's only accent

- **Status:** Accepted — amended by [ADR 0003](./0003-rest-timer-reads-a-wall-clock.md)
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

A second fact shapes the resolution. Per `CONTEXT.md` the rest timer is a pure count-up
with no pause and no countdown mode: `session.js` sets `timer.running = true` and adds the
`running` class, and nothing ever reverses either. Once the first set is checked, the timer
runs for the remainder of the session.

> **Amended 2026-09-18 by [ADR 0003](./0003-rest-timer-reads-a-wall-clock.md).** The timer
> now stops — at a ten-minute ceiling and on session completion — so the paragraph above no
> longer describes the code. The decision below is unaffected: a stopped timer returns the
> screen to zero accents, which §2 permits, and ADR 0003 says why the ceiling is not the
> bounded rest window rejected further down.

## Decision

**Copper belongs to the rest timer alone.** The timer readout is Ink at rest and Accent
while running. The Complete Session button is never Accent — it is Ink on Elevated,
pinned to the bottom, full width and bold.

§2 holds at every instant, and by a comfortable margin: an idle session shows no Copper at
all, which §2 permits ("at most once" includes zero).

The Complete button loses no prominence from this. It is the only full-width control on
the screen, it is pinned where the thumb rests, and its label is bold — §1's own argument
that "weight and size create hierarchy, not color." Colour was never what made it findable.

This supersedes §5's "solid Accent fill" instruction for that button; §2 of
`design_guidelines.md` has been amended to match, so the two documents no longer disagree.

## Alternatives considered

- **A one-way swap.** Accent starts on the Complete button and moves to the timer on the
  first completed set. Implemented first, then withdrawn: because the timer never stops,
  the button is Copper only before any set is logged — precisely when the user is *least*
  likely to press it — and the swap fires once and never returns. The rule was harder to
  explain than the thing it bought.
- **A bounded rest window** (Copper returns to the button after ~90 s), which would make
  Copper mean "resting right now." Rejected: it introduces a "rest is over" concept that
  `CONTEXT.md` does not define, and its non-goals explicitly exclude timer alerts and
  countdown modes.
- **Complete button permanently Accent, timer always Ink.** Keeps Copper on the terminal
  action, but discards §5's explicit statement that the timer switches to Accent while
  running, leaving the running state with no colour cue.

## Consequences

- The session screen shows zero Accent until the first set is completed, then exactly one
  (the timer). Both states satisfy §2 literally.
- Copper acquires a single, consistent meaning on this screen — *you are resting* — rather
  than being shared between a state and an action.
- No JavaScript computes colour: the existing `running` class on the timer bar drives the
  only rule. The `timer-running` body class the swap required has been removed.
- Reverting to a swap later means re-adding that class and one CSS rule; nothing else
  depends on it.
