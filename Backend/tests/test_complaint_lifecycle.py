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

OWNER = {"id": "owner", "role": "inspector", "name": "Owner"}
OTHER = {"id": "other", "role": "inspector", "name": "Other"}
ADMIN = {"id": "admin1", "role": "admin", "name": "Admin"}
FM = {"id": "fm1", "role": "facility_manager", "name": "Manager"}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _complaint_db(complaint_row, inspection_row, published, reviewer_role="admin"):
    return FakeSupabase(responses={
        ("complaints", "select"): [complaint_row] if complaint_row else [],
        ("inspections", "select"): [inspection_row],
        ("reports", "select"): [{"id": "r1"}] if published else [],
        ("users", "select"): [{"role": reviewer_role}],
    })


def _complaint_updates(db):
    return [payload for table, payload, _ in db.updated if table == "complaints"]


@pytest.mark.parametrize("started, inspection_status, published, expected", [
    (False, "draft", False, "assigned"),
    (True, "draft", False, "in_progress"),
    (True, "submitted", False, "in_progress"),
    (True, "draft", True, "in_progress"),
    (True, "submitted", True, "resolved"),
    (False, "submitted", True, "resolved"),
])
def test_derive_status(started, inspection_status, published, expected):
    assert complaint.derive_status(started, inspection_status, published) == expected


def test_overdue_uses_malaysia_dates():
    today = date(2026, 10, 21)
    assert complaint.MYT.utcoffset(None) == timedelta(hours=8)
    assert complaint.overdue_info("assigned", "2026-10-21", today) == (False, 0)
    assert complaint.overdue_info("in_progress", "2026-10-18", today) == (True, 3)
    assert complaint.overdue_info("resolved", "2026-10-01", today) == (False, 0)
    assert complaint.overdue_info("pending", "2026-10-01", today) == (False, 0)
    assert complaint.overdue_info("assigned", None, today) == (False, 0)
    assert complaint.resolved_late("2026-10-20", "2026-10-20T16:30:00+00:00") is True
    assert complaint.resolved_late("2026-10-20", "2026-10-20T15:59:00Z") is False
    assert complaint.resolved_late("2026-10-20", "2026-10-20T01:00:00+00:00") is False


def test_owner_activity_starts_work_but_admin_activity_does_not(monkeypatch):
    row = {"id": "c1", "ref_no": 7, "status": "assigned", "started_at": None, "reviewed_by": "admin1"}
    db = _complaint_db(row, {"status": "draft", "inspector_id": "owner"}, published=False)
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)

    assert complaint.sync_complaint("insp1", ADMIN, started=True) == "assigned"
    assert _complaint_updates(db) == []

    assert complaint.sync_complaint("insp1", OWNER, started=True) == "in_progress"
    update = _complaint_updates(db)[0]
    assert update["status"] == "in_progress" and update["started_at"] and update["resolved_at"] is None
    assert "notifications" not in db.inserted


def test_resolution_notifies_reviewer_and_can_regress(monkeypatch):
    row = {"id": "c1", "ref_no": 7, "status": "in_progress", "started_at": "2026-10-20T01:00:00+00:00", "reviewed_by": "admin1"}
    db = _complaint_db(row, {"status": "submitted", "inspector_id": "owner"}, published=True)
    monkeypatch.setattr(complaint, "get_supabase", lambda: db)
    assert complaint.sync_complaint("insp1", OWNER) == "resolved"
    update = _complaint_updates(db)[0]
    assert update["status"] == "resolved" and update["resolved_at"]
    note = db.inserted["notifications"][0]
    assert note["user_id"] == "admin1" and note["link"] == "/admin/complaints" and "VIDA-C-0007" in note["message"]

    fm_db = _complaint_db(dict(row), {"status": "submitted", "inspector_id": "owner"}, published=True, reviewer_role="facility_manager")
    monkeypatch.setattr(complaint, "get_supabase", lambda: fm_db)
    complaint.sync_complaint("insp1", OWNER)
    assert fm_db.inserted["notifications"][0]["link"] == "/inspector/complaints"

    resolved = dict(row, status="resolved", resolved_at="2026-10-21T01:00:00+00:00")
    regress_db = _complaint_db(resolved, {"status": "submitted", "inspector_id": "owner"}, published=False)
    monkeypatch.setattr(complaint, "get_supabase", lambda: regress_db)
    assert complaint.sync_complaint("insp1", ADMIN) == "in_progress"
    assert _complaint_updates(regress_db)[0] == {"status": "in_progress", "resolved_at": None}
    assert "notifications" not in regress_db.inserted


def test_sync_ignores_unlinked_inspections_and_never_raises(monkeypatch):
    db = _complaint_db(None, {"status": "draft", "inspector_id": "owner"}, published=False)
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
    assert all(payload[k] is None for k in ("reviewed_by", "reviewed_at", "due_date", "started_at", "resolved_at"))


def test_convert_refuses_past_due_date(client, login, monkeypatch):
    monkeypatch.setattr(complaint, "get_supabase", lambda: FakeSupabase())
    login(ADMIN)
    yesterday = (complaint.today_myt() - timedelta(days=1)).isoformat()
    response = client.post("/complaints/c1/convert", json={"inspector_id": "owner", "due_date": yesterday})
    assert response.status_code == 400
    assert response.json()["detail"] == "Due date cannot be in the past"


