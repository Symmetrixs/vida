import os
import uuid
from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field
from supabase import create_client, Client

from ai_detection import DEFECT_CLASSES, count_labels, scan_image_bytes
from auth import MANAGER_ROLES, active_user_with_role, get_current_user, has_any_role, require_roles, users_with_roles
from complaint import SEVERITIES, complaint_snapshot, today_myt
from inspection import first_embed, review_shape
from photo import ALLOWED_TYPES, MAX_FILE_SIZE
from public import format_inspection_reference, format_reference, format_repair_reference

router = APIRouter()

PHOTO_BUCKET = os.getenv("STORAGE_BUCKET", "vida-photos")
MAX_PHOTOS_PER_ROUND = 10
ACTIVE_STATUSES = ("in_progress", "awaiting_review")
JOB_STATUSES = ("open", "in_progress", "awaiting_review", "done")
JOB_COLUMNS = (
    "*, worker:users!assigned_to(name), "
    "inspections(id, ref_no, title, severity, floor_level, area_inspected, buildings(name, code), complaints(ref_no))"
)
INSPECTION_DETAIL_COLUMNS = (
    "id, ref_no, title, description, remarks, inspection_date, weather_condition, floor_level, area_inspected, "
    "severity, severity_note, assessed_at, buildings(name, code), users!inspector_id(name), assessor:users!assessed_by(name)"
)
CANDIDATE_COLUMNS = (
    "id, ref_no, title, floor_level, area_inspected, submitted_at, severity, severity_note, assessed_at, "
    "buildings(name, code), users!inspector_id(name), assessor:users!assessed_by(name), complaints(ref_no), repair_jobs(id, ref_no, status)"
)
EVENT_COLUMNS = "*, actor:users!actor_id(name), from_worker:users!from_user(name), to_worker:users!to_user(name)"

require_manager = require_roles("facility_manager")
require_reader = require_roles(*MANAGER_ROLES)
require_maintenance = require_roles("maintenance")


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


class CreateBody(BaseModel):
    inspection_id: str
    worker_id: Optional[str] = None
    due_date: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=2000)


class AssignBody(BaseModel):
    worker_id: str
    due_date: Optional[date] = None


class ReassignBody(BaseModel):
    worker_id: str
    reason: str = Field(max_length=500)
    due_date: Optional[date] = None


class ReasonBody(BaseModel):
    reason: str = Field(max_length=500)


