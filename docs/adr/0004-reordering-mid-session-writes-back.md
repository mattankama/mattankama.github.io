# 0004 — Reordering mid-session writes back to the routine

- **Status:** Accepted
- **Date:** 2026-09-19

## Context

`CONTEXT.md` has listed "Reorder exercises" under *Create / Edit Routine* since v1 and
nothing ever implemented it. Adding it raised a question the bullet never had to answer,
because it names only one of the two screens that show an ordered list of exercises.

**In the routine editor the answer is free.** That screen is a whole-form editor: name,
exercises, instances, add and remove all live in the DOM until Save, and `Cancel` discards
the lot. `updateRoutine` already deletes every link and rewrites `position: i` from the
payload's array order, and `saveRoutine` already reads the rows in document order. Moving a
card in the list *is* the edit. No route, no schema change, no migration.

**Mid-session there is no Save.** Every other edit on that screen — a weight, a rep count, a
completed box, an added set — lands the moment it is made. A drag there has to persist on
the drop, which means a route. And it has to mean something: a session's entry order and its
routine's exercise order are two different rows in two different tables, and the drag could
reasonably change either.

## Decision

**A drag on the session screen reorders that session's entries and writes the new order back
to the routine**, through one new route:

```
PUT /api/sessions/:id/entry-order
body:  { entry_ids: [7, 5, 6] }
200:   the session, entries in the new order
404:   unknown session
400:   entry_ids is not exactly this session's entries, once each
```

A lifter who reorders mid-workout is not fixing today — they are fixing the order they will
want every time. The routine is the only thing in the model that carries an order forward,
so writing only to `session_entries` would mean making the same drag again next session, and
the one after that. The routine is what the lifter thinks they are editing.

**The write-back fills slots rather than rewriting the list.** A session and its routine can
have drifted apart — the routine may have gained or lost an exercise since the session
started. Only the positions already occupied by the dragged exercises are redistributed, so
an exercise that is in the routine but not on screen keeps its place instead of being swept
to the end. The lifter permutes what they can see and nothing else.

**A session whose routine was deleted still reorders itself.** `deleteRoutine` nulls
`routine_id` on its sessions, and there is simply nothing to write back to.

## Alternatives considered

- **Session-only, no write-back.** The smallest change, and the one the model's shape
  suggests. Rejected because the drag would evaporate: the lifter fixes the order, finishes
  the workout, and finds it unchanged the next time they start that routine.
- **Ask.** A "just this session / always" prompt makes the ambiguity the lifter's problem. A
  modal mid-set is exactly the interruption `CONTEXT.md`'s "speed over configuration"
  principle exists to prevent, and it asks a question whose answer is the same every time.
- **Reuse `PUT /api/routines/:id` from the session screen.** It already rewrites order, so no
  new route. Rejected outright: that route rebuilds the routine from a full exercise *and
  instance* payload, which the session screen does not have. Calling it from there would
  clobber every instance in the routine to save a position.
- **A `position` column change, or fractional ordering.** Considered and dropped. Fractional
  keys earn their keep against concurrent or partial writes; here there is one writer, on one
  phone, rewriting a handful of rows synchronously in memory. It would buy nothing and add a
  float-drift failure mode.

## Consequences

- **Twenty-one routes, not twenty.** `local-api.js` was a port of `api.py` and said so; this
  is the first route that never existed on the server, because reordering mid-session was not
  something the app could do. The comment and `CLAUDE.md` now say twenty-one.
- **The session screen writes to a routine.** It is the only cross-aggregate write in the API
  and it is deliberate. `reorderRoutineToMatch` is named and commented for the next reader who
  wonders why a session route touches `routine_exercises`.
- **Positions are renumbered to a clean 0..n-1 run on write-back.** They can be gappy —
  deleting an exercise globally drops its links and leaves holes — or absent on a row written
  before the field existed, and a permutation over a mix of the two would not hold. `byPosition`
  still falls through to the id, which is what keeps "no migration" true for old data.
- **No migration, and nowhere to run one if there were.** Every `routine_exercises` row has
  carried a position since the table existed.
- **The gesture is press-and-hold only, and ships without a keyboard path.** Both are
  explicit decisions. A grip was built first and removed: it is a permanent 48px handle on
  every card, taking width from the exercise name, for something a lifter does occasionally.
  What it cost is discoverability — a long-press advertises nothing — and a safety net, since
  a grip could hold `touch-action: none` outright while a press on the card body cannot.
  Every other gesture in this app has a keyboard path (the pager has arrow keys, the set-row
  swipe keeps its delete button in the tab order), so this is the first that has neither that
  nor a visible affordance. A move-up/move-down pair would close both gaps in about forty
  lines and would share `RattlesnakeReorder.move()` with the drag.
- **The rows are never reordered in the DOM mid-drag**, only transformed, with exactly one
  `insertBefore` after the drop animation lands. Cards in these lists vary in height by a
  factor of several, so moving a node under the finger re-lays-out everything below it and
  invalidates offsets the animation is halfway through. `tests/js/reorder.test.js` pins the
  invariant that the drawing and the committed order agree, over every from/to pair.
