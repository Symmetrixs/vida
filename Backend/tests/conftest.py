import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

load_dotenv(REPO_DIR / "Docker" / ".env")
os.environ.setdefault("MODEL_PATH", str(REPO_DIR / "Model"))
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from main import app


@pytest.fixture(scope="session")
def client():
    return TestClient(app)