def test_only_owner_or_manager_can_submit_or_create_report(client, login, monkeypatch):
    calls = []
    monkeypatch.setattr(inspection, "sync_complaint", lambda *a, **k: calls.append("inspection"))
    monkeypatch.setattr(report, "sync_complaint", lambda *a, **k: calls.append("report"))
    monkeypatch.setattr(inspection, "notify_complaint_submitted", lambda *a, **k: 0)
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

    login(FM)
    assert client.post("/inspections/insp1/submit").status_code == 200
    assert calls == ["inspection", "report", "inspection"]


def test_every_hooked_endpoint_updates_the_complaint(client, login, monkeypatch):
    calls = []

    def recorder(name):
        return lambda inspection_id, actor=None, *args, **kwargs: calls.append((name, inspection_id))

    for module in (inspection, photo, finding, group, report):
        monkeypatch.setattr(module, "sync_complaint", recorder(f"{module.__name__}.sync"))
    monkeypatch.setattr(inspection, "mark_started", recorder("inspection.open"))
    monkeypatch.setattr(photo, "mark_started", recorder("photo.open"))
    monkeypatch.setattr(inspection, "release_complaint", lambda supabase, inspection_id: calls.append(("inspection.release", inspection_id)))

    def use(module, responses):
        monkeypatch.setattr(module, "get_supabase", lambda: FakeSupabase(responses=responses))

    login(OWNER)
    now = datetime.now(timezone.utc).isoformat()
    report_row = {"id": "r1", "created_by": "owner", "created_at": now, "inspection_id": "insp1", "status": "draft"}

    use(inspection, {("inspections", "select"): {"id": "insp1", "inspector_id": "owner"}})
    assert client.get("/inspections/insp1").status_code == 200
    use(inspection, {("inspections", "select"): {"inspector_id": "owner", "status": "draft"}, ("inspections", "update"): [{"id": "insp1"}]})
    assert client.put("/inspections/insp1", json={"remarks": "checked"}).status_code == 200
    use(inspection, {("inspections", "select"): {"inspector_id": "owner"}})
    assert client.delete("/inspections/insp1").status_code == 200

    use(photo, {})
    assert client.get("/photos/insp1/list").status_code == 200
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32)).save(buffer, format="JPEG")
    upload = client.post("/photos/upload", data={"inspection_id": "insp1"}, files={"file": ("a.jpg", buffer.getvalue(), "image/jpeg")})
    assert upload.status_code == 201

    use(finding, {})
    assert client.post("/findings/", json={"inspection_id": "insp1", "defect_type": "crack", "severity": "high"}).status_code == 201

    use(group, {})
    assert client.post("/groups/insp1/save", json={"groups": []}).status_code == 200

    use(report, {("reports", "select"): report_row, ("reports", "update"): [report_row]})
    assert client.put("/reports/r1", json={"status": "published"}).status_code == 200
    assert client.put("/reports/r1", json={"summary": "no status change"}).status_code == 200
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
        ("report.sync", "insp1"),
        ("report.sync", "insp1"),
        ("report.sync", "insp1"),
    ]


def test_assigned_tasks_lists_only_my_open_and_recent_work(client, login, monkeypatch):
    today = complaint.today_myt()
    now = datetime.now(timezone.utc)
    base = {"floor": "Level 1", "location_note": "Corridor", "description": "Crack", "reviewed_at": now.isoformat(),
            "started_at": None, "resolved_at": None, "buildings": {"name": "FTMK", "code": "FTMK-MAIN"}}
    rows = [
        dict(base, ref_no=1, status="in_progress", due_date=None, inspections={"id": "i1", "title": "A", "status": "draft", "inspector_id": "owner"}),
        dict(base, ref_no=2, status="assigned", due_date=(today - timedelta(days=2)).isoformat(), inspections={"id": "i2", "title": "B", "status": "draft", "inspector_id": "owner"}),
        dict(base, ref_no=3, status="resolved", due_date=(today - timedelta(days=5)).isoformat(), resolved_at=(now - timedelta(days=1)).isoformat(), inspections={"id": "i3", "title": "C", "status": "submitted", "inspector_id": "owner"}),
        dict(base, ref_no=4, status="resolved", due_date=None, resolved_at=(now - timedelta(days=10)).isoformat(), inspections={"id": "i4", "title": "D", "status": "submitted", "inspector_id": "owner"}),
        dict(base, ref_no=5, status="assigned", due_date=(today + timedelta(days=3)).isoformat(), inspections={"id": "i5", "title": "E", "status": "draft", "inspector_id": "owner"}),
    ]
    db = FakeSupabase(responses={("complaints", "select"): rows})
    monkeypatch.setattr(inspector, "get_supabase", lambda: db)
    login(OWNER)

    tasks = client.get("/inspector/assigned-tasks").json()
    assert [t["reference"] for t in tasks] == ["VIDA-C-0002", "VIDA-C-0005", "VIDA-C-0001", "VIDA-C-0003"]
    assert tasks[0]["is_overdue"] and tasks[0]["days_overdue"] == 2
    assert tasks[3]["resolved_late"] is True
    assert db.queries[0].filters["inspections.inspector_id"] == "owner"
    assert all(not any(k.startswith("reporter") for k in t) for t in tasks)
