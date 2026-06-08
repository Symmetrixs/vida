import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from auth import router as auth_router
from admin import router as admin_router
from vessel import router as vessel_router
from inspection import router as inspection_router
from finding import router as finding_router
from photo import router as photo_router
from report import router as report_router
from recommendation import router as recommendation_router
from notification import router as notification_router
from inspector import router as inspector_router
from ai_detection import router as ai_router
from group import router as group_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from ai_detection import _load_model
        _load_model()
        print("[VIDA] AI model loaded on startup")
    except Exception as e:
        print(f"[VIDA] AI model load failed (will retry on first request): {e}")
    yield


app = FastAPI(
    title="VIDA API",
    description="Visual Infrastructure Defect Analyzer – UTeM Campus",
    version="1.1.0",
    lifespan=lifespan,
)

origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,           prefix="/auth",            tags=["Authentication"])
app.include_router(admin_router,          prefix="/admin",           tags=["Admin"])
app.include_router(vessel_router,         prefix="/buildings",       tags=["Buildings"])
app.include_router(inspection_router,     prefix="/inspections",     tags=["Inspections"])
app.include_router(finding_router,        prefix="/findings",        tags=["Findings"])
app.include_router(photo_router,          prefix="/photos",          tags=["Photos"])
app.include_router(ai_router,             prefix="/ai",              tags=["AI Detection"])
app.include_router(report_router,         prefix="/reports",         tags=["Reports"])
app.include_router(recommendation_router, prefix="/recommendations",  tags=["Recommendations"])
app.include_router(notification_router,   prefix="/notifications",   tags=["Notifications"])
app.include_router(inspector_router,      prefix="/inspector",       tags=["Inspector"])
app.include_router(group_router,          prefix="/groups",          tags=["Groups"])


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "VIDA API", "version": "1.1.0"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}