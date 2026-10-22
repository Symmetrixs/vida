import io

import pytest
from PIL import Image
from postgrest.exceptions import APIError

import complaint
import inspection
import report
from auth import get_current_user
from fakes import FakeSupabase
from main import app

INSPECTOR = {"id": "insp-a", "roles": ["inspector"], "name": "Aina"}
ADMIN = {"id": "admin1", "roles": ["admin"], "name": "Admin"}
FM = {"id": "fm1", "roles": ["facility_manager"], "name": "Farah"}
MAINT = {"id": "m1", "roles": ["maintenance"], "name": "Mazlan"}

QUEUE = [
    {"id": "i1", "ref_no": 1, "title": "Block A", "severity": None, "users": {"name": "Aina"}, "assessor": None,
     "complaints": [{"ref_no": 3}], "findings": [{"severity": "low"}, {"severity": "high"}], "photos": [{"id": "p1"}], "repair_jobs": []},
    {"id": "i2", "ref_no": 2, "title": "Block B", "severity": "medium", "users": {"name": "Aina"}, "assessor": {"name": "Farah"},
     "complaints": [], "findings": [], "photos": [], "repair_jobs": {"id": "j1", "ref_no": 4, "status": "open"}},
]


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def test_review_queue_lists_every_submitted_inspection_for_facility_managers(client, login, monkeypatch):
    db = FakeSupabase(responses={("inspections", "select"): [dict(r) for r in QUEUE]})
    monkeypatch.setattr(inspection, "get_supabase", lambda: db)
    for user in (ADMIN, INSPECTOR, MAINT):
        login(user)
        assert client.get("/inspections/review-queue").status_code == 403

    login(FM)
    body = client.get("/inspections/review-queue").json()
    assert db.queries[-1].filters == {"status": "submitted"}
    first, second = body
    assert first["reference"] == "VIDA-I-0001" and first["complaint_reference"] == "VIDA-C-0003"
    assert first["reviewed"] is False and first["finding_count"] == 2 and first["highest_finding_severity"] == "high"
    assert first["photo_count"] == 1 and first["inspector_name"] == "Aina" and first["repair_job"] is None
    assert second["reviewed"] is True and second["complaint_reference"] is None and second["assessor"] == "Farah"
    assert second["repair_job"] == {"id": "j1", "reference": "VIDA-R-0004", "status": "open"}


def _review_db(severity=None, status="submitted"):
    return FakeSupabase(responses={
        ("inspections", "select"): [{"id": "i1", "ref_no": 4, "title": "Block A", "status": status, "severity": severity,
                                     "users": {"name": "Aina"}, "assessor": None, "complaints": [], "repair_jobs": []}],
        ("photos", "select"): [{"id": "p1", "url": "https://storage.test/p1.jpg"}],
        ("findings", "select"): [{"id": "f1", "photo_id": "p1", "defect_type": "crack", "severity": "critical"}],
        ("complaints", "select"): [],
    })


def test_review_page_for_any_inspection(client, login, monkeypatch):
    monkeypatch.setattr(inspection, "get_supabase", lambda: _review_db())
    login(FM)
    body = client.get("/inspections/i1/review").json()
    assert body["inspection"]["reference"] == "VIDA-I-0004" and body["inspection"]["inspector_name"] == "Aina"
    assert body["complaint"] is None and body["highest_finding_severity"] == "critical"
    assert body["can_review"] is True

    login(ADMIN)
    assert client.get("/inspections/i1/review").json()["can_review"] is False
    for user in (INSPECTOR, MAINT):
        login(user)
        assert client.get("/inspections/i1/review").status_code == 403

    monkeypatch.setattr(inspection, "get_supabase", lambda: _review_db(severity="low"))
    login(FM)
    assert client.get("/inspections/i1/review").json()["can_review"] is False


def test_review_of_a_normal_inspection_notifies_admins(client, login, monkeypatch):
    db = FakeSupabase(responses={
        ("inspections", "update"): [{"id": "i1", "ref_no": 4}],
        ("complaints", "update"): [],
        ("user_roles", "select"): [{"user_id": "admin1"}],
        ("users", "select"): [{"id": "admin1"}],
    })
    monkeypatch.setattr(inspection, "get_supabase", lambda: db)
    for user in (ADMIN, INSPECTOR):
        login(user)
        assert client.post("/inspections/i1/review", json={"severity": "critical"}).status_code == 403

    login(FM)
    response = client.post("/inspections/i1/review", json={"severity": "critical", "note": "Close the stairs"})
    assert response.status_code == 200
    assert response.json() == {"reference": "VIDA-I-0004", "complaint_reference": None, "status": "reviewed", "severity": "critical"}
    assert db.updated[0][0] == "inspections" and db.updated[0][2] == {"id": "i1", "status": "submitted"}
    note = db.inserted["notifications"][0]
    assert note["user_id"] == "admin1" and note["type"] == "warning" and note["link"] == "/inspections/i1/review"
    assert "VIDA-I-0004" in note["message"] and "complaint" not in note["message"] and "Close the stairs" in note["message"]


