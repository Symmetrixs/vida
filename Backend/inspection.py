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


class InspectionCreate(BaseModel):
    title: str
    building_id: str
    description: Optional[str] = None
    inspection_date: Optional[str] = None
    weather_condition: Optional[str] = None
    floor_level: Optional[str] = None
    area_inspected: Optional[str] = None


class InspectionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    inspection_date: Optional[str] = None
    weather_condition: Optional[str] = None
    floor_level: Optional[str] = None
    area_inspected: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/")
def list_inspections(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("inspections")
        .select("*, buildings(name, code), users!inspector_id(name)")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/{inspection_id}")
def get_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("inspections").select("*, buildings(*)").eq("id", inspection_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Inspection not found")
    insp = result.data
    if current_user["role"] == "inspector" and insp.get("inspector_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised")
    return insp


@router.post("/", status_code=201)
def create_inspection(body: InspectionCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    data = body.model_dump()
    data["inspector_id"] = current_user["id"]
    data["status"] = "draft"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("inspections").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create inspection")
    return result.data[0]


@router.put("/{inspection_id}")
def update_inspection(inspection_id: str, body: InspectionUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    existing = supabase.table("inspections").select("inspector_id, status").eq("id", inspection_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if current_user["role"] == "inspector" and existing.data["inspector_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("inspections").update(updates).eq("id", inspection_id).execute()
    return result.data[0]


@router.delete("/{inspection_id}")
def delete_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    existing = supabase.table("inspections").select("inspector_id").eq("id", inspection_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if current_user["role"] == "inspector" and existing.data["inspector_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase.table("inspections").delete().eq("id", inspection_id).execute()
    return {"message": "Inspection deleted"}


@router.post("/{inspection_id}/submit")
def submit_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("inspections").update({
        "status": "submitted",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", inspection_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return result.data[0]


@router.get("/{inspection_id}/findings")
def inspection_findings(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("findings").select("*").eq("inspection_id", inspection_id).execute()
    return result.data or []