import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import create_client, Client
from auth import get_current_user

router = APIRouter()


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None


@router.get("/stats")
def get_stats(admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    users_count = len(supabase.table("users").select("id").execute().data or [])
    buildings_count = len(supabase.table("buildings").select("id").execute().data or [])
    inspections_count = len(supabase.table("inspections").select("id").execute().data or [])
    findings_count = len(supabase.table("findings").select("id").execute().data or [])
    reports_count = len(supabase.table("reports").select("id").execute().data or [])

    return {
        "total_users": users_count,
        "total_buildings": buildings_count,
        "total_inspections": inspections_count,
        "total_findings": findings_count,
        "total_reports": reports_count,
    }


@router.get("/users")
def list_users(admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    result = supabase.table("users").select("id, name, email, role, is_active, created_at").execute()
    return result.data or []


@router.get("/users/{user_id}")
def get_user(user_id: str, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    result = supabase.table("users").select("id, name, email, role, is_active, created_at").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data


@router.put("/users/{user_id}")
def update_user(user_id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table("users").update(updates).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]


@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    supabase.table("users").delete().eq("id", user_id).execute()
    return {"message": "User deleted"}


@router.get("/analytics")
def get_analytics(admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    findings = supabase.table("findings").select("defect_type, severity, created_at").execute().data or []
    inspections = supabase.table("inspections").select("status, created_at").execute().data or []

    defect_counts = {}
    for f in findings:
        dt = f.get("defect_type", "unknown")
        defect_counts[dt] = defect_counts.get(dt, 0) + 1

    severity_counts = {}
    for f in findings:
        sv = f.get("severity", "unknown")
        severity_counts[sv] = severity_counts.get(sv, 0) + 1

    monthly_inspections = {}
    for insp in inspections:
        month = insp.get("created_at", "")[:7]
        monthly_inspections[month] = monthly_inspections.get(month, 0) + 1

    return {
        "defect_by_type": [{"type": k, "count": v} for k, v in defect_counts.items()],
        "defect_by_severity": [{"severity": k, "count": v} for k, v in severity_counts.items()],
        "monthly_inspections": [{"month": k, "count": v} for k, v in sorted(monthly_inspections.items())],
    }


@router.get("/activity")
def recent_activity(admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    inspections = (
        supabase.table("inspections")
        .select("id, title, status, created_at, inspector_id")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data or []
    )
    return inspections
