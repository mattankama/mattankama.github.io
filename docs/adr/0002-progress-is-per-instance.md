# 0002 — Progress charts one instance, and plots the top set

- **Status:** Accepted
- **Date:** 2026-09-14

## Context

`CONTEXT.md` has stored completed session history since v1 and never read it back —
"not surfaced in UI for v1, but stored". The Progress screen is the first read of it.

The obvious design is the one the feature was asked for in: *select an exercise, see weight
over time*. Two things make that under-specified.

**A weight is only comparable within an instance.** `CONTEXT.md`'s core principle is explicit:
"History is per-instance, not per-exercise… since the weight/resistance scale differs between
instances." 125 lb on a Hammer Strength is not 125 lb on a flat bench, and it is not
necessarily more than 100 lb on one either. A single line across an exercise would render the
week a lifter switched instances as a PR or a collapse, and neither would have happened.

**A session is several sets at several weights**, so "the weight" for a session is a choice,
not a fact: heaviest set, average, or an estimated 1RM from a formula.

## Decision

**A Progress series is an (Exercise, Instance) pair, and its value is the top set** — the
heaviest set logged in that session, with a tie broken toward the higher rep count.

The screen therefore carries two selectors. The instance selector lists only instances that
have history, most-logged first, and hides itself entirely when there is only one.

Sets of weight 0 are excluded: they are blank rows left by the set editor, not lifts. Only
completed sessions count — an in-progress session is pre-filled from the instance's
`lastSession`, so charting one would plot a lift that has not happened yet.

`GET /api/exercises/<id>/progress` returns every instance's series in one payload, so
switching instances is free once the exercise is loaded.

## Alternatives considered

- **One line per instance, overlaid.** Reads everything at once, and is the design most
  charting libraries push you toward. Rejected on two counts: it needs three or more accent
  colours, which `design_guidelines.md` §8 bans outright ("Two accents ❌"), and the thing it
  makes easy — comparing two instances' numbers directly — is exactly the comparison the
  domain says is meaningless.
- **One line across all instances.** Simplest possible UI and the most literal reading of
  "select an exercise". Rejected: it contradicts the core principle, and its failure mode is
  the worst kind — it does not look broken, it looks like progress.
- **Estimated 1RM** (Epley, `weight × (1 + reps/30)`). Genuinely better at one thing: it
  catches progress made through reps at a fixed weight, which a top-set line reads as flat.
  Rejected for v1 because it plots a number the lifter never actually lifted, which sits badly
  with the app's "Honest" brand trait, and because it is a second code path and a second thing
  to explain on a screen whose whole job is one glance. It remains the obvious first extension.

## Consequences

- Deleting an instance deletes its series. The `instance_id` FK is already `SET NULL`, so the
  session rows survive, but an entry with no instance has no series it could belong to.
  Recorded in `CONTEXT.md`'s deletion rules.
- No schema change, no migration: the endpoint derives everything from
  `Session`/`SessionEntry`/`SessionSet` on read.
- A lifter who has used three instances for one lift sees three short lines rather than one
  long one. That is the honest picture, but it does mean the screen is least useful for
  exactly the person who switches instances most — the argument for a normalised view later.
- This reverses the v1 non-goal "No charts/analytics/progress graphs". The narrower non-goals
  that replace it are in `CONTEXT.md`.
