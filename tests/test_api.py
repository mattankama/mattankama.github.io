"""Tests for REST API endpoints."""

import json


class TestExercisesAPI:
    """Exercise CRUD endpoints."""

    def test_list_exercises_empty(self, client):
        resp = client.get("/api/exercises")
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_create_exercise(self, client):
        resp = client.post("/api/exercises", json={"name": "Bench Press"})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Bench Press"
        assert data["machines"] == []

    def test_create_exercise_idempotent(self, client):
        client.post("/api/exercises", json={"name": "Bench Press"})
        resp = client.post("/api/exercises", json={"name": "bench press"})
        assert resp.status_code == 200
        assert resp.get_json()["name"] == "Bench Press"

    def test_create_exercise_no_name(self, client):
        resp = client.post("/api/exercises", json={})
        assert resp.status_code == 400

    def test_create_exercise_empty_name(self, client):
        resp = client.post("/api/exercises", json={"name": "  "})
        assert resp.status_code == 400

    def test_list_exercises(self, client):
        client.post("/api/exercises", json={"name": "Bench Press"})
        client.post("/api/exercises", json={"name": "Squat"})
        resp = client.get("/api/exercises")
        data = resp.get_json()
        assert len(data) == 2

    def test_delete_exercise(self, client):
        resp = client.post("/api/exercises", json={"name": "Bench Press"})
        ex_id = resp.get_json()["id"]
        resp = client.delete(f"/api/exercises/{ex_id}")
        assert resp.status_code == 204

        resp = client.get("/api/exercises")
        assert resp.get_json() == []

    def test_delete_exercise_not_found(self, client):
        resp = client.delete("/api/exercises/9999")
        assert resp.status_code == 404


class TestMachinesAPI:
    """Machine endpoints."""

    def test_create_machine(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        resp = client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Cybex"})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Cybex"
        assert data["exercise_id"] == ex["id"]
        assert data["last_session"] is None

    def test_create_machine_exercise_not_found(self, client):
        resp = client.post("/api/exercises/9999/machines", json={"name": "Cybex"})
        assert resp.status_code == 404

    def test_create_machine_no_name(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        resp = client.post(f"/api/exercises/{ex['id']}/machines", json={})
        assert resp.status_code == 400

    def test_create_machine_duplicate(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Cybex"})
        resp = client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Cybex"})
        assert resp.status_code == 200  # Idempotent

    def test_delete_machine(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Cybex"}).get_json()
        resp = client.delete(f"/api/machines/{m['id']}")
        assert resp.status_code == 204

    def test_delete_machine_not_found(self, client):
        resp = client.delete("/api/machines/9999")
        assert resp.status_code == 404

    def test_get_last_session_no_data(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Cybex"}).get_json()
        resp = client.get(f"/api/machines/{m['id']}/last-session")
        data = resp.get_json()
        assert data["sets"] == []

    def test_get_last_session_not_found(self, client):
        resp = client.get("/api/machines/9999/last-session")
        assert resp.status_code == 404


class TestRoutinesAPI:
    """Routine CRUD endpoints."""

    def test_list_routines_empty(self, client):
        resp = client.get("/api/routines")
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_create_routine(self, client):
        resp = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [
                {"name": "Bench Press", "machines": [{"name": "Flat Bench"}]},
                {"name": "Shoulder Press"},
            ],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Push Day"
        assert len(data["exercises"]) == 2
        assert data["exercises"][0]["name"] == "Bench Press"
        assert len(data["exercises"][0]["machines"]) == 1

    def test_create_routine_no_name(self, client):
        resp = client.post("/api/routines", json={})
        assert resp.status_code == 400

    def test_create_routine_reuses_existing_exercise(self, client):
        client.post("/api/exercises", json={"name": "Bench Press"})
        resp = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        })
        data = resp.get_json()
        assert len(data["exercises"]) == 1

        # Only one exercise should exist globally
        exercises = client.get("/api/exercises").get_json()
        assert len(exercises) == 1

    def test_list_routines(self, client):
        client.post("/api/routines", json={"name": "Push Day", "exercises": []})
        client.post("/api/routines", json={"name": "Pull Day", "exercises": []})
        resp = client.get("/api/routines")
        assert len(resp.get_json()) == 2

    def test_get_routine(self, client):
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        }).get_json()
        resp = client.get(f"/api/routines/{r['id']}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["name"] == "Push Day"
        assert len(data["exercises"]) == 1

    def test_get_routine_not_found(self, client):
        resp = client.get("/api/routines/9999")
        assert resp.status_code == 404

    def test_update_routine(self, client):
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        }).get_json()

        resp = client.put(f"/api/routines/{r['id']}", json={
            "name": "Push Day Updated",
            "exercises": [{"name": "Bench Press"}, {"name": "Shoulder Press"}],
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["name"] == "Push Day Updated"
        assert len(data["exercises"]) == 2


    def test_update_routine_empty_exercise_name(self, client):
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        }).get_json()

        resp = client.put(f"/api/routines/{r['id']}", json={
            "name": "Push Day Updated",
            "exercises": [{"name": "Bench Press"}, {"name": " "}, {"name": ""}, {}],
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["name"] == "Push Day Updated"
        assert len(data["exercises"]) == 1
        assert data["exercises"][0]["name"] == "Bench Press"

    def test_update_routine_not_found(self, client):
        resp = client.put("/api/routines/9999", json={"name": "X"})
        assert resp.status_code == 404

    def test_delete_routine(self, client):
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        }).get_json()

        resp = client.delete(f"/api/routines/{r['id']}")
        assert resp.status_code == 204

        # Routine gone
        resp = client.get(f"/api/routines/{r['id']}")
        assert resp.status_code == 404

        # But exercise still exists
        exercises = client.get("/api/exercises").get_json()
        assert len(exercises) == 1
        assert exercises[0]["name"] == "Bench Press"

    def test_delete_routine_not_found(self, client):
        resp = client.delete("/api/routines/9999")
        assert resp.status_code == 404


