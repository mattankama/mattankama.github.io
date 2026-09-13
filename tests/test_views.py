"""Tests for view routes — page rendering."""


class TestViewRoutes:
    """Page routes return correct templates."""

    def test_home_page(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert b"Rattlesnake" in resp.data

    def test_home_page_has_create_button(self, client):
        resp = client.get("/")
        assert b"create-routine-btn" in resp.data

    def test_new_routine_page(self, client):
        resp = client.get("/routine/new")
        assert resp.status_code == 200
        assert b"New Routine" in resp.data

    def test_new_routine_has_form(self, client):
        resp = client.get("/routine/new")
        assert b"routine-form" in resp.data
        assert b"routine-name" in resp.data

    def test_edit_routine_page(self, client):
        # Create a routine first
        r = client.post("/api/routines", json={"name": "Push Day", "exercises": []}).get_json()
        resp = client.get(f"/routine/{r['id']}/edit")
        assert resp.status_code == 200
        assert b"Edit Routine" in resp.data

    def test_edit_routine_has_routine_id(self, client):
        r = client.post("/api/routines", json={"name": "Push Day", "exercises": []}).get_json()
        resp = client.get(f"/routine/{r['id']}/edit")
        assert f"ROUTINE_ID = {r['id']}".encode() in resp.data

    def test_session_page(self, client):
        r = client.post("/api/routines", json={"name": "Push Day", "exercises": []}).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        resp = client.get(f"/session/{s['id']}")
        assert resp.status_code == 200
        assert b"timer-display" in resp.data
        assert b"complete-session-btn" in resp.data

    def test_session_page_has_session_id(self, client):
        r = client.post("/api/routines", json={"name": "Push Day", "exercises": []}).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        resp = client.get(f"/session/{s['id']}")
        assert f"SESSION_ID = {s['id']}".encode() in resp.data

    def test_session_page_has_timer(self, client):
        r = client.post("/api/routines", json={"name": "Push Day", "exercises": []}).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        resp = client.get(f"/session/{s['id']}")
        assert b"timer-bar" in resp.data
        assert b"00:00" in resp.data

    def test_css_loads(self, client):
        resp = client.get("/")
        assert b"style.css" in resp.data

    def test_js_loads_on_home(self, client):
        resp = client.get("/")
        assert b"app.js" in resp.data
        assert b"home.js" in resp.data

    def test_js_loads_on_routine(self, client):
        resp = client.get("/routine/new")
        assert b"routine.js" in resp.data

    def test_js_loads_on_session(self, client):
        r = client.post("/api/routines", json={"name": "Push Day", "exercises": []}).get_json()
        s = client.post("/api/sessions", json={"routine_id": r["id"]}).get_json()
        resp = client.get(f"/session/{s['id']}")
        assert b"session.js" in resp.data
