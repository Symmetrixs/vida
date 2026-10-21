import io

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from PIL import Image

import ai_detection
import auth
import public
from auth import get_current_user
from main import app

BUILDING_ID = "11111111-2222-3333-4444-555555555555"
COMPLAINT_ID = "99999999-8888-7777-6666-555555555555"


class FakeResult:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = {}

    def select(self, *args, **kwargs):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        return self.db.respond(self)


class FakeBucket:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def upload(self, path, data, options):
        self.db.uploads[(self.name, path)] = data

    def remove(self, paths):
        for path in paths:
            self.db.uploads.pop((self.name, path), None)


class FakeStorage:
    def __init__(self, db):
        self.db = db

    def from_(self, name):
        return FakeBucket(self.db, name)


class FakeSupabase:
    def __init__(self, recent=0, responses=None):
        self.recent = recent
        self.responses = responses or {}
        self.inserted = {}
        self.uploads = {}
        self.storage = FakeStorage(self)

    def table(self, name):
        return FakeQuery(self, name)

    def respond(self, query):
        key = (query.table, query.op)
        if query.op == "insert":
            rows = query.payload if isinstance(query.payload, list) else [query.payload]
            self.inserted.setdefault(query.table, []).extend(rows)
        if key in self.responses:
            return FakeResult(self.responses[key])
        if key == ("complaints", "select"):
            return FakeResult([], count=self.recent)
        if key == ("buildings", "select"):
            return FakeResult([{"id": query.filters.get("id")}])
        if key == ("complaints", "insert"):
            return FakeResult([{"id": COMPLAINT_ID, "ref_no": 42, **query.payload}])
        if query.op == "insert":
            return FakeResult(query.payload if isinstance(query.payload, list) else [query.payload])
        return FakeResult([])


def _image_bytes(fmt="JPEG", size=(64, 48), exif=False):
    buffer = io.BytesIO()
    image = Image.new("RGB", size, (120, 90, 60))
    if exif:
        data = Image.Exif()
        data[0x010F] = "TestCam"
        image.save(buffer, format=fmt, exif=data.tobytes())
    else:
        image.save(buffer, format=fmt)
    return buffer.getvalue()


def _solve(captcha):
    return str(sum(int(part) for part in captcha["question"].split("+")))


def _form(captcha, **overrides):
    data = {
        "building_id":    BUILDING_ID,
        "floor":          "Level 1",
        "location_note":  "Corridor near BK-12",
        "description":    "Large crack on the wall next to the door",
        "captcha_token":  captcha["token"],
        "captcha_answer": _solve(captcha),
    }
    data.update(overrides)
    return data


def _dependency_calls(dependant):
    calls = [dependant.call]
    for sub in dependant.dependencies:
        calls.extend(_dependency_calls(sub))
    return calls


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(public, "get_supabase", lambda: db)
    return db


def test_public_routes_never_require_login_or_run_ai():
    public_routes = [r for r in app.routes if isinstance(r, APIRoute) and r.path.startswith("/public")]
    assert {r.path for r in public_routes} == {"/public/buildings", "/public/captcha", "/public/complaints"}
    for route in public_routes:
        calls = _dependency_calls(route.dependant)
        assert get_current_user not in calls
        assert all(getattr(c, "__module__", "") != "ai_detection" for c in calls if c)


def test_complaint_inbox_rejects_inspectors(client):
    app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "role": "inspector"}
    try:
        assert client.get("/complaints/").status_code == 403
        assert client.post(f"/complaints/{COMPLAINT_ID}/reject", json={"reason": "Duplicate report"}).status_code == 403
        assert client.post(f"/complaints/{COMPLAINT_ID}/convert", json={"inspector_id": "u2"}).status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_captcha_accepts_once_and_burns_wrong_guesses(client):
    captcha = client.get("/public/captcha").json()
    assert public.verify_captcha(captcha["token"], _solve(captcha))
    with pytest.raises(HTTPException):
        public.verify_captcha(captcha["token"], _solve(captcha))

    other = public.issue_captcha()
    with pytest.raises(HTTPException):
        public.verify_captcha(other["token"], "0")
    with pytest.raises(HTTPException):
        public.verify_captcha(other["token"], _solve(other))


