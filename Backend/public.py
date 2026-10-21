import hashlib
import hmac
import io
import os
import re
import secrets
import socket
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from jose import JWTError, jwt
from PIL import Image, ImageOps
from pydantic import EmailStr, TypeAdapter, ValidationError
from supabase import create_client, Client

from auth import ALGORITHM, SECRET_KEY

router = APIRouter()

COMPLAINT_BUCKET = os.getenv("COMPLAINT_BUCKET", "vida-complaints")
IP_HASH_SALT = os.getenv("IP_HASH_SALT", SECRET_KEY)
RATE_LIMIT_PER_HOUR = int(os.getenv("COMPLAINT_RATE_LIMIT", "5"))
TRUSTED_PROXY_HOSTS = [h.strip() for h in os.getenv("TRUSTED_PROXY_HOSTS", "").split(",") if h.strip()]
CAPTCHA_TTL_SECONDS = 600
MAX_PHOTOS = 3
MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
ALLOWED_FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG":  ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
PHONE_RE = re.compile(r"^[0-9+()\-\s]{6,20}$")
EMAIL_ADAPTER = TypeAdapter(EmailStr)

_burned_nonces: dict = {}


def get_supabase() -> Client:
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))


def format_reference(ref_no: int) -> str:
    return f"VIDA-C-{ref_no:04d}"


def _trusted_proxy_ips() -> set:
    ips = set()
    for host in TRUSTED_PROXY_HOSTS:
        try:
            ips.update(info[4][0] for info in socket.getaddrinfo(host, None))
        except socket.gaierror:
            pass
    return ips


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip and TRUSTED_PROXY_HOSTS and peer in _trusted_proxy_ips():
        return real_ip
    return peer


def hash_ip(ip: str) -> str:
    return hmac.new(IP_HASH_SALT.encode("utf-8"), ip.encode("utf-8"), hashlib.sha256).hexdigest()


def _answer_digest(nonce: str, answer: str) -> str:
    return hmac.new(SECRET_KEY.encode("utf-8"), f"{nonce}:{answer}".encode("utf-8"), hashlib.sha256).hexdigest()


def _burn_nonce(nonce: str) -> None:
    now = time.time()
    for key in [k for k, exp in _burned_nonces.items() if exp < now]:
        _burned_nonces.pop(key, None)
    _burned_nonces[nonce] = now + CAPTCHA_TTL_SECONDS


def issue_captcha() -> dict:
    a = secrets.randbelow(40) + 10
    b = secrets.randbelow(9) + 1
    nonce = secrets.token_urlsafe(16)
    token = jwt.encode({
        "purpose": "captcha",
        "nonce":   nonce,
        "digest":  _answer_digest(nonce, str(a + b)),
        "exp":     datetime.now(timezone.utc) + timedelta(seconds=CAPTCHA_TTL_SECONDS),
    }, SECRET_KEY, algorithm=ALGORITHM)
    return {"question": f"{a} + {b}", "token": token}


def verify_captcha(token: str, answer: str) -> str:
    invalid = HTTPException(status_code=400, detail="Captcha answer is wrong or expired. Please try a new one.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise invalid
    nonce = payload.get("nonce")
    if payload.get("purpose") != "captcha" or not nonce or nonce in _burned_nonces:
        raise invalid
    _burn_nonce(nonce)
    if not hmac.compare_digest(payload.get("digest", ""), _answer_digest(nonce, answer.strip())):
        raise invalid
    return nonce


def clean_image(data: bytes) -> dict:
    rejected = HTTPException(status_code=400, detail="Each photo must be a valid JPEG, PNG or WEBP image.")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            width, height = probe.size
            probe.verify()
        if fmt not in ALLOWED_FORMATS or width * height > MAX_PIXELS:
            raise rejected
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)
            if fmt == "JPEG":
                img = img.convert("RGB")
            elif img.mode not in ("RGB", "RGBA", "L", "LA"):
                img = img.convert("RGBA")
            out = io.BytesIO()
            save_args = {"quality": 90} if fmt in ("JPEG", "WEBP") else {}
            img.save(out, format=fmt, **save_args)
            width, height = img.size
    except HTTPException:
        raise
    except Exception:
        raise rejected
    cleaned = out.getvalue()
    if len(cleaned) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Each photo must be 5 MB or smaller.")
    content_type, ext = ALLOWED_FORMATS[fmt]
    return {"bytes": cleaned, "content_type": content_type, "ext": ext, "width": width, "height": height}


def _text(value: str, field: str, min_len: int, max_len: int) -> str:
    value = (value or "").strip()
    if not min_len <= len(value) <= max_len:
        raise HTTPException(status_code=400, detail=f"{field} must be between {min_len} and {max_len} characters.")
    return value


