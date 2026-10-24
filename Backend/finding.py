import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from auth import MANAGER_ROLES, attach_user_names, get_current_user, has_any_role
from complaint import sync_complaint
from inspection import assert_editable, assert_viewer

router = APIRouter()

DEFECT_TYPES = ["crack", "faded_paint", "spalling", "water_stain", "rust", "mold", "efflorescence"]
SEVERITIES = ["low", "medium", "high", "critical"]


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


class FindingCreate(BaseModel):
    inspection_id: str
    defect_type: str
    severity: str
    location_description: Optional[str] = None
    photo_id: Optional[str] = None
    notes: Optional[str] = None


class FindingUpdate(BaseModel):
    defect_type: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    location_description: Optional[str] = None
    notes: Optional[str] = None


def _check_values(defect_type: Optional[str], severity: Optional[str]):
    if defect_type is not None and defect_type not in DEFECT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid defect type. Must be one of: {DEFECT_TYPES}")
    if severity is not None and severity not in SEVERITIES:
        raise HTTPException(status_code=400, detail=f"Invalid severity. Must be one of: {SEVERITIES}")


def _load_editable_finding(supabase: Client, finding_id: str, user: dict) -> dict:
    rows = supabase.table("findings").select("id, inspection_id, source, dismissed_at").eq("id", finding_id).execute().data
    if not rows or rows[0].get("dismissed_at"):
        raise HTTPException(status_code=404, detail="Finding not found")
    assert_editable(supabase, rows[0]["inspection_id"], user)
    return rows[0]


def shape_findings(supabase: Client, rows: list) -> list:
    return attach_user_names(supabase, rows, "created_by", "edited_by")


@router.get("/")
def list_findings(inspection_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    query = supabase.table("findings").select("*").is_("dismissed_at", "null")
    if inspection_id:
        assert_viewer(supabase, inspection_id, current_user)
        query = query.eq("inspection_id", inspection_id)
    elif not has_any_role(current_user, *MANAGER_ROLES):
        raise HTTPException(status_code=403, detail="Not authorised")
    result = query.order("created_at", desc=False).execute()
    return shape_findings(supabase, result.data or [])


@router.get("/{finding_id}")
def get_finding(finding_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    rows = supabase.table("findings").select("*").eq("id", finding_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Finding not found")
    assert_viewer(supabase, rows[0]["inspection_id"], current_user)
    return shape_findings(supabase, rows)[0]


@router.post("/", status_code=201)
def create_finding(body: FindingCreate, current_user: dict = Depends(get_current_user)):
    _check_values(body.defect_type, body.severity)
    supabase = get_supabase()
    assert_editable(supabase, body.inspection_id, current_user)
    data = body.model_dump()
    data["source"] = "manual"
    data["confidence"] = None
    data["created_by"] = current_user["id"]
    data["status"] = "open"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("findings").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create finding")
    sync_complaint(body.inspection_id, current_user, started=True)
    return shape_findings(supabase, result.data)[0]


@router.put("/{finding_id}")
def update_finding(finding_id: str, body: FindingUpdate, current_user: dict = Depends(get_current_user)):
    _check_values(body.defect_type, body.severity)
    supabase = get_supabase()
    _load_editable_finding(supabase, finding_id, current_user)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["edited_by"] = current_user["id"]
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("findings").update(updates).eq("id", finding_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Finding not found")
    return shape_findings(supabase, result.data)[0]


@router.delete("/{finding_id}")
def delete_finding(finding_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    row = _load_editable_finding(supabase, finding_id, current_user)
    if row.get("source") == "ai":
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("findings").update({
            "dismissed_at": now,
            "dismissed_by": current_user["id"],
            "updated_at":   now,
        }).eq("id", finding_id).execute()
        return {"message": "Finding dismissed", "dismissed": True}
    supabase.table("recommendations").delete().eq("finding_id", finding_id).execute()
    supabase.table("findings").delete().eq("id", finding_id).execute()
    return {"message": "Finding deleted", "dismissed": False}


@router.get("/stats/summary")
def findings_summary(current_user: dict = Depends(get_current_user)):
    if not has_any_role(current_user, *MANAGER_ROLES):
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase = get_supabase()
    findings = supabase.table("findings").select("defect_type, severity, status").is_("dismissed_at", "null").execute().data or []

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