def test_clean_image_strips_exif_and_rejects_non_images():
    cleaned = public.clean_image(_image_bytes(exif=True))
    assert cleaned["content_type"] == "image/jpeg"
    with Image.open(io.BytesIO(cleaned["bytes"])) as image:
        assert len(image.getexif()) == 0

    for bad in (b"MZ\x90\x00 not really a jpeg", _image_bytes("GIF"), _image_bytes("PNG", size=(8000, 6000))):
        with pytest.raises(HTTPException) as err:
            public.clean_image(bad)
        assert err.value.status_code == 400


def test_submit_is_rate_limited(client, fake_db):
    fake_db.recent = 5
    captcha = public.issue_captcha()
    response = client.post("/public/complaints", data=_form(captcha), files=[("photos", ("a.jpg", _image_bytes(), "image/jpeg"))])
    assert response.status_code == 429
    assert "complaints" not in fake_db.inserted


def test_submit_rejects_honeypot_and_bad_photos(client, fake_db):
    jpeg = ("a.jpg", _image_bytes(), "image/jpeg")
    response = client.post("/public/complaints", data=_form(public.issue_captcha(), website="spam"), files=[("photos", jpeg)])
    assert response.status_code == 400

    response = client.post("/public/complaints", data=_form(public.issue_captcha()), files=[("photos", jpeg)] * 4)
    assert response.status_code == 400

    big = ("big.jpg", b"\xff" * (5 * 1024 * 1024 + 10), "image/jpeg")
    response = client.post("/public/complaints", data=_form(public.issue_captcha()), files=[("photos", big)])
    assert response.status_code == 413

    fake = ("fake.jpg", b"#!/bin/sh\necho hi\n", "image/jpeg")
    response = client.post("/public/complaints", data=_form(public.issue_captcha()), files=[("photos", fake)])
    assert response.status_code == 400
    assert "complaints" not in fake_db.inserted


def test_submit_stores_pending_complaint_without_ai(client, fake_db, monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("AI inference must not run on public submit")

    monkeypatch.setattr(ai_detection, "_run_inference", fail)
    monkeypatch.setattr(ai_detection, "_load_model", fail)
    files = [
        ("photos", ("a.jpg", _image_bytes(exif=True), "image/jpeg")),
        ("photos", ("b.png", _image_bytes("PNG"), "image/png")),
    ]
    response = client.post("/public/complaints", data=_form(public.issue_captcha(), reporter_email="someone@example.com"), files=files)
    assert response.status_code == 201
    assert response.json() == {"reference": "VIDA-C-0042", "status": "pending"}

    row = fake_db.inserted["complaints"][0]
    assert "status" not in row
    assert row["ip_hash"] != "testclient" and len(row["ip_hash"]) == 64
    assert len(fake_db.inserted["complaint_photos"]) == 2
    assert {bucket for bucket, _ in fake_db.uploads} == {"vida-complaints"}
    assert all(path.startswith(COMPLAINT_ID + "/") for _, path in fake_db.uploads)


def test_register_rejects_unknown_role(client):
    response = client.post("/auth/register", json={"name": "X", "email": "x@example.com", "password": "secret123", "role": "superuser"})
    assert response.status_code == 422


def test_facility_manager_signup_needs_approval(client, monkeypatch):
    db = FakeSupabase(responses={
        ("users", "select"): [],
        ("users", "insert"): [{"id": "u1", "name": "FM", "email": "fm@example.com", "role": "facility_manager"}],
    })
    monkeypatch.setattr(auth, "get_supabase", lambda: db)
    response = client.post("/auth/register", json={"name": "FM", "email": "fm@example.com", "password": "secret123", "role": "facility_manager"})
    assert response.status_code == 201
    assert response.json()["status"] == "pending"
    assert "access_token" not in response.json()
    assert db.inserted["users"][0]["is_approved"] is None

    pending_user = {
        "id": "u1", "name": "FM", "email": "fm@example.com", "role": "facility_manager",
        "password_hash": auth.hash_password("secret123"), "is_active": True, "is_approved": None,
    }
    login_db = FakeSupabase(responses={("users", "select"): pending_user})
    monkeypatch.setattr(auth, "get_supabase", lambda: login_db)
    response = client.post("/auth/login", json={"email": "fm@example.com", "password": "secret123"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Account pending approval"
