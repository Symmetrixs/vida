import pytest
from PIL import Image

import ai_detection
import complaint
import finding
import inspection
import photo
from auth import get_current_user
from fakes import FakeSupabase
from main import app

OWNER = {"id": "insp-a", "roles": ["inspector"], "name": "Aina"}
CRACK = {"label": "crack", "score": 0.21, "severity": "low", "box": {"xmin": 10, "ymin": 10, "xmax": 110, "ymax": 60}}
MOLD = {"label": "mold", "score": 0.07, "severity": "low", "box": {"xmin": 200, "ymin": 200, "xmax": 260, "ymax": 280}}


@pytest.fixture
def login():
    def use(user):
        app.dependency_overrides[get_current_user] = lambda: user
    yield use
    app.dependency_overrides.pop(get_current_user, None)


def _db(monkeypatch, existing=None, photos=None, finding_row=None):
    def findings(query):
        if query.filters.get("source") == "ai":
            return existing or []
        if finding_row is not None:
            return [finding_row]
        return [{"id": "f-new", "photo_id": "p1", "created_by": "insp-a", "source": "ai"}]

    db = FakeSupabase(responses={
        ("inspections", "select"): [{"id": "i1", "inspector_id": "insp-a", "status": "draft", "severity": None}],
        ("inspections", "update"): lambda q: [{"id": "i1", **q.payload}],
        ("photos", "select"): photos if photos is not None else [{"id": "p1", "inspection_id": "i1", "filename": "i1/a.jpg"}],
        ("findings", "select"): findings,
        ("findings", "update"): lambda q: [{"id": "f1", **q.payload}],
        ("users", "select"): [{"id": "insp-a", "name": "Aina"}],
    })
    for module in (inspection, photo, finding, complaint):
        monkeypatch.setattr(module, "get_supabase", lambda: db)
    for module in (photo, finding, inspection):
        monkeypatch.setattr(module, "sync_complaint", lambda *a, **k: None)
    monkeypatch.setattr(inspection, "notify_inspection_submitted", lambda *a, **k: 0)
    return db


def _fake_model(monkeypatch, detections, size=(640, 480)):
    monkeypatch.setattr(photo, "open_image", lambda data: Image.new("RGB", size))
    monkeypatch.setattr(photo, "detect_image", lambda image, source: detections)


def test_box_iou_and_duplicates():
    box = CRACK["box"]
    assert ai_detection.box_iou(box, box) == pytest.approx(1.0)
    assert ai_detection.box_iou(box, MOLD["box"]) == 0.0
    assert ai_detection.box_iou(None, box) == 0.0
    near = {"xmin": 12, "ymin": 11, "xmax": 112, "ymax": 61}
    assert ai_detection.is_duplicate(CRACK, [{"defect_type": "crack", "bbox": near}])
    assert not ai_detection.is_duplicate(CRACK, [{"defect_type": "spalling", "bbox": near}])
    assert not ai_detection.is_duplicate(CRACK, [{"defect_type": "crack", "bbox": MOLD["box"]}])


def test_every_scan_logs_one_line_even_with_zero_detections(capsys):
    ai_detection.log_scan("photo=p1", [], 0.5)
    ai_detection.log_scan("photo=p2", [MOLD, CRACK], 1.234)
    lines = capsys.readouterr().out.strip().splitlines()
    assert len(lines) == 2
    assert lines[0].startswith("[AI] scan photo=p1 detections=0 top=none")
    assert "photo=p2 detections=2 top=crack:0.21,mold:0.07" in lines[1] and "time=1.23s" in lines[1]


def test_scan_saves_ai_findings_with_image_size_and_marks_photo(client, login, monkeypatch):
    db = _db(monkeypatch)
    _fake_model(monkeypatch, [CRACK, MOLD])
    login(OWNER)
    response = client.post("/photos/p1/scan")
    assert response.status_code == 200
    body = response.json()
    assert (body["detected"], body["added"], body["skipped"]) == (2, 2, 0)
    rows = db.inserted["findings"]
    assert {r["source"] for r in rows} == {"ai"}
    assert rows[0]["confidence"] == 0.21 and rows[0]["bbox"]["width"] == 640 and rows[0]["bbox"]["height"] == 480
    assert ("photos", {"scanned_at": body["scanned_at"]}, {"id": "p1"}) in db.updated


