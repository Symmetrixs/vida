import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from supabase import create_client, Client
from auth import get_current_user

router = APIRouter()


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


class BuildingCreate(BaseModel):
    name: str
    code: str
    location: str
    description: Optional[str] = None
    floors: Optional[int] = 1
    year_built: Optional[int] = None
    image_url: Optional[str] = None


class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    floors: Optional[int] = None
    year_built: Optional[int] = None
    image_url: Optional[str] = None


@router.get("/")
def list_buildings(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("buildings").select("*").order("name").execute()
    return result.data or []


@router.get("/{building_id}")
def get_building(building_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("buildings").select("*").eq("id", building_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Building not found")
    return result.data


@router.post("/", status_code=201)
def create_building(body: BuildingCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "facility_manager"):
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase = get_supabase()
    existing = supabase.table("buildings").select("id").eq("code", body.code).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Building code already exists")
    data = body.model_dump()
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("buildings").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create building")
    return result.data[0]


@router.put("/{building_id}")
def update_building(building_id: str, body: BuildingUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "facility_manager"):
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    result = supabase.table("buildings").update(updates).eq("id", building_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Building not found")
    return result.data[0]


@router.delete("/{building_id}")
def delete_building(building_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    supabase = get_supabase()
    linked = supabase.table("inspections").select("id").eq("building_id", building_id).limit(1).execute().data or []
    if linked:
        raise HTTPException(status_code=400, detail="Cannot delete a building that still has inspections. Delete or reassign its inspections first.")
    supabase.table("buildings").delete().eq("id", building_id).execute()
    return {"message": "Building deleted"}


@router.get("/{building_id}/inspections")
def building_inspections(building_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("inspections")
        .select("*")
        .eq("building_id", building_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/{building_id}/stats")
def building_stats(building_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    inspections = supabase.table("inspections").select("id, status").eq("building_id", building_id).execute().data or []
    inspection_ids = [i["id"] for i in inspections]
    findings = []
    if inspection_ids:
        findings = supabase.table("findings").select("defect_type, severity").in_("inspection_id", inspection_ids).execute().data or []

    defect_counts = {}
    for f in findings:
        dt = f.get("defect_type", "unknown")
        defect_counts[dt] = defect_counts.get(dt, 0) + 1

    return {
        "total_inspections": len(inspections),
        "total_findings": len(findings),
        "defect_breakdown": defect_counts,
    }
