import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from auth import MANAGER_ROLES, get_current_user, has_any_role, require_roles
from complaint import SEVERITIES, ReviewBody, apply_review, complaint_snapshot, mark_started, notify_inspection_submitted, release_complaint, sync_complaint
from public import format_inspection_reference, format_reference, format_repair_reference

router = APIRouter()

require_inspector = require_roles("inspector")
require_facility_manager = require_roles("facility_manager")
require_review_reader = require_roles(*MANAGER_ROLES)

QUEUE_COLUMNS = (
    "id, ref_no, title, floor_level, area_inspected, submitted_at, severity, severity_note, assessed_at, "
    "buildings(name, code), users!inspector_id(name), assessor:users!assessed_by(name), "
    "complaints(ref_no), findings(severity), photos(id), repair_jobs(id, ref_no, status)"
)
REVIEW_COLUMNS = (
    "id, ref_no, title, status, inspection_date, weather_condition, floor_level, area_inspected, description, remarks, "
    "submitted_at, severity, severity_note, assessed_at, buildings(name, code), users!inspector_id(name), "
    "assessor:users!assessed_by(name), complaints(ref_no), repair_jobs(id, ref_no, status)"
)


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


def owns_inspection(inspection: Optional[dict], user: dict) -> bool:
    return bool(inspection) and has_any_role(user, "inspector") and inspection.get("inspector_id") == user["id"]


def can_view_inspection(inspection: Optional[dict], user: dict) -> bool:
    return bool(inspection) and (owns_inspection(inspection, user) or has_any_role(user, *MANAGER_ROLES))


