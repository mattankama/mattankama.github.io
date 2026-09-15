"""Tests for REST API endpoints."""

import json
from datetime import datetime


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
        assert data["instances"] == []

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


class TestInstancesAPI:
    """Instance endpoints."""

    def test_create_instance(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        resp = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Cybex"
        assert data["exercise_id"] == ex["id"]
        assert data["last_session"] is None

    def test_create_instance_exercise_not_found(self, client):
        resp = client.post("/api/exercises/9999/instances", json={"name": "Cybex"})
        assert resp.status_code == 404

    def test_create_instance_no_name(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        resp = client.post(f"/api/exercises/{ex['id']}/instances", json={})
        assert resp.status_code == 400

    def test_create_instance_duplicate(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"})
        resp = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"})
        assert resp.status_code == 200  # Idempotent

    def test_delete_instance(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"}).get_json()
        resp = client.delete(f"/api/instances/{m['id']}")
        assert resp.status_code == 204

    def test_delete_instance_not_found(self, client):
        resp = client.delete("/api/instances/9999")
        assert resp.status_code == 404

    def test_get_last_session_no_data(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"}).get_json()
        resp = client.get(f"/api/instances/{m['id']}/last-session")
        data = resp.get_json()
        assert data["sets"] == []

    def test_get_last_session_with_data(self, client):
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"}).get_json()

        # Manually set instance's last session data
        from app.models import Instance as InstanceModel
        from app import db as _db
        with client.application.app_context():
            instance = _db.session.get(InstanceModel, m["id"])
            instance.last_session_data = [{"weight": 135, "reps": 10}, {"weight": 145, "reps": 8}]
            _db.session.commit()

        resp = client.get(f"/api/instances/{m['id']}/last-session")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["sets"]) == 2
        assert data["sets"][0]["weight"] == 135
        assert data["sets"][0]["reps"] == 10
        assert data["sets"][1]["weight"] == 145
        assert data["sets"][1]["reps"] == 8

    def test_get_last_session_not_found(self, client):
        resp = client.get("/api/instances/9999/last-session")
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
                {"name": "Bench Press", "instances": [{"name": "Flat Bench"}]},
                {"name": "Shoulder Press"},
            ],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Push Day"
        assert len(data["exercises"]) == 2
        assert data["exercises"][0]["name"] == "Bench Press"
        assert len(data["exercises"][0]["instances"]) == 1

    def test_create_routine_no_name(self, client):
        resp = client.post("/api/routines", json={})
        assert resp.status_code == 400

    def test_create_routine_empty_exercise_name(self, client):
        resp = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "  "}],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Push Day"
        assert len(data["exercises"]) == 0

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

    def test_create_routine_reuses_existing_instance(self, client):
        ex_resp = client.post("/api/exercises", json={"name": "Bench Press"})
        ex_id = ex_resp.get_json()["id"]
        client.post(f"/api/exercises/{ex_id}/instances", json={"name": "Flat Bench"})

        resp = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [
                {"name": "Bench Press", "instances": [{"name": "Flat Bench"}]}
            ],
        })
        data = resp.get_json()
        assert len(data["exercises"]) == 1
        assert len(data["exercises"][0]["instances"]) == 1

        # Only one exercise and one instance should exist globally
        exercises = client.get("/api/exercises").get_json()
        assert len(exercises) == 1
        assert len(exercises[0]["instances"]) == 1
        assert exercises[0]["instances"][0]["name"] == "Flat Bench"

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
        # Setup: routine → exercise → instance → session → entry → sets
        ex = client.post("/api/exercises", json={"name": "Bench Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Flat Bench"}).get_json()
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Bench Press"}],
        }).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        entry_id = s["entries"][0]["id"]

        # Prefill with instance
        client.post(f"/api/session-entries/{entry_id}/prefill", json={"instance_id": m["id"]})

        # Add and update sets
        client.post(f"/api/session-entries/{entry_id}/sets", json={"weight": 135, "reps": 10})

        # Complete
        resp = client.put(f"/api/sessions/{s['id']}/complete")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "completed"
        assert data["completed_at"] is not None

        # Instance's last_session should be updated
        ls = client.get(f"/api/instances/{m['id']}/last-session").get_json()
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
    """Session entry endpoints: instance switch, prefill, add set."""

    def _setup_session(self, client):
        """Helper: create exercise, instance, routine, and session."""
        ex = client.post("/api/exercises", json={"name": "Chest Press"}).get_json()
        m = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"}).get_json()
        r = client.post("/api/routines", json={
            "name": "Push Day",
            "exercises": [{"name": "Chest Press"}],
        }).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        return ex, m, r, s

    def test_switch_instance(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]

        resp = client.put(f"/api/session-entries/{entry_id}/instance", json={"instance_id": m["id"]})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["entry"]["instance"]["name"] == "Cybex"

    def test_switch_instance_not_found_entry(self, client):
        resp = client.put("/api/session-entries/9999/instance", json={"instance_id": 1})
        assert resp.status_code == 404

    def test_switch_instance_no_instance_id(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.put(f"/api/session-entries/{entry_id}/instance", json={})
        assert resp.status_code == 400

    def test_switch_instance_instance_not_found(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.put(f"/api/session-entries/{entry_id}/instance", json={"instance_id": 9999})
        assert resp.status_code == 404

    def test_prefill_no_history(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]

        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={"instance_id": m["id"]})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["instance"]["name"] == "Cybex"
        assert len(data["sets"]) == 1  # One empty set
        assert data["sets"][0]["weight"] == 0

    def test_prefill_with_history(self, client):
        ex, m, r, s = self._setup_session(client)

        # Manually set instance's last session
        from app.models import Instance as InstanceModel
        from app import db as _db
        with client.application.app_context():
            instance = _db.session.get(InstanceModel, m["id"])
            instance.last_session_data = [{"weight": 135, "reps": 10}, {"weight": 145, "reps": 8}]
            _db.session.commit()

        entry_id = s["entries"][0]["id"]
        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={"instance_id": m["id"]})
        data = resp.get_json()
        assert len(data["sets"]) == 2
        assert data["sets"][0]["weight"] == 135
        assert data["sets"][1]["weight"] == 145

    def test_prefill_not_found_entry(self, client):
        resp = client.post("/api/session-entries/9999/prefill", json={"instance_id": 1})
        assert resp.status_code == 404

    def test_prefill_no_instance_id(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={})
        assert resp.status_code == 400

    def test_prefill_instance_not_found(self, client):
        ex, m, r, s = self._setup_session(client)
        entry_id = s["entries"][0]["id"]
        resp = client.post(f"/api/session-entries/{entry_id}/prefill", json={"instance_id": 9999})
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
        m = client.post(f"/api/exercises/{ex['id']}/instances", json={"name": "Cybex"}).get_json()
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


