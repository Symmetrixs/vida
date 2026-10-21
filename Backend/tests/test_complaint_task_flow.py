import pytest

import complaint
import inspection
from auth import get_current_user
from fakes import FakeSupabase
from main import app

OWNER = {"id": "owner", "role": "inspector", "name": "Owner Inspector"}
OTHER = {"id": "other", "role": "inspector", "name": "Other"}
ADMIN = {"id": "admin1", "role": "admin", "name": "Admin"}
FM = {"id": "fm1", "role": "facility_manager", "name": "Manager"}

COMPLAINT_ROW = {
    "id": "c1", "ref_no": 12, "floor": "Level 2", "location_note": "Lab corridor",
    "description": "Water leaking from ceiling", "status": "in_progress", "due_date": "2026-10-30",
    "created_at": "2026-10-20T02:00:00+00:00", "buildings": {"name": "FTMK", "code": "FTMK-MAIN"},
    "reporter_name": "Ali", "reporter_email": "ali@example.com", "reporter_phone": "0123456789",
}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def test_snapshot_has_complaint_and_signed_photos_but_no_contact():
    db = FakeSupabase(responses={
        ("complaints", "select"): [COMPLAINT_ROW],
        ("complaint_photos", "select"): [{"id": "p1", "storage_path": "c1/a.jpg", "content_type": "image/jpeg", "width": 10, "height": 10}],
    })
    snap = complaint.complaint_snapshot(db, "insp1")
    assert snap["reference"] == "VIDA-C-0012"
    assert snap["building"] == {"name": "FTMK", "code": "FTMK-MAIN"}
    assert (snap["floor"], snap["location_note"], snap["description"]) == ("Level 2", "Lab corridor", "Water leaking from ceiling")
    assert snap["photos"][0]["url"].startswith("https://signed.test/vida-complaints/c1/a.jpg")
    assert "storage_path" not in snap["photos"][0]
    assert not any(key.startswith("reporter") for key in snap)
    assert "ali@example.com" not in str(snap) and "0123456789" not in str(snap)

    assert complaint.complaint_snapshot(FakeSupabase(responses={("complaints", "select"): []}), "insp1") is None


def test_complaint_box_endpoint_permissions(client, login, monkeypatch):
    monkeypatch.setattr(inspection, "get_supabase", lambda: FakeSupabase(responses={("inspections", "select"): [{"inspector_id": "owner"}]}))
    monkeypatch.setattr(inspection, "complaint_snapshot", lambda supabase, inspection_id: {"reference": "VIDA-C-0012"})
    for user, expected in ((OWNER, 200), (ADMIN, 200), (FM, 200), (OTHER, 403)):
        login(user)
        assert client.get("/inspections/insp1/complaint").status_code == expected

    login(OWNER)
    monkeypatch.setattr(inspection, "complaint_snapshot", lambda supabase, inspection_id: None)
    response = client.get("/inspections/insp1/complaint")
    assert response.status_code == 200 and response.json() is None

    monkeypatch.setattr(inspection, "get_supabase", lambda: FakeSupabase(responses={("inspections", "select"): []}))
    assert client.get("/inspections/missing/complaint").status_code == 404


def test_submit_notifies_approved_admins_and_facility_managers(monkeypatch):
    users = [
        {"id": "admin1", "role": "admin", "is_approved": True},
        {"id": "fm1", "role": "facility_manager", "is_approved": True},
        {"id": "fm-pending", "role": "facility_manager", "is_approved": None},
        {"id": "admin-rejected", "role": "admin", "is_approved": False},
    ]
    db = FakeSupabase(responses={
        ("complaints", "select"): [{"id": "c1", "ref_no": 12, "status": "in_progress"}],
        ("users", "select"): users,
    })
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    assert complaint.notify_complaint_submitted("insp1", OWNER) == 2
    notes = {n["user_id"]: n for n in db.inserted["notifications"]}
    assert set(notes) == {"admin1", "fm1"}
    assert notes["admin1"]["link"] == "/admin/complaints?open=c1"
    assert notes["fm1"]["link"] == "/inspector/inspections/insp1/edit"
    assert "Owner Inspector" in notes["fm1"]["message"] and "VIDA-C-0012" in notes["fm1"]["message"]
    assert "stays in progress" in notes["fm1"]["message"]

    resolved_db = FakeSupabase(responses={
        ("complaints", "select"): [{"id": "c1", "ref_no": 12, "status": "resolved"}],
        ("users", "select"): users[:1],
    })
    monkeypatch.setattr(complaint, "get_supabase", lambda: resolved_db)
    complaint.notify_complaint_submitted("insp1", OWNER)
    assert "now resolved" in resolved_db.inserted["notifications"][0]["message"]


def test_submit_notification_skips_normal_inspections_and_never_raises(monkeypatch):
    db = FakeSupabase(responses={("complaints", "select"): []})
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    assert complaint.notify_complaint_submitted("insp1", OWNER) == 0
    assert "notifications" not in db.inserted

    def broken():
        raise RuntimeError("database down")

    monkeypatch.setattr(complaint, "get_supabase", broken)
    assert complaint.notify_complaint_submitted("insp1", OWNER) == 0


@pytest.mark.parametrize("previous_status, expected_calls", [("draft", 1), ("submitted", 0)])
def test_submit_notifies_only_on_first_submit(client, login, monkeypatch, previous_status, expected_calls):
    calls = []
    monkeypatch.setattr(inspection, "sync_complaint", lambda *a, **k: None)
    monkeypatch.setattr(inspection, "notify_complaint_submitted", lambda inspection_id, actor: calls.append(inspection_id))
    monkeypatch.setattr(inspection, "get_supabase", lambda: FakeSupabase(responses={
        ("inspections", "select"): [{"inspector_id": "owner", "status": previous_status}],
        ("inspections", "update"): [{"id": "insp1", "status": "submitted"}],
    }))
    login(OWNER)
    assert client.post("/inspections/insp1/submit").status_code == 200
    assert len(calls) == expected_calls


def test_submit_succeeds_when_notification_store_is_down(client, login, monkeypatch):
    def broken():
        raise RuntimeError("database down")

    monkeypatch.setattr(complaint, "get_supabase", broken)
    monkeypatch.setattr(inspection, "get_supabase", lambda: FakeSupabase(responses={
        ("inspections", "select"): [{"inspector_id": "owner", "status": "draft"}],
        ("inspections", "update"): [{"id": "insp1", "status": "submitted"}],
    }))
    login(OWNER)
    assert client.post("/inspections/insp1/submit").status_code == 200
