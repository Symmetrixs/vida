import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from auth import get_current_user

router = APIRouter()


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None


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


@router.get("/stats")
def inspector_stats(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    user_id = current_user["id"]
    inspections = supabase.table("inspections").select("id, status").eq("inspector_id", user_id).execute().data or []
    insp_ids = [i["id"] for i in inspections]
    findings = []
    if insp_ids:
        findings = supabase.table("findings").select("defect_type, severity").in_("inspection_id", insp_ids).execute().data or []

    by_status = {}
    for insp in inspections:
        s = insp.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1

    by_defect = {}
    for f in findings:
        dt = f.get("defect_type", "unknown")
        by_defect[dt] = by_defect.get(dt, 0) + 1

    return {
        "total_inspections": len(inspections),
        "total_findings": len(findings),
        "inspections_by_status": by_status,
        "findings_by_defect": by_defect,
    }


@router.get("/dashboard")
def inspector_dashboard(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    user_id = current_user["id"]
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
        "recent_inspections": recent_inspections,
        "unread_notifications": notifications,
    }
