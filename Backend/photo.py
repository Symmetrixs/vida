import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from supabase import create_client, Client
from auth import get_current_user
from complaint import mark_started, sync_complaint
from inspection import assert_owner, assert_viewer

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "vida-photos")
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


@router.post("/upload", status_code=201)
async def upload_photo(
    file: UploadFile = File(...),
    inspection_id: str = Form(...),
    description: str = Form(default=""),
    current_user: dict = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10MB limit")

    supabase = get_supabase()
    assert_owner(supabase, inspection_id, current_user)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{inspection_id}/{uuid.uuid4()}.{ext}"

    storage_response = supabase.storage.from_(STORAGE_BUCKET).upload(
        filename,
        contents,
        {"content-type": file.content_type},
    )

    public_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(filename)

    record = {
        "inspection_id": inspection_id,
        "url": public_url,
        "filename": filename,
        "content_type": file.content_type,
        "size_bytes": len(contents),
        "description": description,
        "uploaded_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("photos").insert(record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save photo record")
    sync_complaint(inspection_id, current_user, started=True)
    return result.data[0]


@router.get("/{inspection_id}/list")
def list_photos(inspection_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    assert_viewer(supabase, inspection_id, current_user)
    result = (
        supabase.table("photos")
        .select("*")
        .eq("inspection_id", inspection_id)
        .order("created_at", desc=False)
        .execute()
    )
    mark_started(inspection_id, current_user)
    return result.data or []


@router.delete("/{photo_id}")
def delete_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    rows = supabase.table("photos").select("filename, uploaded_by, inspection_id").eq("id", photo_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Photo not found")
    photo = rows[0]
    assert_owner(supabase, photo["inspection_id"], current_user)

    supabase.table("group_photos").delete().eq("photo_id", photo_id).execute()
    supabase.table("findings").delete().eq("photo_id", photo_id).execute()

    try:
        supabase.storage.from_(STORAGE_BUCKET).remove([photo["filename"]])
    except Exception:
        pass
    supabase.table("photos").delete().eq("id", photo_id).execute()
    return {"message": "Photo deleted"}


@router.get("/{photo_id}")
def get_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    rows = supabase.table("photos").select("*").eq("id", photo_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Photo not found")
    assert_viewer(supabase, rows[0]["inspection_id"], current_user)
    return rows[0]
