import os
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from supabase import create_client, Client

from auth import get_current_user
from public import COMPLAINT_BUCKET, format_reference

router = APIRouter()

PHOTO_BUCKET = os.getenv("STORAGE_BUCKET", "vida-photos")
REVIEWER_ROLES = ("admin", "facility_manager")
SIGNED_URL_SECONDS = 600
LIST_COLUMNS = (
    "id, ref_no, building_id, floor, location_note, description, reporter_name, status, "
    "reject_reason, inspection_id, reviewed_at, created_at, "
    "buildings(name, code), complaint_photos(id), users!reviewed_by(name)"
)
DETAIL_COLUMNS = (
    "id, ref_no, building_id, floor, location_note, description, reporter_name, reporter_email, "
    "reporter_phone, status, reject_reason, inspection_id, reviewed_at, created_at, "
    "buildings(name, code), users!reviewed_by(name), inspections(id, title, status, inspector_id)"
)


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


def require_reviewer(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in REVIEWER_ROLES:
        raise HTTPException(status_code=403, detail="Not authorised")
    return current_user


class ConvertBody(BaseModel):
    inspector_id: str
    title: Optional[str] = Field(default=None, max_length=200)
    inspection_date: Optional[date] = None


class RejectBody(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


def _shape(row: dict) -> dict:
    row["reference"] = format_reference(row["ref_no"])
    row["photo_count"] = len(row.pop("complaint_photos", None) or [])
    row["reviewer"] = (row.pop("users", None) or {}).get("name")
    return row


def _claim(supabase: Client, complaint_id: str, updates: dict) -> dict:
    result = (
        supabase.table("complaints")
        .update(updates)
        .eq("id", complaint_id)
        .eq("status", "pending")
        .execute()
    )
    if result.data:
        return result.data[0]
    exists = supabase.table("complaints").select("id").eq("id", complaint_id).execute().data
    if not exists:
        raise HTTPException(status_code=404, detail="Complaint not found")
    raise HTTPException(status_code=409, detail="This complaint has already been handled")


@router.get("/")
def list_complaints(status: Optional[str] = Query(None), reviewer: dict = Depends(require_reviewer)):
    supabase = get_supabase()
    query = supabase.table("complaints").select(LIST_COLUMNS).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    return [_shape(row) for row in (query.execute().data or [])]


@router.get("/assignees")
def list_assignees(reviewer: dict = Depends(require_reviewer)):
    supabase = get_supabase()
    result = (
        supabase.table("users")
        .select("id, name, email")
        .eq("role", "inspector")
        .eq("is_active", True)
        .order("name")
        .execute()
    )
    return result.data or []


@router.get("/{complaint_id}")
def get_complaint(complaint_id: str, reviewer: dict = Depends(require_reviewer)):
    supabase = get_supabase()
    rows = supabase.table("complaints").select(DETAIL_COLUMNS).eq("id", complaint_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Complaint not found")
    complaint = _shape(rows[0])
    photos = (
        supabase.table("complaint_photos")
        .select("id, storage_path, content_type, width, height")
        .eq("complaint_id", complaint_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    bucket = supabase.storage.from_(COMPLAINT_BUCKET)
    for photo in photos:
        try:
            photo["url"] = bucket.create_signed_url(photo["storage_path"], SIGNED_URL_SECONDS)["signedURL"]
        except Exception:
            photo["url"] = None
        photo.pop("storage_path", None)
    complaint["photos"] = photos
    complaint["photo_count"] = len(photos)
    return complaint


@router.post("/{complaint_id}/convert")
def convert_complaint(complaint_id: str, body: ConvertBody, reviewer: dict = Depends(require_reviewer)):
    supabase = get_supabase()
    inspector = (
        supabase.table("users")
        .select("id, name")
        .eq("id", body.inspector_id)
        .eq("role", "inspector")
        .eq("is_active", True)
        .execute()
        .data
    )
    if not inspector:
        raise HTTPException(status_code=400, detail="Choose an active inspector")

    now = datetime.now(timezone.utc).isoformat()
    complaint = _claim(supabase, complaint_id, {
        "status":      "converted",
        "reviewed_by": reviewer["id"],
        "reviewed_at": now,
    })
    reference = format_reference(complaint["ref_no"])

    inspection_id = None
    copied = []
    try:
        inspection = supabase.table("inspections").insert({
            "title":           (body.title or "").strip() or f"Complaint {reference}",
            "building_id":     complaint["building_id"],
            "description":     complaint["description"],
            "floor_level":     complaint["floor"],
            "area_inspected":  complaint["location_note"],
            "inspection_date": (body.inspection_date or date.today()).isoformat(),
            "inspector_id":    body.inspector_id,
            "status":          "draft",
            "created_at":      now,
        }).execute().data[0]
        inspection_id = inspection["id"]

        source = supabase.storage.from_(COMPLAINT_BUCKET)
        target = supabase.storage.from_(PHOTO_BUCKET)
        photos = supabase.table("complaint_photos").select("*").eq("complaint_id", complaint_id).order("created_at").execute().data or []
        rows = []
        for photo in photos:
            contents = source.download(photo["storage_path"])
            ext = photo["storage_path"].rsplit(".", 1)[-1]
            filename = f"{inspection_id}/{uuid.uuid4()}.{ext}"
            target.upload(filename, contents, {"content-type": photo["content_type"]})
            copied.append(filename)
            rows.append({
                "inspection_id": inspection_id,
                "url":           target.get_public_url(filename),
                "filename":      filename,
                "content_type":  photo["content_type"],
                "size_bytes":    photo["size_bytes"],
                "description":   f"Public complaint {reference}",
                "uploaded_by":   body.inspector_id,
                "created_at":    now,
            })
        if rows:
            supabase.table("photos").insert(rows).execute()

        supabase.table("complaints").update({"inspection_id": inspection_id}).eq("id", complaint_id).execute()
    except Exception:
        if copied:
            try:
                supabase.storage.from_(PHOTO_BUCKET).remove(copied)
            except Exception:
                pass
        if inspection_id:
            supabase.table("photos").delete().eq("inspection_id", inspection_id).execute()
            supabase.table("inspections").delete().eq("id", inspection_id).execute()
        supabase.table("complaints").update({
            "status":        "pending",
            "reviewed_by":   None,
            "reviewed_at":   None,
            "inspection_id": None,
        }).eq("id", complaint_id).execute()
        raise HTTPException(status_code=500, detail="Conversion failed. The complaint is still pending.")

    try:
        supabase.table("notifications").insert({
            "user_id":    body.inspector_id,
            "title":      "New inspection assigned",
            "message":    f"Public complaint {reference} was converted into an inspection for you. Open it and run the defect scan.",
            "type":       "info",
            "link":       "/inspector/inspections",
            "is_read":    False,
            "created_at": now,
        }).execute()
    except Exception:
        pass

    return {"reference": reference, "inspection_id": inspection_id, "status": "converted"}


@router.post("/{complaint_id}/reject")
def reject_complaint(complaint_id: str, body: RejectBody, reviewer: dict = Depends(require_reviewer)):
    supabase = get_supabase()
    complaint = _claim(supabase, complaint_id, {
        "status":        "rejected",
        "reject_reason": body.reason.strip(),
        "reviewed_by":   reviewer["id"],
        "reviewed_at":   datetime.now(timezone.utc).isoformat(),
    })
    return {"reference": format_reference(complaint["ref_no"]), "status": "rejected"}
