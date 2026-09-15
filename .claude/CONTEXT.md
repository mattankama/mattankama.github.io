# Rattlesnake — Context

## Overview
A minimal, fast weightlifting companion web app for guiding workouts session-to-session. The app removes friction from logging: every exercise auto-fills with the sets, reps, and weight from the last time it was performed on a given instance, so the user can start lifting immediately and only adjust what changed. All data lives on-device (SQLite via Flask) — no account, no cloud sync.

## Core Principles
- **Speed over configuration** — every screen should get the user into a set as fast as possible.
- **Minimal input surface** — the create screen only asks for what's strictly needed.
- **Rest timer is always reachable** — pinned to the top of the screen during a session, counts up automatically.
- **History is per-instance, not per-exercise** — the same exercise performed on a different instance is tracked separately, since the weight/resistance scale differs between instances. This governs Progress as much as pre-fill: a trend line that mixed instances would plot incomparable numbers.
- **Stats are global** — per Exercise+Instance stats carry over across all routines, not scoped to a single routine.

## Glossary

**Exercise** — a named lift (e.g. "Chest Press"). A global entity shared across all routines. Exercises are never automatically deleted; they persist even if removed from all routines.

**Instance** — a user-defined label for a specific piece of equipment within an exercise (e.g. "Cybex", "Hammer Strength", "Free Weight"). Each instance belongs to exactly one exercise. Instances can be created during routine editing or on-the-fly during a live session. Each instance stores its own independent `lastSession` stats. An exercise with exactly one instance is never asked about — see flow 3.

**Routine** — a saved, reusable workout template. Contains an ordered list of exercises. Does NOT specify which instance to use — that's chosen at session time. Routines are freely editable (add/remove exercises, rename) at any time.

**Session** — a single performance of a routine on a given day. Created by "starting" a routine. Tracks which instance was used for each exercise, the sets performed, and completion status. When completed, updates each instance's `lastSession` with the sets as laid out (regardless of individual set completion status).

**Set** — a single work set within a session entry: weight, reps, and a completed flag. The completed flag is for in-session tracking only; all sets (completed or not) are saved to `lastSession` on session completion.

**lastSession** — the most recent sets data for a specific instance. A list of `{ weight, reps }`. Used to pre-fill sets when that instance is next selected in any routine.

**Top set** — the heaviest Set of a SessionEntry: the single point Progress plots for that session. Sets with weight 0 are blank rows from the set editor, not lifts, and are excluded. A tie on weight resolves to the higher rep count. Not a stored field — derived on read.

**Progress** — a read-only view of Top set weight over time for one Exercise on one Instance. Derived entirely from completed Sessions; it stores nothing and changes nothing.

## Data Model

**Exercise**
- `id`
- `name` — user-entered, globally unique (e.g. "Chest Press")
- `instances` — list of Instance

**Instance**
- `id`
- `name` — user-defined label (e.g. "Cybex", "Hammer Strength", "Free Weight")
- belongs to exactly one Exercise
- `lastSession` — most recent sets for this instance: list of `{ weight, reps }`

**Routine**
- `id`
- `name`
- `created_at`
- `exercises` — ordered list of Exercise references (no instance assignment)

**Session**
- `id`
- `routine_id` — nullable (routine may be deleted after session was recorded)
- `started_at`
- `completed_at` — null while in progress
- `status` — `in_progress` | `completed`
- `entries` — list of SessionEntry

**SessionEntry**
- `exercise_id`
- `instance_id` — which instance was used (selected during session, can be changed)
- `sets` — list of Set

**Set**
- `weight`
- `reps`
- `completed` — bool (in-session tracking only)

Progress introduces no entities. It is a read of Session → SessionEntry → SessionSet,
filtered to completed sessions and reduced to one Top set per session per instance.

## User Flows

### 1. Home Screen
- Flat list of saved routines
- Each routine shows its name with "Start" and "Edit" actions
- "Create Routine" action always available
- Home and Progress are two panes of one pager. Progress is reached by **sliding left**, and by nothing else — there is deliberately no control for it (see flow 5)

### 2. Create / Edit Routine
Bare-bones screen, nothing beyond what's needed:
- Input: routine name
- Exercise list: add exercises by name (autocomplete from existing global exercises, or create new)
- For each exercise: optionally view/add instances
- Reorder exercises
- Save button

