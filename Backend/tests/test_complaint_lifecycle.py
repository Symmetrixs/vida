import io
from datetime import date, datetime, timedelta, timezone

import pytest
from PIL import Image

import complaint
import finding
import group
import inspection
import inspector
import photo
import report
from auth import get_current_user
from fakes import FakeSupabase
from main import app

OWNER = {"id": "owner", "roles": ["inspector"], "name": "Owner"}
OTHER = {"id": "other", "roles": ["inspector"], "name": "Other"}
ADMIN = {"id": "admin1", "roles": ["admin"], "name": "Admin"}
FM = {"id": "fm1", "roles": ["facility_manager"], "name": "Manager"}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _complaint_db(complaint_row, inspection_row):
    return FakeSupabase(responses={
        ("complaints", "select"): [complaint_row] if complaint_row else [],
        ("inspections", "select"): [inspection_row],
    })


def _complaint_updates(db):
    return [payload for table, payload, _ in db.updated if table == "complaints"]


@pytest.mark.parametrize("started, inspection_status, expected", [
    (False, "draft", "assigned"),
    (True, "draft", "in_progress"),
    (True, "submitted", "submitted"),
    (False, "submitted", "submitted"),
])
def test_derive_status(started, inspection_status, expected):
    assert complaint.derive_status(started, inspection_status) == expected


def test_overdue_and_submitted_late_use_malaysia_dates():
    today = date(2026, 10, 21)
    assert complaint.MYT.utcoffset(None) == timedelta(hours=8)
    assert complaint.overdue_info("assigned", "2026-10-21", today) == (False, 0)
    assert complaint.overdue_info("in_progress", "2026-10-18", today) == (True, 3)
    assert complaint.overdue_info("submitted", "2026-10-01", today) == (False, 0)
    assert complaint.overdue_info("reviewed", "2026-10-01", today) == (False, 0)
    assert complaint.overdue_info("pending", "2026-10-01", today) == (False, 0)
    assert complaint.overdue_info("assigned", None, today) == (False, 0)
    assert complaint.submitted_late("2026-10-20", "2026-10-20T16:30:00+00:00") is True
    assert complaint.submitted_late("2026-10-20", "2026-10-20T15:59:00Z") is False
    assert complaint.submitted_late("2026-10-20", "2026-10-20T01:00:00+00:00") is False
    assert complaint.submitted_late(None, "2026-10-20T16:30:00+00:00") is False


def test_owner_activity_starts_work_but_admin_activity_does_not(monkeypatch):
    row = {"id": "c1", "status": "assigned", "started_at": None, "submitted_at": None}
    db = _complaint_db(row, {"status": "draft", "inspector_id": "owner", "submitted_at": None})
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)

    assert complaint.sync_complaint("insp1", ADMIN, started=True) == "assigned"
    assert _complaint_updates(db) == []

    assert complaint.sync_complaint("insp1", OWNER, started=True) == "in_progress"
    update = _complaint_updates(db)[0]
    assert update["status"] == "in_progress" and update["started_at"] and update["submitted_at"] is None
    assert "notifications" not in db.inserted


def test_submitted_inspection_moves_complaint_to_submitted(monkeypatch):
    row = {"id": "c1", "status": "in_progress", "started_at": "2026-10-20T01:00:00+00:00", "submitted_at": None}
    db = _complaint_db(row, {"status": "submitted", "inspector_id": "owner", "submitted_at": "2026-10-21T03:00:00+00:00"})
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    assert complaint.sync_complaint("insp1", OWNER, started=True) == "submitted"
    assert _complaint_updates(db) == [{"status": "submitted", "submitted_at": "2026-10-21T03:00:00+00:00"}]
    assert "reports" not in {q.table for q in db.queries}

    back = dict(row, status="submitted", submitted_at="2026-10-21T03:00:00+00:00")
    draft_db = _complaint_db(back, {"status": "draft", "inspector_id": "owner", "submitted_at": None})
    monkeypatch.setattr(complaint, "get_supabase", lambda: draft_db)
    assert complaint.sync_complaint("insp1", OWNER) == "in_progress"
    assert _complaint_updates(draft_db) == [{"status": "in_progress", "submitted_at": None}]


def test_reviewed_complaint_never_changes_status(monkeypatch):
    row = {"id": "c1", "status": "reviewed", "started_at": "2026-10-20T01:00:00+00:00", "submitted_at": "2026-10-21T03:00:00+00:00"}
    db = _complaint_db(row, {"status": "draft", "inspector_id": "owner", "submitted_at": None})
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    assert complaint.sync_complaint("insp1", OWNER, started=True) == "reviewed"
    assert db.updated == []


