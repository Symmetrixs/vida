import pytest

import complaint
from auth import get_current_user
from fakes import FakeSupabase
from main import app

INSPECTOR = {"id": "owner", "roles": ["inspector"], "name": "Owner"}
ADMIN = {"id": "admin1", "roles": ["admin"], "name": "Admin"}
FM = {"id": "fm1", "roles": ["facility_manager"], "name": "Farah Manager"}

COMPLAINT = {
    "id": "c1", "ref_no": 21, "floor": "Floor 1", "location_note": "Corridor", "description": "Crack on wall",
    "status": "submitted", "reject_reason": None, "inspection_id": "insp1", "reviewed_at": "2026-10-20T01:00:00+00:00",
    "due_date": "2026-10-25", "started_at": "2026-10-20T02:00:00+00:00", "submitted_at": "2026-10-21T02:00:00+00:00",
    "severity": None, "severity_note": None, "assessed_at": None, "created_at": "2026-10-19T01:00:00+00:00",
    "buildings": {"name": "FTMK", "code": "FTMK-MAIN"}, "reviewer": {"name": "Admin"}, "assessor": None,
    "inspections": {"id": "insp1", "title": "Complaint VIDA-C-0021", "status": "submitted", "inspector_id": "owner", "users": {"name": "Owner"}},
}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _review_db(status="submitted"):
    return FakeSupabase(responses={
        ("complaints", "select"): [dict(COMPLAINT, status=status)],
        ("complaint_photos", "select"): [],
        ("inspections", "select"): [{"id": "insp1", "title": "Complaint VIDA-C-0021", "status": "submitted", "inspection_date": "2026-10-20",
                                      "weather_condition": "sunny", "floor_level": "Floor 1", "area_inspected": "Corridor",
                                      "description": "Crack", "remarks": None, "submitted_at": "2026-10-21T02:00:00+00:00", "users": {"name": "Owner"}}],
        ("photos", "select"): [{"id": "p1", "url": "https://storage.test/p1.jpg", "description": None, "created_at": "2026-10-20T02:00:00+00:00"}],
        ("findings", "select"): [
            {"id": "f1", "photo_id": "p1", "defect_type": "crack", "severity": "medium", "confidence": 0.81, "location_description": None, "notes": None},
            {"id": "f2", "photo_id": "p1", "defect_type": "spalling", "severity": "high", "confidence": 0.66, "location_description": None, "notes": None},
        ],
    })


def test_review_page_is_for_managers_and_read_only_for_admins(client, login, monkeypatch):
    monkeypatch.setattr(complaint, "get_supabase", lambda: _review_db())

    login(FM)
    body = client.get("/complaints/c1/review").json()
    assert body["complaint"]["reference"] == "VIDA-C-0021"
    assert body["inspection"]["inspector_name"] == "Owner" and body["inspection"]["weather_condition"] == "sunny"
    assert len(body["photos"]) == 1 and len(body["findings"]) == 2
    assert body["highest_finding_severity"] == "high"
    assert body["can_review"] is True
    assert not any(k.startswith("reporter") for k in body["complaint"])

    login(ADMIN)
    body = client.get("/complaints/c1/review").json()
    assert body["can_review"] is False

    login(INSPECTOR)
    assert client.get("/complaints/c1/review").status_code == 403


def test_reviewed_page_is_read_only_for_everyone(client, login, monkeypatch):
    monkeypatch.setattr(complaint, "get_supabase", lambda: _review_db("reviewed"))
    login(FM)
    assert client.get("/complaints/c1/review").json()["can_review"] is False


def test_only_facility_managers_can_set_severity(client, login, monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    for user, expected in ((ADMIN, 403), (INSPECTOR, 403)):
        login(user)
        assert client.post("/complaints/c1/review", json={"severity": "high"}).status_code == expected
    assert db.updated == []


@pytest.mark.parametrize("payload", [
    {"severity": "urgent"},
    {"severity": ""},
    {},
    {"severity": "high", "note": "x" * 1001},
])
def test_review_validates_input(client, login, monkeypatch, payload):
    monkeypatch.setattr(complaint, "get_supabase", lambda: FakeSupabase())
    login(FM)
    assert client.post("/complaints/c1/review", json=payload).status_code == 422


def test_review_only_while_submitted(client, login, monkeypatch):
    db = FakeSupabase(responses={("complaints", "select"): [{"id": "c1", "ref_no": 21, "status": "reviewed", "inspection_id": "insp1"}]})
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    login(FM)
    assert client.post("/complaints/c1/review", json={"severity": "low"}).status_code == 409
    assert db.updated == []

    missing = FakeSupabase(responses={("complaints", "select"): []})
    monkeypatch.setattr(complaint, "get_supabase", lambda: missing)
    assert client.post("/complaints/c1/review", json={"severity": "low"}).status_code == 404


def _reviewed_db(severity, note):
    return FakeSupabase(responses={
        ("complaints", "select"): [{"id": "c1", "ref_no": 21, "status": "submitted", "inspection_id": "insp1"}],
        ("inspections", "update"): [{"id": "insp1", "ref_no": 3}],
        ("complaints", "update"): [{"id": "c1", "ref_no": 21, "status": "reviewed"}],
        ("user_roles", "select"): [{"user_id": "admin1"}, {"user_id": "admin2"}],
        ("users", "select"): [{"id": "admin1"}, {"id": "admin2"}],
    })


def test_review_writes_severity_to_the_inspection_and_complaint_and_notifies_admins(client, login, monkeypatch):
    db = _reviewed_db("high", "Close the corridor until repaired.")
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    login(FM)
    response = client.post("/complaints/c1/review", json={"severity": "high", "note": "  Close the corridor until repaired.  "})
    assert response.status_code == 200
    assert response.json() == {"reference": "VIDA-C-0021", "status": "reviewed", "severity": "high"}

    table, payload, filters = db.updated[0]
    assert table == "inspections" and filters == {"id": "insp1", "status": "submitted"}
    assert payload["severity"] == "high" and payload["severity_note"] == "Close the corridor until repaired."
    assert payload["assessed_by"] == "fm1" and payload["assessed_at"]

    table, payload, filters = db.updated[1]
    assert table == "complaints" and filters == {"inspection_id": "insp1"}
    assert payload["status"] == "reviewed" and payload["severity"] == "high"

    notes = db.inserted["notifications"]
    assert {n["user_id"] for n in notes} == {"admin1", "admin2"}
    note = notes[0]
    assert note["title"] == "Inspection reviewed" and note["type"] == "warning"
    assert note["link"] == "/inspections/insp1/review"
    assert "Farah Manager" in note["message"] and "VIDA-I-0003" in note["message"] and "VIDA-C-0021" in note["message"]
    assert "severity HIGH" in note["message"] and "Close the corridor until repaired." in note["message"]


def test_review_note_is_optional_and_low_severity_is_info(client, login, monkeypatch):
    db = _reviewed_db("low", None)
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    login(FM)
    assert client.post("/complaints/c1/review", json={"severity": "low", "note": "   "}).status_code == 200
    assert db.updated[0][1]["severity_note"] is None
    note = db.inserted["notifications"][0]
    assert note["type"] == "info" and "Note:" not in note["message"]