def load_inspection(supabase: Client, inspection_id: str) -> dict:
    rows = supabase.table("inspections").select("id, inspector_id, status").eq("id", inspection_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return rows[0]


def assert_owner(supabase: Client, inspection_id: str, user: dict) -> dict:
    inspection = load_inspection(supabase, inspection_id)
    if not owns_inspection(inspection, user):
        raise HTTPException(status_code=403, detail="Not authorised")
    return inspection


def assert_viewer(supabase: Client, inspection_id: str, user: dict) -> dict:
    inspection = load_inspection(supabase, inspection_id)
    if not can_view_inspection(inspection, user):
        raise HTTPException(status_code=403, detail="Not authorised")
    return inspection


def with_references(row: dict) -> dict:
    row["reference"] = format_inspection_reference(row["ref_no"]) if row.get("ref_no") else None
    linked = row.pop("complaints", None) or []
    if isinstance(linked, dict):
        linked = [linked]
    row["complaint_reference"] = format_reference(linked[0]["ref_no"]) if linked else None
    return row


def first_embed(value):
    if isinstance(value, list):
        return value[0] if value else None
    return value


def highest_severity(findings: list) -> Optional[str]:
    ranked = [f["severity"] for f in findings if f.get("severity") in SEVERITIES]
    return max(ranked, key=SEVERITIES.index) if ranked else None


def review_shape(row: dict) -> dict:
    with_references(row)
    row["inspector_name"] = (row.pop("users", None) or {}).get("name")
    row["assessor"] = (row.get("assessor") or {}).get("name")
    job = first_embed(row.pop("repair_jobs", None))
    row["repair_job"] = {"id": job["id"], "reference": format_repair_reference(job["ref_no"]), "status": job["status"]} if job else None
    return row


class InspectionCreate(BaseModel):
    title: str
    building_id: str
    description: Optional[str] = None
    inspection_date: Optional[str] = None
    weather_condition: Optional[str] = None
    floor_level: Optional[str] = None
    area_inspected: Optional[str] = None


class InspectionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    inspection_date: Optional[str] = None
    weather_condition: Optional[str] = None
    floor_level: Optional[str] = None
    area_inspected: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/")
def list_inspections(current_user: dict = Depends(require_inspector)):
    supabase = get_supabase()
    me_id    = current_user["id"]

    result = (
        supabase.table("inspections")
        .select("*, buildings(name, code), users!inspector_id(name, avatar_url), complaints(ref_no)")
        .eq("inspector_id", me_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = result.data or []

    for row in rows:
        with_references(row)
        row["is_mine"]     = True
        inspector_data     = row.get("users") or {}
        row["inspector"]   = {"name": inspector_data.get("name", "Unknown"), "avatar_url": inspector_data.get("avatar_url")}

    return rows


@router.get("/review-queue")
def review_queue(reviewer: dict = Depends(require_facility_manager)):
    supabase = get_supabase()
    rows = (
        supabase.table("inspections")
        .select(QUEUE_COLUMNS)
        .eq("status", "submitted")
        .order("submitted_at", desc=True)
        .execute()
        .data
        or []
    )
    for row in rows:
        review_shape(row)
        findings = row.pop("findings", None) or []
        row["finding_count"] = len(findings)
        row["highest_finding_severity"] = highest_severity(findings)
        row["photo_count"] = len(row.pop("photos", None) or [])
        row["reviewed"] = row.get("severity") is not None
    return rows


@router.get("/{inspection_id}/review")
def get_review(inspection_id: str, reviewer: dict = Depends(require_review_reader)):
    supabase = get_supabase()
    rows = supabase.table("inspections").select(REVIEW_COLUMNS).eq("id", inspection_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Inspection not found")
    inspection = review_shape(rows[0])
    photos = (
        supabase.table("photos")
        .select("id, url, description, created_at")
        .eq("inspection_id", inspection_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    findings = (
        supabase.table("findings")
        .select("id, photo_id, defect_type, severity, confidence, location_description, notes")
        .eq("inspection_id", inspection_id)
        .execute()
        .data
        or []
    )
    return {
        "inspection":               inspection,
        "complaint":                complaint_snapshot(supabase, inspection_id),
        "photos":                   photos,
        "findings":                 findings,
        "highest_finding_severity": highest_severity(findings),
        "can_review":               has_any_role(reviewer, "facility_manager") and inspection["status"] == "submitted" and not inspection.get("severity"),
    }


@router.post("/{inspection_id}/review")
def review_inspection(inspection_id: str, body: ReviewBody, reviewer: dict = Depends(require_facility_manager)):
    return apply_review(get_supabase(), inspection_id, reviewer, body.severity, body.note)


@router.get("/{inspection_id}")
def get_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    rows = supabase.table("inspections").select("*, buildings(*), complaints(ref_no)").eq("id", inspection_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Inspection not found")
    insp = rows[0]
    if not can_view_inspection(insp, current_user):
        raise HTTPException(status_code=403, detail="Not authorised")
    mark_started(inspection_id, current_user, insp.get("inspector_id"))
    insp["is_mine"] = owns_inspection(insp, current_user)
    return with_references(insp)


@router.post("/", status_code=201)
def create_inspection(body: InspectionCreate, current_user: dict = Depends(require_inspector)):
    supabase = get_supabase()
    data = body.model_dump()
    data["inspector_id"] = current_user["id"]
    data["status"] = "draft"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("inspections").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create inspection")
    return with_references(result.data[0])


@router.put("/{inspection_id}")
def update_inspection(inspection_id: str, body: InspectionUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    assert_owner(supabase, inspection_id, current_user)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("inspections").update(updates).eq("id", inspection_id).execute()
    sync_complaint(inspection_id, current_user, started=True)
    return result.data[0]


@router.delete("/{inspection_id}")
def delete_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    assert_owner(supabase, inspection_id, current_user)
    if supabase.table("repair_jobs").select("id").eq("inspection_id", inspection_id).execute().data:
        raise HTTPException(status_code=409, detail="This inspection has a repair job and cannot be deleted")

    release_complaint(supabase, inspection_id)

    group_ids =[g["id"] for g in (supabase.table("inspection_groups").select("id").eq("inspection_id", inspection_id).execute().data or [])]
    if group_ids:
        supabase.table("group_annotations").delete().in_("group_id", group_ids).execute()
        supabase.table("group_photos").delete().in_("group_id", group_ids).execute()
    supabase.table("inspection_groups").delete().eq("inspection_id", inspection_id).execute()

    finding_ids = [f["id"] for f in (supabase.table("findings").select("id").eq("inspection_id", inspection_id).execute().data or [])]
    if finding_ids:
        supabase.table("recommendations").delete().in_("finding_id", finding_ids).execute()
    supabase.table("findings").delete().eq("inspection_id", inspection_id).execute()

    report_ids = [r["id"] for r in (supabase.table("reports").select("id").eq("inspection_id", inspection_id).execute().data or [])]
    if report_ids:
        supabase.table("shared_reports").delete().in_("report_id", report_ids).execute()
    supabase.table("reports").delete().eq("inspection_id", inspection_id).execute()

    photos = supabase.table("photos").select("filename").eq("inspection_id", inspection_id).execute().data or []
    filenames = [p["filename"] for p in photos if p.get("filename")]
    if filenames:
        try:
            supabase.storage.from_(os.getenv("STORAGE_BUCKET", "vida-photos")).remove(filenames)
        except Exception:
            pass
    supabase.table("photos").delete().eq("inspection_id", inspection_id).execute()

    supabase.table("inspections").delete().eq("id", inspection_id).execute()
    return {"message": "Inspection deleted"}


@router.post("/{inspection_id}/submit")
def submit_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    existing = assert_owner(supabase, inspection_id, current_user)
    result = supabase.table("inspections").update({
        "status": "submitted",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", inspection_id).execute()
    sync_complaint(inspection_id, current_user, started=True)
    if existing.get("status") != "submitted":
        notify_inspection_submitted(inspection_id, current_user)
    return result.data[0]


@router.get("/{inspection_id}/complaint")
def inspection_complaint(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    assert_viewer(supabase, inspection_id, current_user)
    return complaint_snapshot(supabase, inspection_id)


@router.get("/{inspection_id}/findings")
def inspection_findings(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    assert_viewer(supabase, inspection_id, current_user)
    result = supabase.table("findings").select("*").eq("inspection_id", inspection_id).execute()
    return result.data or []