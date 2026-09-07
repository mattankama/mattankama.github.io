# Rattlesnake — Implementation Plan

Build a weightlifting workout tracker web app. Every design decision has been settled via grilling rounds. This plan is self-contained: any agent can execute it without additional context beyond the files in `.agents/`.

## User Review Required

> [!IMPORTANT]
> This plan creates a full Flask + vanilla JS web app from scratch. The entire project structure, database schema, API surface, frontend pages, styling, and test suite are specified below. Estimated ~20 files to create.

## Proposed Changes

### 1. Project Scaffolding

#### [NEW] `requirements.txt`
```
flask==3.1.*
flask-sqlalchemy==3.1.*
pytest==8.*
pytest-cov==6.*
```

#### [NEW] `run.py`
Flask entry point. Imports the app factory, runs on port **5001** (per AGENTS.md).
```python
from app import create_app
app = create_app()
app.run(host="0.0.0.0", port=5001, debug=True)
```

---

### 2. Flask Application

#### [NEW] `app/__init__.py` — App Factory
- `create_app(config=None)` function
- Configures SQLAlchemy with `sqlite:///rattlesnake.db` (default) or in-memory for tests
- Registers blueprints: `api_bp` (prefix `/api`), `views_bp` (prefix `/`)
- Creates all tables on first request

#### [NEW] `app/models.py` — SQLAlchemy Models

Five models mapping to the data model in CONTEXT.md:

| Model | Table | Columns | Relationships |
|---|---|---|---|
| `Exercise` | `exercises` | `id` (PK), `name` (unique, not null) | `machines` → Machine (cascade delete) |
| `Machine` | `machines` | `id` (PK), `exercise_id` (FK), `name`, `last_session_data` (JSON, nullable) | `exercise` → Exercise |
| `Routine` | `routines` | `id` (PK), `name`, `created_at` | `exercises` → Exercise (M2M via `routine_exercises`) |
| `Session` | `sessions` | `id` (PK), `routine_id` (FK, nullable), `routine_name` (snapshot), `started_at`, `completed_at` (nullable), `status` (default `'in_progress'`) | `entries` → SessionEntry (cascade delete) |
| `SessionEntry` | `session_entries` | `id` (PK), `session_id` (FK), `exercise_id` (FK), `machine_id` (FK, nullable), `position` | `sets` → SessionSet (cascade delete) |
| `SessionSet` | `session_sets` | `id` (PK), `entry_id` (FK), `weight` (float), `reps` (int), `completed` (bool, default false), `position` | — |

**Association table** `routine_exercises`:
| Column | Type |
|---|---|
| `routine_id` | FK → routines.id |
| `exercise_id` | FK → exercises.id |
| `position` | INTEGER (ordering) |

Key details:
- `Machine.last_session_data` stores JSON: `[{"weight": 135, "reps": 10}, ...]`
- `Session.routine_name` is a snapshot string so the session retains the routine's name even if the routine is later deleted
- `Session.routine_id` is nullable (routine may be deleted)
- All cascade deletes go parent → child (Exercise → Machine, Session → SessionEntry → SessionSet)
- Unique constraint on `(exercise_id, name)` for machines
- Unique constraint on `(routine_id, exercise_id)` for routine_exercises

---

### 3. API Layer

#### [NEW] `app/routes/__init__.py` — Empty init

#### [NEW] `app/routes/api.py` — REST API Blueprint

All endpoints return JSON. Error responses use `{"error": "message"}` with appropriate HTTP status codes.

**Exercises**

| Method | Path | Body | Behavior |
|---|---|---|---|
| `GET` | `/api/exercises` | — | List all exercises with their machines. Each exercise includes `id`, `name`, `machines: [{id, name}]` |
| `POST` | `/api/exercises` | `{"name": "..."}` | Create exercise. If name already exists, return the existing one (idempotent for autocomplete flow). Returns `{id, name, machines: []}` |
| `DELETE` | `/api/exercises/<id>` | — | Delete exercise and all its machines. Nullifies any routine_exercises references. Returns 204. |

**Machines**

| Method | Path | Body | Behavior |
|---|---|---|---|
| `POST` | `/api/exercises/<exercise_id>/machines` | `{"name": "..."}` | Add machine to exercise. Returns `{id, name, exercise_id, last_session: null}` |
| `DELETE` | `/api/machines/<id>` | — | Delete machine. Returns 204. |
| `GET` | `/api/machines/<id>/last-session` | — | Returns `{machine_id, sets: [{weight, reps}]}` or `{machine_id, sets: []}` if no history |