class TestExerciseProgressAPI:
    """Top-set weight over time, split by instance.

    The split is the point of this endpoint: per CONTEXT.md, history is
    per-instance because the same number on two instances is not the same load.
    """

    def _series(self, client, exercise_id):
        resp = client.get(f"/api/exercises/{exercise_id}/progress")
        assert resp.status_code == 200
        return resp.get_json()

    def test_progress_exercise_not_found(self, client):
        resp = client.get("/api/exercises/9999/progress")
        assert resp.status_code == 404
        assert resp.get_json()["error"] == "Exercise not found"

    def test_progress_no_history(self, client, create_exercise, create_instance):
        ex = create_exercise("Chest Press")
        create_instance(ex.id, "Cybex")
        data = self._series(client, ex.id)
        assert data["exercise"]["name"] == "Chest Press"
        assert data["instances"] == []

    def test_progress_exercise_summary_omits_instances(self, client, create_exercise):
        """The instance list travels in `instances`, with its points attached."""
        ex = create_exercise("Chest Press")
        data = self._series(client, ex.id)
        assert "instances" not in data["exercise"]

    def test_progress_plots_the_top_set(
        self, client, create_exercise, create_instance, record_session
    ):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        record_session(ex, m, [(185, 8), (195, 6), (185, 5)], datetime(2026, 3, 3))

        points = self._series(client, ex.id)["instances"][0]["points"]
        assert len(points) == 1
        assert points[0]["weight"] == 195
        assert points[0]["reps"] == 6
        assert points[0]["date"] == "2026-03-03"

    def test_progress_point_carries_the_time_of_day(
        self, client, create_exercise, create_instance, record_session
    ):
        """Two sessions on one day are two points, so x-position needs the time."""
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        record_session(ex, m, [(185, 8)], datetime(2026, 3, 3, 7, 30))
        record_session(ex, m, [(190, 6)], datetime(2026, 3, 3, 18, 15))

        points = self._series(client, ex.id)["instances"][0]["points"]
        assert [p["date"] for p in points] == ["2026-03-03", "2026-03-03"]
        assert points[0]["at"] == "2026-03-03T07:30:00"
        assert points[1]["at"] == "2026-03-03T18:15:00"

    def test_progress_weight_tie_breaks_to_higher_reps(
        self, client, create_exercise, create_instance, record_session
    ):
        """Two sets at the same load: the longer one is the harder one."""
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        record_session(ex, m, [(185, 5), (185, 9), (185, 7)], datetime(2026, 3, 3))

        assert self._series(client, ex.id)["instances"][0]["points"][0]["reps"] == 9

    def test_progress_skips_blank_sets(
        self, client, create_exercise, create_instance, record_session
    ):
        """A weight-0 row is an artifact of the set editor, not a lift."""
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        record_session(ex, m, [(0, 0), (140, 10), (0, 0)], datetime(2026, 3, 3))

        assert self._series(client, ex.id)["instances"][0]["points"][0]["weight"] == 140

    def test_progress_entry_of_only_blank_sets_yields_no_point(
        self, client, create_exercise, create_instance, record_session
    ):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        record_session(ex, m, [(0, 0), (0, 0)], datetime(2026, 3, 3))

        assert self._series(client, ex.id)["instances"] == []

    def test_progress_excludes_in_progress_sessions(
        self, client, create_exercise, create_instance, record_session
    ):
        """An open session is pre-filled from lastSession — it hasn't happened yet."""
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        record_session(ex, m, [(185, 8)], status="in_progress")

        assert self._series(client, ex.id)["instances"] == []

    def test_progress_points_ascend_by_date(
        self, client, create_exercise, create_instance, record_session
    ):
        ex = create_exercise("Chest Press")
        m = create_instance(ex.id, "Cybex")
        record_session(ex, m, [(195, 6)], datetime(2026, 3, 3))
        record_session(ex, m, [(175, 8)], datetime(2026, 1, 8))
        record_session(ex, m, [(185, 7)], datetime(2026, 2, 17))

        points = self._series(client, ex.id)["instances"][0]["points"]
        assert [p["date"] for p in points] == [
            "2026-01-08", "2026-02-17", "2026-03-03",
        ]
        assert [p["weight"] for p in points] == [175, 185, 195]

    def test_progress_separates_instances(
        self, client, create_exercise, create_instance, record_session
    ):
        ex = create_exercise("Chest Press")
        cybex = create_instance(ex.id, "Cybex")
        hammer = create_instance(ex.id, "Hammer")
        record_session(ex, cybex, [(195, 6)], datetime(2026, 3, 3))
        record_session(ex, hammer, [(90, 10)], datetime(2026, 3, 4))

        by_name = {m["name"]: m for m in self._series(client, ex.id)["instances"]}
        assert by_name["Cybex"]["points"][0]["weight"] == 195
        assert by_name["Hammer"]["points"][0]["weight"] == 90

    def test_progress_most_logged_instance_first(
        self, client, create_exercise, create_instance, record_session
    ):
        """The client picks instances[0] and is right by default."""
        ex = create_exercise("Chest Press")
        cybex = create_instance(ex.id, "Cybex")
        hammer = create_instance(ex.id, "Hammer")
        record_session(ex, hammer, [(90, 10)], datetime(2026, 3, 4))
        record_session(ex, cybex, [(195, 6)], datetime(2026, 3, 3))
        record_session(ex, cybex, [(200, 5)], datetime(2026, 3, 10))

        names = [m["name"] for m in self._series(client, ex.id)["instances"]]
        assert names == ["Cybex", "Hammer"]

    def test_progress_ignores_other_exercises(
        self, client, create_exercise, create_instance, record_session
    ):
        ex = create_exercise("Chest Press")
        other = create_exercise("Squat")
        m = create_instance(ex.id, "Cybex")
        other_m = create_instance(other.id, "Rack")
        record_session(ex, m, [(195, 6)], datetime(2026, 3, 3))
        record_session(other, other_m, [(315, 5)], datetime(2026, 3, 3))

        instances = self._series(client, ex.id)["instances"]
        assert len(instances) == 1
        assert instances[0]["name"] == "Cybex"

    def test_progress_ignores_entries_with_no_instance(
        self, client, create_exercise, record_session
    ):
        """A session can be completed before an instance was ever picked."""
        ex = create_exercise("Chest Press")
        record_session(ex, None, [(185, 8)], datetime(2026, 3, 3))

        assert self._series(client, ex.id)["instances"] == []


