# Rattlesnake — Context

## Overview
A minimal, fast weightlifting companion web app for guiding workouts session-to-session. The app removes friction from logging: every exercise auto-fills with the sets, reps, and weight from the last time it was performed on a given machine, so the user can start lifting immediately and only adjust what changed. All data lives on-device (SQLite via Flask) — no account, no cloud sync.

## Core Principles
- **Speed over configuration** — every screen should get the user into a set as fast as possible.
- **Minimal input surface** — the create screen only asks for what's strictly needed.
- **Rest timer is always reachable** — pinned to the top of the screen during a session, counts up automatically.
- **History is per-machine, not per-exercise** — the same exercise performed on a different machine is tracked separately, since the weight/resistance scale differs between machines.
- **Stats are global** — per Exercise+Machine stats carry over across all routines, not scoped to a single routine.

## Glossary

**Exercise** — a named lift (e.g. "Chest Press"). A global entity shared across all routines. Exercises are never automatically deleted; they persist even if removed from all routines.

**Machine** — a user-defined label for a specific piece of equipment within an exercise (e.g. "Machine A", "Cybex", "Free Weight"). Each machine belongs to exactly one exercise. Machines can be created during routine editing or on-the-fly during a live session. Each machine stores its own independent `lastSession` stats.

**Routine** — a saved, reusable workout template. Contains an ordered list of exercises. Does NOT specify which machine to use — that's chosen at session time. Routines are freely editable (add/remove exercises, rename) at any time.

**Session** — a single performance of a routine on a given day. Created by "starting" a routine. Tracks which machine was used for each exercise, the sets performed, and completion status. When completed, updates each machine's `lastSession` with the sets as laid out (regardless of individual set completion status).

**Set** — a single work set within a session entry: weight, reps, and a completed flag. The completed flag is for in-session tracking only; all sets (completed or not) are saved to `lastSession` on session completion.

**lastSession** — the most recent sets data for a specific machine. A list of `{ weight, reps }`. Used to pre-fill sets when that machine is next selected in any routine.

## Data Model

**Exercise**
- `id`
- `name` — user-entered, globally unique (e.g. "Chest Press")
- `machines` — list of Machine

**Machine**
- `id`
- `name` — user-defined label (e.g. "Machine A", "Cybex", "Free Weight")
- belongs to exactly one Exercise
- `lastSession` — most recent sets for this machine: list of `{ weight, reps }`

**Routine**
- `id`
- `name`
- `created_at`
- `exercises` — ordered list of Exercise references (no machine assignment)

**Session**
- `id`
- `routine_id` — nullable (routine may be deleted after session was recorded)
- `started_at`
- `completed_at` — null while in progress
- `status` — `in_progress` | `completed`
- `entries` — list of SessionEntry

**SessionEntry**
- `exercise_id`
- `machine_id` — which machine was used (selected during session, can be changed)
- `sets` — list of Set

**Set**
- `weight`
- `reps`
- `completed` — bool (in-session tracking only)

## User Flows

### 1. Home Screen
- Flat list of saved routines
- Each routine shows its name with "Start" and "Edit" actions
- "Create Routine" action always available
- Dark mode toggle in header

### 2. Create / Edit Routine
Bare-bones screen, nothing beyond what's needed:
- Input: routine name
- Exercise list: add exercises by name (autocomplete from existing global exercises, or create new)
- For each exercise: optionally view/add machines
- Reorder exercises
- Save button

### 3. Start / Perform Session
- **Rest timer** — fixed/sticky to the top of the screen at all times. Displays a count-up timer (MM:SS) that starts at 0:00 paused. Auto-resets to 0:00 and begins counting when any set is marked complete. No adjustment buttons — purely informational.
- **Exercise list** — each exercise shows a machine selector (dropdown of existing machines + "Add new"). Selecting a machine pre-fills sets from that machine's `lastSession`. If no machine is selected or the machine has no history, sets start empty.
- **Per-set controls**:
  - Weight: digit input via keyboard
  - Reps: digit input via keyboard
  - Completed checkbox: tap to toggle
  - Add set / remove set buttons
- **Machine switching**: selecting a different machine replaces the pre-filled sets with that machine's `lastSession`. Adding a new machine on-the-fly starts with blank sets.
- **Complete Session button** — pinned to the bottom of the screen, always reachable.

### 4. Complete & Save Session
Tapping "Complete Session":
- Marks the session `completed`
- For each SessionEntry, updates that machine's `lastSession` with ALL sets as laid out (regardless of individual completion status)
- Persists the full session to storage

## Persistence Requirements
- SQLite database via Flask backend
- Must persist:
  - Exercise and machine definitions (global, never auto-deleted)
  - Per-machine `lastSession` stats (sets, reps, weight)
  - Completed session history (not surfaced in UI for v1, but stored)
  - Routine definitions
- No network dependency for core functionality

## Deletion Rules
- **Deleting an exercise from a routine**: exercise and its machines/stats persist globally
- **Deleting a routine**: only the routine definition is removed; exercises, machines, stats, and session history are untouched
- **Deleting an exercise globally**: removes the exercise and its machines from the system

## Explicit Non-Goals (v1)
- No account system or cloud sync
- No built-in exercise database or lookup — names are freeform user entry
- No charts/analytics/progress graphs
- No session history browsing view
- No timer alerts or countdown mode