**Routines**

| Method | Path | Body | Behavior |
|---|---|---|---|
| `GET` | `/api/routines` | — | List all routines: `[{id, name, created_at, exercise_count}]` |
| `POST` | `/api/routines` | `{"name": "...", "exercises": [{"name": "...", "machines": [{"name": "..."}]}]}` | Create routine. For each exercise: find-or-create by name. For each machine: find-or-create under that exercise. Returns full routine object. |
| `GET` | `/api/routines/<id>` | — | Full routine with exercises and their machines: `{id, name, exercises: [{id, name, machines: [{id, name}]}]}` |
| `PUT` | `/api/routines/<id>` | `{"name": "...", "exercises": [...]}` | Replace routine's exercise list (same find-or-create logic). Returns full routine. |
| `DELETE` | `/api/routines/<id>` | — | Delete routine definition only. Exercises, machines, stats, sessions untouched. Returns 204. |

**Sessions**

| Method | Path | Body | Behavior |
|---|---|---|---|
| `POST` | `/api/sessions` | `{"routine_id": N}` | Start a new session from routine. Creates SessionEntry for each exercise in the routine (ordered by position). Does NOT pre-assign machines or sets — the client fetches last_session per machine when the user selects one. Returns session with entries. |
| `GET` | `/api/sessions/<id>` | — | Full session: `{id, routine_name, status, started_at, entries: [{id, exercise: {id, name}, machine: {id, name} or null, sets: [{id, weight, reps, completed, position}]}]}` |
| `PUT` | `/api/sessions/<id>/complete` | — | Complete session. Sets `status='completed'`, `completed_at=now()`. For each entry that has a machine assigned: updates that machine's `last_session_data` with ALL sets (weight, reps) regardless of completion flag. Returns completed session. |
| `PUT` | `/api/session-entries/<id>/machine` | `{"machine_id": N}` | Switch machine for an entry. Returns updated entry with machine's last_session data for pre-fill. |
| `POST` | `/api/session-entries/<id>/sets` | `{"weight": N, "reps": N}` | Add a new set to entry. Position = max existing + 1. Returns new set. |
| `PUT` | `/api/session-sets/<id>` | `{"weight": N, "reps": N, "completed": bool}` | Update a set's weight, reps, or completion status. Returns updated set. |
| `DELETE` | `/api/session-sets/<id>` | — | Remove a set. Returns 204. |
| `POST` | `/api/session-entries/<id>/prefill` | `{"machine_id": N}` | Assign machine to entry AND auto-create sets from that machine's `last_session_data`. If machine has no history, creates one empty set. Returns entry with sets. |

---

### 4. Page Routes & Templates

#### [NEW] `app/routes/views.py` — View Blueprint

| Method | Path | Template | Description |
|---|---|---|---|
| `GET` | `/` | `home.html` | Home — list of routines |
| `GET` | `/routine/new` | `routine.html` | Create routine form |
| `GET` | `/routine/<id>/edit` | `routine.html` | Edit routine form (pre-populated) |
| `GET` | `/session/<id>` | `session.html` | Active session view |

#### [NEW] `app/templates/base.html`
Base layout with:
- `<meta name="viewport" content="width=device-width, initial-scale=1">` (mobile)
- CSS link to `/static/css/style.css`
- Dark mode handled entirely via `@media (prefers-color-scheme: dark)` in CSS — no JS toggle, no `data-theme` attribute (per Design Guidelines §2: "Follow the system's light/dark setting by default; this app doesn't need its own in-app toggle unless requested later.")
- `{% block content %}` for page content
- JS scripts at bottom

#### [NEW] `app/templates/home.html`
- Extends `base.html`
- Heading: "Rattlesnake"
- List of routines fetched from API on load
- Each routine card: name, "Start" button (POST to create session, redirect to `/session/<id>`), "Edit" link, "Delete" button
- "Create Routine" button → navigates to `/routine/new`
- Empty state message when no routines exist

#### [NEW] `app/templates/routine.html`
- Extends `base.html`
- Routine name text input
- Dynamic exercise list:
  - Each exercise row: name input with autocomplete (fetches from `/api/exercises`), remove button
  - Under each exercise: collapsible machine list (add/view machines)
  - "Add Exercise" button at bottom
- Save button → POST or PUT to API, redirect to `/`
- Cancel link → back to `/`

