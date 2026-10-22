import io
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt
from PIL import Image

import admin
import auth
import complaint
import inspection
import notification
import report
import vessel
from auth import get_current_user
from fakes import FakeSupabase
from main import app
from public import format_inspection_reference

INSPECTOR = {"id": "insp-a", "roles": ["inspector"], "name": "Aina"}
OTHER = {"id": "insp-b", "roles": ["inspector"], "name": "Badrul"}
ADMIN = {"id": "admin1", "roles": ["admin"], "name": "Admin"}
FM = {"id": "fm1", "roles": ["facility_manager"], "name": "Farah"}
MAINT = {"id": "m1", "roles": ["maintenance"], "name": "Mazlan"}
ADMIN_INSPECTOR = {"id": "admin2", "roles": ["inspector", "admin"], "name": "Hybrid"}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _use(monkeypatch, module, responses=None):
    db = FakeSupabase(responses=responses or {})
    monkeypatch.setattr(module, "get_supabase", lambda: db)
    return db


def test_has_any_role():
    assert auth.has_any_role(ADMIN_INSPECTOR, "inspector")
    assert auth.has_any_role(ADMIN_INSPECTOR, "facility_manager", "admin")
    assert not auth.has_any_role(ADMIN, "inspector")
    assert not auth.has_any_role(FM, "admin", "inspector")
    assert not auth.has_any_role({"id": "x"}, "inspector")
    assert not auth.has_any_role(None, "inspector")


