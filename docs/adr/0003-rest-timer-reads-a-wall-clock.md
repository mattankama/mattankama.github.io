# 0003 — The rest timer reads a wall clock, and stops

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

The rest timer was a tick counter. `session.js` held `timer.seconds` and a one-second
interval that did `timer.seconds++`, so elapsed rest was defined as *the number of times
that callback ran*.

That definition holds only while the browser keeps running the callback, and on the one
platform this app targets it does not. WebKit is explicit, and the difference from desktop
is the whole problem:

> on iOS, tabs are completely suspended when possible.
>
> — [How Web Content Can Affect Power Usage](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)

Not throttled to a slower beat, as macOS App Nap does — suspended. The web process is not
scheduled, so the callback does not run late, it does not run. Time that passes while the
phone is in a pocket is not counted slowly; it is not counted at all.

So the common case — finish a set, lock the phone, rest — produced a timer that had stopped
without looking stopped. Resumed from memory it carried on from the value it froze at, so a
three-minute rest read as the twenty seconds that elapsed before the screen went dark. A
number that looks live while standing still is worse than one that has visibly stopped,
because the lifter has no way to tell.

Nothing in the code could have recovered the true figure. `resetAndStartTimer()` recorded
*that* rest had started and never *when*: there was no instant to subtract from.

## Decision

**Elapsed rest is derived from the wall clock, and the timer has an end.**

1. **`timer.startedAt` is an absolute instant** (`Date.now()`). Every beat, and every return
   to the app, computes `Math.floor((Date.now() - startedAt) / 1000)`. The interval only
   repaints; it no longer counts. A suspended tab therefore costs a stale pixel, not a wrong
   number, and catches up the moment it wakes — on `visibilitychange`, on `pageshow`, or on
   the next beat, whichever comes first. The interval is restarted on resume rather than
   trusted to come back on its own.

2. **Rest stops at ten minutes.** Past the ceiling the timer stops and the bar returns to
   0:00, unlit. This is a staleness guard, not a rest cue: it exists because a lifter who
   put the phone down for forty minutes is shown an accurate `40:00` otherwise, which is
   true and useless. Ten minutes of rest is ten minutes of rest whether the lifter watched
   it or not — the ceiling is on elapsed rest, not on time spent away.

3. **The timer stops when the session completes**, and never starts on a session that was
   already complete when the screen opened. A finished session has no rest to time.

4. **`startedAt` lives in memory only.** A reload, or a relaunch after iOS evicts the page,
   starts the screen with an idle timer. Rest is screen state, not domain data: it is absent
   from the seven tables in `store.js` and from `CONTEXT.md`'s data model, and it stays that
   way.

## Relationship to ADR 0001

ADR 0001 gave Copper to the rest timer alone, and reasoned twice from a fact this decision
changes: *"because the timer never stops"*, and *"Once the first set is checked, the timer
runs for the remainder of the session."* Neither is true any more.

**Its decision survives, and its argument still closes.** ADR 0001 rests on
`design_guidelines.md` §2 — Copper "appears at most once per screen" — and it already noted
that "at most once" includes zero, because an idle session shows no Copper at all. A timer
that stops simply returns the screen to that state. There is still never more than one
accent, and Copper still means exactly one thing here: *you are resting*. It now stops
claiming that when it is no longer true, which is a strengthening of ADR 0001's argument
rather than a hole in it.

One of ADR 0001's rejected alternatives sits close enough to point 2 to be worth separating.
It considered *"a bounded rest window (Copper returns to the button after ~90 s)"* and
rejected it for introducing "a 'rest is over' concept that `CONTEXT.md` does not define".
Two differences carry the distinction. That alternative **moved** Copper to another element,
which is precisely the two-meanings problem ADR 0001 exists to solve; the ceiling removes it
and puts nothing in its place. And ~90 s fires in ordinary use, which makes it a de-facto
rest cue — the countdown behaviour `CONTEXT.md` excludes. Ten minutes fires only when the
timer has stopped meaning anything. The concept being defined is "this readout is stale",
not "your rest is up".

## Alternatives considered

- **Persist `startedAt`, so the timer survives a reload.** `sessionStorage` would do it
  synchronously, outside the `settled()` discipline, for about three lines. Rejected because
  a timer that outlives the page it belongs to is not wanted: relaunching the app should
  present a clean screen, and a rest that began before a crash or a force-quit is not a rest
  anyone is still taking.
- **Put `startedAt` in the store, and so in IndexedDB.** Rejected more firmly. It means a
  column on `sessions`, an edit to the data model in `CONTEXT.md`, and the `settled()` rule
  applied to a value that is worthless five minutes later — ephemeral UI state promoted into
  the domain for nothing.
- **Freeze at the ceiling, showing `10:00`.** Rejected: a frozen readout is indistinguishable
  from a running one at a glance in bad gym light, which is the exact failure this ADR
  removes. Zero and unlit says plainly that nothing is being timed.
- **No ceiling — show `40:00` and keep counting.** Accurate, and the smallest change. Rejected
  on the same grounds the ceiling exists for.
- **Sound or a notification when rest ends.** Excluded by `CONTEXT.md`'s non-goal "No timer
  alerts or countdown mode", and unbuildable regardless: a suspended page cannot fire one.
  Pre-scheduled Web Audio does not survive — iOS moves an `AudioContext` to `interrupted`
  when the user switches tabs, minimises, or locks the screen. Scheduled local notifications
  (`TimestampTrigger`) never shipped in WebKit. Web Push on iOS needs a Home Screen install
  *and a server to send it*, and this app has no backend. The honest ceiling for an alert is
  one that fires only when the app is already in front of the lifter, which is when they can
  see the timer anyway.

## Consequences

- The reported bug is gone: the readout is correct on return, to the second, however long
  the phone was away.
- The session screen can now return to zero accents mid-session, where before it kept one
  from the first completed set onward. Both states satisfy `design_guidelines.md` §2.
- The timer has tests for the first time — `tests/js/session-timer.test.js` loads `session.js`
  into a sandbox with a clock and an interval queue the tests drive by hand, so "pocket the
  phone for three minutes" is an assertion rather than a three-minute wait. The suspension
  cases fail against a tick counter, which is what makes them worth keeping.
- `elapsedSeconds()` clamps at zero, so a phone crossing a timezone or correcting its clock
  mid-session cannot read as rest undone.
- Nothing persisted changed, so there is no migration — which matters here, because with no
  backend there is nowhere to run one.
