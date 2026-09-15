"""Tests for SQLAlchemy models — CRUD, relationships, cascades."""

import pytest

from app import db as _db
from app.models import Exercise, Instance, Routine, Session, SessionEntry, SessionSet, routine_exercises


class TestExercise:
    """Exercise model CRUD and constraints."""

    def test_create_exercise(self, db, create_exercise):
        ex = create_exercise("Bench Press")
        assert ex.id is not None
        assert ex.name == "Bench Press"
        assert ex.instances == []

    def test_exercise_name_unique(self, db, create_exercise):
        create_exercise("Bench Press")
        with pytest.raises(Exception):
            create_exercise("Bench Press")

    def test_exercise_to_dict(self, db, create_exercise):
        ex = create_exercise("Squat")
        d = ex.to_dict()
        assert d["name"] == "Squat"
        assert d["instances"] == []

    def test_exercise_to_dict_without_instances(self, db, create_exercise):
        ex = create_exercise("Squat")
        d = ex.to_dict(include_instances=False)
        assert "instances" not in d

    def test_delete_exercise(self, db, create_exercise):
        ex = create_exercise("Deadlift")
        ex_id = ex.id
        _db.session.delete(ex)
        _db.session.commit()
        assert _db.session.get(Exercise, ex_id) is None


class TestInstance:
    """Instance model CRUD and relationships."""

    def test_create_instance(self, db, create_exercise, create_instance):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        assert m.id is not None
        assert m.name == "Cybex"
        assert m.exercise_id == ex.id

    def test_instance_belongs_to_exercise(self, db, create_exercise, create_instance):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        assert m.exercise.name == "Chest Press"

    def test_instance_cascade_delete(self, db, create_exercise, create_instance):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        m_id = m.id
        _db.session.delete(ex)
        _db.session.commit()
        assert _db.session.get(Instance, m_id) is None

    def test_instance_last_session_data(self, db, create_exercise, create_instance):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        m.last_session_data = [{"weight": 135, "reps": 10}, {"weight": 135, "reps": 8}]
        _db.session.commit()

        refreshed = _db.session.get(Instance, m.id)
        assert refreshed.last_session_data == [{"weight": 135, "reps": 10}, {"weight": 135, "reps": 8}]

    def test_instance_to_dict(self, db, create_exercise, create_instance):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        d = m.to_dict()
        assert d["name"] == "Cybex"
        assert d["exercise_id"] == ex.id
        assert d["last_session"] is None

    def test_instance_unique_per_exercise(self, db, create_exercise, create_instance):
        ex = create_exercise("Chest Press")
        create_instance(ex.id, "Cybex")
        with pytest.raises(Exception):
            create_instance(ex.id, "Cybex")