class TestSoleInstanceAutoLoad:
    """One instance is not a choice — starting a session should make it for you."""

    def _entry(self, session, exercise_name):
        return next(
            e for e in session["entries"] if e["exercise"]["name"] == exercise_name
        )

    def test_sole_instance_is_assigned_on_start(
        self, client, create_routine, create_exercise, create_instance
    ):
        ex = create_exercise("Chest Press")
        inst = create_instance(ex.id, "Cybex")
        routine = create_routine("Push Day", ["Chest Press"])

        session = client.post("/api/sessions", json={"routine_id": routine.id}).get_json()
        entry = self._entry(session, "Chest Press")
        assert entry["instance"]["id"] == inst.id
        assert entry["instance"]["name"] == "Cybex"

    def test_sole_instance_prefills_last_session(
        self, client, db, create_routine, create_exercise, create_instance
    ):
        ex = create_exercise("Chest Press")
        inst = create_instance(ex.id, "Cybex")
        inst.last_session_data = [{"weight": 185, "reps": 8}, {"weight": 195, "reps": 6}]
        db.session.commit()
        routine = create_routine("Push Day", ["Chest Press"])

        session = client.post("/api/sessions", json={"routine_id": routine.id}).get_json()
        sets = self._entry(session, "Chest Press")["sets"]
        assert [(s["weight"], s["reps"]) for s in sets] == [(185, 8), (195, 6)]

    def test_sole_instance_with_no_history_gets_one_blank_set(
        self, client, create_routine, create_exercise, create_instance
    ):
        """There should always be a row to type into."""
        ex = create_exercise("Chest Press")
        create_instance(ex.id, "Cybex")
        routine = create_routine("Push Day", ["Chest Press"])

        session = client.post("/api/sessions", json={"routine_id": routine.id}).get_json()
        sets = self._entry(session, "Chest Press")["sets"]
        assert len(sets) == 1
        assert (sets[0]["weight"], sets[0]["reps"]) == (0, 0)

    def test_two_instances_are_left_to_the_lifter(
        self, client, create_routine, create_exercise, create_instance
    ):
        """With a real choice, guessing would be worse than asking."""
        ex = create_exercise("Chest Press")
        create_instance(ex.id, "Cybex")
        create_instance(ex.id, "Hammer")
        routine = create_routine("Push Day", ["Chest Press"])

        session = client.post("/api/sessions", json={"routine_id": routine.id}).get_json()
        entry = self._entry(session, "Chest Press")
        assert entry["instance"] is None
        assert entry["sets"] == []

    def test_no_instances_leaves_the_entry_empty(
        self, client, create_routine, create_exercise
    ):
        create_exercise("Chest Press")
        routine = create_routine("Push Day", ["Chest Press"])

        session = client.post("/api/sessions", json={"routine_id": routine.id}).get_json()
        entry = self._entry(session, "Chest Press")
        assert entry["instance"] is None
        assert entry["sets"] == []

    def test_each_exercise_is_decided_independently(
        self, client, db, create_routine, create_exercise, create_instance
    ):
        solo = create_exercise("Chest Press")
        solo_inst = create_instance(solo.id, "Cybex")
        solo_inst.last_session_data = [{"weight": 185, "reps": 8}]
        choice = create_exercise("Row")
        create_instance(choice.id, "Cable")
        create_instance(choice.id, "T-Bar")
        db.session.commit()
        routine = create_routine("Push Day", ["Chest Press", "Row"])

        session = client.post("/api/sessions", json={"routine_id": routine.id}).get_json()
        assert self._entry(session, "Chest Press")["instance"]["name"] == "Cybex"
        assert len(self._entry(session, "Chest Press")["sets"]) == 1
        assert self._entry(session, "Row")["instance"] is None
        assert self._entry(session, "Row")["sets"] == []

    def test_switching_away_from_the_auto_pick_still_works(
        self, client, db, create_routine, create_exercise, create_instance
    ):
        """Auto-assignment is a default, not a lock."""
        ex = create_exercise("Chest Press")
        auto = create_instance(ex.id, "Cybex")
        auto.last_session_data = [{"weight": 185, "reps": 8}]
        db.session.commit()
        routine = create_routine("Push Day", ["Chest Press"])

        session = client.post("/api/sessions", json={"routine_id": routine.id}).get_json()
        entry = self._entry(session, "Chest Press")
        assert entry["instance"]["id"] == auto.id

        # A second instance added mid-session, then selected.
        added = client.post(
            f"/api/exercises/{ex.id}/instances", json={"name": "Hammer"}
        ).get_json()
        resp = client.post(
            f"/api/session-entries/{entry['id']}/prefill",
            json={"instance_id": added["id"]},
        )
        assert resp.status_code == 200
        assert resp.get_json()["instance"]["name"] == "Hammer"
