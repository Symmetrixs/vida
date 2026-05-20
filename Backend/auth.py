import os
import bcrypt
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SECRET_KEY = os.getenv("JWT_SECRET", "vida-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "inspector"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class PasswordReset(BaseModel):
    token: str
    new_password: str


class ForgotPassword(BaseModel):
    email: EmailStr


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def send_reset_email(to_email: str, reset_token: str) -> None:
    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;font-family:Inter,Arial,sans-serif;background:#f1f5f9;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
        <tr>
          <td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;text-align:center;">
                  <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:rgba(255,255,255,0.15);margin-bottom:12px;">
                    <span style="color:#ffffff;font-size:28px;font-weight:900;line-height:1;">V</span>
                  </div>
                  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">VIDA</h1>
                  <p style="margin:4px 0 0;color:#93c5fd;font-size:12px;">Visual Infrastructure Defect Analyzer</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px;">
                  <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:700;">Reset your password</h2>
                  <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
                    We received a request to reset your VIDA account password.
                    Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
                  </p>
                  <div style="text-align:center;margin:28px 0;">
                    <a href="{reset_link}"
                       style="display:inline-block;padding:14px 32px;background:#2563eb;color:#ffffff;
                              text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;
                              letter-spacing:0.3px;box-shadow:0 4px 12px rgba(37,99,235,0.35);">
                      Reset Password
                    </a>
                  </div>
                  <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.6;">
                    If you did not request this, you can safely ignore this email.<br/>
                    This link will expire in 1 hour.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px;border-top:1px solid #f1f5f9;text-align:center;">
                  <p style="margin:0;color:#cbd5e1;font-size:11px;">
                    &copy; {datetime.now().year} UTeM &ndash; Faculty of ICT &nbsp;&middot;&nbsp; VIDA System
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your VIDA password"
    msg["From"] = f"VIDA <{EMAIL_FROM}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(EMAIL_FROM, to_email, msg.as_string())


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise credentials_exception
    return result.data


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user: UserRegister):
    supabase = get_supabase()
    existing = supabase.table("users").select("id").eq("email", user.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(user.password)
    is_admin_role = user.role == "admin"

    new_user = {
        "name": user.name,
        "email": user.email,
        "password_hash": hashed,
        "role": user.role,
        "is_active": True,
        "is_approved": None if is_admin_role else True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("users").insert(new_user).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Registration failed")

    created = result.data[0]

    if is_admin_role:
        return {
            "status": "pending",
            "message": "Your admin account is pending approval from an existing administrator.",
            "user": {
                "id": created["id"],
                "name": created["name"],
                "email": created["email"],
                "role": created["role"],
            },
        }

    token = create_access_token({"sub": str(created["id"]), "role": created["role"]})
    return Token(access_token=token, token_type="bearer", user={
        "id": created["id"], "name": created["name"],
        "email": created["email"], "role": created["role"],
    })


@router.post("/login", response_model=Token)
def login(form_data: UserLogin):
    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("email", form_data.email).single().execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = result.data
    if not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")

    if user.get("role") == "admin":
        approved = user.get("is_approved")
        if approved is False:
            raise HTTPException(status_code=403, detail="Account rejected")
        if approved is None:
            raise HTTPException(status_code=403, detail="Account pending approval")

    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    return Token(access_token=token, token_type="bearer", user={
        "id": user["id"], "name": user["name"],
        "email": user["email"], "role": user["role"],
    })


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    current_user.pop("password_hash", None)
    return current_user


@router.post("/forgot-password")
def forgot_password(body: ForgotPassword):
    supabase = get_supabase()
    result = supabase.table("users").select("id, email").eq("email", body.email).execute()
    if not result.data:
        return {"message": "If the email exists, a reset link has been sent."}

    user = result.data[0]
    reset_token = create_access_token({"sub": str(user["id"]), "purpose": "reset"}, timedelta(hours=1))

    supabase.table("password_resets").insert({
        "user_id": user["id"],
        "token": reset_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }).execute()

    try:
        send_reset_email(user["email"], reset_token)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reset email: {str(e)}")

    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: PasswordReset):
    try:
        payload = jwt.decode(body.token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "reset":
            raise HTTPException(status_code=400, detail="Invalid reset token")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    supabase = get_supabase()
    hashed = hash_password(body.new_password)
    supabase.table("users").update({"password_hash": hashed}).eq("id", user_id).execute()
    supabase.table("password_resets").delete().eq("user_id", user_id).execute()
    return {"message": "Password reset successfully"}


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    return {"message": "Logged out successfully"}