class TestRoutine:
    """Routine model CRUD and associations."""

    def test_create_routine(self, db, create_routine):
        r = create_routine("Push Day")
        assert r.id is not None
        assert r.name == "Push Day"
        assert r.created_at is not None

    def test_routine_with_exercises(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press", "Shoulder Press"])
        assert len(r.exercises) == 2
        assert r.exercises[0].name == "Bench Press"
        assert r.exercises[1].name == "Shoulder Press"

    def test_routine_exercise_ordering(self, db, create_routine):
        r = create_routine("Full Body", ["Squat", "Bench Press", "Deadlift"])
        names = [e.name for e in r.exercises]
        assert names == ["Squat", "Bench Press", "Deadlift"]

    def test_routine_to_dict(self, db, create_routine):
        r = create_routine("Leg Day", ["Squat"])
        d = r.to_dict()
        assert d["name"] == "Leg Day"
        assert len(d["exercises"]) == 1
        assert d["exercise_count"] == 1

    def test_routine_to_dict_without_exercises(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        d = r.to_dict(include_exercises=False)
        assert "exercises" not in d
        assert d["exercise_count"] == 1

    def test_delete_routine_keeps_exercises(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        ex_id = r.exercises[0].id
        _db.session.delete(r)
        _db.session.commit()
        # Exercise should still exist
        assert _db.session.get(Exercise, ex_id) is not None


class TestSession:
    """Session model CRUD and completion logic."""

    def test_create_session(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.commit()
        assert session.id is not None
        assert session.status == "in_progress"
        assert session.completed_at is None

    def test_session_routine_name_snapshot(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.commit()

        # Delete routine
        _db.session.delete(r)
        _db.session.commit()

        refreshed = _db.session.get(Session, session.id)
        assert refreshed.routine_name == "Push Day"
        assert refreshed.routine_id is None

    def test_session_to_dict(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.commit()
        d = session.to_dict()
        assert d["routine_name"] == "Push Day"
        assert d["status"] == "in_progress"
        assert d["entries"] == []


class TestSessionEntry:
    """SessionEntry model."""

    def test_create_entry(self, db, create_routine, create_exercise):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=r.exercises[0].id, position=0)
        _db.session.add(entry)
        _db.session.commit()

        assert entry.id is not None
        assert entry.exercise.name == "Bench Press"
        assert entry.instance is None
        assert entry.sets == []

    def test_entry_instance_assignment(self, db, create_routine, create_instance):
        r = create_routine("Push Day", ["Bench Press"])
        ex = r.exercises[0]
        m = create_instance(ex.id, "Cybex")

        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=ex.id, instance_id=m.id, position=0)
        _db.session.add(entry)
        _db.session.commit()

        assert entry.instance.name == "Cybex"

    def test_entry_to_dict(self, db, create_routine, create_instance):
        r = create_routine("Push Day", ["Bench Press"])
        ex = r.exercises[0]
        m = create_instance(ex.id, "Cybex")

        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=ex.id, instance_id=m.id, position=0)
        _db.session.add(entry)
        _db.session.commit()

        d = entry.to_dict()
        assert d["exercise"]["name"] == "Bench Press"
        assert d["instance"]["name"] == "Cybex"
        assert d["sets"] == []

    def test_entry_cascade_delete(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=r.exercises[0].id, position=0)
        _db.session.add(entry)
        _db.session.commit()
        entry_id = entry.id

        _db.session.delete(session)
        _db.session.commit()
        assert _db.session.get(SessionEntry, entry_id) is None


class TestSessionSet:
    """SessionSet model CRUD."""

    def test_create_set(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=r.exercises[0].id, position=0)
        _db.session.add(entry)
        _db.session.flush()

        s = SessionSet(entry_id=entry.id, weight=135, reps=10, position=0)
        _db.session.add(s)
        _db.session.commit()

        assert s.id is not None
        assert s.weight == 135
        assert s.reps == 10
        assert s.completed is False

    def test_set_to_dict(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=r.exercises[0].id, position=0)
        _db.session.add(entry)
        _db.session.flush()

        s = SessionSet(entry_id=entry.id, weight=225, reps=5, position=0, completed=True)
        _db.session.add(s)
        _db.session.commit()

        d = s.to_dict()
        assert d["weight"] == 225
        assert d["reps"] == 5
        assert d["completed"] is True
        assert d["position"] == 0

    def test_set_cascade_delete(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=r.exercises[0].id, position=0)
        _db.session.add(entry)
        _db.session.flush()

        s = SessionSet(entry_id=entry.id, weight=135, reps=10, position=0)
        _db.session.add(s)
        _db.session.commit()
        set_id = s.id

        _db.session.delete(entry)
        _db.session.commit()
        assert _db.session.get(SessionSet, set_id) is None


class TestSessionCompletion:
    """Session completion updates instance lastSession."""

    def test_complete_session_updates_last_session(self, db, create_routine, create_instance):
        from datetime import datetime, timezone

        r = create_routine("Push Day", ["Bench Press"])
        ex = r.exercises[0]
        m = create_instance(ex.id, "Cybex")

        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.flush()

        entry = SessionEntry(session_id=session.id, exercise_id=ex.id, instance_id=m.id, position=0)
        _db.session.add(entry)
        _db.session.flush()

        _db.session.add(SessionSet(entry_id=entry.id, weight=135, reps=10, position=0, completed=True))
        _db.session.add(SessionSet(entry_id=entry.id, weight=145, reps=8, position=1, completed=False))
        _db.session.commit()

        # Complete session
        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)
        for e in session.entries:
            if e.instance_id and e.sets:
                instance = _db.session.get(Instance, e.instance_id)
                if instance:
                    instance.last_session_data = [
                        {"weight": s.weight, "reps": s.reps}
                        for s in sorted(e.sets, key=lambda s: s.position)
                    ]
        _db.session.commit()

        refreshed = _db.session.get(Instance, m.id)
        assert refreshed.last_session_data == [
            {"weight": 135, "reps": 10},
            {"weight": 145, "reps": 8},
        ]

    def test_routine_deletion_preserves_sessions(self, db, create_routine):
        r = create_routine("Push Day", ["Bench Press"])
        session = Session(routine_id=r.id, routine_name=r.name)
        _db.session.add(session)
        _db.session.commit()
        session_id = session.id

        _db.session.delete(r)
        _db.session.commit()

        refreshed = _db.session.get(Session, session_id)
        assert refreshed is not None
        assert refreshed.routine_name == "Push Day"