class TestSessionsAPI:
    """Session lifecycle endpoints."""

    def test_start_session(self, client):
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}, {"name": "Shoulder Press"}],
        }).get_json()

        resp = client.post("/api/sessions", json={"routine_id": r["id"]})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["routine_name"] == "Push Day"
        assert data["status"] == "in_progress"
        assert len(data["entries"]) == 2

    def test_start_session_no_routine(self, client):
        resp = client.post("/api/sessions", json={})
        assert resp.status_code == 400

    def test_start_session_routine_not_found(self, client):
        resp = client.post("/api/sessions", json={"routine_id": 9999})
        assert resp.status_code == 404

    def test_get_session(self, client):
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        }).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()

        resp = client.get(f"/api/sessions/{s['id']}")
        assert resp.status_code == 200
        assert resp.get_json()["routine_name"] == "Push Day"

    def test_get_session_not_found(self, client):
        resp = client.get("/api/sessions/9999")
        assert resp.status_code == 404

    def test_complete_session(self, client):
        # Setup: routine → exercise → machine → session → entry → sets
        ex = client.post("/api/exercises", json={"name": "Bench Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Flat Bench"}).get_json()
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        }).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        entry_id = s["entries"][0]["id"]

        # Prefill with machine
        client.post(f"/api/session-entries/{entry_id}/prefill", json={"machine_id": m["id"]})

        # Add and update sets
        client.post(f"/api/session-entries/{entry_id}/sets", json={"weight": 135, "reps": 10})

        # Complete
        resp = client.put(f"/api/sessions/{s['id']}/complete")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "completed"
        assert data["completed_at"] is not None

        # Machine's last_session should be updated
        ls = client.get(f"/api/machines/{m['id']}/last-session").get_json()
        assert len(ls["sets"]) > 0

    def test_complete_already_completed(self, client):
        r = client.post("/api/routines", json={"name": "Push Day", "exercises": []}).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        client.put(f"/api/sessions/{s['id']}/complete")
        resp = client.put(f"/api/sessions/{s['id']}/complete")
        assert resp.status_code == 400

    def test_complete_session_not_found(self, client):
        resp = client.put("/api/sessions/9999/complete")
        assert resp.status_code == 404


