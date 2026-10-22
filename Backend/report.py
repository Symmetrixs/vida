import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from auth import MANAGER_ROLES, get_current_user, has_any_role, require_roles, users_with_roles
from inspection import owns_inspection
from public import format_inspection_reference

router = APIRouter()

LOCK_DAYS = 3
LIST_COLUMNS = "*, inspections(ref_no, title, inspection_date, building_id, inspector_id, buildings(name, code)), users!created_by(name)"

require_inspector = require_roles("inspector")
require_manager = require_roles(*MANAGER_ROLES)


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


def _is_locked(created_at_str: str) -> bool:
    try:
        created = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - created).total_seconds() / 86400
        return age_days >= LOCK_DAYS
    except Exception:
        return False


def _shape(row: dict) -> dict:
    row["locked"] = _is_locked(row.get("created_at", ""))
    inspection = row.get("inspections") or {}
    row["inspection_reference"] = format_inspection_reference(inspection["ref_no"]) if inspection.get("ref_no") else None
    return row


def _assert_can_view(supabase: Client, report: dict, current_user: dict):
    if report.get("created_by") == current_user["id"] or has_any_role(current_user, *MANAGER_ROLES):
        return
    shared = supabase.table("shared_reports").select("id").eq("report_id", report["id"]).eq("shared_to_user_id", current_user["id"]).execute().data
    if not shared:
        raise HTTPException(status_code=403, detail="Not authorised")


def _assert_can_edit(report: dict, current_user: dict):
    if report.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised to edit this report")
    if _is_locked(report.get("created_at", "")):
        raise HTTPException(status_code=403, detail="Report is locked after 3 days")


class ReportCreate(BaseModel):
    inspection_id: str
    title: str
    summary: Optional[str] = None
    recommendations: Optional[str] = None
    row_data: Optional[dict] = None


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    recommendations: Optional[str] = None
    status: Optional[str] = None
    row_data: Optional[dict] = None


class ShareReportBody(BaseModel):
    report_id: str
    user_ids: list
    message: Optional[str] = None


@router.get("/")
def list_reports(current_user: dict = Depends(require_inspector)):
    supabase = get_supabase()
    rows = (
        supabase.table("reports")
        .select(LIST_COLUMNS)
        .eq("created_by", current_user["id"])
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_shape(r) for r in rows]


@router.get("/all")
def list_all_reports(current_user: dict = Depends(require_manager)):
    supabase = get_supabase()
    rows = supabase.table("reports").select(LIST_COLUMNS).order("created_at", desc=True).execute().data or []
    return [_shape(r) for r in rows]


@router.get("/shared-with-me")
def shared_with_me(current_user: dict = Depends(require_inspector)):
    supabase = get_supabase()
    result = supabase.table("shared_reports").select(
        "*, reports(id, title, status, created_at, inspections(title, buildings(name))), users!shared_by(name, avatar_url)"
    ).eq("shared_to_user_id", current_user["id"]).order("shared_at", desc=True).execute()
    return result.data or []


def _shareable(supabase: Client, current_user: dict) -> list:
    users = users_with_roles(supabase, ("inspector",), "id, name, email, avatar_url, employee_id")
    return [u for u in users if u["id"] != current_user["id"]]


@router.get("/shareable-users")
def get_shareable_users(current_user: dict = Depends(require_inspector)):
    return _shareable(get_supabase(), current_user)


@router.post("/", status_code=201)
def create_report(body: ReportCreate, current_user: dict = Depends(require_inspector)):
    supabase = get_supabase()
    insp = supabase.table("inspections").select("id, status, inspector_id").eq("id", body.inspection_id).execute()
    if not insp.data:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if not owns_inspection(insp.data[0], current_user):
        raise HTTPException(status_code=403, detail="Not authorised")
    data = body.model_dump()
    data["created_by"] = current_user["id"]
    data["status"] = "draft"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("reports").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create report")
    return result.data[0]


