from datetime import datetime, timezone

from app import db

# Association table for Routine <-> Exercise (many-to-many with ordering)
routine_exercises = db.Table(
    "routine_exercises",
    db.Column("id", db.Integer, primary_key=True),
    db.Column("routine_id", db.Integer, db.ForeignKey("routines.id", ondelete="CASCADE"), nullable=False),
    db.Column("exercise_id", db.Integer, db.ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False),
    db.Column("position", db.Integer, nullable=False, default=0),
    db.UniqueConstraint("routine_id", "exercise_id", name="uq_routine_exercise"),
)


class Exercise(db.Model):
    """A named lift (e.g. 'Chest Press'). Global entity shared across all routines."""

    __tablename__ = "exercises"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), unique=True, nullable=False)

    machines = db.relationship("Machine", backref="exercise", cascade="all, delete-orphan", lazy=True)

    def to_dict(self, include_machines=True):
        data = {"id": self.id, "name": self.name}
        if include_machines:
            data["machines"] = [m.to_dict() for m in self.machines]
        return data


class Machine(db.Model):
    """A specific piece of equipment within an exercise (e.g. 'Cybex', 'Free Weight')."""

    __tablename__ = "machines"

    id = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    last_session_data = db.Column(db.JSON, nullable=True)  # [{"weight": 135, "reps": 10}, ...]

    __table_args__ = (db.UniqueConstraint("exercise_id", "name", name="uq_exercise_machine"),)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "exercise_id": self.exercise_id,
            "last_session": self.last_session_data,
        }


class Routine(db.Model):
    """A saved, reusable workout template containing an ordered list of exercises."""

    __tablename__ = "routines"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    exercises = db.relationship(
        "Exercise",
        secondary=routine_exercises,
        lazy=True,
        order_by=routine_exercises.c.position,
    )

    def to_dict(self, include_exercises=True):
        data = {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_exercises:
            data["exercises"] = [e.to_dict() for e in self.exercises]
            data["exercise_count"] = len(data["exercises"])
        else:
            data["exercise_count"] = (
                db.session.query(routine_exercises)
                .filter(routine_exercises.c.routine_id == self.id)
                .count()
            )
        return data


class Session(db.Model):
    """A single performance of a routine on a given day."""

    __tablename__ = "sessions"

    id = db.Column(db.Integer, primary_key=True)
    routine_id = db.Column(db.Integer, db.ForeignKey("routines.id", ondelete="SET NULL"), nullable=True)
    routine_name = db.Column(db.String(200), nullable=False)  # Snapshot — survives routine deletion
    started_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), default="in_progress", nullable=False)

    entries = db.relationship("SessionEntry", backref="session", cascade="all, delete-orphan", lazy=True,
                              order_by="SessionEntry.position")

    def to_dict(self):
        return {
            "id": self.id,
            "routine_id": self.routine_id,
            "routine_name": self.routine_name,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "entries": [e.to_dict() for e in self.entries],
        }


class SessionEntry(db.Model):
    """One exercise within a session, tracking which machine was used and the sets performed."""

    __tablename__ = "session_entries"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    exercise_id = db.Column(db.Integer, db.ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True)
    machine_id = db.Column(db.Integer, db.ForeignKey("machines.id", ondelete="SET NULL"), nullable=True)
    position = db.Column(db.Integer, nullable=False, default=0)

    exercise = db.relationship("Exercise", lazy=True)
    machine = db.relationship("Machine", lazy=True)
    sets = db.relationship("SessionSet", backref="entry", cascade="all, delete-orphan", lazy=True,
                           order_by="SessionSet.position")

    def to_dict(self):
        return {
            "id": self.id,
            "exercise": self.exercise.to_dict(include_machines=True) if self.exercise else None,
            "machine": self.machine.to_dict() if self.machine else None,
            "sets": [s.to_dict() for s in self.sets],
        }


class SessionSet(db.Model):
    """A single work set: weight, reps, and completion flag."""

    __tablename__ = "session_sets"

    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.Integer, db.ForeignKey("session_entries.id", ondelete="CASCADE"), nullable=False)
    weight = db.Column(db.Float, nullable=False, default=0)
    reps = db.Column(db.Integer, nullable=False, default=0)
    completed = db.Column(db.Boolean, default=False, nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "weight": self.weight,
            "reps": self.reps,
            "completed": self.completed,
            "position": self.position,
        }
