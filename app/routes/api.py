from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, abort, make_response

from app import db
from app.models import (Exercise, Machine, Routine, Session, SessionEntry,
                        SessionSet, routine_exercises)

api_bp = Blueprint("api", __name__)


def get_or_404_json(model, ident, error_message):
    """Get an entity by ID or abort with a 404 JSON response."""
    entity = db.session.get(model, ident)
    if not entity:
        abort(make_response(jsonify({"error": error_message}), 404))
    return entity


# ---------------------------------------------------------------------------
# Exercises
# ---------------------------------------------------------------------------


@api_bp.route("/exercises", methods=["GET"])
def list_exercises():
    """List all exercises with their machines."""
    exercises = Exercise.query.order_by(Exercise.name).all()
    return jsonify([e.to_dict() for e in exercises])


@api_bp.route("/exercises", methods=["POST"])
def create_exercise():
    """Create an exercise. Idempotent: returns existing if name matches."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Exercise name is required"}), 400

    existing = Exercise.query.filter(
        db.func.lower(Exercise.name) == name.lower()
    ).first()
    if existing:
        return jsonify(existing.to_dict()), 200

    exercise = Exercise(name=name)
    db.session.add(exercise)
    db.session.commit()
    return jsonify(exercise.to_dict()), 201


@api_bp.route("/exercises/<int:exercise_id>", methods=["DELETE"])
def delete_exercise(exercise_id):
    """Delete an exercise and all its machines."""
    exercise = get_or_404_json(Exercise, exercise_id, "Exercise not found")
    db.session.delete(exercise)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Machines
# ---------------------------------------------------------------------------


@api_bp.route("/exercises/<int:exercise_id>/machines", methods=["POST"])
def create_machine(exercise_id):
    """Add a machine to an exercise."""
    exercise = get_or_404_json(Exercise, exercise_id, "Exercise not found")

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Machine name is required"}), 400

    # Check for duplicate
    existing = Machine.query.filter_by(exercise_id=exercise_id, name=name).first()
    if existing:
        return jsonify(existing.to_dict()), 200

    machine = Machine(exercise_id=exercise_id, name=name)
    db.session.add(machine)
    db.session.commit()
    return jsonify(machine.to_dict()), 201


@api_bp.route("/machines/<int:machine_id>", methods=["DELETE"])
def delete_machine(machine_id):
    """Delete a machine."""
    machine = get_or_404_json(Machine, machine_id, "Machine not found")
    db.session.delete(machine)
    db.session.commit()
    return "", 204


@api_bp.route("/machines/<int:machine_id>/last-session", methods=["GET"])
def get_machine_last_session(machine_id):
    """Get last session stats for a machine."""
    machine = get_or_404_json(Machine, machine_id, "Machine not found")
    return jsonify({
        "machine_id": machine.id,
        "sets": machine.last_session_data or [],
    })


# ---------------------------------------------------------------------------
# Routines
# ---------------------------------------------------------------------------


def _add_exercises_to_routine(routine, exercises_data):
    """Helper function to find/create exercises and associate them with a routine."""
    for i, ex_data in enumerate(exercises_data):
        ex_name = (ex_data.get("name") or "").strip()
        if not ex_name:
            continue

        ex_name_lower = ex_name.lower()

        # Find or create exercise
        exercise = existing_exercises.get(ex_name_lower)
        if not exercise:
            exercise = Exercise(name=ex_name)
            db.session.add(exercise)
            db.session.flush()
            existing_exercises[ex_name_lower] = exercise

        # Create machines if specified
        existing_machines = {m.name for m in Machine.query.filter_by(exercise_id=exercise.id).all()}
        for m_data in ex_data.get("machines", []):
            m_name = (m_data.get("name") or "").strip()
            if m_name and m_name not in existing_machines:
                db.session.add(Machine(exercise_id=exercise.id, name=m_name))
                existing_machines.add(m_name)

        # Link to routine
        db.session.execute(
            routine_exercises.insert().values(
                routine_id=routine.id, exercise_id=exercise.id, position=i
            )
        )


@api_bp.route("/routines", methods=["GET"])
def list_routines():
    """List all routines."""
    routines = Routine.query.order_by(Routine.created_at.desc()).all()
    return jsonify([r.to_dict(include_exercises=False) for r in routines])


@api_bp.route("/routines", methods=["POST"])
def create_routine():
    """Create a routine with exercises and optional machines.

    Body: {"name": "...", "exercises": [{"name": "...", "machines": [{"name": "..."}]}]}
    """
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Routine name is required"}), 400

    routine = Routine(name=name)
    db.session.add(routine)
    db.session.flush()  # Get routine.id

    exercises_data = data.get("exercises", [])
    _add_exercises_to_routine(routine, exercises_data)

    db.session.commit()
    return jsonify(routine.to_dict()), 201


@api_bp.route("/routines/<int:routine_id>", methods=["GET"])
def get_routine(routine_id):
    """Get a routine with its exercises and machines."""
    routine = get_or_404_json(Routine, routine_id, "Routine not found")
    return jsonify(routine.to_dict())


@api_bp.route("/routines/<int:routine_id>", methods=["PUT"])
def update_routine(routine_id):
    """Update a routine's name and exercise list."""
    routine = get_or_404_json(Routine, routine_id, "Routine not found")

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if name:
        routine.name = name

    if "exercises" in data:
        # Clear existing associations
        db.session.execute(
            routine_exercises.delete().where(
                routine_exercises.c.routine_id == routine.id
            )
        )

        _add_exercises_to_routine(routine, data["exercises"])

    db.session.commit()
    return jsonify(routine.to_dict())


