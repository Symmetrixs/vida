import io

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from PIL import Image
from starlette.requests import Request

import ai_detection
import public
from auth import get_current_user
from fakes import COMPLAINT_ID, FakeSupabase
from main import app

BUILDING_ID = "11111111-2222-3333-4444-555555555555"


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


def _form(**overrides):
    data = {
        "building_id":    BUILDING_ID,
        "floor":          "Floor 1",
        "location_note":  "Corridor near BK-12",
        "description":    "Large crack on the wall next to the door",
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
    assert {r.path for r in public_routes} == {"/public/buildings", "/public/buildings/{building_id}/rooms", "/public/complaints"}
    for route in public_routes:
        calls = _dependency_calls(route.dependant)
        assert get_current_user not in calls
        assert all(getattr(c, "__module__", "") != "ai_detection" for c in calls if c)


def test_complaint_inbox_rejects_inspectors(client):
    app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "roles": ["inspector"]}
    try:
        assert client.get("/complaints/").status_code == 403
        assert client.post(f"/complaints/{COMPLAINT_ID}/reject", json={"reason": "Duplicate report"}).status_code == 403
        assert client.post(f"/complaints/{COMPLAINT_ID}/convert", json={"inspector_id": "u2"}).status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_public_rooms_list_one_floor_without_login(client, fake_db):
    fake_db.responses[("building_rooms", "select")] = [{"id": "r1", "name": "BK15", "floor": "Floor 1", "sort_order": 0}]
    response = client.get(f"/public/buildings/{BUILDING_ID}/rooms", params={"floor": "Floor 1"})
    assert response.status_code == 200
    assert response.json()[0]["name"] == "BK15"
    query = fake_db.queries[-1]
    assert query.table == "building_rooms" and query.filters == {"building_id": BUILDING_ID, "floor": "Floor 1"}
    assert client.get("/public/buildings/not-a-uuid/rooms", params={"floor": "Floor 1"}).status_code == 400


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
    response = client.post("/public/complaints", data=_form(), files=[("photos", ("a.jpg", _image_bytes(), "image/jpeg"))])
    assert response.status_code == 429
    assert "complaints" not in fake_db.inserted


def _request(peer, real_ip=None):
    headers = [(b"x-real-ip", real_ip.encode())] if real_ip else []
    return Request({"type": "http", "client": (peer, 5000), "headers": headers})


def test_client_ip_trusts_the_header_only_from_nginx(monkeypatch):
    monkeypatch.setattr(public, "TRUSTED_PROXY_HOSTS", ["frontend"])
    monkeypatch.setattr(public, "_trusted_proxy_ips", lambda: {"172.18.0.3"})
    assert public.client_ip(_request("172.18.0.3", "203.0.113.7")) == "203.0.113.7"
    assert public.client_ip(_request("172.18.0.1", "203.0.113.7")) == "172.18.0.1"
    assert public.client_ip(_request("172.18.0.3")) == "172.18.0.3"

    monkeypatch.setattr(public, "TRUSTED_PROXY_HOSTS", [])
    assert public.client_ip(_request("172.18.0.3", "203.0.113.7")) == "172.18.0.3"


def test_submit_rejects_honeypot_and_bad_photos(client, fake_db):
    jpeg = ("a.jpg", _image_bytes(), "image/jpeg")
    response = client.post("/public/complaints", data=_form(website="spam"), files=[("photos", jpeg)])
    assert response.status_code == 400

    response = client.post("/public/complaints", data=_form(), files=[("photos", jpeg)] * 4)
    assert response.status_code == 400

    big = ("big.jpg", b"\xff" * (5 * 1024 * 1024 + 10), "image/jpeg")
    response = client.post("/public/complaints", data=_form(), files=[("photos", big)])
    assert response.status_code == 413

    fake = ("fake.jpg", b"#!/bin/sh\necho hi\n", "image/jpeg")
    response = client.post("/public/complaints", data=_form(), files=[("photos", fake)])
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
    response = client.post("/public/complaints", data=_form(reporter_email="someone@example.com"), files=files)
    assert response.status_code == 201
    assert response.json() == {"reference": "VIDA-C-0042", "status": "pending"}

    row = fake_db.inserted["complaints"][0]
    assert "status" not in row
    assert "captcha_nonce" not in row
    assert row["ip_hash"] != "testclient" and len(row["ip_hash"]) == 64
    assert len(fake_db.inserted["complaint_photos"]) == 2
    assert {bucket for bucket, _ in fake_db.uploads} == {"vida-complaints"}
    assert all(path.startswith(COMPLAINT_ID + "/") for _, path in fake_db.uploads)