class TestSessionEntriesAPI:
    """Session entry endpoints: machine switch, prefill, add set."""

    def _setup_session(self, client):
        """Helper: create exercise, machine, routine, and session."""
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Cybex"}).get_json()
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Chest Press"}],
        }).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        return ex, m, r, s

    def test_switch_machine(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]

        resp = client.put(f"/api/session-entries/{entry_id}/machine", json={"machine_id": m["id"]})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["entry"]["machine"]["name"] == "Cybex"

    def test_switch_machine_not_found_entry(self, client):
        resp = client.put("/api/session-entries/9999/machine", json={"machine_id": 1})
        assert resp.status_code == 404

    def test_switch_machine_no_machine_id(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.put(f"/api/session-entries/{entry_id}/machine", json={})
        assert resp.status_code == 400

    def test_switch_machine_machine_not_found(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.put(f"/api/session-entries/{entry_id}/machine", json={"machine_id": 9999})
        assert resp.status_code == 404

    def test_prefill_no_history(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]

        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={"machine_id": m["id"]})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["machine"]["name"] == "Cybex"
        assert len(data["sets"]) == 1  # One empty set
        assert data["sets"][0]["weight"] == 0

    def test_prefill_with_history(self, client):
        ex, m, r, s = self._setup_session(client)

        # Manually set machine's last session
        from app.models import Machine as MachineModel
        from app import db as _db
        with client.application.app_context():
            machine = _db.session.get(MachineModel, m["id"])
            machine.last_session_data = [{"weight": 135, "reps": 10}, {"weight": 145, "reps": 8}]
            _db.session.commit()

        entry_id = s["entries"][0]["id"]
        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={"machine_id": m["id"]})
        data = resp.get_json()
        assert len(data["sets"]) == 2
        assert data["sets"][0]["weight"] == 135
        assert data["sets"][1]["weight"] == 145

    def test_prefill_not_found_entry(self, client):
        resp = client.post("/api/session-entries/9999/prefill", json={"machine_id": 1})
        assert resp.status_code == 404

    def test_prefill_no_machine_id(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={})
        assert resp.status_code == 400

    def test_prefill_machine_not_found(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={"machine_id": 9999})
        assert resp.status_code == 404

    def test_add_set(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]

        resp = client.post(f"/api/session-entries/{entry_id}/sets", json={"weight": 100, "reps": 12})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["weight"] == 100
        assert data["reps"] == 12

    def test_add_set_not_found(self, client):
        resp = client.post("/api/session-entries/9999/sets", json={"weight": 100, "reps": 12})
        assert resp.status_code == 404


class TestSessionSetsAPI:
    """Session set endpoints: update, delete."""

    def _setup_set(self, client):
        """Helper: create full chain and return set id."""
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/machines", json={"name": "Cybex"}).get_json()
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Chest Press"}],
        }).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        entry_id = s["entries"][0]["id"]
        new_set = client.post(f"/api/session-entries/{entry_id}/sets", json={"weight": 100, "reps": 10}).get_json()
        return new_set, entry_id

    def test_update_set_weight(self, client):
        s, _ = self._setup_set(client)
        resp = client.put(f"/api/session-sets/{s['id']}", json={"weight": 135})
        assert resp.status_code == 200
        assert resp.get_json()["weight"] == 135

    def test_update_set_reps(self, client):
        s, _ = self._setup_set(client)
        resp = client.put(f"/api/session-sets/{s['id']}", json={"reps": 8})
        assert resp.status_code == 200
        assert resp.get_json()["reps"] == 8

    def test_update_set_completed(self, client):
        s, _ = self._setup_set(client)
        resp = client.put(f"/api/session-sets/{s['id']}", json={"completed": True})
        assert resp.status_code == 200
        assert resp.get_json()["completed"] is True

    def test_update_set_not_found(self, client):
        resp = client.put("/api/session-sets/9999", json={"weight": 100})
        assert resp.status_code == 404

    def test_delete_set(self, client):
        s, _ = self._setup_set(client)
        resp = client.delete(f"/api/session-sets/{s['id']}")
        assert resp.status_code == 204

    def test_delete_set_not_found(self, client):
        resp = client.delete("/api/session-sets/9999")
        assert resp.status_code == 404
