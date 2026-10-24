from datetime import date, timedelta

import pytest

import inspection
import vessel
from auth import get_current_user
from fakes import FakeSupabase
from main import app

ADMIN = {"id": "admin1", "roles": ["admin"], "name": "Admin"}
FM = {"id": "fm1", "roles": ["facility_manager"], "name": "Farah"}
INSPECTOR = {"id": "insp-a", "roles": ["inspector"], "name": "Aina"}
MAINT = {"id": "m1", "roles": ["maintenance"], "name": "Mazlan"}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _rooms_db(monkeypatch, rooms=None):
    db = FakeSupabase(responses={
        ("buildings", "select"): [{"id": "b1", "floors": 3}],
        ("building_rooms", "select"): rooms or [],
    })
    monkeypatch.setattr(vessel, "get_supabase", lambda: db)
    return db


def test_floor_labels_match_the_frontend():
    assert vessel.floor_labels(3) == ["Ground Floor", "Floor 1", "Floor 2", "Rooftop"]
    assert vessel.floor_labels(None) == ["Ground Floor", "Rooftop"]


def test_admin_adds_rooms_to_real_floors_only(client, login, monkeypatch):
    db = _rooms_db(monkeypatch)
    login(ADMIN)
    response = client.post("/buildings/b1/rooms", json={"floor": "Floor 2", "name": "  BK   15 "})
    assert response.status_code == 201
    row = db.inserted["building_rooms"][0]
    assert (row["building_id"], row["floor"], row["name"], row["sort_order"]) == ("b1", "Floor 2", "BK 15", 0)
    assert client.post("/buildings/b1/rooms", json={"floor": "Floor 7", "name": "BK 16"}).status_code == 400


def test_room_names_are_unique_per_floor(client, login, monkeypatch):
    _rooms_db(monkeypatch, rooms=[{"id": "r1", "name": "bk15"}])
    login(ADMIN)
    assert client.post("/buildings/b1/rooms", json={"floor": "Floor 2", "name": "BK15"}).status_code == 400


@pytest.mark.parametrize("user", [FM, INSPECTOR, MAINT])
def test_only_admins_change_rooms(client, login, monkeypatch, user):
    db = _rooms_db(monkeypatch, rooms=[{"id": "r1", "building_id": "b1", "floor": "Floor 1", "name": "BK1"}])
    login(user)
    assert client.post("/buildings/b1/rooms", json={"floor": "Floor 1", "name": "BK1"}).status_code == 403
    assert client.put("/buildings/rooms/r1", json={"name": "BK2"}).status_code == 403
    assert client.delete("/buildings/rooms/r1").status_code == 403
    assert client.get("/buildings/b1/rooms", params={"floor": "Floor 1"}).status_code == 200
    assert "building_rooms" not in db.inserted and db.updated == []


def test_inspector_workload_counts():
    today = date.today()
    late = (today - timedelta(days=3)).isoformat()
    soon = (today + timedelta(days=3)).isoformat()
    rows = [
        {"inspector_id": "a", "status": "draft", "severity": None, "complaints": [{"status": "assigned", "due_date": late}]},
        {"inspector_id": "a", "status": "draft", "severity": None, "complaints": [{"status": "in_progress", "due_date": soon}]},
        {"inspector_id": "a", "status": "draft", "severity": None, "complaints": []},
        {"inspector_id": "a", "status": "submitted", "severity": None, "complaints": [{"status": "submitted", "due_date": late}]},
        {"inspector_id": "a", "status": "submitted", "severity": "high", "complaints": None},
        {"inspector_id": "b", "status": "draft", "severity": None, "complaints": []},
    ]
    result = inspection.inspector_workload({"id": "a", "name": "Aina"}, rows)
    assert {k: result[k] for k in ("assigned", "in_progress", "awaiting_severity", "overdue", "done", "active")} == {
        "assigned": 1, "in_progress": 2, "awaiting_severity": 1, "overdue": 1, "done": 1, "active": 3,
    }


def test_inspector_staff_is_for_managers(client, login, monkeypatch):
    monkeypatch.setattr(inspection, "users_with_roles", lambda *a, **k: [{"id": "a", "name": "Aina", "email": "a@x"}])
    db = FakeSupabase(responses={("inspections", "select"): []})
    monkeypatch.setattr(inspection, "get_supabase", lambda: db)
    for user in (FM, ADMIN):
        login(user)
        body = client.get("/inspections/staff").json()
        assert body[0]["name"] == "Aina" and body[0]["active"] == 0
    for user in (INSPECTOR, MAINT):
        login(user)
        assert client.get("/inspections/staff").status_code == 403
