# Rattlesnake

A mobile-first Flask web app for logging weightlifting workouts. Every exercise auto-fills with
the sets, reps, and weight from the last time it was performed on that machine, so the lifter
can start the set immediately and only adjust what changed. All data is on-device SQLite — no
account, no cloud sync.

## Navigation

Read the document before working in the area it covers. Do not reconstruct these from the code.

- **[.claude/CONTEXT.md](.claude/CONTEXT.md)** — domain model, glossary, user flows, deletion
  rules, and explicit non-goals. Read before touching `app/models.py` or `app/routes/`, or
  before using the words *exercise*, *machine*, *routine*, *session*, *set*, or *lastSession* —
  each is a defined term here and they do not mean what they'd mean in another lifting app.
- **[.claude/design_guidelines.md](.claude/design_guidelines.md)** — the FORGE design system, as
  actually implemented in `app/static/css/style.css`. Read before any change to markup, CSS, or
  visual behaviour. If the code and that document disagree, one of them is a bug — say which,
  don't silently pick a side.
- **[docs/adr/](docs/adr/)** — architecture decision records. Check for one covering your area
  before changing a decision it locks in.

## Skills

Project skills live in `.claude/skills/` and Claude Code loads them automatically. Invoke one
with the Skill tool, or by name as `/<skill-name>`. Run **`/ask-matt`** to route yourself to the
right skill when you're unsure which fits.

Most-used here: `/tdd`, `/code-review`, `/diagnosing-bugs`, `/domain-modeling`, `/retro`.

Two things to know about the bundled library, because its skills were written generically:

- They assume `CONTEXT.md` lives at the repo root. **Here it is `.claude/CONTEXT.md`.** Use that
  path; do not create a second one at the root.
- Several target TypeScript repos (`/migrate-to-shoehorn`, `/setup-ts-deep-modules`,
  `/setup-pre-commit`) and simply don't apply to this Python codebase.

## Layout

| Path | What's there |
|---|---|
| `app/__init__.py` | Flask app factory, extension + blueprint wiring |
| `app/models.py` | SQLAlchemy models — the domain model in CONTEXT.md, in code |
| `app/routes/api.py` | JSON API; the bulk of the logic and the bulk of the test surface |
| `app/routes/views.py` | Page routes; thin, renders the four templates |
| `app/templates/` | `base`, `home`, `routine`, `session` |
| `app/static/css/style.css` | The whole FORGE system; the only stylesheet |
| `tests/` | pytest suite, `conftest.py` holds the fixtures |
| `run.py` | Dev entrypoint, binds `0.0.0.0:5001` |
| `benchmarks/` | Standalone perf scripts, not part of the suite |

## Protocol

- **90% coverage is the floor.** Run `python3 -m pytest --cov=app --cov-report=term-missing`.
  Currently 98 tests, 97%. Fix failures and coverage regressions immediately — never report work
  as done while either is red, and never lower the bar to make a run pass.
- **The dev server is port 5001** — `python3 run.py`. Don't substitute another port.
- **Mobile is the target, not an afterthought.** Every change has to hold up one-handed at
  phone width, mid-set, in bad gym light. Interactive controls stay ≥44×44px.
- **Dark-mode-only.** Light mode is deliberately unimplemented; don't add it, and don't add a
  theme toggle.
