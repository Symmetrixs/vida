import pytest

import complaint
import finding
import group
import inspection
import photo
from auth import get_current_user
from fakes import FakeSupabase
from main import app

OWNER = {"id": "insp-a", "roles": ["inspector"], "name": "Aina"}
OTHER = {"id": "insp-b", "roles": ["inspector"], "name": "Badrul"}

WRITES = [
    ("put",    "/inspections/i1",          {"json": {"title": "New title"}}),
    ("post",   "/inspections/i1/submit",   {}),
    ("delete", "/inspections/i1",          {}),
    ("post",   "/photos/upload",           {"data": {"inspection_id": "i1"}, "files": [("file", ("a.jpg", b"jpeg", "image/jpeg"))]}),
    ("delete", "/photos/p1",               {}),
    ("post",   "/findings/",               {"json": {"inspection_id": "i1", "defect_type": "crack", "severity": "high"}}),
    ("put",    "/findings/f1",             {"json": {"notes": "Wider now"}}),
    ("post",   "/photos/p1/scan",          {}),
    ("delete", "/findings/f1",             {}),
    ("post",   "/groups/i1/save",          {"json": {"groups": []}}),
    ("delete", "/groups/i1",               {}),
    ("patch",  "/groups/group/g1",         {"json": {"name": "Stairwell"}}),
]


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _db(monkeypatch, severity):
    db = FakeSupabase(responses={
        ("inspections", "select"): [{"id": "i1", "inspector_id": "insp-a", "status": "submitted", "severity": severity}],
        ("inspections", "update"): lambda q: [{"id": "i1", **q.payload}],
        ("photos", "select"): [{"id": "p1", "inspection_id": "i1", "filename": "i1/a.jpg", "uploaded_by": "insp-a"}],
        ("findings", "select"): [{"id": "f1", "inspection_id": "i1"}],
        ("inspection_groups", "select"): [{"id": "g1", "inspection_id": "i1"}],
        ("repair_jobs", "select"): [],
    })
    for module in (inspection, photo, finding, group, complaint):
        monkeypatch.setattr(module, "get_supabase", lambda: db)
    return db


@pytest.mark.parametrize("method,path,kwargs", WRITES)
def test_reviewed_inspection_rejects_every_write(client, login, monkeypatch, method, path, kwargs):
    db = _db(monkeypatch, severity="high")
    login(OWNER)
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 409
    assert response.json()["detail"] == "This inspection has been reviewed and is locked"
    assert all(q.op == "select" for q in db.queries)


def test_unreviewed_inspection_stays_editable_for_its_owner(client, login, monkeypatch):
    db = _db(monkeypatch, severity=None)
    login(OWNER)
    assert client.put("/inspections/i1", json={"title": "New title"}).status_code == 200
    assert any(table == "inspections" and payload.get("title") == "New title" for table, payload, _ in db.updated)
    assert inspection.assert_editable(db, "i1", OWNER)["id"] == "i1"


def test_lock_does_not_replace_the_owner_check(client, login, monkeypatch):
    _db(monkeypatch, severity=None)
    login(OTHER)
    assert client.put("/inspections/i1", json={"title": "New title"}).status_code == 403