def test_login_returns_ordered_roles_and_puts_them_in_the_token(client, monkeypatch):
    user = {"id": "u1", "name": "Hybrid", "email": "h@example.com", "password_hash": auth.hash_password("secret123"), "is_active": True}
    _use(monkeypatch, auth, {("users", "select"): [user], ("user_roles", "select"): [{"role": "admin"}, {"role": "inspector"}]})
    response = client.post("/auth/login", json={"email": "h@example.com", "password": "secret123"})
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["roles"] == ["inspector", "admin"]
    assert "role" not in body["user"] and "password_hash" not in body["user"]
    claims = jwt.decode(body["access_token"], auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    assert claims["sub"] == "u1" and claims["roles"] == ["inspector", "admin"]


def test_login_refuses_accounts_without_roles_or_deactivated(client, monkeypatch):
    user = {"id": "u1", "name": "N", "email": "n@example.com", "password_hash": auth.hash_password("secret123"), "is_active": True}
    _use(monkeypatch, auth, {("users", "select"): [user], ("user_roles", "select"): []})
    response = client.post("/auth/login", json={"email": "n@example.com", "password": "secret123"})
    assert response.status_code == 403 and "No roles" in response.json()["detail"]

    _use(monkeypatch, auth, {("users", "select"): [dict(user, is_active=False)], ("user_roles", "select"): [{"role": "admin"}]})
    response = client.post("/auth/login", json={"email": "n@example.com", "password": "secret123"})
    assert response.status_code == 403 and response.json()["detail"] == "Account deactivated"


def test_self_registration_and_approval_endpoints_are_gone(client, login):
    assert client.post("/auth/register", json={"name": "X", "email": "x@example.com", "password": "secret123"}).status_code == 404
    login(ADMIN)
    assert client.get("/admin/pending-approvals").status_code == 404
    assert client.patch("/admin/users/u1/approve").status_code in (404, 405)


def test_current_user_roles_come_from_the_database_not_the_token(client, monkeypatch):
    token = auth.create_access_token({"sub": "u1", "roles": ["admin"]})
    headers = {"Authorization": f"Bearer {token}"}
    row = {"id": "u1", "name": "N", "email": "n@example.com", "password_hash": "x", "is_active": True}

    _use(monkeypatch, auth, {("users", "select"): [row], ("user_roles", "select"): [{"role": "inspector"}]})
    body = client.get("/auth/me", headers=headers).json()
    assert body["roles"] == ["inspector"] and "password_hash" not in body
    assert client.get("/admin/users", headers=headers).status_code == 403

    _use(monkeypatch, auth, {("users", "select"): [dict(row, is_active=False)], ("user_roles", "select"): [{"role": "admin"}]})
    assert client.get("/auth/me", headers=headers).status_code == 401

    reset = auth.create_access_token({"sub": "u1", "purpose": "reset"})
    _use(monkeypatch, auth, {("users", "select"): [row], ("user_roles", "select"): [{"role": "admin"}]})
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {reset}"}).status_code == 401


@pytest.mark.parametrize("user, expected", [(INSPECTOR, 201), (ADMIN_INSPECTOR, 201), (ADMIN, 403), (FM, 403), (MAINT, 403)])
def test_only_inspectors_create_inspections(client, login, monkeypatch, user, expected):
    db = _use(monkeypatch, inspection, {("inspections", "insert"): [{"id": "i1", "ref_no": 7, "inspector_id": user["id"]}]})
    login(user)
    response = client.post("/inspections/", json={"title": "Block A", "building_id": "b1"})
    assert response.status_code == expected
    if expected == 201:
        assert response.json()["reference"] == "VIDA-I-0007"
        assert db.inserted["inspections"][0]["inspector_id"] == user["id"]
    else:
        assert "inspections" not in db.inserted


def test_my_inspections_lists_only_my_own_with_numbers(client, login, monkeypatch):
    rows = [
        {"id": "i1", "ref_no": 1, "inspector_id": "admin2", "users": {"name": "Hybrid"}, "complaints": [{"ref_no": 3}]},
        {"id": "i2", "ref_no": 12, "inspector_id": "admin2", "users": {"name": "Hybrid"}, "complaints": []},
    ]
    db = _use(monkeypatch, inspection, {("inspections", "select"): rows})
    login(ADMIN_INSPECTOR)
    body = client.get("/inspections/").json()
    assert db.queries[0].filters == {"inspector_id": "admin2"}
    assert [(r["reference"], r["complaint_reference"]) for r in body] == [("VIDA-I-0001", "VIDA-C-0003"), ("VIDA-I-0012", None)]
    assert all("complaints" not in r for r in body)

    for user in (ADMIN, FM):
        login(user)
        assert client.get("/inspections/").status_code == 403


def test_managers_read_any_inspection_but_only_the_owner_changes_it(client, login, monkeypatch):
    monkeypatch.setattr(inspection, "mark_started", lambda *a, **k: None)
    monkeypatch.setattr(inspection, "sync_complaint", lambda *a, **k: None)
    _use(monkeypatch, inspection, {
        ("inspections", "select"): [{"id": "i1", "ref_no": 4, "inspector_id": "insp-a", "status": "draft"}],
        ("inspections", "update"): [{"id": "i1"}],
    })
    for user, expected in ((INSPECTOR, 200), (FM, 200), (ADMIN, 200), (OTHER, 403), (MAINT, 403)):
        login(user)
        assert client.get("/inspections/i1").status_code == expected

    login(FM)
    assert client.get("/inspections/i1").json()["is_mine"] is False
    for user in (FM, ADMIN, OTHER):
        login(user)
        assert client.put("/inspections/i1", json={"remarks": "x"}).status_code == 403
        assert client.delete("/inspections/i1").status_code == 403
    login(INSPECTOR)
    assert client.put("/inspections/i1", json={"remarks": "x"}).status_code == 200


def test_owner_who_lost_the_inspector_role_cannot_edit(client, login, monkeypatch):
    _use(monkeypatch, inspection, {("inspections", "select"): [{"id": "i1", "inspector_id": "fm1", "status": "draft"}]})
    login(FM)
    assert client.put("/inspections/i1", json={"remarks": "x"}).status_code == 403


def test_my_reports_and_all_reports(client, login, monkeypatch):
    rows = [{"id": "r1", "created_by": "insp-a", "created_at": datetime.now(timezone.utc).isoformat(), "inspections": {"ref_no": 9}}]
    db = _use(monkeypatch, report, {("reports", "select"): rows})

    login(INSPECTOR)
    body = client.get("/reports/").json()
    assert db.queries[-1].filters == {"created_by": "insp-a"}
    assert body[0]["inspection_reference"] == "VIDA-I-0009" and body[0]["locked"] is False
    assert client.get("/reports/all").status_code == 403

    for user in (FM, ADMIN):
        login(user)
        assert client.get("/reports/").status_code == 403
        response = client.get("/reports/all")
        assert response.status_code == 200 and len(response.json()) == 1
        assert db.queries[-1].filters == {}


def test_report_visibility_and_editing(client, login, monkeypatch):
    row = {"id": "r1", "created_by": "insp-a", "created_at": datetime.now(timezone.utc).isoformat(), "inspection_id": "i1", "status": "draft"}

    _use(monkeypatch, report, {("reports", "select"): [row], ("shared_reports", "select"): []})
    for user, expected in ((INSPECTOR, 200), (FM, 200), (ADMIN, 200), (OTHER, 403)):
        login(user)
        assert client.get("/reports/r1").status_code == expected

    _use(monkeypatch, report, {("reports", "select"): [row], ("shared_reports", "select"): [{"id": "s1"}]})
    login(OTHER)
    response = client.get("/reports/r1")
    assert response.status_code == 200 and response.json()["is_mine"] is False

    _use(monkeypatch, report, {("reports", "select"): [row], ("reports", "update"): [row]})
    for user in (ADMIN, FM, OTHER):
        login(user)
        assert client.put("/reports/r1", json={"title": "x"}).status_code == 403
        assert client.post("/reports/r1/publish").status_code == 403
        assert client.delete("/reports/r1").status_code == 403
    login(INSPECTOR)
    assert client.put("/reports/r1", json={"title": "x"}).status_code == 200

    old = dict(row, created_at=(datetime.now(timezone.utc) - timedelta(days=5)).isoformat())
    _use(monkeypatch, report, {("reports", "select"): [old]})
    assert client.put("/reports/r1", json={"title": "x"}).status_code == 403


def test_sharing_is_by_the_author_to_inspectors_only(client, login, monkeypatch):
    published = {"id": "r1", "status": "published", "created_by": "insp-a"}
    responses = {
        ("reports", "select"): [published],
        ("shared_reports", "select"): [],
        ("user_roles", "select"): [{"user_id": "insp-a"}, {"user_id": "insp-b"}],
        ("users", "select"): [{"id": "insp-a", "name": "Aina"}, {"id": "insp-b", "name": "Badrul"}],
    }
    db = _use(monkeypatch, report, responses)
    login(INSPECTOR)
    assert [u["id"] for u in client.get("/reports/shareable-users").json()] == ["insp-b"]
    assert client.post("/reports/share", json={"report_id": "r1", "user_ids": ["admin1"]}).status_code == 400
    assert client.post("/reports/share", json={"report_id": "r1", "user_ids": ["insp-b"]}).json() == {"shared": 1}
    assert db.inserted["shared_reports"][0]["shared_to_user_id"] == "insp-b"

    login(OTHER)
    assert client.post("/reports/share", json={"report_id": "r1", "user_ids": ["insp-a"]}).status_code == 403
    login(ADMIN)
    assert client.get("/reports/shared-with-me").status_code == 403


def test_complaints_inbox_is_facility_manager_only(client, login, monkeypatch):
    _use(monkeypatch, complaint, {("complaints", "select"): []})
    for user, expected in ((FM, 200), (ADMIN, 403), (INSPECTOR, 403), (ADMIN_INSPECTOR, 403)):
        login(user)
        assert client.get("/complaints/").status_code == expected
        assert client.get("/complaints/assignees").status_code == expected
    login(ADMIN)
    assert client.post("/complaints/c1/reject", json={"reason": "Duplicate report"}).status_code == 403
    assert client.post("/complaints/c1/convert", json={"inspector_id": "insp-a"}).status_code == 403
    assert client.get("/complaints/c1").status_code == 403


def test_assignees_and_conversion_use_the_inspector_role(client, login, monkeypatch):
    db = _use(monkeypatch, complaint, {
        ("user_roles", "select"): [{"user_id": "insp-a"}],
        ("users", "select"): [{"id": "insp-a", "name": "Aina", "email": "a@example.com"}],
    })
    login(FM)
    assert client.get("/complaints/assignees").json() == [{"id": "insp-a", "name": "Aina", "email": "a@example.com"}]
    roles_query = next(q for q in db.queries if q.table == "user_roles")
    assert roles_query.table == "user_roles"

    _use(monkeypatch, complaint, {("user_roles", "select"): []})
    response = client.post("/complaints/c1/convert", json={"inspector_id": "fm1"})
    assert response.status_code == 400 and response.json()["detail"] == "Choose an active inspector"


def test_buildings_and_broadcasts_are_admin_only(client, login, monkeypatch):
    _use(monkeypatch, vessel, {("buildings", "select"): []})
    building = {"name": "FTMK", "code": "FTMK-NEW", "location": "Main campus"}
    for user, expected in ((FM, 403), (INSPECTOR, 403), (ADMIN, 201)):
        login(user)
        assert client.post("/buildings/", json=building).status_code == expected
    login(INSPECTOR)
    assert client.get("/buildings/").status_code == 200

    _use(monkeypatch, notification, {("user_roles", "select"): [{"user_id": "insp-a"}], ("users", "select"): [{"id": "insp-a"}]})
    message = {"target_role": "inspector", "title": "Hi", "message": "Hello"}
    login(FM)
    assert client.post("/notifications/", json=message).status_code == 403
    login(ADMIN)
    assert client.post("/notifications/", json=message).json() == {"sent": 1}
    assert client.post("/notifications/", json=dict(message, target_role="superuser")).status_code == 400


def test_detection_needs_the_inspector_role(client, login):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, format="JPEG")
    login(ADMIN)
    assert client.post("/ai/detect", files={"file": ("a.jpg", buffer.getvalue(), "image/jpeg")}).status_code == 403


