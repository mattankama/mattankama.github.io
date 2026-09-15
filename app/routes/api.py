from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, abort, make_response
from sqlalchemy.orm import joinedload, selectinload

from app import db
from app.models import (Exercise, Instance, Routine, Session, SessionEntry,
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
    """List all exercises with their instances."""
    exercises = Exercise.query.options(joinedload(Exercise.instances)).order_by(Exercise.name).all()
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
    """Delete an exercise and all its instances."""
    exercise = get_or_404_json(Exercise, exercise_id, "Exercise not found")
    db.session.delete(exercise)
    db.session.commit()
    return "", 204


def _top_set(sets):
    """The heaviest set of an entry — the value Progress plots.

    Blank rows (weight 0) are an artifact of the set editor, not a lift, so they
    never become a data point. A tie on weight breaks to the higher rep count:
    of two sets at the same load, the longer one is the harder one.
    """
    working = [s for s in sets if (s.weight or 0) > 0]
    if not working:
        return None
    return max(working, key=lambda s: (s.weight, s.reps))


@api_bp.route("/exercises/<int:exercise_id>/progress", methods=["GET"])
def exercise_progress(exercise_id):
    """Top-set weight over time for one exercise, split by instance.

    The split is not a display choice — per CONTEXT.md, history is per-instance,
    because the same weight on two instances is not the same load. A single line
    across instances would read an instance switch as a PR or a plateau.

    Only completed sessions count: an in-progress session is pre-filled from the
    instance's lastSession, so charting it would plot a lift that hasn't happened.

    The whole exercise ships in one payload, so switching instances on the client
    costs no round trip.
    """
    exercise = get_or_404_json(Exercise, exercise_id, "Exercise not found")

    rows = (
        db.session.query(SessionEntry, Session.completed_at)
        .join(Session, SessionEntry.session_id == Session.id)
        .filter(
            SessionEntry.exercise_id == exercise.id,
            SessionEntry.instance_id.isnot(None),
            Session.status == "completed",
        )
        .options(joinedload(SessionEntry.instance))
        .order_by(Session.completed_at, Session.id)
        .all()
    )

    series = {}
    for entry, completed_at in rows:
        top = _top_set(entry.sets)
        if top is None or entry.instance is None:
            continue
        instance = series.setdefault(
            entry.instance_id,
            {"id": entry.instance_id, "name": entry.instance.name, "points": []},
        )
        instance["points"].append({
            "session_id": entry.session_id,
            # `date` is what gets labelled; `at` carries the time of day, which
            # is what keeps two sessions logged on one day from landing on the
            # same point of the x-axis.
            "date": completed_at.date().isoformat() if completed_at else None,
            "at": completed_at.isoformat() if completed_at else None,
            "weight": top.weight,
            "reps": top.reps,
        })

    # Most-logged instance first: the client picks series[0] and is right by
    # default, without having to decide anything itself.
    instances = sorted(series.values(), key=lambda m: (-len(m["points"]), m["name"]))

    return jsonify({
        "exercise": exercise.to_dict(include_instances=False),
        "instances": instances,
    })


# ---------------------------------------------------------------------------
# Instances
# ---------------------------------------------------------------------------

def _get_instance_or_404(instance_id):
    """Helper to get an instance by ID or abort with 404."""
    instance = db.session.get(Instance, instance_id)
    if not instance:
        abort(make_response(jsonify({"error": "Instance not found"}), 404))
    return instance


@api_bp.route("/exercises/<int:exercise_id>/instances", methods=["POST"])
def create_instance(exercise_id):
    """Add an instance to an exercise."""
    exercise = get_or_404_json(Exercise, exercise_id, "Exercise not found")

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Instance name is required"}), 400

    # Check for duplicate
    existing = Instance.query.filter_by(exercise_id=exercise_id, name=name).first()
    if existing:
        return jsonify(existing.to_dict()), 200

    instance = Instance(exercise_id=exercise_id, name=name)
    db.session.add(instance)
    db.session.commit()
    return jsonify(instance.to_dict()), 201


@api_bp.route("/instances/<int:instance_id>", methods=["DELETE"])
def delete_instance(instance_id):
    """Delete an instance."""
    instance = _get_instance_or_404(instance_id)
    db.session.delete(instance)
    db.session.commit()
    return "", 204


@api_bp.route("/instances/<int:instance_id>/last-session", methods=["GET"])
def get_instance_last_session(instance_id):
    """Get last session stats for an instance."""
    instance = _get_instance_or_404(instance_id)
    return jsonify({
        "instance_id": instance.id,
        "sets": instance.last_session_data or [],
    })


# ---------------------------------------------------------------------------
# Routines
# ---------------------------------------------------------------------------


def _get_routine_or_404(routine_id):
    """Helper to get a routine or abort with a 404 JSON response."""
    return get_or_404_json(Routine, routine_id, "Routine not found")


def _add_exercises_to_routine(routine, exercises_data):
    """Helper function to find/create exercises and associate them with a routine."""
    existing_exercises = {e.name.lower(): e for e in Exercise.query.all()}

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

        # Create instances if specified
        existing_instances = {m.name for m in Instance.query.filter_by(exercise_id=exercise.id).all()}
        for m_data in ex_data.get("instances", []):
            m_name = (m_data.get("name") or "").strip()
            if m_name and m_name not in existing_instances:
                db.session.add(Instance(exercise_id=exercise.id, name=m_name))
                existing_instances.add(m_name)

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
    """Create a routine with exercises and optional instances.

    Body: {"name": "...", "exercises": [{"name": "...", "instances": [{"name": "..."}]}]}
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
    """Get a routine with its exercises and instances."""
    routine = get_or_404_json(Routine, routine_id, "Routine not found")
    return jsonify(routine.to_dict())


@api_bp.route("/routines/<int:routine_id>", methods=["PUT"])
def update_routine(routine_id):
    """Update a routine's name and exercise list."""
    routine = _get_routine_or_404(routine_id)

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
    """Delete a routine definition only. Exercises, instances, stats, sessions untouched."""
    routine = _get_routine_or_404(routine_id)
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


def _lay_out_sets_from_instance(entry, instance):
    """Replace an entry's sets with the instance's lastSession.

    An instance with no history still gets one blank row, so there is always
    something to type into rather than an empty container.
    """
    SessionSet.query.filter_by(entry_id=entry.id).delete()

    last_data = instance.last_session_data or []
    if not last_data:
        db.session.add(SessionSet(entry_id=entry.id, weight=0, reps=0, position=0))
        return

    for i, set_data in enumerate(last_data):
        db.session.add(SessionSet(
            entry_id=entry.id,
            weight=set_data.get("weight", 0),
            reps=set_data.get("reps", 0),
            position=i,
        ))


@api_bp.route("/sessions", methods=["POST"])
def start_session():
    """Start a new session from a routine."""
    data = request.get_json(silent=True) or {}
    routine_id = data.get("routine_id")
    if not routine_id:
        return jsonify({"error": "routine_id is required"}), 400

    routine = _get_routine_or_404(routine_id)

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

        # One instance is not a choice, it is the answer. Assign it and lay the
        # sets out now, so the lifter arrives at a screen they can lift from
        # instead of one asking them to confirm the only option there is.
        # Done here rather than on the client so it is one transaction, not one
        # round trip per exercise.
        if len(exercise.instances) == 1:
            db.session.flush()  # entry.id, which the sets reference
            entry.instance_id = exercise.instances[0].id
            _lay_out_sets_from_instance(entry, exercise.instances[0])

    db.session.commit()
    return jsonify(session.to_dict()), 201


@api_bp.route("/sessions/<int:session_id>", methods=["GET"])
def get_session(session_id):
    """Get full session with entries and sets."""
    session = _get_session_or_404(session_id)
    return jsonify(session.to_dict())


def update_instance_stats(session):
    """Update last_session_data for all instances used in this session."""
    instance_ids = {entry.instance_id for entry in session.entries if entry.instance_id and entry.sets}
    if not instance_ids:
        return

    instances = db.session.query(Instance).filter(Instance.id.in_(instance_ids)).all()
    instance_map = {m.id: m for m in instances}

    for entry in session.entries:
        if entry.instance_id and entry.sets:
            instance = instance_map.get(entry.instance_id)
            if instance:
                instance.last_session_data = [
                    {"weight": s.weight, "reps": s.reps}
                    for s in sorted(entry.sets, key=lambda s: s.position)
                ]


@api_bp.route("/sessions/<int:session_id>/complete", methods=["PUT"])
def complete_session(session_id):
    """Complete a session. Updates each instance's lastSession with all sets."""
    session = _get_session_or_404(session_id)

    if session.status == "completed":
        return jsonify({"error": "Session already completed"}), 400

    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)

    # Update lastSession for each instance used
    instance_ids = [entry.instance_id for entry in session.entries if entry.instance_id and entry.sets]
    if instance_ids:
        instances = Instance.query.filter(Instance.id.in_(instance_ids)).all()
        instance_dict = {instance.id: instance for instance in instances}

        for entry in session.entries:
            if entry.instance_id and entry.sets:
                instance = instance_dict.get(entry.instance_id)
                if instance:
                    instance.last_session_data = [
                        {"weight": s.weight, "reps": s.reps}
                        for s in sorted(entry.sets, key=lambda s: s.position)
                    ]

    db.session.commit()
    return jsonify(session.to_dict())


