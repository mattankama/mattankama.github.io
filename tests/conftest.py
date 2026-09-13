import pytest

from app import create_app, db as _db
from app.models import Exercise, Machine, Routine, Session, SessionEntry, SessionSet, routine_exercises


@pytest.fixture
def app():
    """Create application for testing with in-memory SQLite."""
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    })
    yield app


@pytest.fixture
def db(app):
    """Provide a clean database for each test."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.rollback()
        _db.drop_all()


@pytest.fixture
def client(app, db):
    """Flask test client."""
    return app.test_client()


# ---------------------------------------------------------------------------
# Helper fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def create_exercise(db):
    """Factory fixture to create an exercise."""
    def _create(name="Chest Press"):
        ex = Exercise(name=name)
        db.session.add(ex)
        db.session.commit()
        return ex
    return _create


@pytest.fixture
def create_machine(db):
    """Factory fixture to create a machine."""
    def _create(exercise_id, name="Machine A"):
        m = Machine(exercise_id=exercise_id, name=name)
        db.session.add(m)
        db.session.commit()
        return m
    return _create


@pytest.fixture
def create_routine(db):
    """Factory fixture to create a routine with exercises."""
    def _create(name="Push Day", exercise_names=None):
        routine = Routine(name=name)
        db.session.add(routine)
        db.session.flush()

        if exercise_names:
            for i, ex_name in enumerate(exercise_names):
                ex = Exercise.query.filter_by(name=ex_name).first()
                if not ex:
                    ex = Exercise(name=ex_name)
                    db.session.add(ex)
                    db.session.flush()
                db.session.execute(
                    routine_exercises.insert().values(
                        routine_id=routine.id, exercise_id=ex.id, position=i
                    )
                )

        db.session.commit()
        return routine
    return _create


@pytest.fixture
def start_session(client):
    """Factory fixture to start a session from a routine."""
    def _start(routine_id):
        resp = client.post("/api/sessions", json={"routine_id": routine_id})
        return resp.get_json()
    return _start
