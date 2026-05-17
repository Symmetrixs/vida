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


class ReportCreate(BaseModel):
    inspection_id: str
    title: str
    summary: Optional[str] = None
    recommendations: Optional[str] = None


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    recommendations: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
def list_reports(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    if current_user["role"] in ("admin", "facility_manager"):
        result = (
            supabase.table("reports")
            .select("*, inspections(title, building_id, buildings(name))")
            .order("created_at", desc=True)
            .execute()
        )
    else:
        result = (
            supabase.table("reports")
            .select("*, inspections(title, building_id, buildings(name))")
            .eq("created_by", current_user["id"])
            .order("created_at", desc=True)
            .execute()
        )
    return result.data or []


@router.get("/{report_id}")
def get_report(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("reports")
        .select("*, inspections(*, buildings(*)), findings(*), photos(*)")
        .eq("id", report_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Report not found")
    return result.data


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
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("reports").update(updates).eq("id", report_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Report not found")
    return result.data[0]


@router.delete("/{report_id}")
def delete_report(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("reports").delete().eq("id", report_id).execute()
    return {"message": "Report deleted"}


@router.post("/{report_id}/publish")
def publish_report(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("reports").update({
        "status": "published",
        "published_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", report_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Report not found")
    return result.data[0]


@router.get("/{report_id}/export")
def export_report_data(report_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    report = supabase.table("reports").select("*").eq("id", report_id).single().execute()
    if not report.data:
        raise HTTPException(status_code=404, detail="Report not found")
    inspection = supabase.table("inspections").select("*, buildings(*)").eq("id", report.data["inspection_id"]).single().execute()
    findings = supabase.table("findings").select("*, photos(url)").eq("inspection_id", report.data["inspection_id"]).execute()
    return {
        "report": report.data,
        "inspection": inspection.data,
        "findings": findings.data or [],
    }