### 3. Start / Perform Session
- **Rest timer** — fixed/sticky to the top of the screen at all times. Displays a count-up timer (MM:SS) that starts at 0:00 paused. Auto-resets to 0:00 and begins counting when any set is marked complete. No adjustment buttons — purely informational.
- **Exercise list** — each exercise shows an instance selector (dropdown of existing instances + "Add new"). Selecting an instance pre-fills sets from that instance's `lastSession`. If no instance is selected or the instance has no history, sets start empty.
- **A sole instance is selected for you.** An exercise with exactly one instance has it assigned, and its sets laid out, at the moment the session is started — one instance is not a choice, and the lifter should never be asked to confirm the only option there is. An instance with no history still gets one blank set, so there is always a row to type into. With two or more instances nothing is guessed. The auto-pick is a default, not a lock: the selector still lists every instance, and switching re-fills from the one chosen.
- **Per-set controls**:
  - Weight: digit input via keyboard
  - Reps: digit input via keyboard
  - Completed checkbox: tap to toggle
  - Add set / remove set buttons
- **Instance switching**: selecting a different instance replaces the pre-filled sets with that instance's `lastSession`. Adding a new instance on-the-fly starts with blank sets.
- **Complete Session button** — pinned to the bottom of the screen, always reachable.

### 4. Complete & Save Session
Tapping "Complete Session":
- Marks the session `completed`
- For each SessionEntry, updates that instance's `lastSession` with ALL sets as laid out (regardless of individual completion status)
- Persists the full session to storage

### 5. Progress
Progress is not a page. It is the second pane of a pager whose first pane is Home, and
sliding **left** is the only way to it. The track follows the finger for the whole drag and
snaps to the nearest pane on release; nothing navigates, so the content moving under the
thumb is real at every point in the gesture.

Both panes render and load their data up front, which is what makes the slide instant —
there is no request to wait on and no blank frame to cover. The URL is kept in step with
`replaceState`, so a reload or a direct link to `/progress` opens on that pane.

Consequences worth keeping in mind: Progress is undiscoverable without being told it
exists, and a drag needs a pointer, so arrow keys move between panes for anyone on a
keyboard. The hidden pane is `inert`, so it is never reachable by tabbing into it.

- **Exercise selector** — every Exercise, whether or not it has history.
- **Instance selector** — only the instances of that exercise that have history, most-logged
  first. Hidden when there is only one: there is no choice to make.
- **Chart** — Top set weight over time for the selected Exercise + Instance, oldest to
  newest, positioned by when each session was actually completed so a month away from the
  gym reads as a month. The y-axis is not zero-based; its floor and ceiling are labelled
  instead.
- **Session list** — the exact numbers (`date`, `weight × reps`), newest first. The chart
  is a glance; this is the record.
- Sessions still in progress never appear — they are pre-filled from lastSession, so
  charting one would plot a lift that has not happened.
- An exercise with no completed history shows an empty state, not an empty chart.

## Persistence Requirements
- SQLite database via Flask backend
- Must persist:
  - Exercise and instance definitions (global, never auto-deleted)
  - Per-instance `lastSession` stats (sets, reps, weight)
  - Completed session history — the source Progress reads
  - Routine definitions
- No network dependency for core functionality

## Deletion Rules
- **Deleting an exercise from a routine**: exercise and its instances/stats persist globally
- **Deleting a routine**: only the routine definition is removed; exercises, instances, stats, and session history are untouched
- **Deleting an exercise globally**: removes the exercise and its instances from the system
- **Deleting an instance**: its Progress series goes with it. Session entries that used it
  survive but lose their instance reference, and an entry with no instance has no series to
  belong to — per the per-instance principle, its weights are not comparable to anything else.

## Explicit Non-Goals (v1)
- No account system or cloud sync
- No built-in exercise database or lookup — names are freeform user entry
- No analytics beyond the Progress chart — no estimated 1RM, no volume or tonnage, no
  personal-record detection, no date-range filtering, no export
- No session history browsing view. Progress is a weight trend for one instance, not a
  browsable log of past sessions: it never opens a session, and it cannot edit one
- No timer alerts or countdown mode
