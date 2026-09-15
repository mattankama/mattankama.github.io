import time

from app import create_app, db
from app.models import Exercise, Instance, Routine, Session, SessionEntry, SessionSet, routine_exercises

def create_benchmark_data(app):
    with app.app_context():
        db.create_all()
        routine = Routine(name="Huge Routine")
        db.session.add(routine)
        db.session.flush()

        session = Session(routine_id=routine.id, routine_name="Huge Routine")
        db.session.add(session)
        db.session.flush()

        for i in range(500):  # Create 500 exercises, instances, and session entries
            ex = Exercise(name=f"Exercise {i}")
            db.session.add(ex)
            db.session.flush()

            m = Instance(exercise_id=ex.id, name=f"Instance {i}")
            db.session.add(m)
            db.session.flush()

            entry = SessionEntry(session_id=session.id, exercise_id=ex.id, instance_id=m.id, position=i)
            db.session.add(entry)
            db.session.flush()

            # Add some sets
            for j in range(3):
                s = SessionSet(entry_id=entry.id, weight=100, reps=10, position=j)
                db.session.add(s)

        db.session.commit()
        return session.id

if __name__ == "__main__":
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.test_client() as client:
        session_id = create_benchmark_data(app)

        # Warmup
        client.get(f"/api/sessions/{session_id}")

        start_time = time.time()
        resp = client.put(f"/api/sessions/{session_id}/complete")
        end_time = time.time()

        print(f"Status Code: {resp.status_code}")
        print(f"Time taken for completing session with 500 entries (N+1 queries): {end_time - start_time:.4f} seconds")
