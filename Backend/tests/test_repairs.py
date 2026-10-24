import io
from datetime import date, timedelta

import pytest
from PIL import Image

import repair
from auth import get_current_user
from fakes import FakeSupabase
from main import app
from public import format_repair_reference

INSPECTOR = {"id": "insp-a", "roles": ["inspector"], "name": "Aina"}
ADMIN = {"id": "admin1", "roles": ["admin"], "name": "Admin"}
FM = {"id": "fm1", "roles": ["facility_manager"], "name": "Farah"}
MAINT = {"id": "m1", "roles": ["maintenance"], "name": "Mazlan"}
MAINT2 = {"id": "m2", "roles": ["maintenance"], "name": "Nadia"}
FM_WORKER = {"id": "m1", "roles": ["maintenance", "facility_manager"], "name": "Mazlan"}

JOB = {
    "id": "j1", "ref_no": 7, "inspection_id": "insp1", "status": "open", "assigned_to": None, "assignment_type": None,
    "due_date": None, "rework_count": 0, "round": 1, "before_counts": {"crack": 2}, "repair_notes": None,
}


def embed():
    return {"inspections": {"id": "insp1", "ref_no": 5, "title": "Block A", "severity": "high", "complaints": [{"ref_no": 9}]}, "worker": None}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _db(monkeypatch, job=None, **extra):
    responses = {
        ("repair_jobs", "update"): lambda q: [dict(job or JOB, **q.payload)],
        ("user_roles", "select"): [{"user_id": "m1"}, {"user_id": "m2"}, {"user_id": "fm1"}],
        ("users", "select"): [{"id": "m2", "name": "Nadia"}],
        ("inspections", "select"): [{"ref_no": 5}],
    }
    if job is not None:
        responses[("repair_jobs", "select")] = [dict(job)]
    responses.update({tuple(k.split(":")): v for k, v in extra.items()})
    db = FakeSupabase(responses=responses)
    monkeypatch.setattr(repair, "get_supabase", lambda: db)
    return db


def _events(db):
    return [e for e in db.inserted.get("repair_job_events", [])]


def _image():
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, format="JPEG")
    return buffer.getvalue()


def test_repair_reference_format():
    assert format_repair_reference(1) == "VIDA-R-0001"
    assert format_repair_reference(12345) == "VIDA-R-12345"


def test_comparison_and_overdue():
    rows = repair.comparison({"crack": 3}, [{"defect_type": "crack"}], [{"counts": {"crack": 1, "rust": 2}}])
    by_label = {r["label"]: r for r in rows}
    assert by_label["crack"] == {"label": "crack", "findings": 1, "before": 3, "after": 1}
    assert by_label["rust"]["after"] == 2 and by_label["mold"] == {"label": "mold", "findings": 0, "before": 0, "after": 0}
    assert repair.comparison(None, [], [])[0]["before"] == 0

    today = date(2026, 10, 22)
    assert repair.overdue_info({"status": "in_progress", "due_date": "2026-10-20"}, today) == (True, 2)
    assert repair.overdue_info({"status": "awaiting_review", "due_date": "2026-10-20"}, today) == (False, 0)
    assert repair.overdue_info({"status": "in_progress", "due_date": "2026-10-25"}, today) == (False, 0)


def _create_db(monkeypatch, inspection=None, existing=None, workers=True):
    return _db(
        monkeypatch,
        **{
            "inspections:select": [inspection or {"id": "insp1", "ref_no": 5, "status": "submitted", "severity": "high"}],
            "repair_jobs:select": existing or [],
            "repair_jobs:insert": lambda q: [dict(q.payload, id="j1", ref_no=1)],
            "photos:select": [{"filename": "insp1/a.jpg"}, {"filename": "insp1/b.jpg"}],
            "user_roles:select": [{"user_id": "m1"}] if workers else [],
            "users:select": [{"id": "m1", "name": "Mazlan"}] if workers else [],
        },
    )