@router.post("/share")
def share_report(body: ShareReportBody, current_user: dict = Depends(require_inspector)):
    supabase = get_supabase()
    found = supabase.table("reports").select("id, status, created_by").eq("id", body.report_id).execute().data
    if not found:
        raise HTTPException(status_code=404, detail="Report not found")
    report = found[0]
    if report.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the report's author can share it")
    if report.get("status") != "published":
        raise HTTPException(status_code=400, detail="Only published reports can be shared")
    allowed = {u["id"] for u in _shareable(supabase, current_user)}
    if not body.user_ids or any(uid not in allowed for uid in body.user_ids):
        raise HTTPException(status_code=400, detail="Reports can only be shared with active inspectors")
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for uid in body.user_ids:
        existing = supabase.table("shared_reports").select("id").eq("report_id", body.report_id).eq("shared_to_user_id", uid).execute().data
        if not existing:
            rows.append({
                "report_id":         body.report_id,
                "shared_by":         current_user["id"],
                "shared_to_user_id": uid,
                "message":           body.message,
                "shared_at":         now,
            })
    if rows:
        supabase.table("shared_reports").insert(rows).execute()
    notif_rows = [{
        "user_id":    uid,
        "title":      "Report shared with you",
        "message":    (current_user.get("name", "Someone") + " shared a report with you" + (": " + body.message if body.message else "")),
        "type":       "info",
        "is_read":    False,
        "created_at": now,
    } for uid in body.user_ids]
    if notif_rows:
        supabase.table("notifications").insert(notif_rows).execute()
    return {"shared": len(rows)}


@router.get("/{report_id}")
def get_report(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("reports")
        .select("*, inspections(*, buildings(*)), users!created_by(name)")
        .eq("id", report_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Report not found")
    report = result.data
    _assert_can_view(supabase, report, current_user)
    report["is_mine"] = report.get("created_by") == current_user["id"]
    return _shape(report)


@router.put("/{report_id}")
def update_report(report_id: str, body: ReportUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    existing = supabase.table("reports").select("*").eq("id", report_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Report not found")
    _assert_can_edit(existing.data, current_user)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "row_data" in body.model_dump() and body.row_data is not None:
        updates["row_data"] = body.row_data
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("reports").update(updates).eq("id", report_id).execute()
    return result.data[0]


@router.delete("/{report_id}")
def delete_report(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    existing = supabase.table("reports").select("created_by").eq("id", report_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Report not found")
    if existing.data.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase.table("shared_reports").delete().eq("report_id", report_id).execute()
    supabase.table("reports").delete().eq("id", report_id).execute()
    return {"message": "Report deleted"}


@router.post("/{report_id}/publish")
def publish_report(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    existing = supabase.table("reports").select("*").eq("id", report_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Report not found")
    _assert_can_edit(existing.data, current_user)
    result = supabase.table("reports").update({
        "status":       "published",
        "published_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", report_id).execute()
    return result.data[0]


@router.get("/{report_id}/export")
def export_report_data(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    report_res = supabase.table("reports").select("*").eq("id", report_id).single().execute()
    if not report_res.data:
        raise HTTPException(status_code=404, detail="Report not found")
    report = report_res.data
    _assert_can_view(supabase, report, current_user)
    inspection = supabase.table("inspections").select("*, buildings(*)").eq("id", report["inspection_id"]).single().execute().data or {}
    findings   = supabase.table("findings").select("*").eq("inspection_id", report["inspection_id"]).execute().data or []
    photos     = supabase.table("photos").select("*").eq("inspection_id", report["inspection_id"]).order("created_at").execute().data or []
    groups_raw = supabase.table("inspection_groups").select("*").eq("inspection_id", report["inspection_id"]).order("sort_order").execute().data or []
    groups = []
    for g in groups_raw:
        gid = g["id"]
        gp  = supabase.table("group_photos").select("photo_id, sort_order").eq("group_id", gid).order("sort_order").execute().data or []
        ann = supabase.table("group_annotations").select("canvas_data, actions, layout").eq("group_id", gid).execute().data or []
        groups.append({
            "id":         gid,
            "label":      g["label"],
            "name":       g.get("name") or "",
            "sort_order": g["sort_order"],
            "photoIds":   [row["photo_id"] for row in gp],
            "annotation": ann[0] if ann else None,
        })
    creator = supabase.table("users").select("name, email").eq("id", report["created_by"]).single().execute().data or {}
    return {
        "report":     report,
        "inspection": inspection,
        "findings":   findings,
        "photos":     photos,
        "groups":     groups,
        "creator":    creator,
    }