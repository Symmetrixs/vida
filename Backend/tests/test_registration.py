import pytest

import admin
import auth
from auth import get_current_user
from fakes import FakeSupabase
from main import app

ADMIN = {"id": "admin1", "roles": ["admin"], "name": "Admin"}
INSPECTOR = {"id": "insp-a", "roles": ["inspector"], "name": "Aina"}
FORM = {"name": "  Siti   Aminah ", "email": "Siti@Example.com", "employee_id": " E123 ", "password": "secret123"}


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


def _user(**overrides):
    row = {"id": "u1", "name": "Siti", "email": "siti@example.com", "password_hash": auth.hash_password("secret123"), "is_active": True}
    row.update(overrides)
    return row


def test_register_creates_a_pending_account_without_roles(client, monkeypatch):
    db = _use(monkeypatch, auth)
    response = client.post("/auth/register", json=FORM)
    assert response.status_code == 201 and response.json()["status"] == "pending"
    row = db.inserted["users"][0]
    assert row["status"] == "pending" and row["name"] == "Siti Aminah"
    assert row["email"] == "siti@example.com" and row["employee_id"] == "E123"
    assert row["password_hash"] != "secret123" and auth.verify_password("secret123", row["password_hash"])
    assert "user_roles" not in db.inserted


def test_register_refuses_duplicates_and_missing_fields(client, monkeypatch):
    db = _use(monkeypatch, auth, {("users", "select"): [{"id": "u0"}]})
    assert client.post("/auth/register", json=FORM).status_code == 400
    assert "users" not in db.inserted
    _use(monkeypatch, auth)
    assert client.post("/auth/register", json={**FORM, "employee_id": ""}).status_code == 422
    assert client.post("/auth/register", json={**FORM, "password": "short"}).status_code == 422
    assert client.post("/auth/register", json={**FORM, "roles": ["admin"]}).status_code == 201


@pytest.mark.parametrize("row, detail", [
    (_user(status="pending"), "Your account is waiting for admin approval"),
    (_user(status="rejected", reject_reason=None), "Your registration was rejected"),
    (_user(status="rejected", reject_reason="Not a staff member"), "Your registration was rejected. Reason: Not a staff member"),
])
def test_login_explains_pending_and_rejected_accounts(client, monkeypatch, row, detail):
    _use(monkeypatch, auth, {("users", "select"): [row], ("user_roles", "select"): [{"role": "inspector"}]})
    response = client.post("/auth/login", json={"email": "siti@example.com", "password": "secret123"})
    assert response.status_code == 403 and response.json()["detail"] == detail


def test_login_with_wrong_password_does_not_reveal_status(client, monkeypatch):
    _use(monkeypatch, auth, {("users", "select"): [_user(status="pending")]})
    response = client.post("/auth/login", json={"email": "siti@example.com", "password": "wrong-pass"})
    assert response.status_code == 401 and response.json()["detail"] == "Invalid credentials"


def test_pending_token_is_refused(client, monkeypatch):
    token = auth.create_access_token({"sub": "u1", "roles": ["inspector"]})
    _use(monkeypatch, auth, {("users", "select"): [_user(status="pending")], ("user_roles", "select"): [{"role": "inspector"}]})
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_admin_approves_with_roles(client, login, monkeypatch):
    pending = {"id": "u1", "name": "Siti", "status": "pending"}
    db = _use(monkeypatch, admin, {
        ("users", "select"): [pending],
        ("users", "update"): lambda q: [{**pending, **q.payload}],
    })
    login(ADMIN)
    assert client.post("/admin/users/u1/approve", json={"roles": []}).status_code == 422
    response = client.post("/admin/users/u1/approve", json={"roles": ["maintenance", "inspector"]})
    assert response.status_code == 200
    assert [r["role"] for r in db.inserted["user_roles"]] == ["inspector", "maintenance"]
    table, payload, filters = db.updated[0]
    assert table == "users" and payload["status"] == "approved" and payload["reviewed_by"] == "admin1"
    assert filters == {"id": "u1", "status": "pending"}


def test_admin_rejects_with_optional_reason(client, login, monkeypatch):
    pending = {"id": "u1", "name": "Siti", "status": "pending"}
    db = _use(monkeypatch, admin, {("users", "select"): [pending], ("users", "update"): [pending]})
    login(ADMIN)
    response = client.post("/admin/users/u1/reject", json={"reason": "  "})
    assert response.status_code == 200 and response.json()["reject_reason"] is None
    response = client.post("/admin/users/u1/reject", json={"reason": "Not a staff member"})
    assert response.json()["reject_reason"] == "Not a staff member"
    assert db.updated[-1][1]["status"] == "rejected"
    assert "user_roles" not in db.inserted


def test_handled_registrations_cannot_be_approved_twice(client, login, monkeypatch):
    _use(monkeypatch, admin, {("users", "select"): [{"id": "u1", "status": "approved"}]})
    login(ADMIN)
    assert client.post("/admin/users/u1/approve", json={"roles": ["inspector"]}).status_code == 409
    assert client.post("/admin/users/u1/reject", json={}).status_code == 409


def test_only_admins_approve(client, login, monkeypatch):
    _use(monkeypatch, admin, {("users", "select"): [{"id": "u1", "status": "pending"}]})
    login(INSPECTOR)
    assert client.post("/admin/users/u1/approve", json={"roles": ["inspector"]}).status_code == 403
    assert client.post("/admin/users/u1/reject", json={}).status_code == 403


def test_admin_created_accounts_are_approved(client, login, monkeypatch):
    db = _use(monkeypatch, admin, {("users", "insert"): lambda q: [{"id": "u9", **q.payload}]})
    login(ADMIN)
    response = client.post("/admin/users", json={"name": "Lee", "email": "lee@example.com", "password": "secret123", "roles": ["inspector"]})
    assert response.status_code == 201 and response.json()["status"] == "approved"
    assert db.inserted["users"][0]["status"] == "approved"