def test_rescan_skips_duplicates_including_dismissed(client, login, monkeypatch):
    existing = [{"id": "f1", "defect_type": "crack", "bbox": dict(CRACK["box"]), "dismissed_at": "2026-10-22T00:00:00+00:00"}]
    db = _db(monkeypatch, existing=existing)
    _fake_model(monkeypatch, [CRACK, MOLD])
    login(OWNER)
    body = client.post("/photos/p1/scan").json()
    assert (body["added"], body["skipped"]) == (1, 1)
    assert [r["defect_type"] for r in db.inserted["findings"]] == ["mold"]


def test_scan_with_zero_detections_still_counts_as_scanned(client, login, monkeypatch):
    db = _db(monkeypatch)
    _fake_model(monkeypatch, [])
    login(OWNER)
    body = client.post("/photos/p1/scan").json()
    assert body["detected"] == 0 and "findings" not in db.inserted
    assert any(t == "photos" and "scanned_at" in p for t, p, _ in db.updated)


def test_failed_scan_does_not_mark_the_photo(client, login, monkeypatch):
    db = _db(monkeypatch)
    monkeypatch.setattr(photo, "open_image", lambda data: Image.new("RGB", (10, 10)))

    def broken(image, source):
        raise ValueError("boom")

    monkeypatch.setattr(photo, "detect_image", broken)
    login(OWNER)
    assert client.post("/photos/p1/scan").status_code == 500
    assert db.updated == []


def test_submit_needs_every_photo_scanned(client, login, monkeypatch):
    photos = [{"id": "p1", "scanned_at": "2026-10-22T00:00:00+00:00"}, {"id": "p2", "scanned_at": None}]
    db = _db(monkeypatch, photos=photos)
    login(OWNER)
    response = client.post("/inspections/i1/submit")
    assert response.status_code == 409
    assert response.json()["detail"]["unscanned"] == ["p2"]
    assert "1 of 2 photo(s)" in response.json()["detail"]["msg"]
    assert not any(t == "inspections" for t, _, _ in db.updated)

    db = _db(monkeypatch, photos=[dict(p, scanned_at="2026-10-22T00:00:00+00:00") for p in photos])
    assert client.post("/inspections/i1/submit").status_code == 200
    assert any(t == "inspections" and p.get("status") == "submitted" for t, p, _ in db.updated)


def test_removing_an_ai_finding_keeps_it_as_dismissed(client, login, monkeypatch):
    db = _db(monkeypatch, finding_row={"id": "f1", "inspection_id": "i1", "source": "ai", "dismissed_at": None})
    login(OWNER)
    response = client.delete("/findings/f1")
    assert response.status_code == 200 and response.json()["dismissed"] is True
    table, payload, filters = db.updated[0]
    assert table == "findings" and payload["dismissed_by"] == "insp-a" and payload["dismissed_at"]
    assert not any(q.op == "delete" and q.table == "findings" for q in db.queries)


def test_removing_a_manual_finding_deletes_it(client, login, monkeypatch):
    db = _db(monkeypatch, finding_row={"id": "f1", "inspection_id": "i1", "source": "manual", "dismissed_at": None})
    login(OWNER)
    assert client.delete("/findings/f1").json()["dismissed"] is False
    assert any(q.op == "delete" and q.table == "findings" for q in db.queries)


def test_dismissed_findings_cannot_be_edited_again(client, login, monkeypatch):
    _db(monkeypatch, finding_row={"id": "f1", "inspection_id": "i1", "source": "ai", "dismissed_at": "2026-10-22T00:00:00+00:00"})
    login(OWNER)
    assert client.put("/findings/f1", json={"severity": "high"}).status_code == 404
    assert client.delete("/findings/f1").status_code == 404


def test_editing_records_who_and_validates_values(client, login, monkeypatch):
    db = _db(monkeypatch, finding_row={"id": "f1", "inspection_id": "i1", "source": "ai", "dismissed_at": None})
    login(OWNER)
    assert client.put("/findings/f1", json={"defect_type": "graffiti"}).status_code == 400
    response = client.put("/findings/f1", json={"defect_type": "spalling", "severity": "high"})
    assert response.status_code == 200
    payload = db.updated[-1][1]
    assert payload["edited_by"] == "insp-a" and payload["defect_type"] == "spalling"


def test_new_findings_from_the_api_are_always_manual(client, login, monkeypatch):
    db = _db(monkeypatch)
    login(OWNER)
    body = {"inspection_id": "i1", "defect_type": "crack", "severity": "high", "confidence": 0.9, "photo_id": "p1"}
    assert client.post("/findings/", json=body).status_code == 201
    row = db.inserted["findings"][0]
    assert row["source"] == "manual" and row["confidence"] is None and row["created_by"] == "insp-a"