#### [NEW] `app/templates/session.html`
- Extends `base.html`
- **Sticky top bar**: Rest timer display
  - Shows `00:00` initially, paused
  - JS count-up timer: auto-resets to 0 and starts when any set's completed checkbox is toggled ON
  - Large monospace/tabular digits (48-64pt per design spec)
  - Background: Structure border separates it from content (flat divider, not shadow per Design Guidelines §5). In dark mode, uses `--color-elevated` (`#523A34`) as fill.
- **Scrollable exercise list**:
  - Each exercise block:
    - Exercise name as heading (18-20pt bold)
    - Machine selector: `<select>` dropdown of machines for this exercise + "Add new machine" option
    - When machine selected → fetch last_session and pre-fill sets via `/api/session-entries/<id>/prefill`
    - Sets table: each row has weight input (type="number"), reps input (type="number"), completed checkbox
    - "Add Set" button, "Remove" button on each set
    - 1px hairline divider between exercises
- **Sticky bottom bar**: "Complete Session" button
  - On tap: PUT to complete endpoint, redirect to `/` 
  - Background matches top bar styling

---

### 5. Static Assets

#### [NEW] `app/static/css/style.css`

Full design system implementing [design_guidelines.md](file:///Users/mattankama/antigravity/rattlesnake/.agents/design_guidelines.md):

```css
/* Token names from Design Guidelines §10 */
:root {
  --color-ink: #191D24;
  --color-structure: #523A34;
  --color-muted: #799496;
  --color-surface: #FFF8E8;
  --color-accent: #B87D4B;
  --color-elevated: var(--color-structure); /* only distinct in dark mode */
  --space-unit: 8px;
  --space-micro: 4px;
  --touch-target-min: 44px;
  --radius: 4px;  /* one modest value everywhere (§4) */
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: #191D24;   /* Surface ↔ Ink swap */
    --color-ink: #FFF8E8;       /* Ink ↔ Surface swap */
    --color-structure: #799496; /* Cool Steel replaces Deep Mocha for legibility */
    --color-elevated: #523A34;  /* Deep Mocha repurposed as flat panel fill */
    --color-accent: #B87D4B;   /* unchanged in both modes */
    /* --color-muted has no separate dark value; use --color-structure */
  }
}
```

Key rules (referencing Design Guidelines sections):
- `font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (§3: platform system font)
- `font-variant-numeric: tabular-nums` on all numeric inputs and timer (§3: tabular numerals)
- `border-radius: var(--radius)` on all components — one consistent value (§4: "one radius value, used everywhere")
- No `box-shadow`, no gradients, no opacity blends, no blur (§8: anti-patterns)
- Dividers: `1px solid var(--color-structure)` only (§5: "flat divider line in Structure")
- Inputs: flat, bordered with `var(--color-structure)`, background `var(--color-surface)`
- **Two font weights only** — `700` (Bold) and `400` (Regular) (§3: "Two weights only")
- Number inputs (weight × reps): `font-size: 28px; font-weight: 700` (§3: 28–34pt Bold)
- Timer: `font-size: 56px; font-weight: 700` (§3: 48–64pt Bold)
- Exercise titles: `font-size: 20px; font-weight: 700` (§3: 18–20pt Bold)
- Button / action labels: `font-size: 16px; font-weight: 700` (§3: 15–17pt Bold)
- Body / metadata (machine names, set counts): `font-size: 14px; font-weight: 400` (§3: 13–15pt Regular)
- All spacing on 8px grid, with 4px micro-spacing exceptions (§4)
- Touch targets: `min-height: var(--touch-target-min); min-width: var(--touch-target-min)` (§4: 44×44pt)
- Sticky bars separated by flat `var(--color-structure)` divider, not shadow (§5)
- Mobile: full-width single-column layout, touch-friendly by default

#### [NEW] `app/static/js/app.js` — Shared utilities
- `fetchJSON(url, options)` — wrapper around fetch with JSON headers and error handling
- No theme JS needed — dark mode is handled entirely by CSS `@media (prefers-color-scheme: dark)`
- Initializes shared event handlers on DOMContentLoaded

#### [NEW] `app/static/js/home.js` — Home page logic
- Fetches routines from API on load
- Renders routine list with Start/Edit/Delete actions
- Start: POST to create session → redirect to session page
- Delete: confirm dialog → DELETE routine → re-render list

#### [NEW] `app/static/js/routine.js` — Routine editor logic
- Dynamic exercise list management (add/remove exercise rows)
- Exercise name autocomplete: debounced fetch to `/api/exercises` on input
- Machine sub-list management (add/remove machines under each exercise)
- Save: collects form data, POST or PUT to API, redirect to home
- On edit: pre-populates from GET `/api/routines/<id>`

#### [NEW] `app/static/js/session.js` — Active session logic
- **Timer module**:
  - State: `{ running: false, seconds: 0, intervalId: null }`
  - `resetAndStart()`: clears interval, sets seconds=0, starts new interval incrementing every 1s, updates display
  - `formatTime(seconds)` → `MM:SS` string
  - Display updates the timer DOM element
  - Called when any set checkbox is toggled to `completed=true`
- **Exercise rendering**:
  - For each entry: render machine selector, sets table
  - Machine selector `onchange`: POST to `/api/session-entries/<id>/prefill` with selected machine_id → replace sets UI with response data
  - "Add new machine" option in selector: prompt for name → POST to create machine → POST prefill → update selector
- **Set interactions**:
  - Weight/reps inputs: `type="number"`, `inputmode="decimal"` (triggers numeric keyboard on mobile)
  - On blur or change: PUT to `/api/session-sets/<id>` with updated values
  - Completed checkbox: on toggle to true → PUT set update + call `timer.resetAndStart()`
  - "Add Set": POST to `/api/session-entries/<id>/sets` → append new set row
  - "Remove Set": DELETE `/api/session-sets/<id>` → remove row
- **Complete Session**:
  - PUT to `/api/sessions/<id>/complete`
  - On success: redirect to `/`

---

### 6. Test Suite

All tests use pytest with Flask test client and an in-memory SQLite database.

#### [NEW] `tests/__init__.py` — Empty

#### [NEW] `tests/conftest.py`
- Fixture `app`: creates app with `SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'` and `TESTING = True`
- Fixture `client`: `app.test_client()`
- Fixture `db`: creates all tables, yields db session, drops all after test
- Fixture helpers: `create_exercise(name)`, `create_routine(name, exercises)`, `create_machine(exercise_id, name)`, `start_session(routine_id)`

#### [NEW] `tests/test_models.py`
Test all model CRUD operations and relationships:
- Create/read/delete Exercise
- Exercise name uniqueness
- Create/delete Machine under Exercise
- Machine cascade delete when Exercise deleted
- Machine last_session_data JSON storage and retrieval
- Create/read/delete Routine with exercise associations
- Routine exercise ordering (position)
- Create Session from Routine
- Session completion logic: updates machine last_session_data
- SessionEntry machine assignment
- SessionSet CRUD
- Routine deletion doesn't affect exercises or sessions

#### [NEW] `tests/test_api.py`
Test every API endpoint:
- **Exercises**: GET list, POST create (new + idempotent), DELETE
- **Machines**: POST create, DELETE, GET last-session (with data, without data)
- **Routines**: GET list, POST create (with nested exercises/machines), GET detail, PUT update, DELETE (verify exercises survive)
- **Sessions**: POST start (verify entries created from routine), GET detail, PUT complete (verify last_session_data updated for each machine), entry machine switch, set CRUD (add/update/delete), prefill from machine history
- **Error cases**: 404 for missing resources, 400 for bad input, duplicate names

#### [NEW] `tests/test_views.py`
Test page routes return 200 and contain expected elements:
- `GET /` returns home page with "Rattlesnake" heading
- `GET /routine/new` returns form
- `GET /routine/<id>/edit` returns pre-populated form
- `GET /session/<id>` returns session page with timer element
- 404 for non-existent routine/session IDs

**Coverage target**: ≥ 90% as mandated by AGENTS.md. Run with:
```bash
pytest --cov=app --cov-report=term-missing --cov-fail-under=90
```

---

## Verification Plan

### Automated Tests
```bash
pip install -r requirements.txt
pytest --cov=app --cov-report=term-missing --cov-fail-under=90 -v
```

### Manual Verification
1. Start server: `python run.py` (port 5001)
2. Open browser to `http://localhost:5001`
3. Test full flow:
   - Create a routine with 2-3 exercises and machines
   - Start a session from that routine
   - Select machines, adjust weight/reps via keyboard input
   - Mark sets complete → verify timer resets and counts up
   - Complete session → verify redirect to home
   - Start same routine again → verify last session stats pre-fill
4. Test on mobile viewport (Chrome DevTools device toolbar)
5. Test dark mode via OS preference (no in-app toggle)
6. Test routine editing (add/remove exercises)
7. Test routine deletion (verify exercises survive)
