import time
from app import create_app, db
from app.models import Routine, Exercise, Machine, routine_exercises

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    # create a large request payload
    payload = {
        "name": "Benchmark Routine",
        "exercises": []
    }
    for i in range(10):
        exercise = {
            "name": f"Exercise {i}",
            "machines": [{"name": f"Machine {i}_{j}"} for j in range(20)]
        }
        payload["exercises"].append(exercise)

    # Pre-populate some to test the existing machine case as well
    for i in range(10):
        ex = Exercise(name=f"Exercise {i}")
        db.session.add(ex)
        db.session.flush()
        for j in range(10):
            db.session.add(Machine(exercise_id=ex.id, name=f"Machine {i}_{j}"))
    db.session.commit()

    start = time.time()
    with app.test_client() as client:
        resp = client.post("/api/routines", json=payload)
        assert resp.status_code == 201
    duration = time.time() - start
    print(f"Baseline (Creation): {duration:.4f} seconds")

    # Update routine benchmark
    routine_id = resp.get_json()["id"]
    payload["name"] = "Benchmark Routine Updated"

    start2 = time.time()
    with app.test_client() as client:
        resp2 = client.put(f"/api/routines/{routine_id}", json=payload)
        assert resp2.status_code == 200
    duration2 = time.time() - start2
    print(f"Baseline (Update): {duration2:.4f} seconds")