class ApproveBody(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


class NotesBody(BaseModel):
    notes: str = Field(default="", max_length=2000)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _required_text(value: str, what: str) -> str:
    text = (value or "").strip()
    if len(text) < 5:
        raise HTTPException(status_code=422, detail=f"{what} must be at least 5 characters")
    return text


def _check_due(due_date: Optional[date]) -> Optional[str]:
    if due_date and due_date < today_myt():
        raise HTTPException(status_code=400, detail="Due date cannot be in the past")
    return due_date.isoformat() if due_date else None


def _worker(supabase: Client, worker_id: str) -> dict:
    worker = active_user_with_role(supabase, worker_id, "maintenance")
    if not worker:
        raise HTTPException(status_code=400, detail="Choose an active maintenance worker")
    return worker


def overdue_info(job: dict, today: Optional[date] = None) -> tuple:
    if not job.get("due_date") or job.get("status") != "in_progress":
        return False, 0
    days = ((today or today_myt()) - date.fromisoformat(job["due_date"])).days
    return days > 0, max(days, 0)


def shape_job(row: dict) -> dict:
    inspection = row.pop("inspections", None) or {}
    complaint = first_embed(inspection.pop("complaints", None))
    row["reference"] = format_repair_reference(row["ref_no"])
    row["inspection_reference"] = format_inspection_reference(inspection["ref_no"]) if inspection.get("ref_no") else None
    row["complaint_reference"] = format_reference(complaint["ref_no"]) if complaint else None
    row["inspection"] = inspection
    row["worker_name"] = (row.pop("worker", None) or {}).get("name")
    row["is_overdue"], row["days_overdue"] = overdue_info(row)
    row["is_rework"] = (row.get("rework_count") or 0) > 0
    return row


def _load_job(supabase: Client, job_id: str, columns: str = "*") -> dict:
    try:
        rows = supabase.table("repair_jobs").select(columns).eq("id", job_id).execute().data
    except APIError as e:
        if e.code != "22P02":
            raise
        rows = None
    if not rows:
        raise HTTPException(status_code=404, detail="Repair job not found")
    return rows[0]


def can_view(job: dict, user: dict) -> bool:
    if has_any_role(user, *MANAGER_ROLES):
        return True
    if not has_any_role(user, "maintenance"):
        return False
    return job["status"] == "open" or job.get("assigned_to") == user["id"]


def is_worker(job: dict, user: dict) -> bool:
    return has_any_role(user, "maintenance") and bool(job.get("assigned_to")) and job["assigned_to"] == user["id"]


def _assert_worker(job: dict, user: dict) -> None:
    if not is_worker(job, user):
        raise HTTPException(status_code=403, detail="This job is not assigned to you")
    if job["status"] != "in_progress":
        raise HTTPException(status_code=409, detail="This job is not open for work")


def _assert_not_own(job: dict, user: dict) -> None:
    if job.get("assigned_to") == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot review your own repair work")


def _transition(supabase: Client, job: dict, updates: dict, conflict: str = "This repair job was changed by someone else. Reload and try again.") -> dict:
    query = (
        supabase.table("repair_jobs")
        .update({**updates, "updated_at": _now()})
        .eq("id", job["id"])
        .eq("status", job["status"])
    )
    if job.get("assigned_to"):
        query = query.eq("assigned_to", job["assigned_to"])
    else:
        query = query.is_("assigned_to", "null")
    rows = query.execute().data
    if not rows:
        raise HTTPException(status_code=409, detail=conflict)
    return rows[0]


def _log(supabase: Client, job: dict, event: str, actor: dict, round_no: int, **extra) -> None:
    supabase.table("repair_job_events").insert({
        "job_id":     job["id"],
        "event":      event,
        "actor_id":   actor["id"],
        "round":      round_no,
        "created_at": _now(),
        **extra,
    }).execute()


def _notify(supabase: Client, user_ids, title: str, message: str, link: str, kind: str = "info") -> int:
    ids = [u for u in dict.fromkeys(user_ids) if u]
    if not ids:
        return 0
    now = _now()
    try:
        supabase.table("notifications").insert([{
            "user_id":    user_id,
            "title":      title,
            "message":    message,
            "type":       kind,
            "link":       link,
            "is_read":    False,
            "created_at": now,
        } for user_id in ids]).execute()
        return len(ids)
    except Exception as e:
        print(f"[VIDA] repair notification failed: {e}")
        return 0


def _job_link(job_id: str) -> str:
    return f"/jobs/{job_id}"


def _label(supabase: Client, job: dict) -> str:
    reference = format_repair_reference(job["ref_no"])
    rows = supabase.table("inspections").select("ref_no").eq("id", job["inspection_id"]).execute().data or []
    return f"{reference} (inspection {format_inspection_reference(rows[0]['ref_no'])})" if rows and rows[0].get("ref_no") else reference


def _scan_inspection(supabase: Client, inspection_id: str) -> Optional[dict]:
    photos = supabase.table("photos").select("id, filename").eq("inspection_id", inspection_id).execute().data or []
    bucket = supabase.storage.from_(PHOTO_BUCKET)
    counts = {}
    try:
        for photo in photos:
            if not photo.get("filename"):
                continue
            for label, n in count_labels(scan_image_bytes(bucket.download(photo["filename"]), f"photo={photo.get('id')} before-job")).items():
                counts[label] = counts.get(label, 0) + n
    except Exception as e:
        print(f"[VIDA] before scan failed for inspection {inspection_id}: {e}")
        return None
    return counts


def _photo_view(photo: dict) -> dict:
    detections = photo.pop("detections", None)
    photo["scanned"] = photo.get("scanned_at") is not None
    photo["total"] = len(detections or [])
    photo["counts"] = count_labels(detections)
    return photo


def comparison(before: Optional[dict], findings: list, after_photos: list) -> list:
    finding_counts = {}
    for f in findings:
        finding_counts[f.get("defect_type")] = finding_counts.get(f.get("defect_type"), 0) + 1
    after = {}
    for photo in after_photos:
        for label, n in (photo.get("counts") or {}).items():
            after[label] = after.get(label, 0) + n
    return [{
        "label":    label,
        "findings": finding_counts.get(label, 0),
        "before":   (before or {}).get(label, 0),
        "after":    after.get(label, 0),
    } for label in DEFECT_CLASSES]


def _list(query) -> list:
    return [shape_job(row) for row in (query.execute().data or [])]


@router.get("/candidates")
def list_candidates(manager: dict = Depends(require_manager)):
    supabase = get_supabase()
    rows = (
        supabase.table("inspections")
        .select(CANDIDATE_COLUMNS)
        .eq("status", "submitted")
        .order("assessed_at", desc=True)
        .execute()
        .data
        or []
    )
    ready = [review_shape(row) for row in rows if row.get("severity")]
    ready = [row for row in ready if not row["repair_job"]]
    ready.sort(key=lambda r: SEVERITIES.index(r["severity"]) if r["severity"] in SEVERITIES else -1, reverse=True)
    return ready


@router.get("/staff")
def list_staff(manager: dict = Depends(require_manager)):
    supabase = get_supabase()
    workers = users_with_roles(supabase, ("maintenance",), "id, name, email")
    ids = [w["id"] for w in workers]
    jobs = []
    if ids:
        jobs = (
            supabase.table("repair_jobs")
            .select("assigned_to, assignment_type, status, due_date")
            .in_("assigned_to", ids)
            .execute()
            .data
            or []
        )
    for worker in workers:
        mine = [j for j in jobs if j.get("assigned_to") == worker["id"]]
        working = [j for j in mine if j["status"] == "in_progress"]
        worker["assigned"] = len([j for j in working if j.get("assignment_type") == "assigned"])
        worker["claimed"] = len([j for j in working if j.get("assignment_type") == "claimed"])
        worker["awaiting_review"] = len([j for j in mine if j["status"] == "awaiting_review"])
        worker["done"] = len([j for j in mine if j["status"] == "done"])
        worker["overdue"] = len([j for j in working if overdue_info(j)[0]])
        worker["active"] = len(working) + worker["awaiting_review"]
    return workers


@router.get("/")
def list_jobs(status: Optional[Literal["open", "in_progress", "awaiting_review", "done"]] = Query(None), reader: dict = Depends(require_reader)):
    query = get_supabase().table("repair_jobs").select(JOB_COLUMNS).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    return _list(query)


@router.get("/board")
def job_board(worker: dict = Depends(require_maintenance)):
    return _list(get_supabase().table("repair_jobs").select(JOB_COLUMNS).eq("status", "open").order("created_at"))


@router.get("/mine")
def my_jobs(type: Literal["assigned", "claimed"] = Query(...), worker: dict = Depends(require_maintenance)):
    query = (
        get_supabase().table("repair_jobs")
        .select(JOB_COLUMNS)
        .eq("assigned_to", worker["id"])
        .eq("assignment_type", type)
        .order("updated_at", desc=True)
    )
    return _list(query)


@router.post("/", status_code=201)
def create_job(body: CreateBody, manager: dict = Depends(require_manager)):
    if body.due_date and not body.worker_id:
        raise HTTPException(status_code=400, detail="Set a due date only when assigning a worker")
    due_date = _check_due(body.due_date)
    supabase = get_supabase()
    rows = supabase.table("inspections").select("id, ref_no, status, severity").eq("id", body.inspection_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Inspection not found")
    inspection = rows[0]
    if inspection["status"] != "submitted" or not inspection.get("severity"):
        raise HTTPException(status_code=400, detail="Only inspections with a severity set by a facility manager can become repair jobs")
    if supabase.table("repair_jobs").select("id").eq("inspection_id", body.inspection_id).execute().data:
        raise HTTPException(status_code=409, detail="This inspection already has a repair job")
    worker = _worker(supabase, body.worker_id) if body.worker_id else None

    now = _now()
    record = {
        "inspection_id":   body.inspection_id,
        "status":          "in_progress" if worker else "open",
        "assigned_to":     worker["id"] if worker else None,
        "assignment_type": "assigned" if worker else None,
        "due_date":        due_date,
        "before_counts":   _scan_inspection(supabase, body.inspection_id),
        "created_by":      manager["id"],
        "created_at":      now,
        "updated_at":      now,
    }
    try:
        job = supabase.table("repair_jobs").insert(record).execute().data[0]
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status_code=409, detail="This inspection already has a repair job")
        raise

    events = [{"job_id": job["id"], "event": "created", "actor_id": manager["id"], "note": (body.note or "").strip() or None, "round": 1, "created_at": now}]
    if worker:
        events.append({"job_id": job["id"], "event": "assigned", "actor_id": manager["id"], "to_user": worker["id"], "round": 1, "created_at": now})
    try:
        supabase.table("repair_job_events").insert(events).execute()
    except Exception:
        supabase.table("repair_jobs").delete().eq("id", job["id"]).execute()
        raise HTTPException(status_code=500, detail="Could not create the repair job")

    reference = format_repair_reference(job["ref_no"])
    if worker:
        due_text = f" Due by {body.due_date.strftime('%d %b %Y')}." if body.due_date else ""
        _notify(supabase, [worker["id"]], "Repair job assigned",
                f"{manager.get('name') or 'A facility manager'} assigned repair job {reference} (inspection {format_inspection_reference(inspection['ref_no'])}) to you.{due_text}",
                _job_link(job["id"]))
    return {"id": job["id"], "reference": reference, "status": job["status"], "before_scanned": record["before_counts"] is not None}


@router.get("/{job_id}")
def get_job(job_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    job = _load_job(supabase, job_id, JOB_COLUMNS)
    if not can_view(job, user):
        raise HTTPException(status_code=403, detail="Not authorised")
    job = shape_job(job)
    inspection_id = job["inspection_id"]

    inspection = supabase.table("inspections").select(INSPECTION_DETAIL_COLUMNS).eq("id", inspection_id).execute().data or [{}]
    inspection = inspection[0]
    inspection["inspector_name"] = (inspection.pop("users", None) or {}).get("name")
    inspection["assessor"] = (inspection.get("assessor") or {}).get("name")
    inspection["reference"] = job["inspection_reference"]

    photos = supabase.table("photos").select("id, url, description").eq("inspection_id", inspection_id).order("created_at").execute().data or []
    findings = (
        supabase.table("findings")
        .select("id, photo_id, defect_type, severity, confidence, source, location_description")
        .eq("inspection_id", inspection_id)
        .is_("dismissed_at", "null")
        .execute()
        .data
        or []
    )
    completion = [_photo_view(p) for p in (supabase.table("repair_photos").select("*").eq("job_id", job["id"]).order("created_at").execute().data or [])]
    events = supabase.table("repair_job_events").select(EVENT_COLUMNS).eq("job_id", job["id"]).order("created_at").execute().data or []
    for event in events:
        event["actor_name"] = (event.pop("actor", None) or {}).get("name")
        event["from_name"] = (event.pop("from_worker", None) or {}).get("name")
        event["to_name"] = (event.pop("to_worker", None) or {}).get("name")

    current = [p for p in completion if p.get("round") == job["round"]]
    manager = has_any_role(user, "facility_manager")
    own = job.get("assigned_to") == user["id"]
    return {
        "job":               job,
        "inspection":        inspection,
        "complaint":         complaint_snapshot(supabase, inspection_id),
        "photos":            photos,
        "findings":          findings,
        "completion_photos": completion,
        "events":            events,
        "comparison":        comparison(job.get("before_counts"), findings, current),
        "before_scanned":    job.get("before_counts") is not None,
        "after_scanned":     bool(current) and all(p["scanned"] for p in current),
        "permissions": {
            "can_claim":    has_any_role(user, "maintenance") and job["status"] == "open",
            "can_work":     is_worker(job, user) and job["status"] == "in_progress",
            "can_assign":   manager and job["status"] == "open",
            "can_review":   manager and job["status"] == "awaiting_review" and not own,
            "can_reassign": manager and job["status"] in ACTIVE_STATUSES,
        },
    }


@router.post("/{job_id}/claim")
def claim_job(job_id: str, worker: dict = Depends(require_maintenance)):
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    if job["status"] != "open":
        raise HTTPException(status_code=409, detail="This job has already been taken")
    _transition(supabase, job, {"status": "in_progress", "assigned_to": worker["id"], "assignment_type": "claimed"}, "This job has already been taken")
    _log(supabase, job, "claimed", worker, job["round"], to_user=worker["id"])
    return {"id": job["id"], "status": "in_progress"}


@router.post("/{job_id}/assign")
def assign_job(job_id: str, body: AssignBody, manager: dict = Depends(require_manager)):
    due_date = _check_due(body.due_date)
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    if job["status"] != "open":
        raise HTTPException(status_code=409, detail="Only jobs on the Job Board can be assigned")
    worker = _worker(supabase, body.worker_id)
    _transition(supabase, job, {"status": "in_progress", "assigned_to": worker["id"], "assignment_type": "assigned", "due_date": due_date}, "This job has already been taken")
    _log(supabase, job, "assigned", manager, job["round"], to_user=worker["id"])
    due_text = f" Due by {body.due_date.strftime('%d %b %Y')}." if body.due_date else ""
    _notify(supabase, [worker["id"]], "Repair job assigned",
            f"{manager.get('name') or 'A facility manager'} assigned repair job {_label(supabase, job)} to you.{due_text}", _job_link(job["id"]))
    return {"id": job["id"], "status": "in_progress"}


@router.post("/{job_id}/reassign")
def reassign_job(job_id: str, body: ReassignBody, manager: dict = Depends(require_manager)):
    reason = _required_text(body.reason, "Reason")
    due_date = _check_due(body.due_date)
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    if job["status"] not in ACTIVE_STATUSES:
        raise HTTPException(status_code=409, detail="Only jobs in progress or awaiting review can be reassigned")
    if body.worker_id == job.get("assigned_to"):
        raise HTTPException(status_code=400, detail="Choose a different worker")
    worker = _worker(supabase, body.worker_id)
    new_round = job["round"] + 1
    _transition(supabase, job, {
        "status":          "in_progress",
        "assigned_to":     worker["id"],
        "assignment_type": "assigned",
        "due_date":        due_date,
        "round":           new_round,
        "repair_notes":    None,
        "submitted_at":    None,
    })
    _log(supabase, job, "reassigned", manager, new_round, from_user=job.get("assigned_to"), to_user=worker["id"], reason=reason)
    label = _label(supabase, job)
    name = manager.get("name") or "A facility manager"
    _notify(supabase, [worker["id"]], "Repair job assigned", f"{name} reassigned repair job {label} to you. Reason: {reason}", _job_link(job["id"]))
    _notify(supabase, [job.get("assigned_to")], "Repair job reassigned", f"{name} moved repair job {label} to another worker. Reason: {reason}", f"/jobs/{job.get('assignment_type') or 'assigned'}")
    return {"id": job["id"], "status": "in_progress"}


@router.post("/{job_id}/send-back")
def send_back_job(job_id: str, body: ReasonBody, manager: dict = Depends(require_manager)):
    reason = _required_text(body.reason, "Reason")
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    _assert_not_own(job, manager)
    if job["status"] != "awaiting_review":
        raise HTTPException(status_code=409, detail="Only jobs awaiting review can be sent back")
    new_round = job["round"] + 1
    _transition(supabase, job, {"status": "in_progress", "rework_count": (job.get("rework_count") or 0) + 1, "round": new_round})
    _log(supabase, job, "sent_back", manager, new_round, to_user=job.get("assigned_to"), reason=reason)
    _notify(supabase, [job.get("assigned_to")], "Repair sent back for rework",
            f"{manager.get('name') or 'A facility manager'} sent repair job {_label(supabase, job)} back for rework. Reason: {reason}",
            _job_link(job["id"]), "warning")
    return {"id": job["id"], "status": "in_progress"}


@router.post("/{job_id}/approve")
def approve_job(job_id: str, body: ApproveBody, manager: dict = Depends(require_manager)):
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    _assert_not_own(job, manager)
    if job["status"] != "awaiting_review":
        raise HTTPException(status_code=409, detail="Only jobs awaiting review can be approved")
    now = _now()
    _transition(supabase, job, {"status": "done", "approved_by": manager["id"], "completed_at": now})
    _log(supabase, job, "approved", manager, job["round"], note=(body.note or "").strip() or None)
    _notify(supabase, [job.get("assigned_to")], "Repair approved",
            f"{manager.get('name') or 'A facility manager'} approved repair job {_label(supabase, job)}.", _job_link(job["id"]), "success")
    return {"id": job["id"], "status": "done"}


@router.post("/{job_id}/photos", status_code=201)
def upload_completion_photo(job_id: str, file: UploadFile = File(...), worker: dict = Depends(require_maintenance)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are allowed")
    contents = file.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10MB limit")
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    _assert_worker(job, worker)
    existing = supabase.table("repair_photos").select("id").eq("job_id", job["id"]).eq("round", job["round"]).execute().data or []
    if len(existing) >= MAX_PHOTOS_PER_ROUND:
        raise HTTPException(status_code=400, detail=f"Upload at most {MAX_PHOTOS_PER_ROUND} photos per submission")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    filename = f"repairs/{job['id']}/{uuid.uuid4()}.{ext}"
    bucket = supabase.storage.from_(PHOTO_BUCKET)
    bucket.upload(filename, contents, {"content-type": file.content_type})

    try:
        detections = scan_image_bytes(contents, f"completion job={job['id']} file={filename}")
        scanned_at = _now()
    except Exception as e:
        print(f"[VIDA] completion photo scan failed for job {job['id']}: {e}")
        detections, scanned_at = None, None

    record = {
        "job_id":       job["id"],
        "round":        job["round"],
        "filename":     filename,
        "url":          bucket.get_public_url(filename),
        "content_type": file.content_type,
        "size_bytes":   len(contents),
        "uploaded_by":  worker["id"],
        "detections":   detections,
        "scanned_at":   scanned_at,
        "created_at":   _now(),
    }
    try:
        row = supabase.table("repair_photos").insert(record).execute().data[0]
    except Exception:
        try:
            bucket.remove([filename])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to save photo record")
    return _photo_view({**record, **row})


@router.delete("/{job_id}/photos/{photo_id}")
def delete_completion_photo(job_id: str, photo_id: str, worker: dict = Depends(require_maintenance)):
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    _assert_worker(job, worker)
    rows = supabase.table("repair_photos").select("id, filename, round").eq("id", photo_id).eq("job_id", job["id"]).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Photo not found")
    if rows[0]["round"] != job["round"]:
        raise HTTPException(status_code=409, detail="Photos from an earlier submission are kept in the history")
    try:
        supabase.storage.from_(PHOTO_BUCKET).remove([rows[0]["filename"]])
    except Exception:
        pass
    supabase.table("repair_photos").delete().eq("id", photo_id).execute()
    return {"message": "Photo deleted"}


@router.put("/{job_id}/notes")
def save_notes(job_id: str, body: NotesBody, worker: dict = Depends(require_maintenance)):
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    _assert_worker(job, worker)
    supabase.table("repair_jobs").update({"repair_notes": body.notes.strip() or None, "updated_at": _now()}).eq("id", job["id"]).execute()
    return {"id": job["id"], "repair_notes": body.notes.strip() or None}


@router.post("/{job_id}/submit")
def submit_job(job_id: str, body: NotesBody, worker: dict = Depends(require_maintenance)):
    notes = _required_text(body.notes, "Repair notes")
    supabase = get_supabase()
    job = _load_job(supabase, job_id)
    _assert_worker(job, worker)
    photos = supabase.table("repair_photos").select("id").eq("job_id", job["id"]).eq("round", job["round"]).execute().data or []
    if not photos:
        raise HTTPException(status_code=400, detail="Upload at least one completion photo before submitting")
    _transition(supabase, job, {"status": "awaiting_review", "repair_notes": notes, "submitted_at": _now()})
    _log(supabase, job, "submitted", worker, job["round"], note=notes)
    managers = [u["id"] for u in users_with_roles(supabase, ("facility_manager",)) if u["id"] != worker["id"]]
    _notify(supabase, managers, "Repair submitted for review",
            f"{worker.get('name') or 'A maintenance worker'} submitted repair job {_label(supabase, job)}. Compare the before and after photos and review it.",
            _job_link(job["id"]))
    return {"id": job["id"], "status": "awaiting_review"}