def test_inspection_reference_format():
    assert format_inspection_reference(1) == "VIDA-I-0001"
    assert format_inspection_reference(12345) == "VIDA-I-12345"


def test_admin_creates_staff_with_roles(client, login, monkeypatch):
    db = _use(monkeypatch, admin, {("users", "select"): [], ("users", "insert"): [{"id": "new1", "name": "Siti", "email": "siti@example.com"}]})
    payload = {"name": "Siti", "email": "Siti@Example.com", "password": "temporary1", "roles": ["admin", "inspector"]}

    for user in (FM, INSPECTOR):
        login(user)
        assert client.post("/admin/users", json=payload).status_code == 403

    login(ADMIN)
    for bad in ({**payload, "roles": []}, {**payload, "roles": ["superuser"]}, {**payload, "password": "short"}):
        assert client.post("/admin/users", json=bad).status_code == 422

    response = client.post("/admin/users", json=payload)
    assert response.status_code == 201
    assert response.json()["roles"] == ["inspector", "admin"]
    created = db.inserted["users"][0]
    assert created["email"] == "siti@example.com" and created["password_hash"] != "temporary1"
    assert "role" not in created and "is_approved" not in created
    grants = db.inserted["user_roles"]
    assert {(g["user_id"], g["role"], g["granted_by"]) for g in grants} == {("new1", "inspector", "admin1"), ("new1", "admin", "admin1")}

    _use(monkeypatch, admin, {("users", "select"): [{"id": "someone"}]})
    assert client.post("/admin/users", json=payload).status_code == 400