@pytest.mark.parametrize("current, expected", [
    ([{"id": "i1", "status": "submitted", "severity": "low"}], 409),
    ([{"id": "i1", "status": "draft", "severity": None}], 409),
    ([], 404),
])
def test_review_refuses_reviewed_unsubmitted_or_missing(client, login, monkeypatch, current, expected):
    db = FakeSupabase(responses={("inspections", "update"): [], ("inspections", "select"): current})
    monkeypatch.setattr(inspection, "get_supabase", lambda: db)
    login(FM)
    assert client.post("/inspections/i1/review", json={"severity": "low"}).status_code == expected
    assert "notifications" not in db.inserted


def test_inspection_with_a_repair_job_cannot_be_deleted(client, login, monkeypatch):
    db = FakeSupabase(responses={
        ("inspections", "select"): [{"id": "i1", "inspector_id": "insp-a", "status": "submitted"}],
        ("repair_jobs", "select"): [{"id": "j1"}],
    })
    monkeypatch.setattr(inspection, "get_supabase", lambda: db)
    login(INSPECTOR)
    assert client.delete("/inspections/i1").status_code == 409
    assert not any(q.op == "delete" for q in db.queries)


def test_report_with_a_malformed_id_is_not_found(client, login, monkeypatch):
    def bad_uuid(query):
        raise APIError({"code": "22P02", "message": "invalid input syntax for type uuid"})

    monkeypatch.setattr(report, "get_supabase", lambda: FakeSupabase(responses={("reports", "select"): bad_uuid}))
    login(INSPECTOR)
    assert client.get("/reports/not-a-uuid").status_code == 404
    assert client.get("/reports/not-a-uuid/export").status_code == 404

    monkeypatch.setattr(report, "get_supabase", lambda: FakeSupabase(responses={("reports", "select"): []}))
    assert client.get("/reports/00000000-0000-0000-0000-000000000000").status_code == 404


@pytest.mark.parametrize("user", [MAINT, FM])
def test_detection_is_open_to_maintenance_and_facility_managers(client, login, user):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, format="JPEG")
    login(user)
    assert client.post("/ai/detect", files={"file": ("a.jpg", buffer.getvalue(), "image/jpeg")}).status_code != 403


def test_complaint_photo_scan_runs_once_and_only_for_facility_managers(client, login, monkeypatch):
    db = FakeSupabase(responses={("complaint_photos", "select"): [
        {"id": "cp1", "storage_path": "c1/a.jpg", "detections": None, "scanned_at": None},
        {"id": "cp2", "storage_path": "c1/b.jpg", "detections": [{"label": "mold"}], "scanned_at": "2026-10-22T01:00:00+00:00"},
    ]})
    calls = []
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    monkeypatch.setattr(complaint, "scan_image_bytes", lambda data: calls.append(data) or [{"label": "crack"}, {"label": "crack"}])
    for user in (ADMIN, INSPECTOR, MAINT):
        login(user)
        assert client.post("/complaints/c1/scan").status_code == 403

    login(FM)
    body = client.post("/complaints/c1/scan").json()
    assert len(calls) == 1
    assert body == [
        {"id": "cp1", "scanned": True, "total": 2, "counts": {"crack": 2}},
        {"id": "cp2", "scanned": True, "total": 1, "counts": {"mold": 1}},
    ]
    table, payload, filters = db.updated[0]
    assert table == "complaint_photos" and filters == {"id": "cp1"} and payload["scanned_at"]


def test_complaint_photo_scan_failure_is_not_fatal(client, login, monkeypatch):
    db = FakeSupabase(responses={("complaint_photos", "select"): [{"id": "cp1", "storage_path": "c1/a.jpg", "detections": None, "scanned_at": None}]})
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)

    def broken(data):
        raise RuntimeError("Model not found")

    monkeypatch.setattr(complaint, "scan_image_bytes", broken)
    login(FM)
    assert client.post("/complaints/c1/scan").json() == [{"id": "cp1", "scanned": False, "total": 0, "counts": {}}]
    assert db.updated == []
