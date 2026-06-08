import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from auth import get_current_user

router = APIRouter()

LOCK_DAYS = 3


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


def _is_locked(created_at_str: str) -> bool:
    try:
        created = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - created).total_seconds() / 86400
        return age_days >= LOCK_DAYS
    except Exception:
        return False


def _assert_can_edit(report: dict, current_user: dict):
    if current_user["role"] == "admin":
        return
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


@router.get("/")
def list_reports(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    query = (
        supabase.table("reports")
        .select("*, inspections(title, inspection_date, building_id, inspector_id, buildings(name, code)), users!created_by(name)")
        .order("created_at", desc=True)
    )
    if current_user["role"] not in ("admin", "facility_manager"):
        query = query.eq("created_by", current_user["id"])

    result = query.execute()
    rows = result.data or []

    for r in rows:
        r["locked"] = _is_locked(r.get("created_at", ""))

    return rows


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

    if current_user["role"] == "inspector" and report.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised")

    report["locked"] = _is_locked(report.get("created_at", ""))
    return report


@router.post("/", status_code=201)
def create_report(body: ReportCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    insp = supabase.table("inspections").select("id, status").eq("id", body.inspection_id).single().execute()
    if not insp.data:
        raise HTTPException(status_code=404, detail="Inspection not found")

    data = body.model_dump()
    data["created_by"] = current_user["id"]
    data["status"] = "draft"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("reports").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create report")
    return result.data[0]


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
    if current_user["role"] not in ("admin",) and existing.data.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised")
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
        "status": "published",
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

    if current_user["role"] == "inspector" and report.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised")

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