def test_sync_ignores_unlinked_inspections_and_never_raises(monkeypatch):
    db = _complaint_db(None, {"status": "draft", "inspector_id": "owner"})
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    assert complaint.sync_complaint("insp1", OWNER, started=True) is None
    assert db.updated == []
    assert complaint.sync_complaint(None, OWNER) is None

    def broken():
        raise RuntimeError("database down")

    monkeypatch.setattr(complaint, "get_supabase", broken)
    assert complaint.sync_complaint("insp1", OWNER, started=True) is None
    complaint.mark_started("insp1", OWNER, "owner")


def test_mark_started_only_for_assigned_inspector(monkeypatch):
    calls = []
    monkeypatch.setattr(complaint, "sync_complaint", lambda *args, **kwargs: calls.append((args, kwargs)))
    monkeypatch.setattr(complaint, "get_supabase", lambda: FakeSupabase(responses={("complaints", "select"): [{"id": "c1"}]}))
    complaint.mark_started("insp1", ADMIN, "owner")
    assert calls == []
    complaint.mark_started("insp1", OWNER, "owner")
    assert calls == [(("insp1", OWNER), {"started": True})]

    calls.clear()
    monkeypatch.setattr(complaint, "get_supabase", lambda: FakeSupabase(responses={("complaints", "select"): []}))
    complaint.mark_started("insp1", OWNER, "owner")
    assert calls == []


def test_release_sends_complaint_back_to_pending():
    db = FakeSupabase()
    complaint.release_complaint(db, "insp1")
    table, payload, filters = db.updated[0]
    assert table == "complaints" and filters == {"inspection_id": "insp1"}
    assert payload["status"] == "pending" and payload["inspection_id"] is None
    cleared = ("reviewed_by", "reviewed_at", "due_date", "started_at", "submitted_at", "severity", "severity_note", "assessed_by", "assessed_at")
    assert all(payload[k] is None for k in cleared)


def test_convert_refuses_past_due_date(client, login, monkeypatch):
    monkeypatch.setattr(complaint, "get_supabase", lambda: FakeSupabase())
    login(FM)
    yesterday = (complaint.today_myt() - timedelta(days=1)).isoformat()
    response = client.post("/complaints/c1/convert", json={"inspector_id": "owner", "due_date": yesterday})
    assert response.status_code == 400
    assert response.json()["detail"] == "Due date cannot be in the past"


def test_only_the_owning_inspector_can_submit_or_create_report(client, login, monkeypatch):
    calls = []
    monkeypatch.setattr(inspection, "sync_complaint", lambda *a, **k: calls.append("inspection"))
    monkeypatch.setattr(inspection, "notify_inspection_submitted", lambda *a, **k: 0)
    monkeypatch.setattr(inspection, "get_supabase", lambda: FakeSupabase(responses={
        ("inspections", "select"): [{"inspector_id": "owner"}],
        ("inspections", "update"): [{"id": "insp1", "status": "submitted"}],
    }))
    monkeypatch.setattr(report, "get_supabase", lambda: FakeSupabase(responses={
        ("inspections", "select"): [{"id": "insp1", "status": "draft", "inspector_id": "owner"}],
    }))

    login(OTHER)
    assert client.post("/inspections/insp1/submit").status_code == 403
    assert client.post("/reports/", json={"inspection_id": "insp1", "title": "Report"}).status_code == 403
    assert calls == []

    login(OWNER)
    assert client.post("/inspections/insp1/submit").status_code == 200
    assert client.post("/reports/", json={"inspection_id": "insp1", "title": "Report"}).status_code == 201

    for user in (FM, ADMIN):
        login(user)
        assert client.post("/inspections/insp1/submit").status_code == 403
        assert client.post("/reports/", json={"inspection_id": "insp1", "title": "Report"}).status_code == 403
    assert calls == ["inspection"]