@pytest.mark.parametrize("user", [MAINT, ADMIN, INSPECTOR])
def test_only_facility_managers_create_jobs(client, login, monkeypatch, user):
    db = _create_db(monkeypatch)
    login(user)
    assert client.post("/repairs/", json={"inspection_id": "insp1"}).status_code == 403
    assert "repair_jobs" not in db.inserted


@pytest.mark.parametrize("inspection, expected", [
    ({"id": "insp1", "ref_no": 5, "status": "submitted", "severity": None}, 400),
    ({"id": "insp1", "ref_no": 5, "status": "draft", "severity": "high"}, 400),
])
def test_job_needs_a_reviewed_inspection(client, login, monkeypatch, inspection, expected):
    db = _create_db(monkeypatch, inspection=inspection)
    login(FM)
    response = client.post("/repairs/", json={"inspection_id": "insp1"})
    assert response.status_code == expected and "severity" in response.json()["detail"]
    assert "repair_jobs" not in db.inserted


def test_job_creation_refuses_missing_or_duplicate(client, login, monkeypatch):
    login(FM)
    _db(monkeypatch, **{"inspections:select": []})
    assert client.post("/repairs/", json={"inspection_id": "insp1"}).status_code == 404
    db = _create_db(monkeypatch, existing=[{"id": "j0"}])
    assert client.post("/repairs/", json={"inspection_id": "insp1"}).status_code == 409
    assert "repair_jobs" not in db.inserted


def test_create_assigned_job_scans_before_photos_and_logs_history(client, login, monkeypatch):
    db = _create_db(monkeypatch)
    monkeypatch.setattr(repair, "scan_image_bytes", lambda data, source="": [{"label": "crack"}, {"label": "rust"}])
    due = (date.today() + timedelta(days=3)).isoformat()
    login(FM)
    response = client.post("/repairs/", json={"inspection_id": "insp1", "worker_id": "m1", "due_date": due, "note": "Use epoxy"})
    assert response.status_code == 201
    assert response.json() == {"id": "j1", "reference": "VIDA-R-0001", "status": "in_progress", "before_scanned": True}

    job = db.inserted["repair_jobs"][0]
    assert job["status"] == "in_progress" and job["assigned_to"] == "m1" and job["assignment_type"] == "assigned"
    assert job["due_date"] == due and job["before_counts"] == {"crack": 2, "rust": 2} and job["created_by"] == "fm1"
    events = _events(db)
    assert [e["event"] for e in events] == ["created", "assigned"]
    assert events[0]["note"] == "Use epoxy" and events[1]["to_user"] == "m1" and events[1]["actor_id"] == "fm1"
    note = db.inserted["notifications"][0]
    assert note["user_id"] == "m1" and note["link"] == "/jobs/j1" and "VIDA-R-0001" in note["message"] and "VIDA-I-0005" in note["message"]


def test_create_open_job_for_the_board_even_when_the_model_is_down(client, login, monkeypatch):
    db = _create_db(monkeypatch)

    def broken(data, source=""):
        raise RuntimeError("Model not found")

    monkeypatch.setattr(repair, "scan_image_bytes", broken)
    login(FM)
    response = client.post("/repairs/", json={"inspection_id": "insp1"})
    assert response.status_code == 201 and response.json()["status"] == "open" and response.json()["before_scanned"] is False
    job = db.inserted["repair_jobs"][0]
    assert job["assigned_to"] is None and job["assignment_type"] is None and job["before_counts"] is None
    assert [e["event"] for e in _events(db)] == ["created"]
    assert "notifications" not in db.inserted


def test_create_validates_worker_and_due_date(client, login, monkeypatch):
    login(FM)
    _create_db(monkeypatch)
    later = (date.today() + timedelta(days=3)).isoformat()
    past = (date.today() - timedelta(days=3)).isoformat()
    assert client.post("/repairs/", json={"inspection_id": "insp1", "due_date": later}).status_code == 400
    assert client.post("/repairs/", json={"inspection_id": "insp1", "worker_id": "m1", "due_date": past}).status_code == 400
    _create_db(monkeypatch, workers=False)
    response = client.post("/repairs/", json={"inspection_id": "insp1", "worker_id": "insp-a"})
    assert response.status_code == 400 and response.json()["detail"] == "Choose an active maintenance worker"


