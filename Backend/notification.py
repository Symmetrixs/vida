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
    user_id: Optional[str] = None
    target_role: Optional[str] = None
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
    now      = datetime.now(timezone.utc).isoformat()

    if body.target_role and body.target_role != "specific":
        if body.target_role == "all":
            users = supabase.table("users").select("id").eq("is_active", True).execute().data or []
        else:
            users = supabase.table("users").select("id").eq("role", body.target_role).eq("is_active", True).execute().data or []
        rows = [{"user_id": u["id"], "title": body.title, "message": body.message, "type": body.type, "is_read": False, "created_at": now} for u in users]
        if rows:
            supabase.table("notifications").insert(rows).execute()
        return {"sent": len(rows)}

    if not body.user_id:
        raise HTTPException(status_code=400, detail="user_id required when targeting a specific user")
    data = {"user_id": body.user_id, "title": body.title, "message": body.message, "type": body.type, "is_read": False, "created_at": now}
    if body.link:
        data["link"] = body.link
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