def test_inspection_endpoints_update_the_complaint_and_reports_do_not(client, login, monkeypatch):
    calls = []

    def recorder(name):
        return lambda inspection_id, actor=None, *args, **kwargs: calls.append((name, inspection_id))

    for module in (inspection, photo, finding, group):
        monkeypatch.setattr(module, "sync_complaint", recorder(f"{module.__name__}.sync"))
    monkeypatch.setattr(inspection, "mark_started", recorder("inspection.open"))
    monkeypatch.setattr(photo, "mark_started", recorder("photo.open"))
    monkeypatch.setattr(inspection, "release_complaint", lambda supabase, inspection_id: calls.append(("inspection.release", inspection_id)))

    def explode(*args, **kwargs):
        raise AssertionError("report endpoints must not touch complaint status")

    monkeypatch.setattr(complaint, "sync_complaint", explode)
    monkeypatch.setattr(complaint, "get_supabase", explode)
    assert "sync_complaint" not in vars(report)

    def use(module, responses):
        monkeypatch.setattr(module, "get_supabase", lambda: FakeSupabase(responses=responses))

    login(OWNER)
    now = datetime.now(timezone.utc).isoformat()
    report_row = {"id": "r1", "created_by": "owner", "created_at": now, "inspection_id": "insp1", "status": "draft"}

    owned = {("inspections", "select"): [{"id": "insp1", "inspector_id": "owner", "status": "draft"}]}
    use(inspection, owned)
    assert client.get("/inspections/insp1").status_code == 200
    use(inspection, {**owned, ("inspections", "update"): [{"id": "insp1"}]})
    assert client.put("/inspections/insp1", json={"remarks": "checked"}).status_code == 200
    use(inspection, owned)
    assert client.delete("/inspections/insp1").status_code == 200

    use(photo, owned)
    assert client.get("/photos/insp1/list").status_code == 200
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32)).save(buffer, format="JPEG")
    upload = client.post("/photos/upload", data={"inspection_id": "insp1"}, files={"file": ("a.jpg", buffer.getvalue(), "image/jpeg")})
    assert upload.status_code == 201

    use(finding, owned)
    assert client.post("/findings/", json={"inspection_id": "insp1", "defect_type": "crack", "severity": "high"}).status_code == 201

    use(group, owned)
    assert client.post("/groups/insp1/save", json={"groups": []}).status_code == 200

    use(report, {("inspections", "select"): [{"id": "insp1", "status": "draft", "inspector_id": "owner"}], ("reports", "select"): [report_row], ("reports", "update"): [report_row]})
    assert client.post("/reports/", json={"inspection_id": "insp1", "title": "Report"}).status_code == 201
    assert client.put("/reports/r1", json={"status": "published"}).status_code == 200
    assert client.post("/reports/r1/publish").status_code == 200
    assert client.delete("/reports/r1").status_code == 200

    assert calls == [
        ("inspection.open", "insp1"),
        ("inspection.sync", "insp1"),
        ("inspection.release", "insp1"),
        ("photo.open", "insp1"),
        ("photo.sync", "insp1"),
        ("finding.sync", "insp1"),
        ("group.sync", "insp1"),
    ]


def test_assigned_tasks_lists_open_work_then_recent_submissions(client, login, monkeypatch):
    today = complaint.today_myt()
    now = datetime.now(timezone.utc)
    base = {"floor": "Level 1", "location_note": "Corridor", "description": "Crack", "reviewed_at": now.isoformat(),
            "started_at": None, "submitted_at": None, "severity": None, "buildings": {"name": "FTMK", "code": "FTMK-MAIN"}}

    def insp(i, status="draft"):
        return {"id": f"i{i}", "title": f"T{i}", "status": status, "inspector_id": "owner"}

    rows = [
        dict(base, ref_no=1, status="in_progress", due_date=None, inspections=insp(1)),
        dict(base, ref_no=2, status="assigned", due_date=(today - timedelta(days=2)).isoformat(), inspections=insp(2)),
        dict(base, ref_no=3, status="submitted", due_date=(today - timedelta(days=5)).isoformat(), submitted_at=(now - timedelta(days=1)).isoformat(), inspections=insp(3, "submitted")),
        dict(base, ref_no=4, status="reviewed", due_date=None, severity="high", submitted_at=(now - timedelta(days=10)).isoformat(), inspections=insp(4, "submitted")),
        dict(base, ref_no=5, status="assigned", due_date=(today + timedelta(days=3)).isoformat(), inspections=insp(5)),
        dict(base, ref_no=6, status="reviewed", due_date=None, severity="critical", submitted_at=(now - timedelta(days=2)).isoformat(), inspections=insp(6, "submitted")),
    ]
    db = FakeSupabase(responses={("complaints", "select"): rows})
    monkeypatch.setattr(inspector, "get_supabase", lambda: db)
    login(OWNER)

    tasks = client.get("/inspector/assigned-tasks").json()
    assert [t["reference"] for t in tasks] == ["VIDA-C-0002", "VIDA-C-0005", "VIDA-C-0001", "VIDA-C-0003", "VIDA-C-0006"]
    assert tasks[0]["is_overdue"] and tasks[0]["days_overdue"] == 2
    assert tasks[3]["submitted_late"] is True and tasks[3]["is_overdue"] is False
    assert tasks[4]["severity"] == "critical"
    assert all(t["severity"] is None for t in tasks[:4])
    assert db.queries[0].filters["inspections.inspector_id"] == "owner"
    assert all(not any(k.startswith("reporter") or k.startswith("resolved") for k in t) for t in tasks)
