import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from supabase import create_client, Client
from auth import get_current_user, require_roles
from public import list_room_rows

require_admin = require_roles("admin")

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


class RoomCreate(BaseModel):
    floor: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=100)


class RoomUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


def floor_labels(floors: Optional[int]) -> list:
    return ["Ground Floor"] + [f"Floor {i}" for i in range(1, max(floors or 1, 1))] + ["Rooftop"]


def _clean_room_name(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise HTTPException(status_code=400, detail="Room name is required")
    return name


def _assert_room_name_free(supabase: Client, building_id: str, floor: str, name: str, room_id: Optional[str] = None):
    rows = supabase.table("building_rooms").select("id, name").eq("building_id", building_id).eq("floor", floor).execute().data or []
    if any(r["name"].lower() == name.lower() and r["id"] != room_id for r in rows):
        raise HTTPException(status_code=400, detail=f"{floor} already has a room called {name}")


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
def create_building(body: BuildingCreate, current_user: dict = Depends(require_admin)):
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
def update_building(building_id: str, body: BuildingUpdate, current_user: dict = Depends(require_admin)):
    supabase = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    result = supabase.table("buildings").update(updates).eq("id", building_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Building not found")
    return result.data[0]


@router.delete("/{building_id}")
def delete_building(building_id: str, current_user: dict = Depends(require_admin)):
    supabase = get_supabase()
    linked = supabase.table("inspections").select("id").eq("building_id", building_id).limit(1).execute().data or []
    if linked:
        raise HTTPException(status_code=400, detail="Cannot delete a building that still has inspections. Delete or reassign its inspections first.")
    complaints = supabase.table("complaints").select("id").eq("building_id", building_id).limit(1).execute().data or []
    if complaints:
        raise HTTPException(status_code=400, detail="Cannot delete a building that has public complaints on record.")
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
        findings = supabase.table("findings").select("defect_type, severity").in_("inspection_id", inspection_ids).is_("dismissed_at", "null").execute().data or []

    defect_counts = {}
    for f in findings:
        dt = f.get("defect_type", "unknown")
        defect_counts[dt] = defect_counts.get(dt, 0) + 1

    return {
        "total_inspections": len(inspections),
        "total_findings": len(findings),
        "defect_breakdown": defect_counts,
    }


@router.get("/{building_id}/rooms")
def list_rooms(building_id: str, floor: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    if floor:
        return list_room_rows(supabase, building_id, floor)
    return (
        supabase.table("building_rooms")
        .select("id, name, floor, sort_order")
        .eq("building_id", building_id)
        .order("floor")
        .order("sort_order")
        .order("name")
        .execute()
        .data
        or []
    )


@router.post("/{building_id}/rooms", status_code=201)
def create_room(building_id: str, body: RoomCreate, current_user: dict = Depends(require_admin)):
    supabase = get_supabase()
    buildings = supabase.table("buildings").select("id, floors").eq("id", building_id).execute().data
    if not buildings:
        raise HTTPException(status_code=404, detail="Building not found")
    if body.floor not in floor_labels(buildings[0].get("floors")):
        raise HTTPException(status_code=400, detail="That floor does not exist in this building")
    name = _clean_room_name(body.name)
    _assert_room_name_free(supabase, building_id, body.floor, name)
    existing = supabase.table("building_rooms").select("id").eq("building_id", building_id).eq("floor", body.floor).execute().data or []
    result = supabase.table("building_rooms").insert({
        "building_id": building_id,
        "floor":       body.floor,
        "name":        name,
        "sort_order":  len(existing),
        "created_at":  datetime.now(timezone.utc).isoformat(),
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to add room")
    return result.data[0]


@router.put("/rooms/{room_id}")
def rename_room(room_id: str, body: RoomUpdate, current_user: dict = Depends(require_admin)):
    supabase = get_supabase()
    rows = supabase.table("building_rooms").select("id, building_id, floor").eq("id", room_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Room not found")
    name = _clean_room_name(body.name)
    _assert_room_name_free(supabase, rows[0]["building_id"], rows[0]["floor"], name, room_id)
    result = supabase.table("building_rooms").update({"name": name}).eq("id", room_id).execute()
    return result.data[0] if result.data else {**rows[0], "name": name}


@router.delete("/rooms/{room_id}")
def delete_room(room_id: str, current_user: dict = Depends(require_admin)):
    supabase = get_supabase()
    if not supabase.table("building_rooms").select("id").eq("id", room_id).execute().data:
        raise HTTPException(status_code=404, detail="Room not found")
    supabase.table("building_rooms").delete().eq("id", room_id).execute()
    return {"message": "Room deleted"}