def test_job_lists_are_scoped_by_role(client, login, monkeypatch):
    db = _db(monkeypatch, **{"repair_jobs:select": lambda q: [dict(JOB, **embed())]})
    login(FM)
    assert client.get("/repairs/board").status_code == 403
    assert client.get("/repairs/mine?type=assigned").status_code == 403
    assert client.get("/repairs/").status_code == 200
    login(ADMIN)
    assert client.get("/repairs/?status=awaiting_review").status_code == 200
    assert db.queries[-1].filters == {"status": "awaiting_review"}

    login(MAINT)
    assert client.get("/repairs/").status_code == 403
    body = client.get("/repairs/board").json()
    assert db.queries[-1].filters == {"status": "open"}
    assert body[0]["reference"] == "VIDA-R-0007" and body[0]["inspection_reference"] == "VIDA-I-0005" and body[0]["complaint_reference"] == "VIDA-C-0009"
    client.get("/repairs/mine?type=claimed")
    assert db.queries[-1].filters == {"assigned_to": "m1", "assignment_type": "claimed"}
    assert client.get("/repairs/mine?type=everything").status_code == 422


@pytest.mark.parametrize("job, user, expected", [
    (dict(JOB), MAINT2, 200),
    (dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed"), MAINT, 200),
    (dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed"), MAINT2, 403),
    (dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed"), FM, 200),
    (dict(JOB, status="done", assigned_to="m1", assignment_type="claimed"), ADMIN, 200),
    (dict(JOB), INSPECTOR, 403),
])
def test_job_page_visibility(client, login, monkeypatch, job, user, expected):
    _db(monkeypatch, **{"repair_jobs:select": [dict(job, **embed())], "inspections:select": [{"id": "insp1", "users": {"name": "Aina"}}]})
    login(user)
    assert client.get("/repairs/j1").status_code == expected


def test_job_page_has_numbers_history_and_comparison(client, login, monkeypatch):
    job = dict(JOB, status="awaiting_review", assigned_to="m1", assignment_type="assigned", **embed())
    _db(monkeypatch, **{
        "repair_jobs:select": lambda q: [dict(job, **embed())],
        "inspections:select": lambda q: [{"id": "insp1", "users": {"name": "Aina"}, "assessor": {"name": "Farah"}}],
        "findings:select": [{"id": "f1", "defect_type": "crack"}],
        "repair_photos:select": [
            {"id": "rp0", "round": 0, "detections": [{"label": "crack"}], "scanned_at": "x"},
            {"id": "rp1", "round": 1, "detections": [], "scanned_at": "x"},
        ],
        "repair_job_events:select": [{"id": "e1", "event": "created", "actor": {"name": "Farah"}, "from_worker": None, "to_worker": None}],
    })
    login(FM)
    body = client.get("/repairs/j1").json()
    assert body["job"]["reference"] == "VIDA-R-0007" and body["job"]["inspection_reference"] == "VIDA-I-0005" and body["job"]["complaint_reference"] == "VIDA-C-0009"
    assert body["inspection"]["inspector_name"] == "Aina" and body["inspection"]["assessor"] == "Farah"
    assert body["events"][0]["actor_name"] == "Farah"
    crack = next(r for r in body["comparison"] if r["label"] == "crack")
    assert crack == {"label": "crack", "findings": 1, "before": 2, "after": 0}
    assert body["after_scanned"] is True and body["before_scanned"] is True
    assert all("detections" not in p for p in body["completion_photos"])
    assert body["permissions"] == {"can_claim": False, "can_work": False, "can_assign": False, "can_review": True, "can_reassign": True}

    login(FM_WORKER)
    assert client.get("/repairs/j1").json()["permissions"]["can_review"] is False


def test_claim_takes_an_open_job(client, login, monkeypatch):
    db = _db(monkeypatch, job=JOB)
    login(FM)
    assert client.post("/repairs/j1/claim").status_code == 403
    login(MAINT)
    assert client.post("/repairs/j1/claim").json() == {"id": "j1", "status": "in_progress"}
    table, payload, filters = db.updated[0]
    assert filters == {"id": "j1", "status": "open"}
    assert payload["status"] == "in_progress" and payload["assigned_to"] == "m1" and payload["assignment_type"] == "claimed"
    event = _events(db)[0]
    assert event["event"] == "claimed" and event["actor_id"] == "m1" and event["to_user"] == "m1"


def test_claim_refuses_taken_jobs_and_races(client, login, monkeypatch):
    login(MAINT2)
    _db(monkeypatch, job=dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed"))
    assert client.post("/repairs/j1/claim").status_code == 409
    db = _db(monkeypatch, job=JOB, **{"repair_jobs:update": []})
    response = client.post("/repairs/j1/claim")
    assert response.status_code == 409 and response.json()["detail"] == "This job has already been taken"
    assert "repair_job_events" not in db.inserted


def test_facility_manager_assigns_an_open_job(client, login, monkeypatch):
    db = _db(monkeypatch, job=JOB, **{"user_roles:select": [{"user_id": "m2"}]})
    login(FM)
    assert client.post("/repairs/j1/assign", json={"worker_id": "m2"}).status_code == 200
    payload = db.updated[0][1]
    assert payload["assigned_to"] == "m2" and payload["assignment_type"] == "assigned" and payload["status"] == "in_progress"
    assert _events(db)[0]["event"] == "assigned" and db.inserted["notifications"][0]["user_id"] == "m2"

    _db(monkeypatch, job=dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed"))
    assert client.post("/repairs/j1/assign", json={"worker_id": "m2"}).status_code == 409


def test_completion_photo_is_scanned_on_upload(client, login, monkeypatch):
    working = dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed", round=2)
    db = _db(monkeypatch, job=working, **{"repair_photos:select": []})
    monkeypatch.setattr(repair, "scan_image_bytes", lambda data, source="": [{"label": "crack", "score": 0.4}])
    login(MAINT)
    response = client.post("/repairs/j1/photos", files={"file": ("after.jpg", _image(), "image/jpeg")})
    assert response.status_code == 201
    body = response.json()
    assert body["scanned"] is True and body["counts"] == {"crack": 1} and body["round"] == 2 and "detections" not in body
    stored = db.inserted["repair_photos"][0]
    assert stored["detections"] == [{"label": "crack", "score": 0.4}] and stored["filename"].startswith("repairs/j1/")
    assert ("vida-photos", stored["filename"]) in db.uploads

    assert client.post("/repairs/j1/photos", files={"file": ("after.gif", b"GIF89a", "image/gif")}).status_code == 400
    login(MAINT2)
    assert client.post("/repairs/j1/photos", files={"file": ("after.jpg", _image(), "image/jpeg")}).status_code == 403


def test_upload_survives_scan_failure_and_respects_status(client, login, monkeypatch):
    working = dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed")
    _db(monkeypatch, job=working, **{"repair_photos:select": []})

    def broken(data, source=""):
        raise RuntimeError("Model not found")

    monkeypatch.setattr(repair, "scan_image_bytes", broken)
    login(MAINT)
    body = client.post("/repairs/j1/photos", files={"file": ("after.jpg", _image(), "image/jpeg")}).json()
    assert body["scanned"] is False and body["counts"] == {}

    _db(monkeypatch, job=dict(working, status="awaiting_review"))
    assert client.post("/repairs/j1/photos", files={"file": ("after.jpg", _image(), "image/jpeg")}).status_code == 409


def test_old_round_photos_cannot_be_deleted(client, login, monkeypatch):
    working = dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed", round=2)
    _db(monkeypatch, job=working, **{"repair_photos:select": [{"id": "rp1", "filename": "repairs/j1/a.jpg", "round": 1}]})
    login(MAINT)
    assert client.delete("/repairs/j1/photos/rp1").status_code == 409
    db = _db(monkeypatch, job=working, **{"repair_photos:select": [{"id": "rp2", "filename": "repairs/j1/b.jpg", "round": 2}]})
    assert client.delete("/repairs/j1/photos/rp2").status_code == 200
    assert any(q.table == "repair_photos" and q.op == "delete" for q in db.queries)


def test_submit_needs_photos_and_notes(client, login, monkeypatch):
    working = dict(JOB, status="in_progress", assigned_to="m1", assignment_type="assigned")
    login(MAINT)
    _db(monkeypatch, job=working, **{"repair_photos:select": []})
    assert client.post("/repairs/j1/submit", json={"notes": "Patched and repainted the wall"}).status_code == 400
    assert client.post("/repairs/j1/submit", json={"notes": "   ok  "}).status_code == 422

    db = _db(monkeypatch, job=working, **{"repair_photos:select": [{"id": "rp1"}], "users:select": [{"id": "fm1"}, {"id": "m1"}]})
    assert client.post("/repairs/j1/submit", json={"notes": "  Patched and repainted the wall  "}).json() == {"id": "j1", "status": "awaiting_review"}
    payload, filters = db.updated[0][1], db.updated[0][2]
    assert filters == {"id": "j1", "status": "in_progress", "assigned_to": "m1"}
    assert payload["status"] == "awaiting_review" and payload["repair_notes"] == "Patched and repainted the wall" and payload["submitted_at"]
    event = _events(db)[0]
    assert event["event"] == "submitted" and event["note"] == "Patched and repainted the wall" and event["round"] == 1
    assert [n["user_id"] for n in db.inserted["notifications"]] == ["fm1"]

    login(MAINT2)
    assert client.post("/repairs/j1/submit", json={"notes": "Patched and repainted"}).status_code == 403


def test_send_back_marks_rework_for_the_same_worker(client, login, monkeypatch):
    waiting = dict(JOB, status="awaiting_review", assigned_to="m1", assignment_type="claimed")
    db = _db(monkeypatch, job=waiting)
    login(FM)
    assert client.post("/repairs/j1/send-back", json={"reason": "  no "}).status_code == 422
    assert client.post("/repairs/j1/send-back", json={"reason": "Paint still peeling at the corner"}).status_code == 200
    payload = db.updated[0][1]
    assert payload["status"] == "in_progress" and payload["rework_count"] == 1 and payload["round"] == 2
    assert "assigned_to" not in payload
    event = _events(db)[0]
    assert event["event"] == "sent_back" and event["reason"] == "Paint still peeling at the corner" and event["to_user"] == "m1" and event["round"] == 2
    note = db.inserted["notifications"][0]
    assert note["user_id"] == "m1" and note["type"] == "warning"

    _db(monkeypatch, job=dict(waiting, status="in_progress"))
    assert client.post("/repairs/j1/send-back", json={"reason": "Paint still peeling"}).status_code == 409


def test_reassign_moves_the_job_to_another_worker(client, login, monkeypatch):
    working = dict(JOB, status="in_progress", assigned_to="m1", assignment_type="claimed", repair_notes="half done")
    db = _db(monkeypatch, job=working, **{"user_roles:select": [{"user_id": "m2"}]})
    login(FM)
    assert client.post("/repairs/j1/reassign", json={"worker_id": "m2", "reason": ""}).status_code == 422
    assert client.post("/repairs/j1/reassign", json={"worker_id": "m1", "reason": "Worker is on leave"}).status_code == 400
    assert client.post("/repairs/j1/reassign", json={"worker_id": "m2", "reason": "Worker is on leave"}).status_code == 200
    payload = db.updated[0][1]
    assert payload["assigned_to"] == "m2" and payload["assignment_type"] == "assigned" and payload["status"] == "in_progress"
    assert payload["round"] == 2 and payload["repair_notes"] is None
    event = _events(db)[0]
    assert event["event"] == "reassigned" and event["from_user"] == "m1" and event["to_user"] == "m2" and event["reason"] == "Worker is on leave"
    notes = {n["user_id"]: n for n in db.inserted["notifications"]}
    assert notes["m2"]["link"] == "/jobs/j1" and notes["m1"]["link"] == "/jobs/claimed"

    _db(monkeypatch, job=JOB)
    assert client.post("/repairs/j1/reassign", json={"worker_id": "m2", "reason": "Worker is on leave"}).status_code == 409


def test_approve_closes_the_job(client, login, monkeypatch):
    waiting = dict(JOB, status="awaiting_review", assigned_to="m1", assignment_type="assigned")
    db = _db(monkeypatch, job=waiting)
    login(MAINT)
    assert client.post("/repairs/j1/approve", json={}).status_code == 403
    login(FM)
    assert client.post("/repairs/j1/approve", json={"note": "Good work"}).json() == {"id": "j1", "status": "done"}
    payload = db.updated[0][1]
    assert payload["status"] == "done" and payload["approved_by"] == "fm1" and payload["completed_at"]
    event = _events(db)[0]
    assert event["event"] == "approved" and event["note"] == "Good work"
    assert db.inserted["notifications"][0]["type"] == "success"
    assert not any(q.table == "repair_job_events" and q.op in ("update", "delete") for q in db.queries)

    _db(monkeypatch, job=dict(waiting, status="done"))
    assert client.post("/repairs/j1/approve", json={}).status_code == 409


def test_facility_manager_cannot_review_their_own_repair(client, login, monkeypatch):
    db = _db(monkeypatch, job=dict(JOB, status="awaiting_review", assigned_to="m1", assignment_type="claimed"))
    login(FM_WORKER)
    assert client.post("/repairs/j1/approve", json={}).status_code == 403
    assert client.post("/repairs/j1/send-back", json={"reason": "Needs another coat"}).status_code == 403
    assert db.updated == []


def test_staff_counts(client, login, monkeypatch):
    overdue = (date.today() - timedelta(days=2)).isoformat()
    _db(monkeypatch, **{
        "user_roles:select": [{"user_id": "m1"}, {"user_id": "m2"}],
        "users:select": [{"id": "m1", "name": "Mazlan", "email": "m@x"}, {"id": "m2", "name": "Nadia", "email": "n@x"}],
        "repair_jobs:select": [
            {"assigned_to": "m1", "assignment_type": "assigned", "status": "in_progress", "due_date": overdue},
            {"assigned_to": "m1", "assignment_type": "claimed", "status": "in_progress", "due_date": None},
            {"assigned_to": "m1", "assignment_type": "claimed", "status": "awaiting_review", "due_date": None},
            {"assigned_to": "m1", "assignment_type": "assigned", "status": "done", "due_date": None},
        ],
    })
    login(MAINT)
    assert client.get("/repairs/staff").status_code == 403
    login(FM)
    m1, m2 = client.get("/repairs/staff").json()
    assert (m1["assigned"], m1["claimed"], m1["awaiting_review"], m1["done"], m1["overdue"], m1["active"]) == (1, 1, 1, 1, 1, 3)
    assert m2["active"] == 0 and m2["done"] == 0


def test_candidates_are_reviewed_inspections_without_a_job(client, login, monkeypatch):
    _db(monkeypatch, **{"inspections:select": [
        {"id": "i1", "ref_no": 1, "severity": None, "users": {"name": "Aina"}, "complaints": [], "repair_jobs": []},
        {"id": "i2", "ref_no": 2, "severity": "low", "users": {"name": "Aina"}, "complaints": [], "repair_jobs": []},
        {"id": "i3", "ref_no": 3, "severity": "critical", "users": {"name": "Aina"}, "complaints": [{"ref_no": 4}], "repair_jobs": []},
        {"id": "i4", "ref_no": 4, "severity": "high", "users": {"name": "Aina"}, "complaints": [], "repair_jobs": [{"id": "j1", "ref_no": 1, "status": "open"}]},
    ]})
    login(MAINT)
    assert client.get("/repairs/candidates").status_code == 403
    login(FM)
    body = client.get("/repairs/candidates").json()
    assert [(r["reference"], r["complaint_reference"]) for r in body] == [("VIDA-I-0003", "VIDA-C-0004"), ("VIDA-I-0002", None)]


def test_bad_job_id_is_not_found(client, login, monkeypatch):
    _db(monkeypatch, **{"repair_jobs:select": []})
    login(FM)
    assert client.get("/repairs/j404").status_code == 404
    assert client.post("/repairs/j404/approve", json={}).status_code == 404
