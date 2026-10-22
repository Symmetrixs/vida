import os
from datetime import datetime, timezone
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from supabase import create_client, Client
from auth import ROLES, hash_password, require_roles, users_with_roles

router = APIRouter()


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


require_admin = require_roles("admin")

USER_COLUMNS = "id, name, email, employee_id, is_active, created_at"

RoleName = Literal["inspector", "maintenance", "facility_manager", "admin"]


class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    employee_id: Optional[str] = Field(default=None, max_length=40)
    roles: List[RoleName] = Field(min_length=1)


class StaffUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    employee_id: Optional[str] = Field(default=None, max_length=40)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    roles: Optional[List[RoleName]] = Field(default=None, min_length=1)
    is_active: Optional[bool] = None


def _ordered(roles) -> list:
    held = set(roles)
    return [r for r in ROLES if r in held]


def _attach_roles(supabase: Client, users: list) -> list:
    ids = [u["id"] for u in users]
    rows = (supabase.table("user_roles").select("user_id, role").in_("user_id", ids).execute().data or []) if ids else []
    by_user = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r["role"])
    for u in users:
        u["roles"] = _ordered(by_user.get(u["id"], []))
    return users


def _assert_unique(supabase: Client, email: Optional[str], employee_id: Optional[str], user_id: Optional[str] = None):
    if email:
        rows = supabase.table("users").select("id").eq("email", email).execute().data or []
        if any(r["id"] != user_id for r in rows):
            raise HTTPException(status_code=400, detail="An account with this email already exists")
    if employee_id:
        rows = supabase.table("users").select("id").eq("employee_id", employee_id).execute().data or []
        if any(r["id"] != user_id for r in rows):
            raise HTTPException(status_code=400, detail="This Matric No. / Employee ID is already used by another account")


def _assert_keeps_an_admin(supabase: Client, user_id: str):
    others = [u for u in users_with_roles(supabase, ("admin",)) if u["id"] != user_id]
    if not others:
        raise HTTPException(status_code=400, detail="At least one active admin must remain")


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
    users = supabase.table("users").select(USER_COLUMNS).order("name").execute().data or []
    return _attach_roles(supabase, users)


@router.get("/users/{user_id}")
def get_user(user_id: str, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    rows = supabase.table("users").select(USER_COLUMNS).eq("id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    return _attach_roles(supabase, rows)[0]


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(body: StaffCreate, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    email = body.email.lower()
    employee_id = (body.employee_id or "").strip() or None
    _assert_unique(supabase, email, employee_id)

    now = datetime.now(timezone.utc).isoformat()
    new_user = {
        "name":          body.name.strip(),
        "email":         email,
        "password_hash": hash_password(body.password),
        "is_active":     True,
        "created_at":    now,
    }
    if employee_id:
        new_user["employee_id"] = employee_id
    result = supabase.table("users").insert(new_user).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create account")
    created = result.data[0]

    roles = _ordered(body.roles)
    try:
        supabase.table("user_roles").insert([
            {"user_id": created["id"], "role": r, "granted_by": admin["id"], "granted_at": now} for r in roles
        ]).execute()
    except Exception:
        supabase.table("users").delete().eq("id", created["id"]).execute()
        raise HTTPException(status_code=500, detail="Failed to assign roles. The account was not created.")

    return {
        "id":          created["id"],
        "name":        created["name"],
        "email":       created["email"],
        "employee_id": created.get("employee_id"),
        "is_active":   True,
        "created_at":  created.get("created_at"),
        "roles":       roles,
    }


@router.put("/users/{user_id}")
def update_user(user_id: str, body: StaffUpdate, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    rows = supabase.table("users").select(USER_COLUMNS).eq("id", user_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    target = _attach_roles(supabase, rows)[0]

    new_roles = _ordered(body.roles) if body.roles is not None else target["roles"]
    is_active = target.get("is_active") if body.is_active is None else body.is_active
    loses_admin = "admin" in target["roles"] and bool(target.get("is_active")) and ("admin" not in new_roles or not is_active)
    if user_id == admin["id"] and ("admin" not in new_roles or not is_active):
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role or deactivate your own account")
    if loses_admin:
        _assert_keeps_an_admin(supabase, user_id)

    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.employee_id is not None:
        employee_id = body.employee_id.strip() or None
        _assert_unique(supabase, None, employee_id, user_id)
        updates["employee_id"] = employee_id
    if body.password is not None:
        updates["password_hash"] = hash_password(body.password)
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("users").update(updates).eq("id", user_id).execute()

    if body.roles is not None:
        removed = [r for r in target["roles"] if r not in new_roles]
        added = [r for r in new_roles if r not in target["roles"]]
        if removed:
            supabase.table("user_roles").delete().eq("user_id", user_id).in_("role", removed).execute()
        if added:
            now = datetime.now(timezone.utc).isoformat()
            supabase.table("user_roles").insert([
                {"user_id": user_id, "role": r, "granted_by": admin["id"], "granted_at": now} for r in added
            ]).execute()

    target.update({k: v for k, v in updates.items() if k not in ("password_hash", "updated_at")})
    target["roles"] = new_roles
    return target


@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    has_insp = supabase.table("inspections").select("id").eq("inspector_id", user_id).limit(1).execute().data or []
    has_rep  = supabase.table("reports").select("id").eq("created_by", user_id).limit(1).execute().data or []
    if has_insp or has_rep:
        raise HTTPException(status_code=400, detail="This user owns inspections or reports and cannot be deleted. Deactivate the account instead to preserve historical records.")
    if supabase.table("user_roles").select("user_id").eq("user_id", user_id).eq("role", "admin").execute().data:
        _assert_keeps_an_admin(supabase, user_id)
    supabase.table("notifications").delete().eq("user_id", user_id).execute()
    supabase.table("password_resets").delete().eq("user_id", user_id).execute()
    supabase.table("user_roles").delete().eq("user_id", user_id).execute()
    supabase.table("users").delete().eq("id", user_id).execute()
    return {"message": "User deleted"}


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
    inspectors     = users_with_roles(supabase, ("inspector",), "id, name")

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