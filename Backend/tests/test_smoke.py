import io
import os
from pathlib import Path

import pytest
from PIL import Image

from auth import get_current_user
from main import app


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.skipif(
    not all(os.getenv(k) for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "VIDA_TEST_EMAIL", "VIDA_TEST_PASSWORD")),
    reason="Supabase credentials or VIDA_TEST_EMAIL/VIDA_TEST_PASSWORD not set",
)
def test_login(client):
    response = client.post(
        "/auth/login",
        json={"email": os.environ["VIDA_TEST_EMAIL"], "password": os.environ["VIDA_TEST_PASSWORD"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


@pytest.mark.skipif(
    not (Path(os.environ["MODEL_PATH"]) / "model.safetensors").exists(),
    reason="Model weights not present",
)
def test_detect(client):
    app.dependency_overrides[get_current_user] = lambda: {"id": "smoke-test", "role": "inspector"}
    try:
        buffer = io.BytesIO()
        Image.new("RGB", (320, 240), (128, 128, 128)).save(buffer, format="JPEG")
        buffer.seek(0)
        response = client.post("/ai/detect", files={"file": ("smoke.jpg", buffer, "image/jpeg")})
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["detections"], list)
    assert body["total_found"] == len(body["detections"])
