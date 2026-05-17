import os
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from auth import get_current_user

router = APIRouter()


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    member_ids: Optional[List[str]] = []


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ShareReport(BaseModel):
    report_id: str
    team_id: str
    message: Optional[str] = None


@router.get("/")
def list_teams(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("teams").select("*, team_members(user_id, users(name, email))").execute()
    return result.data or []


@router.get("/{team_id}")
def get_team(team_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("teams").select("*, team_members(user_id, users(name, email, role))").eq("id", team_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Team not found")
    return result.data


@router.post("/", status_code=201)
def create_team(body: TeamCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "facility_manager"):
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase = get_supabase()
    team_data = {
        "name": body.name,
        "description": body.description,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("teams").insert(team_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create team")
    team = result.data[0]
    if body.member_ids:
        members = [{"team_id": team["id"], "user_id": uid} for uid in body.member_ids]
        supabase.table("team_members").insert(members).execute()
    return team


@router.post("/{team_id}/members/{user_id}")
def add_member(team_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "facility_manager"):
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase = get_supabase()
    supabase.table("team_members").insert({
        "team_id": team_id,
        "user_id": user_id,
        "joined_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"message": "Member added"}


@router.delete("/{team_id}/members/{user_id}")
def remove_member(team_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "facility_manager"):
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase = get_supabase()
    supabase.table("team_members").delete().eq("team_id", team_id).eq("user_id", user_id).execute()
    return {"message": "Member removed"}


@router.post("/share-report")
def share_report(body: ShareReport, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    data = {
        "report_id": body.report_id,
        "team_id": body.team_id,
        "shared_by": current_user["id"],
        "message": body.message,
        "shared_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("shared_reports").insert(data).execute()
    return result.data[0] if result.data else {"message": "Report shared"}


@router.get("/shared-reports")
def get_shared_reports(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    member_teams = supabase.table("team_members").select("team_id").eq("user_id", current_user["id"]).execute().data or []
    team_ids = [t["team_id"] for t in member_teams]
    if not team_ids:
        return []
    result = supabase.table("shared_reports").select("*, reports(*, inspections(title)), teams(name)").in_("team_id", team_ids).execute()
    return result.data or []