@api_bp.route("/routines/<int:routine_id>", methods=["DELETE"])
def delete_routine(routine_id):
    """Delete a routine definition only. Exercises, machines, stats, sessions untouched."""
    routine = get_or_404_json(Routine, routine_id, "Routine not found")
    db.session.delete(routine)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


def _get_session_or_404(session_id):
    """Helper to get a session or abort with a 404 JSON response."""
    session = db.session.get(Session, session_id)
    if not session:
        abort(make_response(jsonify({"error": "Session not found"}), 404))
    return session


@api_bp.route("/sessions", methods=["POST"])
def start_session():
    """Start a new session from a routine."""
    data = request.get_json(silent=True) or {}
    routine_id = data.get("routine_id")
    if not routine_id:
        return jsonify({"error": "routine_id is required"}), 400

    routine = get_or_404_json(Routine, routine_id, "Routine not found")

    session = Session(routine_id=routine.id, routine_name=routine.name)
    db.session.add(session)
    db.session.flush()

    # Create an entry for each exercise in the routine
    for i, exercise in enumerate(routine.exercises):
        entry = SessionEntry(
            session_id=session.id,
            exercise_id=exercise.id,
            position=i,
        )
        db.session.add(entry)

    db.session.commit()
    return jsonify(session.to_dict()), 201


@api_bp.route("/sessions/<int:session_id>", methods=["GET"])
def get_session(session_id):
    """Get full session with entries and sets."""
    session = _get_session_or_404(session_id)
    return jsonify(session.to_dict())


def update_machine_stats(session):
    """Update last_session_data for all machines used in this session."""
    machine_ids = {entry.machine_id for entry in session.entries if entry.machine_id and entry.sets}
    if not machine_ids:
        return

    machines = db.session.query(Machine).filter(Machine.id.in_(machine_ids)).all()
    machine_map = {m.id: m for m in machines}

    for entry in session.entries:
        if entry.machine_id and entry.sets:
            machine = machine_map.get(entry.machine_id)
            if machine:
                machine.last_session_data = [
                    {"weight": s.weight, "reps": s.reps}
                    for s in sorted(entry.sets, key=lambda s: s.position)
                ]


