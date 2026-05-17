import os
import base64
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from auth import get_current_user

router = APIRouter()

HF_API_URL = os.getenv("HF_API_URL", "")
HF_TOKEN = os.getenv("HF_TOKEN", "")
DEFECT_CLASSES = ["crack", "faded_paint", "spalling", "water_stain"]
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.3"))


class BoundingBox(BaseModel):
    xmin: float
    ymin: float
    xmax: float
    ymax: float


class DetectionResult(BaseModel):
    label: str
    score: float
    box: BoundingBox


class DetectionResponse(BaseModel):
    detections: List[DetectionResult]
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    model: str = "RT-DETR"


@router.post("/detect", response_model=DetectionResponse)
async def detect_defects(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()

    if not HF_API_URL or not HF_TOKEN:
        return DetectionResponse(
            detections=[
                DetectionResult(
                    label="crack",
                    score=0.92,
                    box=BoundingBox(xmin=120, ymin=80, xmax=340, ymax=210),
                ),
                DetectionResult(
                    label="water_stain",
                    score=0.76,
                    box=BoundingBox(xmin=400, ymin=150, xmax=580, ymax=300),
                ),
            ],
            model="RT-DETR (mock)",
        )

    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": file.content_type,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(HF_API_URL, headers=headers, content=contents)

    if response.status_code == 503:
        raise HTTPException(status_code=503, detail="AI model is loading, please retry in 30 seconds")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI model returned error: {response.status_code}")

    raw_results = response.json()

    detections = []
    for item in raw_results:
        score = item.get("score", 0)
        label = item.get("label", "").lower().replace(" ", "_")
        if score < CONFIDENCE_THRESHOLD:
            continue
        if label not in DEFECT_CLASSES:
            continue
        box_data = item.get("box", {})
        detections.append(
            DetectionResult(
                label=label,
                score=round(score, 4),
                box=BoundingBox(
                    xmin=box_data.get("xmin", 0),
                    ymin=box_data.get("ymin", 0),
                    xmax=box_data.get("xmax", 0),
                    ymax=box_data.get("ymax", 0),
                ),
            )
        )

    return DetectionResponse(detections=detections, model="RT-DETR")


@router.get("/classes")
def get_defect_classes(current_user: dict = Depends(get_current_user)):
    return {
        "classes": DEFECT_CLASSES,
        "descriptions": {
            "crack": "Structural or surface crack on building material",
            "faded_paint": "Deteriorated or faded paint coating on surfaces",
            "spalling": "Concrete spalling – flaking or chipping of surface material",
            "water_stain": "Water staining or moisture damage on surfaces",
        },
    }