# ---------------------------------------------------------------------------
# Session Entries
# ---------------------------------------------------------------------------


@api_bp.route("/session-entries/<int:entry_id>/instance", methods=["PUT"])
def switch_entry_instance(entry_id):
    """Switch the instance for a session entry."""
    entry = get_or_404_json(SessionEntry, entry_id, "Session entry not found")

    data = request.get_json(silent=True) or {}
    instance_id = data.get("instance_id")
    if not instance_id:
        return jsonify({"error": "instance_id is required"}), 400

    instance = _get_instance_or_404(instance_id)

    entry.instance_id = instance_id
    db.session.commit()

    return jsonify(
        {
            "entry": entry.to_dict(),
            "last_session": instance.last_session_data or [],
        }
    )


@api_bp.route("/session-entries/<int:entry_id>/prefill", methods=["POST"])
def prefill_entry(entry_id):
    """Assign instance to entry and auto-create sets from instance's lastSession."""
    entry = get_or_404_json(SessionEntry, entry_id, "Session entry not found")

    data = request.get_json(silent=True) or {}
    instance_id = data.get("instance_id")
    if not instance_id:
        return jsonify({"error": "instance_id is required"}), 400

    instance = _get_instance_or_404(instance_id)

    entry.instance_id = instance_id
    _lay_out_sets_from_instance(entry, instance)

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