@api_bp.route("/sessions/<int:session_id>/complete", methods=["PUT"])
def complete_session(session_id):
    """Complete a session. Updates each machine's lastSession with all sets."""
    session = _get_session_or_404(session_id)

    if session.status == "completed":
        return jsonify({"error": "Session already completed"}), 400

    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)

    # Update lastSession for each machine used
    for entry in session.entries:
        if entry.machine_id and entry.sets:
            machine = db.session.get(Machine, entry.machine_id)
            if machine:
                machine.last_session_data = [
                    {"weight": s.weight, "reps": s.reps}
                    for s in entry.sets
                ]

    db.session.commit()
    return jsonify(session.to_dict())


# ---------------------------------------------------------------------------
# Session Entries
# ---------------------------------------------------------------------------


@api_bp.route("/session-entries/<int:entry_id>/machine", methods=["PUT"])
def switch_entry_machine(entry_id):
    """Switch the machine for a session entry."""
    entry = get_or_404_json(SessionEntry, entry_id, "Session entry not found")

    data = request.get_json(silent=True) or {}
    machine_id = data.get("machine_id")
    if not machine_id:
        return jsonify({"error": "machine_id is required"}), 400

    machine = get_or_404_json(Machine, machine_id, "Machine not found")

    entry.machine_id = machine_id
    db.session.commit()

    return jsonify(
        {
            "entry": entry.to_dict(),
            "last_session": machine.last_session_data or [],
        }
    )


@api_bp.route("/session-entries/<int:entry_id>/prefill", methods=["POST"])
def prefill_entry(entry_id):
    """Assign machine to entry and auto-create sets from machine's lastSession."""
    entry = get_or_404_json(SessionEntry, entry_id, "Session entry not found")

    data = request.get_json(silent=True) or {}
    machine_id = data.get("machine_id")
    if not machine_id:
        return jsonify({"error": "machine_id is required"}), 400

    machine = get_or_404_json(Machine, machine_id, "Machine not found")

    entry.machine_id = machine_id

    # Clear existing sets
    SessionSet.query.filter_by(entry_id=entry.id).delete()

    # Pre-fill from machine's last session, or create one empty set
    last_data = machine.last_session_data or []
    if last_data:
        for i, set_data in enumerate(last_data):
            s = SessionSet(
                entry_id=entry.id,
                weight=set_data.get("weight", 0),
                reps=set_data.get("reps", 0),
                position=i,
            )
            db.session.add(s)
    else:
        db.session.add(SessionSet(entry_id=entry.id, weight=0, reps=0, position=0))

    db.session.commit()

    # Refresh to get the new sets
    db.session.refresh(entry)
    return jsonify(entry.to_dict())


@api_bp.route("/session-entries/<int:entry_id>/sets", methods=["POST"])
def add_set(entry_id):
    """Add a new set to a session entry."""
    entry = get_or_404_json(SessionEntry, entry_id, "Session entry not found")

    data = request.get_json(silent=True) or {}
    max_pos = (
        db.session.query(db.func.max(SessionSet.position))
        .filter_by(entry_id=entry.id)
        .scalar()
    )
    position = (max_pos or 0) + 1 if max_pos is not None else 0

    new_set = SessionSet(
        entry_id=entry.id,
        weight=data.get("weight", 0),
        reps=data.get("reps", 0),
        position=position,
    )
    db.session.add(new_set)
    db.session.commit()
    return jsonify(new_set.to_dict()), 201


# ---------------------------------------------------------------------------
# Session Sets
# ---------------------------------------------------------------------------


@api_bp.route("/session-sets/<int:set_id>", methods=["PUT"])
def update_set(set_id):
    """Update a set's weight, reps, or completion status."""
    s = get_or_404_json(SessionSet, set_id, "Set not found")

    data = request.get_json(silent=True) or {}
    if "weight" in data:
        s.weight = data["weight"]
    if "reps" in data:
        s.reps = data["reps"]
    if "completed" in data:
        s.completed = data["completed"]

    db.session.commit()
    return jsonify(s.to_dict())


@api_bp.route("/session-sets/<int:set_id>", methods=["DELETE"])
def delete_set(set_id):
    """Remove a set."""
    s = get_or_404_json(SessionSet, set_id, "Set not found")
    db.session.delete(s)
    db.session.commit()
    return "", 204
