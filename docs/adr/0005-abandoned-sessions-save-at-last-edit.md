# 0005 — An abandoned session is saved for the lifter, dated at its last edit

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

A lifter finishes a workout, forgets to tap Complete, and pockets the phone. iOS kills the
backgrounded tab; the installed app relaunches to its `start_url`, which is Home. The session's
URL (`/session/?id=N`) is gone, and nothing in the app links back to an in-progress session. The
row is still in IndexedDB, but the lifter cannot reach it, cannot complete it, and its numbers
never reach `lastSession`. To them the workout was deleted.

Two facts constrain any fix. **An untouched session looks full.** Starting a session pre-fills
every sole-instance exercise from `lastSession`, so "has sets" says nothing about whether
anything was lifted, and saving an untouched session would put lifts that never happened on
Progress. **Data already on the phone is off-limits.** `CLAUDE.md` forbids a build that alters
or deletes existing user data, and rows written before this change carry no record of whether
they were edited.

## Decision

**Track edits on the session row.** `last_edited_at` is stamped by the routes that change what
was lifted: a weight or reps value that actually changes (session.js commits on blur too, so a
re-sent value is not an edit), ticking or unticking a set, adding or removing a set. Choosing an
instance and reordering are not edits. The field has three states: **absent** (the row predates
tracking), **null** (tracked, unedited) and **a timestamp**. `startSession` writes null;
`markEdited` refuses a row without the key. That refusal is what exempts every old row, forever.

**Two triggers complete an abandoned session.**

- **Home load** calls `POST /api/sessions/complete-abandoned`, first thing, through `fetchJSON`
  so the write settles. It completes every edited session idle for at least an hour, and Home
  says so in one line per workout.
- **Starting a session** first completes any edited session still in progress, whatever its
  age, silently. Starting is the lifter moving on, and it runs before the new session is laid
  out, so a sole instance pre-fills from the numbers just saved.

**An auto-save is Complete, with two differences.** `completed_at` is the last edit, so Progress
plots the workout when it happened rather than when it was found. And it writes an instance's
`lastSession` only if no other completed session at or after that time already did, so an
auto-save can never wind an instance back to older numbers. Manual Complete is dated now and
skips the check.

**Nothing is deleted.** An untouched session stays in progress, unreachable, exactly as before.

## Alternatives considered

- **Complete on `visibilitychange` / `pagehide`.** Fires every time the lifter switches apps
  mid-set, iOS does not reliably fire it when it kills a process, and a page going away cannot
  wait for `settled()`.
- **Track edits per entry**, so exercises the lifter never reached neither write `lastSession`
  nor plot on Progress. That means a stamp per entry, a marker for how a session was completed,
  and a Progress filter — two kinds of completed session in the domain. An auto-save records
  untouched exercises exactly as an early Complete does, which is enough for v1.
- **Count choosing an instance as an edit.** It changes no number. Auto-save would then depend
  on whether an exercise has one instance or two, and a lifter who picked machines and left
  would get a full workout of fake lifts.
- **An idle threshold on the start trigger too.** It would leave an edited session behind just
  as the lifter starts the next one, pre-filled from numbers older than what they just lifted.
- **A Resume card on Home.** The real fix for the first hour, when a session is edited but not
  yet saved. It complements this decision and remains a possible follow-up.
- **Saving the sessions already stranded before this build.** They cannot be told edited from
  untouched, and saving them writes existing data. Not without the user's say-so.
- **Deciding "edited" by comparing sets to `lastSession`.** False positives as soon as
  `lastSession` moves on, and it would make old rows eligible on the first launch.

## Consequences

- **Twenty-two routes.** `complete-abandoned` is the second route the server never had.
- **The first launch of this build writes nothing.** Boot only reads; the sweep matches only a
  string `last_edited_at`, which no earlier build wrote. No IndexedDB version bump: stores are
  keyed on `id` with no field schema, so a new property needs no migration.
  `tests/js/abandoned-session.test.js` boots a store from rows shaped like the previous build's
  and asserts zero writes.
- **The session page now writes the session row.** Before this, no edit on that screen touched
  it. A second tab or a bfcache-restored session page holds its own copy of the store, and an
  edit there can put an auto-saved row back to `in_progress`. It heals itself: a later sweep
  saves it again, with the newer edits. The hour's wait is what makes this unlikely, because
  Home is reachable from a live session by Back and by other tabs, not only by Complete or a
  relaunch.
- **Untouched exercises in an auto-saved session plot as laid out**, a flat point on Progress,
  the same as an early Complete.
- **Redoing a workout the lifter thought was lost** gives two points that day. Home's note is
  the protection.
- **Nothing is reachable during the first hour** after a killed tab, until the lifter starts
  another session. See the Resume card above.
