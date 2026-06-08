import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from supabase import create_client, Client
from auth import get_current_user
import uuid

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


def _get_viewable_user_ids(role: str, current_user_id: str, supabase: Client):
    if role == "inspector":
        return [current_user_id], ["inspector"]
    elif role == "facility_manager":
        users = supabase.table("users").select("id, role").execute().data or []
        ids   = [u["id"] for u in users if u["role"] == "inspector"]
        if current_user_id not in ids:
            ids.append(current_user_id)
        return ids, ["inspector", "facility_manager"]
    elif role == "admin":
        users = supabase.table("users").select("id").execute().data or []
        return [u["id"] for u in users], ["inspector", "facility_manager", "admin"]
    return [current_user_id], [role]


@router.get("/stats")
def stats(
    inspector_id: Optional[str] = Query(None),
    building_id:  Optional[str] = Query(None),
    defect_type:  Optional[str] = Query(None),
    severity:     Optional[str] = Query(None),
    date_from:    Optional[str] = Query(None),
    date_to:      Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    role     = current_user.get("role")
    me_id    = current_user["id"]

    viewable_ids, viewable_roles = _get_viewable_user_ids(role, me_id, supabase)

    if role == "inspector":
        effective_ids = [me_id]
    else:
        if inspector_id == "__me__":
            effective_ids = [me_id]
        elif inspector_id and inspector_id in viewable_ids:
            effective_ids = [inspector_id]
        else:
            effective_ids = viewable_ids

    query = supabase.table("inspections").select("*, buildings(name, code), users!inspector_id(name, role, avatar_url)")
    query = query.in_("inspector_id", effective_ids)
    if building_id:
        query = query.eq("building_id", building_id)
    if date_from:
        query = query.gte("inspection_date", date_from)
    if date_to:
        query = query.lte("inspection_date", date_to)

    inspections = query.execute().data or []
    insp_ids    = [i["id"] for i in inspections]

    findings = []
    if insp_ids:
        fq = supabase.table("findings").select("*").in_("inspection_id", insp_ids)
        if defect_type:
            fq = fq.eq("defect_type", defect_type)
        if severity:
            fq = fq.eq("severity", severity)
        findings = fq.execute().data or []

    by_status    = {}
    by_month     = {}
    by_inspector = {}
    by_building  = {}
    for insp in inspections:
        s = insp.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
        m = (insp.get("inspection_date") or insp.get("created_at") or "")[:7]
        if m:
            by_month[m] = by_month.get(m, 0) + 1
        iuser = insp.get("users") or {}
        iname = iuser.get("name", "Unknown")
        by_inspector[iname] = by_inspector.get(iname, 0) + 1
        bname = (insp.get("buildings") or {}).get("name", "Unknown")
        by_building[bname] = by_building.get(bname, 0) + 1

    by_defect   = {}
    by_severity = {}
    by_month_f  = {}
    for f in findings:
        dt = f.get("defect_type", "unknown")
        by_defect[dt] = by_defect.get(dt, 0) + 1
        sv = f.get("severity", "unknown")
        by_severity[sv] = by_severity.get(sv, 0) + 1
        m2 = (f.get("created_at") or "")[:7]
        if m2:
            by_month_f[m2] = by_month_f.get(m2, 0) + 1

    viewable_users = []
    if role != "inspector":
        u = supabase.table("users").select("id, name, role, avatar_url, employee_id").in_("id", viewable_ids).order("name").execute().data or []
        viewable_users = u

    buildings_list = supabase.table("buildings").select("id, name, code").order("name").execute().data or []

    return {
        "role":                  role,
        "my_id":                 me_id,
        "total_inspections":     len(inspections),
        "total_findings":        len(findings),
        "inspections_by_status": by_status,
        "findings_by_defect":    by_defect,
        "findings_by_severity":  by_severity,
        "monthly_trend":         [{"month": k, "count": v} for k, v in sorted(by_month.items())],
        "findings_monthly_trend":[{"month": k, "count": v} for k, v in sorted(by_month_f.items())],
        "by_inspector":          sorted([{"name": k, "count": v} for k, v in by_inspector.items()], key=lambda x: -x["count"]),
        "by_building":           sorted([{"name": k, "count": v} for k, v in by_building.items()],  key=lambda x: -x["count"]),
        "viewable_users":        viewable_users,
        "buildings":             buildings_list,
    }


@router.get("/dashboard")
def inspector_dashboard(current_user: dict = Depends(get_current_user)):
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