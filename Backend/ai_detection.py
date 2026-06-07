import os
import io
import torch
import numpy as np
from pathlib import Path
from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from auth import get_current_user

router = APIRouter()

MODEL_PATH           = os.getenv("MODEL_PATH", "/app/Model")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))

DEFECT_CLASSES = [
    "crack", "faded_paint", "spalling", "water_stain",
    "rust", "mold", "efflorescence",
]

ID2LABEL = {i: c for i, c in enumerate(DEFECT_CLASSES)}
LABEL2ID = {c: i for i, c in enumerate(DEFECT_CLASSES)}

DEFECT_COLORS = {
    "crack":         "#ef4444",
    "faded_paint":   "#f59e0b",
    "spalling":      "#8b5cf6",
    "water_stain":   "#3b82f6",
    "rust":          "#b45309",
    "mold":          "#16a34a",
    "efflorescence": "#64748b",
}

DEFECT_DESCRIPTIONS = {
    "crack":         "Structural or hairline crack on building surface",
    "faded_paint":   "Deteriorated, peeling, or faded paint on walls",
    "spalling":      "Concrete or plaster breaking off, flaking from surface",
    "water_stain":   "Water staining, dampness or moisture damage on surfaces",
    "rust":          "Rust or corrosion on metallic elements or rebar bleed-through",
    "mold":          "Mold, mildew, algae or biological growth on surfaces",
    "efflorescence": "White chalky salt deposits on concrete, brick or masonry",
}

SEVERITY_RULES = {
    "crack":         lambda s: "high"   if s >= 0.85 else "medium" if s >= 0.55 else "low",
    "spalling":      lambda s: "high"   if s >= 0.80 else "medium" if s >= 0.50 else "low",
    "rust":          lambda s: "high"   if s >= 0.80 else "medium" if s >= 0.50 else "low",
    "faded_paint":   lambda s: "medium" if s >= 0.70 else "low",
    "water_stain":   lambda s: "medium" if s >= 0.65 else "low",
    "mold":          lambda s: "medium" if s >= 0.65 else "low",
    "efflorescence": lambda s: "low",
}

_model     = None
_processor = None
_device    = None


def _load_model():
    global _model, _processor, _device
    if _model is not None:
        return _model, _processor, _device

    model_path = Path(MODEL_PATH)
    if not model_path.exists():
        raise RuntimeError(f"Model not found at {MODEL_PATH}")

    from transformers import RTDetrV2ForObjectDetection, RTDetrImageProcessor

    _device    = "cuda" if torch.cuda.is_available() else "cpu"
    _processor = RTDetrImageProcessor.from_pretrained(str(model_path))
    _model     = RTDetrV2ForObjectDetection.from_pretrained(
        str(model_path),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    ).to(_device)
    _model.eval()
    print(f"[AI] Model loaded from {MODEL_PATH} on {_device}")
    return _model, _processor, _device


def _box_cxcywh_to_xyxy(boxes):
    cx, cy, w, h = boxes.unbind(-1)
    return torch.stack([cx - 0.5*w, cy - 0.5*h, cx + 0.5*w, cy + 0.5*h], dim=-1)


def _infer_severity(label: str, score: float) -> str:
    rule = SEVERITY_RULES.get(label)
    return rule(score) if rule else ("medium" if score >= 0.65 else "low")


def _run_inference(image: Image.Image, conf: float):
    model, processor, device = _load_model()
    w, h    = image.size
    inputs  = processor(images=image, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    logits     = outputs.logits[0]
    pred_boxes = outputs.pred_boxes[0]
    scores_all = torch.sigmoid(logits)
    scores, labels = scores_all.max(dim=-1)

    keep   = scores > conf
    scores = scores[keep].cpu().numpy()
    labels = labels[keep].cpu().numpy()
    boxes  = pred_boxes[keep].cpu()
    boxes  = _box_cxcywh_to_xyxy(boxes).numpy()

    boxes[:, 0] = np.clip(boxes[:, 0] * w, 0, w)
    boxes[:, 1] = np.clip(boxes[:, 1] * h, 0, h)
    boxes[:, 2] = np.clip(boxes[:, 2] * w, 0, w)
    boxes[:, 3] = np.clip(boxes[:, 3] * h, 0, h)

    results = []
    for score, label, box in zip(scores, labels, boxes):
        x1, y1, x2, y2 = box
        bw = float(x2 - x1)
        bh = float(y2 - y1)
        if bw <= 0 or bh <= 0:
            continue
        label_name = ID2LABEL.get(int(label), "unknown")
        results.append({
            "label":    label_name,
            "score":    round(float(score), 4),
            "severity": _infer_severity(label_name, float(score)),
            "box": {
                "xmin": round(float(x1), 1),
                "ymin": round(float(y1), 1),
                "xmax": round(float(x2), 1),
                "ymax": round(float(y2), 1),
            },
        })
    return results


class BoundingBox(BaseModel):
    xmin: float
    ymin: float
    xmax: float
    ymax: float


class DetectionResult(BaseModel):
    label:    str
    score:    float
    severity: str
    box:      BoundingBox


class DetectionResponse(BaseModel):
    detections:  List[DetectionResult]
    model:       str = "RT-DETRv2 (local)"
    total_found: int = 0


@router.post("/detect", response_model=DetectionResponse)
async def detect_defects(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Max 20MB.")

    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        raw = _run_inference(image, CONFIDENCE_THRESHOLD)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    detections = [DetectionResult(**d) for d in raw]
    return DetectionResponse(
        detections=detections,
        model="RT-DETRv2 (local)",
        total_found=len(detections),
    )


@router.get("/classes")
def get_defect_classes(current_user: dict = Depends(get_current_user)):
    return {
        "classes":              DEFECT_CLASSES,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "colors":               DEFECT_COLORS,
        "descriptions":         DEFECT_DESCRIPTIONS,
    }


@router.get("/health")
def model_health():
    model_path = Path(MODEL_PATH)
    if not model_path.exists():
        return {"status": "error", "message": f"Model not found at {MODEL_PATH}"}
    files = [f.name for f in model_path.iterdir() if f.is_file()]
    loaded = _model is not None
    return {
        "status":  "ready" if loaded else "not_loaded",
        "path":    MODEL_PATH,
        "device":  _device or "not loaded",
        "files":   files,
    }