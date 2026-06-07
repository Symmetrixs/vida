from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
from auth import get_current_user
from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY", ""))


class GroupPhotoItem(BaseModel):
    photo_id:   str
    sort_order: int = 0


class AnnotationData(BaseModel):
    actions:     Optional[Any]  = None
    layout:      Optional[Any]  = None
    canvas_data: Optional[str]  = None


class GroupItem(BaseModel):
    id:         Optional[str]       = None
    label:      str
    sort_order: int                 = 0
    photos:     List[GroupPhotoItem] = []
    annotation: Optional[AnnotationData] = None


class SaveGroupsBody(BaseModel):
    groups: List[GroupItem]


@router.get("/{inspection_id}")
def get_groups(inspection_id: str, current_user: dict = Depends(get_current_user)):
    groups = get_supabase().table("inspection_groups").select("*").eq("inspection_id", inspection_id).order("sort_order").execute().data or []

    result = []
    for g in groups:
        gid      = g["id"]
        gp       = get_supabase().table("group_photos").select("photo_id, sort_order").eq("group_id", gid).order("sort_order").execute().data or []
        ann_rows = get_supabase().table("group_annotations").select("actions, layout, canvas_data").eq("group_id", gid).execute().data or []
        ann      = ann_rows[0] if ann_rows else None
        result.append({
            "id":         gid,
            "label":      g["label"],
            "sort_order": g["sort_order"],
            "photoIds":   [row["photo_id"] for row in gp],
            "annotation": ann,
        })
    return result


@router.post("/{inspection_id}/save")
def save_groups(inspection_id: str, body: SaveGroupsBody, current_user: dict = Depends(get_current_user)):
    existing = get_supabase().table("inspection_groups").select("id").eq("inspection_id", inspection_id).execute().data or []
    existing_ids = {r["id"] for r in existing}

    incoming_ids = {g.id for g in body.groups if g.id}
    to_delete    = existing_ids - incoming_ids
    if to_delete:
        get_supabase().table("inspection_groups").delete().in_("id", list(to_delete)).execute()

    saved = []
    for i, g in enumerate(body.groups):
        if g.id and g.id in existing_ids:
            row = get_supabase().table("inspection_groups").update({
                "label": g.label, "sort_order": i
            }).eq("id", g.id).execute().data[0]
        else:
            row = get_supabase().table("inspection_groups").insert({
                "inspection_id": inspection_id, "label": g.label, "sort_order": i
            }).execute().data[0]

        gid = row["id"]
        get_supabase().table("group_photos").delete().eq("group_id", gid).execute()
        if g.photos:
            get_supabase().table("group_photos").insert([
                {"group_id": gid, "photo_id": p.photo_id, "sort_order": p.sort_order}
                for p in g.photos
            ]).execute()

        if g.annotation:
            ann_exists = get_supabase().table("group_annotations").select("id").eq("group_id", gid).execute().data
            ann_data   = {
                "group_id":     gid,
                "inspection_id": inspection_id,
                "actions":      g.annotation.actions,
                "layout":       g.annotation.layout,
                "canvas_data":  g.annotation.canvas_data,
                "updated_at":   "now()",
            }
            if ann_exists:
                get_supabase().table("group_annotations").update(ann_data).eq("group_id", gid).execute()
            else:
                get_supabase().table("group_annotations").insert(ann_data).execute()

        saved.append({"id": gid, "label": g.label})

    return {"saved": len(saved), "groups": saved}


@router.delete("/{inspection_id}")
def delete_all_groups(inspection_id: str, current_user: dict = Depends(get_current_user)):
    get_supabase().table("inspection_groups").delete().eq("inspection_id", inspection_id).execute()
    return {"deleted": True}