def _optional_text(value: str, field: str, max_len: int):
    value = (value or "").strip()
    if len(value) > max_len:
        raise HTTPException(status_code=400, detail=f"{field} must be at most {max_len} characters.")
    return value or None


def _check_rate_limit(supabase: Client, ip_hash: str) -> None:
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    result = (
        supabase.table("complaints")
        .select("id", count="exact")
        .eq("ip_hash", ip_hash)
        .gte("created_at", since)
        .execute()
    )
    if (result.count or 0) >= RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many reports from your network. Please try again in an hour.")


@router.get("/buildings")
def public_buildings():
    supabase = get_supabase()
    result = supabase.table("buildings").select("id, name, code, floors").order("name").execute()
    return result.data or []


@router.get("/captcha")
def captcha():
    return issue_captcha()


@router.post("/complaints", status_code=201)
async def submit_complaint(
    request: Request,
    building_id: str = Form(...),
    floor: str = Form(...),
    location_note: str = Form(...),
    description: str = Form(...),
    captcha_token: str = Form(...),
    captcha_answer: str = Form(...),
    reporter_name: str = Form(""),
    reporter_email: str = Form(""),
    reporter_phone: str = Form(""),
    website: str = Form(""),
    photos: List[UploadFile] = File(...),
):
    supabase = get_supabase()
    ip_hash = hash_ip(client_ip(request))
    _check_rate_limit(supabase, ip_hash)

    if website.strip():
        raise HTTPException(status_code=400, detail="Submission rejected.")

    nonce = verify_captcha(captcha_token, captcha_answer)

    if not UUID_RE.match(building_id or ""):
        raise HTTPException(status_code=400, detail="Please choose a building.")
    floor = _text(floor, "Floor", 1, 40)
    location_note = _text(location_note, "Location", 1, 200)
    description = _text(description, "Description", 10, 2000)
    reporter_name = _optional_text(reporter_name, "Name", 100)
    reporter_email = _optional_text(reporter_email, "Email", 254)
    reporter_phone = _optional_text(reporter_phone, "Phone", 20)
    if reporter_email:
        try:
            reporter_email = EMAIL_ADAPTER.validate_python(reporter_email)
        except ValidationError:
            raise HTTPException(status_code=400, detail="Email address is not valid.")
    if reporter_phone and not PHONE_RE.match(reporter_phone):
        raise HTTPException(status_code=400, detail="Phone number is not valid.")

    if not 1 <= len(photos) <= MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Attach between 1 and {MAX_PHOTOS} photos.")
    cleaned = []
    for photo in photos:
        data = await photo.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="Each photo must be 5 MB or smaller.")
        cleaned.append(clean_image(data))

    building = supabase.table("buildings").select("id").eq("id", building_id).execute().data or []
    if not building:
        raise HTTPException(status_code=400, detail="Please choose a building.")

    try:
        inserted = supabase.table("complaints").insert({
            "building_id":    building_id,
            "floor":          floor,
            "location_note":  location_note,
            "description":    description,
            "reporter_name":  reporter_name,
            "reporter_email": reporter_email,
            "reporter_phone": reporter_phone,
            "ip_hash":        ip_hash,
            "captcha_nonce":  nonce,
        }).execute()
    except Exception as e:
        if getattr(e, "code", "") == "23505":
            raise HTTPException(status_code=400, detail="Captcha answer is wrong or expired. Please try a new one.")
        raise HTTPException(status_code=500, detail="Could not save your report. Please try again.")
    if not inserted.data:
        raise HTTPException(status_code=500, detail="Could not save your report. Please try again.")
    complaint = inserted.data[0]

    bucket = supabase.storage.from_(COMPLAINT_BUCKET)
    uploaded = []
    try:
        rows = []
        for item in cleaned:
            path = f"{complaint['id']}/{uuid.uuid4()}.{item['ext']}"
            bucket.upload(path, item["bytes"], {"content-type": item["content_type"]})
            uploaded.append(path)
            rows.append({
                "complaint_id": complaint["id"],
                "storage_path": path,
                "content_type": item["content_type"],
                "size_bytes":   len(item["bytes"]),
                "width":        item["width"],
                "height":       item["height"],
            })
        supabase.table("complaint_photos").insert(rows).execute()
    except Exception:
        if uploaded:
            try:
                bucket.remove(uploaded)
            except Exception:
                pass
        supabase.table("complaints").delete().eq("id", complaint["id"]).execute()
        raise HTTPException(status_code=500, detail="Could not save your photos. Please try again.")

    return {"reference": format_reference(complaint["ref_no"]), "status": "pending"}
