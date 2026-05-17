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


class RecommendationCreate(BaseModel):
    finding_id: str
    action: str
    priority: str = "medium"
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class RecommendationUpdate(BaseModel):
    action: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
def list_recommendations(finding_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    query = supabase.table("recommendations").select("*")
    if finding_id:
        query = query.eq("finding_id", finding_id)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


@router.post("/", status_code=201)
def create_recommendation(body: RecommendationCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    data = body.model_dump()
    data["created_by"] = current_user["id"]
    data["status"] = "pending"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("recommendations").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create recommendation")
    return result.data[0]


@router.put("/{rec_id}")
def update_recommendation(rec_id: str, body: RecommendationUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("recommendations").update(updates).eq("id", rec_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return result.data[0]


@router.delete("/{rec_id}")
def delete_recommendation(rec_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("recommendations").delete().eq("id", rec_id).execute()
    return {"message": "Recommendation deleted"}
