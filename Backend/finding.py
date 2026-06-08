import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from auth import get_current_user

router = APIRouter()

DEFECT_TYPES = ["crack", "faded_paint", "spalling", "water_stain", "rust", "mold", "efflorescence"]
SEVERITIES = ["low", "medium", "high", "critical"]


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


class FindingCreate(BaseModel):
    inspection_id: str
    defect_type: str
    severity: str
    confidence: Optional[float] = None
    location_description: Optional[str] = None
    bbox: Optional[dict] = None
    photo_id: Optional[str] = None
    notes: Optional[str] = None


class FindingUpdate(BaseModel):
    defect_type: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    location_description: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
def list_findings(inspection_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    query = supabase.table("findings").select("*")
    if inspection_id:
        query = query.eq("inspection_id", inspection_id)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


@router.get("/{finding_id}")
def get_finding(finding_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("findings").select("*").eq("id", finding_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Finding not found")
    return result.data


@router.post("/", status_code=201)
def create_finding(body: FindingCreate, current_user: dict = Depends(get_current_user)):
    if body.defect_type not in DEFECT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid defect type. Must be one of: {DEFECT_TYPES}")
    if body.severity not in SEVERITIES:
        raise HTTPException(status_code=400, detail=f"Invalid severity. Must be one of: {SEVERITIES}")

    supabase = get_supabase()
    data = body.model_dump()
    data["created_by"] = current_user["id"]
    data["status"] = "open"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("findings").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create finding")
    return result.data[0]


@router.put("/{finding_id}")
def update_finding(finding_id: str, body: FindingUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("findings").update(updates).eq("id", finding_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Finding not found")
    return result.data[0]


@router.delete("/{finding_id}")
def delete_finding(finding_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("findings").delete().eq("id", finding_id).execute()
    return {"message": "Finding deleted"}


@router.get("/stats/summary")
def findings_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    findings = supabase.table("findings").select("defect_type, severity, status").execute().data or []

    by_type = {}
    by_severity = {}
    by_status = {}

    for f in findings:
        dt = f.get("defect_type", "unknown")
        sv = f.get("severity", "unknown")
        st = f.get("status", "unknown")
        by_type[dt] = by_type.get(dt, 0) + 1
        by_severity[sv] = by_severity.get(sv, 0) + 1
        by_status[st] = by_status.get(st, 0) + 1

    return {
        "total": len(findings),
        "by_type": by_type,
        "by_severity": by_severity,
        "by_status": by_status,
    }