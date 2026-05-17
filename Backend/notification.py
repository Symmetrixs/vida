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


class NotificationCreate(BaseModel):
    user_id: str
    title: str
    message: str
    type: str = "info"
    link: Optional[str] = None


@router.get("/")
def list_notifications(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("notifications")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return result.data or []


@router.get("/unread-count")
def unread_count(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("notifications")
        .select("id")
        .eq("user_id", current_user["id"])
        .eq("is_read", False)
        .execute()
    )
    return {"count": len(result.data or [])}


@router.post("/", status_code=201)
def create_notification(body: NotificationCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "facility_manager"):
        raise HTTPException(status_code=403, detail="Not authorised")
    supabase = get_supabase()
    data = body.model_dump()
    data["is_read"] = False
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("notifications").insert(data).execute()
    return result.data[0]


@router.patch("/{notification_id}/read")
def mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("notifications").update({
        "is_read": True,
        "read_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", notification_id).eq("user_id", current_user["id"]).execute()
    return {"message": "Marked as read"}


@router.patch("/read-all")
def mark_all_read(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("notifications").update({
        "is_read": True,
        "read_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", current_user["id"]).eq("is_read", False).execute()
    return {"message": "All notifications marked as read"}


@router.delete("/{notification_id}")
def delete_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("notifications").delete().eq("id", notification_id).eq("user_id", current_user["id"]).execute()
    return {"message": "Notification deleted"}
