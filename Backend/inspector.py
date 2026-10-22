import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from supabase import create_client, Client
from auth import get_current_user, require_roles
from complaint import OPEN_STATUSES, TRACKED_STATUSES, overdue_info, submitted_late
from public import format_reference
import uuid

DONE_TASK_DAYS = 7

router = APIRouter()


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None
    employee_id: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    current_user.pop("password_hash", None)
    return current_user


@router.put("/profile")
def update_profile(body: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("users").update(updates).eq("id", current_user["id"]).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Update failed")
    updated = result.data[0]
    updated.pop("password_hash", None)
    return updated


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    contents = await file.read()
    ext       = (file.filename or "jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        raise HTTPException(status_code=400, detail="Invalid image format. Use JPG, PNG, or WebP.")
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5MB")

    path = f"{current_user['id']}/avatar.{ext}"

    try:
        supabase.storage.create_bucket("avatars", options={"public": True})
    except Exception:
        pass

    try:
        supabase.storage.from_("avatars").upload(
            path, contents,
            {"content-type": file.content_type or "image/jpeg", "upsert": "true"},
        )
    except Exception:
        try:
            supabase.storage.from_("avatars").update(
                path, contents,
                {"content-type": file.content_type or "image/jpeg"},
            )
        except Exception as e2:
            raise HTTPException(status_code=500, detail=f"Storage upload failed. Ensure the 'avatars' bucket exists in Supabase Storage and is set to public. Error: {str(e2)}")

    pub_url = supabase.storage.from_("avatars").get_public_url(path)
    cache_bust = f"{pub_url}?t={int(datetime.now(timezone.utc).timestamp())}"
    supabase.table("users").update({
        "avatar_url": pub_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", current_user["id"]).execute()
    return {"avatar_url": cache_bust}


@router.get("/assigned-tasks")
def assigned_tasks(current_user: dict = Depends(require_roles("inspector"))):
    supabase = get_supabase()
    rows = (
        supabase.table("complaints")
        .select(
            "ref_no, floor, location_note, description, status, due_date, reviewed_at, started_at, submitted_at, severity, "
            "buildings(name, code), inspections!inner(id, title, status, inspector_id)"
        )
        .eq("inspections.inspector_id", current_user["id"])
        .in_("status", list(TRACKED_STATUSES))
        .execute()
        .data
        or []
    )
    cutoff = datetime.now(timezone.utc) - timedelta(days=DONE_TASK_DAYS)
    tasks = []
    for row in rows:
        done = row["status"] not in OPEN_STATUSES
        if done and row.get("submitted_at"):
            if datetime.fromisoformat(row["submitted_at"].replace("Z", "+00:00")) < cutoff:
                continue
        inspection = row.get("inspections") or {}
        is_overdue, days_overdue = overdue_info(row["status"], row.get("due_date"))
        tasks.append({
            "reference":         format_reference(row["ref_no"]),
            "status":            row["status"],
            "building":          row.get("buildings"),
            "floor":             row["floor"],
            "location_note":     row["location_note"],
            "description":       row["description"],
            "due_date":          row.get("due_date"),
            "assigned_at":       row.get("reviewed_at"),
            "submitted_at":      row.get("submitted_at"),
            "severity":          row.get("severity") if row["status"] == "reviewed" else None,
            "is_overdue":        is_overdue,
            "days_overdue":      days_overdue,
            "submitted_late":    done and submitted_late(row.get("due_date"), row.get("submitted_at")),
            "inspection_id":     inspection.get("id"),
            "inspection_title":  inspection.get("title"),
            "inspection_status": inspection.get("status"),
        })
    tasks.sort(key=lambda t: (
        t["status"] not in OPEN_STATUSES,
        not t["is_overdue"],
        -t["days_overdue"],
        t["due_date"] is None,
        t["due_date"] or "",
        t["assigned_at"] or "",
    ))
    return tasks


@router.get("/dashboard")
def inspector_dashboard(current_user: dict = Depends(require_roles("inspector"))):
    supabase = get_supabase()
    user_id  = current_user["id"]
    recent_inspections = (
        supabase.table("inspections")
        .select("*, buildings(name, code)")
        .eq("inspector_id", user_id)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
        .data or []
    )
    notifications = (
        supabase.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_read", False)
        .limit(5)
        .execute()
        .data or []
    )
    return {
        "recent_inspections":   recent_inspections,
        "unread_notifications": notifications,
    }