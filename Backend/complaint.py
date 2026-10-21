import os
import uuid
from datetime import date, datetime, timedelta, timezone
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
MYT = timezone(timedelta(hours=8))
OPEN_STATUSES = ("assigned", "in_progress")
TRACKED_STATUSES = ("assigned", "in_progress", "resolved")
INSPECTION_EMBED = "inspections(id, title, status, inspector_id, users!inspector_id(name))"
LIST_COLUMNS = (
    "id, ref_no, building_id, floor, location_note, description, reporter_name, status, "
    "reject_reason, inspection_id, reviewed_at, due_date, started_at, resolved_at, created_at, "
    "buildings(name, code), complaint_photos(id), users!reviewed_by(name), " + INSPECTION_EMBED
)
DETAIL_COLUMNS = (
    "id, ref_no, building_id, floor, location_note, description, reporter_name, reporter_email, "
    "reporter_phone, status, reject_reason, inspection_id, reviewed_at, due_date, started_at, "
    "resolved_at, created_at, buildings(name, code), users!reviewed_by(name), " + INSPECTION_EMBED
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
    due_date: Optional[date] = None


class RejectBody(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


def today_myt() -> date:
    return datetime.now(MYT).date()


def derive_status(started: bool, inspection_status: Optional[str], has_published_report: bool) -> str:
    if inspection_status == "submitted" and has_published_report:
        return "resolved"
    if started:
        return "in_progress"
    return "assigned"


def overdue_info(status: str, due_date: Optional[str], today: Optional[date] = None) -> tuple:
    if not due_date or status not in OPEN_STATUSES:
        return False, 0
    days = ((today or today_myt()) - date.fromisoformat(due_date)).days
    return days > 0, max(days, 0)


def resolved_late(due_date: Optional[str], resolved_at: Optional[str]) -> bool:
    if not due_date or not resolved_at:
        return False
    resolved_day = datetime.fromisoformat(resolved_at.replace("Z", "+00:00")).astimezone(MYT).date()
    return resolved_day > date.fromisoformat(due_date)


def _shape(row: dict) -> dict:
    row["reference"] = format_reference(row["ref_no"])
    row["photo_count"] = len(row.pop("complaint_photos", None) or [])
    row["reviewer"] = (row.pop("users", None) or {}).get("name")
    row["is_overdue"], row["days_overdue"] = overdue_info(row["status"], row.get("due_date"))
    row["resolved_late"] = row["status"] == "resolved" and resolved_late(row.get("due_date"), row.get("resolved_at"))
    inspection = row.pop("inspections", None)
    if inspection:
        inspector = inspection.pop("users", None) or {}
        inspection["inspector_name"] = inspector.get("name")
    row["inspection"] = inspection
    return row


def _latest_reports(supabase: Client, inspection_ids: list) -> dict:
    if not inspection_ids:
        return {}
    rows = (
        supabase.table("reports")
        .select("id, title, status, inspection_id, created_at")
        .in_("inspection_id", inspection_ids)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    latest = {}
    for r in rows:
        current = latest.get(r["inspection_id"])
        if current is None or (r["status"] == "published" and current["status"] != "published"):
            latest[r["inspection_id"]] = r
    return latest


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


def _notify_resolved(supabase: Client, complaint: dict, now: str) -> None:
    reviewer_id = complaint.get("reviewed_by")
    if not reviewer_id:
        return
    reviewer = supabase.table("users").select("role").eq("id", reviewer_id).execute().data or []
    base = "/admin" if reviewer and reviewer[0].get("role") == "admin" else "/inspector"
    supabase.table("notifications").insert({
        "user_id":    reviewer_id,
        "title":      "Complaint resolved",
        "message":    f"Public complaint {format_reference(complaint['ref_no'])} is resolved: the inspection was submitted and its report published.",
        "type":       "success",
        "link":       f"{base}/complaints",
        "is_read":    False,
        "created_at": now,
    }).execute()


def sync_complaint(inspection_id: Optional[str], actor: Optional[dict] = None, started: bool = False) -> Optional[str]:
    if not inspection_id:
        return None
    try:
        supabase = get_supabase()
        rows = (
            supabase.table("complaints")
            .select("id, ref_no, status, started_at, reviewed_by")
            .eq("inspection_id", inspection_id)
            .in_("status", list(TRACKED_STATUSES))
            .execute()
            .data
        )
        if not rows:
            return None
        complaint = rows[0]
        inspections = supabase.table("inspections").select("status, inspector_id").eq("id", inspection_id).execute().data
        if not inspections:
            return None
        inspection = inspections[0]
        now = datetime.now(timezone.utc).isoformat()

        started_at = complaint.get("started_at")
        if not started_at and started and actor and actor.get("id") == inspection.get("inspector_id"):
            started_at = now
        published = (
            supabase.table("reports")
            .select("id")
            .eq("inspection_id", inspection_id)
            .eq("status", "published")
            .limit(1)
            .execute()
            .data
        )
        status = derive_status(bool(started_at), inspection.get("status"), bool(published))

        updates = {}
        if started_at != complaint.get("started_at"):
            updates["started_at"] = started_at
        if status != complaint["status"]:
            updates["status"] = status
            updates["resolved_at"] = now if status == "resolved" else None
        if updates:
            supabase.table("complaints").update(updates).eq("id", complaint["id"]).execute()
            if updates.get("status") == "resolved":
                _notify_resolved(supabase, complaint, now)
        return status
    except Exception as e:
        print(f"[VIDA] complaint sync failed for inspection {inspection_id}: {e}")
        return None


def mark_started(inspection_id: Optional[str], actor: dict, inspector_id: Optional[str] = None) -> None:
    if not inspection_id or not actor:
        return
    try:
        supabase = get_supabase()
        waiting = (
            supabase.table("complaints")
            .select("id")
            .eq("inspection_id", inspection_id)
            .eq("status", "assigned")
            .execute()
            .data
        )
        if not waiting:
            return
        if inspector_id is None:
            rows = supabase.table("inspections").select("inspector_id").eq("id", inspection_id).execute().data or []
            inspector_id = rows[0]["inspector_id"] if rows else None
        if inspector_id and actor.get("id") == inspector_id:
            sync_complaint(inspection_id, actor, started=True)
    except Exception as e:
        print(f"[VIDA] complaint start check failed for inspection {inspection_id}: {e}")


def signed_photos(supabase: Client, complaint_id: str) -> list:
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
    return photos


def complaint_snapshot(supabase: Client, inspection_id: str) -> Optional[dict]:
    rows = (
        supabase.table("complaints")
        .select("id, ref_no, floor, location_note, description, status, due_date, created_at, buildings(name, code)")
        .eq("inspection_id", inspection_id)
        .execute()
        .data
    )
    if not rows:
        return None
    c = rows[0]
    return {
        "reference":     format_reference(c["ref_no"]),
        "status":        c["status"],
        "building":      c.get("buildings"),
        "floor":         c["floor"],
        "location_note": c["location_note"],
        "description":   c["description"],
        "due_date":      c.get("due_date"),
        "received_at":   c.get("created_at"),
        "photos":        signed_photos(supabase, c["id"]),
    }


def notify_complaint_submitted(inspection_id: str, actor: dict) -> int:
    try:
        supabase = get_supabase()
        rows = (
            supabase.table("complaints")
            .select("id, ref_no, status")
            .eq("inspection_id", inspection_id)
            .in_("status", list(TRACKED_STATUSES))
            .execute()
            .data
        )
        if not rows:
            return 0
        complaint = rows[0]
        reference = format_reference(complaint["ref_no"])
        outcome = (
            " The complaint is now resolved."
            if complaint["status"] == "resolved"
            else " The complaint stays in progress until the inspection report is published."
        )
        recipients = (
            supabase.table("users")
            .select("id, role, is_approved")
            .in_("role", list(REVIEWER_ROLES))
            .eq("is_active", True)
            .execute()
            .data
            or []
        )
        now = datetime.now(timezone.utc).isoformat()
        notes = [{
            "user_id":    u["id"],
            "title":      "Complaint inspection submitted",
            "message":    f"{actor.get('name') or 'An inspector'} submitted the inspection for public complaint {reference}.{outcome}",
            "type":       "info",
            "link":       f"/admin/complaints?open={complaint['id']}" if u["role"] == "admin" else f"/inspector/inspections/{inspection_id}/edit",
            "is_read":    False,
            "created_at": now,
        } for u in recipients if u.get("is_approved") is True]
        if notes:
            supabase.table("notifications").insert(notes).execute()
        return len(notes)
    except Exception as e:
        print(f"[VIDA] complaint submit notification failed for inspection {inspection_id}: {e}")
        return 0


def release_complaint(supabase: Client, inspection_id: str) -> None:
    supabase.table("complaints").update({
        "status":        "pending",
        "inspection_id": None,
        "reviewed_by":   None,
        "reviewed_at":   None,
        "due_date":      None,
        "started_at":    None,
        "resolved_at":   None,
    }).eq("inspection_id", inspection_id).in_("status", list(TRACKED_STATUSES)).execute()


@router.get("/")
def list_complaints(status: Optional[str] = Query(None), reviewer: dict = Depends(require_reviewer)):
    supabase = get_supabase()
    query = supabase.table("complaints").select(LIST_COLUMNS).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    rows = [_shape(row) for row in (query.execute().data or [])]
    reports = _latest_reports(supabase, [r["inspection_id"] for r in rows if r.get("inspection_id")])
    for row in rows:
        row["report"] = reports.get(row.get("inspection_id"))
    return rows


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
    photos = signed_photos(supabase, complaint_id)
    complaint["photos"] = photos
    complaint["photo_count"] = len(photos)

    inspection_id = complaint.get("inspection_id")
    complaint["report"] = _latest_reports(supabase, [inspection_id]).get(inspection_id) if inspection_id else None
    if complaint["inspection"]:
        complaint["inspection"]["photo_count"] = len(supabase.table("photos").select("id").eq("inspection_id", inspection_id).execute().data or [])
        complaint["inspection"]["finding_count"] = len(supabase.table("findings").select("id").eq("inspection_id", inspection_id).execute().data or [])
    return complaint


@router.post("/{complaint_id}/convert")
def convert_complaint(complaint_id: str, body: ConvertBody, reviewer: dict = Depends(require_reviewer)):
    if body.due_date and body.due_date < today_myt():
        raise HTTPException(status_code=400, detail="Due date cannot be in the past")
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
        "status":      "assigned",
        "reviewed_by": reviewer["id"],
        "reviewed_at": now,
        "due_date":    body.due_date.isoformat() if body.due_date else None,
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
            "inspection_date": (body.inspection_date or today_myt()).isoformat(),
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
            "due_date":      None,
            "inspection_id": None,
        }).eq("id", complaint_id).execute()
        raise HTTPException(status_code=500, detail="Conversion failed. The complaint is still pending.")

    due_text = f" Due by {body.due_date.strftime('%d %b %Y')}." if body.due_date else ""
    try:
        supabase.table("notifications").insert({
            "user_id":    body.inspector_id,
            "title":      "New inspection assigned",
            "message":    f"Public complaint {reference} was converted into an inspection for you. Open it and run the defect scan.{due_text}",
            "type":       "info",
            "link":       f"/inspector/inspections/{inspection_id}/edit",
            "is_read":    False,
            "created_at": now,
        }).execute()
    except Exception:
        pass

    return {"reference": reference, "inspection_id": inspection_id, "status": "assigned"}


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
