import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    result = supabase.table("users").select("id, name, email, role, is_active, is_approved, created_at").execute()
    return result.data or []


@router.get("/users/{user_id}")
def get_user(user_id: str, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    result = supabase.table("users").select("id, name, email, role, is_active, is_approved, created_at").eq("id", user_id).single().execute()
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
    has_insp = supabase.table("inspections").select("id").eq("inspector_id", user_id).limit(1).execute().data or []
    has_rep  = supabase.table("reports").select("id").eq("created_by", user_id).limit(1).execute().data or []
    if has_insp or has_rep:
        raise HTTPException(status_code=400, detail="This user owns inspections or reports and cannot be deleted. Deactivate the account instead to preserve historical records.")
    supabase.table("notifications").delete().eq("user_id", user_id).execute()
    supabase.table("password_resets").delete().eq("user_id", user_id).execute()
    supabase.table("users").delete().eq("id", user_id).execute()
    return {"message": "User deleted"}


@router.get("/pending-approvals")
def pending_approvals(admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    result = (
        supabase.table("users")
        .select("id, name, email, role, created_at")
        .eq("role", "admin")
        .is_("is_approved", "null")
        .execute()
    )
    return result.data or []


@router.patch("/users/{user_id}/approve")
def approve_user(user_id: str, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    result = supabase.table("users").update({
        "is_approved": True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]


@router.patch("/users/{user_id}/reject")
def reject_user(user_id: str, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    result = supabase.table("users").update({
        "is_approved": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]


@router.get("/analytics")
def get_analytics(
    date_from:   Optional[str] = Query(None),
    date_to:     Optional[str] = Query(None),
    building_id: Optional[str] = Query(None),
    inspector_id: Optional[str] = Query(None),
    admin: dict = Depends(require_admin),
):
    supabase = get_supabase()

    insp_q = supabase.table("inspections").select("id, status, created_at, inspection_date, building_id, inspector_id, buildings(name, code), users!inspector_id(name)")
    if date_from:
        insp_q = insp_q.gte("inspection_date", date_from)
    if date_to:
        insp_q = insp_q.lte("inspection_date", date_to)
    if building_id:
        insp_q = insp_q.eq("building_id", building_id)
    if inspector_id:
        insp_q = insp_q.eq("inspector_id", inspector_id)
    inspections = insp_q.execute().data or []
    insp_ids    = [i["id"] for i in inspections]

    all_findings = supabase.table("findings").select("defect_type, severity, created_at, inspection_id").execute().data or []
    findings = [f for f in all_findings if f.get("inspection_id") in insp_ids] if insp_ids else []

    defect_counts   = {}
    severity_counts = {}
    monthly_findings = {}
    for f in findings:
        dt = f.get("defect_type", "unknown")
        defect_counts[dt] = defect_counts.get(dt, 0) + 1
        sv = f.get("severity", "unknown")
        severity_counts[sv] = severity_counts.get(sv, 0) + 1
        m = (f.get("created_at") or "")[:7]
        if m:
            monthly_findings[m] = monthly_findings.get(m, 0) + 1

    monthly_insp = {}
    status_counts = {}
    by_inspector  = {}
    by_building   = {}
    for insp in inspections:
        m = (insp.get("inspection_date") or insp.get("created_at") or "")[:7]
        if m:
            monthly_insp[m] = monthly_insp.get(m, 0) + 1
        s = insp.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
        iname = (insp.get("users") or {}).get("name", "Unknown")
        by_inspector[iname] = by_inspector.get(iname, 0) + 1
        bname = (insp.get("buildings") or {}).get("name", "Unknown")
        bcode = (insp.get("buildings") or {}).get("code", "")
        entry = by_building.get(bname, {"count": 0, "code": bcode})
        entry["count"] += 1
        by_building[bname] = entry

    buildings_list = supabase.table("buildings").select("id, name, code").order("name").execute().data or []
    users_count    = len(supabase.table("users").select("id").execute().data or [])
    reports_count  = len(supabase.table("reports").select("id").execute().data or [])
    inspectors     = supabase.table("users").select("id, name, role").neq("role", "admin").eq("is_active", True).order("name").execute().data or []

    return {
        "totals": {
            "users":       users_count,
            "buildings":   len(buildings_list),
            "inspections": len(inspections),
            "findings":    len(findings),
            "reports":     reports_count,
        },
        "defect_by_type":      sorted([{"type": k, "count": v} for k, v in defect_counts.items()], key=lambda x: -x["count"]),
        "defect_by_severity":  [{"severity": k, "count": v} for k, v in severity_counts.items()],
        "monthly_inspections": [{"month": k, "count": v} for k, v in sorted(monthly_insp.items())],
        "monthly_findings":    [{"month": k, "count": v} for k, v in sorted(monthly_findings.items())],
        "status_breakdown":    [{"status": k, "count": v} for k, v in status_counts.items()],
        "by_inspector":        sorted([{"name": k, "count": v} for k, v in by_inspector.items()], key=lambda x: -x["count"]),
        "by_building":         sorted([{"name": k, "count": v["count"], "code": v["code"]} for k, v in by_building.items()], key=lambda x: -x["count"]),
        "buildings":           buildings_list,
        "inspectors":          inspectors,
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