def test_admin_replaces_roles_and_deactivates(client, login, monkeypatch):
    target = {"id": "u2", "name": "Bob", "email": "b@example.com", "is_active": True}
    db = _use(monkeypatch, admin, {("users", "select"): [target], ("user_roles", "select"): [{"user_id": "u2", "role": "inspector"}]})
    login(ADMIN)
    response = client.put("/admin/users/u2", json={"roles": ["facility_manager", "maintenance"], "is_active": False})
    assert response.status_code == 200
    assert response.json()["roles"] == ["maintenance", "facility_manager"] and response.json()["is_active"] is False
    assert {r["role"] for r in db.inserted["user_roles"]} == {"maintenance", "facility_manager"}
    deletes = [q for q in db.queries if q.table == "user_roles" and q.op == "delete"]
    assert len(deletes) == 1 and deletes[0].filters == {"user_id": "u2"}
    assert any(t == "users" and p.get("is_active") is False for t, p, _ in db.updated)


def test_admins_cannot_lock_themselves_or_everyone_out(client, login, monkeypatch):
    me = {"id": "admin1", "name": "Admin", "email": "a@example.com", "is_active": True}
    _use(monkeypatch, admin, {("users", "select"): [me], ("user_roles", "select"): [{"user_id": "admin1", "role": "admin"}]})
    login(ADMIN)
    assert client.put("/admin/users/admin1", json={"roles": ["inspector"]}).status_code == 400
    assert client.put("/admin/users/admin1", json={"is_active": False}).status_code == 400
    assert client.delete("/admin/users/admin1").status_code == 400

    last = {"id": "u9", "name": "Last", "email": "l@example.com", "is_active": True}
    db = _use(monkeypatch, admin, {("users", "select"): [last], ("user_roles", "select"): [{"user_id": "u9", "role": "admin"}]})
    response = client.put("/admin/users/u9", json={"roles": ["inspector"]})
    assert response.status_code == 400 and response.json()["detail"] == "At least one active admin must remain"
    assert db.updated == [] and "user_roles" not in db.inserted

    monkeypatch.setattr(admin, "users_with_roles", lambda supabase, roles, columns="id": [{"id": "u9"}, {"id": "admin1"}])
    assert client.put("/admin/users/u9", json={"roles": ["inspector"]}).status_code == 200
