import os
import time
from typing import Optional
from fastapi import FastAPI, Header, HTTPException, Depends, status
from pydantic import BaseModel, Field
import numpy as np

from detector import FaceDetector, FaceQualityError
from recognizer import FaceRecognizer
from anti_spoof import AntiSpoofDetector, AntiSpoofError

DEFAULT_INTERNAL_SECRET = "b10m3tr1c_s3rv1c3_s3cr3t_2026_d3v"
INTERNAL_SECRET = os.environ.get("BIOMETRIC_SERVICE_SECRET", DEFAULT_INTERNAL_SECRET)

app = FastAPI(
    title="Biometric Authentication Microservice",
    description="Internal biometric inference engine for face detection, SFace recognition, and MiniFASNet presentation attack detection.",
    version="1.0.0"
)

# Initialize inference engines
try:
    detector = FaceDetector()
    recognizer = FaceRecognizer()
    anti_spoof = AntiSpoofDetector()
    models_loaded = True
except Exception as e:
    print(f"[FATAL] Failed to initialize biometric models: {e}")
    detector = None
    recognizer = None
    anti_spoof = None
    models_loaded = False

def verify_internal_secret(x_internal_secret: Optional[str] = Header(None)):
    if not x_internal_secret or x_internal_secret != INTERNAL_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing internal service secret"
        )

# Request Models
class QualityCheckRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded image string")

class LivenessCheckRequest(BaseModel):
    frames: list[str] = Field(..., min_items=1, description="List of base64 encoded frames")
    instructions: list[str] = Field(..., min_items=1, description="List of expected challenge actions")

class ExtractEmbeddingRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded image string")

class MatchRequest(BaseModel):
    candidateEmbedding: list[float] = Field(..., description="Candidate face embedding vector")
    registeredEmbedding: list[float] = Field(..., description="Enrolled face embedding vector")

@app.get("/health")
def health():
    if not models_loaded:
        raise HTTPException(status_code=503, detail="Biometric models failed to initialize")
    return {
        "status": "healthy",
        "models": {
            "detector": "face_detection_yunet_2023mar.onnx (Apache-2.0)",
            "recognizer": "face_recognition_sface_2021dec.onnx (Apache-2.0)",
            "pad": "minifasnet_v2.onnx (Apache-2.0)",
        },
        "dimension": recognizer.embedding_dimension if recognizer else 128,
        "match_threshold": recognizer.match_threshold if recognizer else 0.363,
        "pad_threshold": anti_spoof.pad_threshold if anti_spoof else 0.65,
    }

@app.post("/verify/quality", dependencies=[Depends(verify_internal_secret)])
def verify_quality(req: QualityCheckRequest):
    if not models_loaded:
        raise HTTPException(status_code=503, detail="Biometric engine unavailable")

    try:
        img = detector.decode_image(req.image)
        face, quality = detector.detect_single_face(img)
        return {
            "valid": True,
            "quality": quality,
        }
    except FaceQualityError as fqe:
        return {
            "valid": False,
            "error": str(fqe),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing error: {str(e)}")

@app.post("/verify/liveness", dependencies=[Depends(verify_internal_secret)])
def verify_liveness(req: LivenessCheckRequest):
    if not models_loaded:
        raise HTTPException(status_code=503, detail="Biometric engine unavailable")

    try:
        decoded_frames = []
        for frame_str in req.frames:
            img = detector.decode_image(frame_str)
            face, _ = detector.detect_single_face(img)
            decoded_frames.append((img, face))

        # 1. Passive presentation attack detection on primary frame
        primary_img, primary_face = decoded_frames[0]
        is_live_passive, pad_score = anti_spoof.predict_passive_pad(primary_img, primary_face[:4])

        if not is_live_passive:
            return {
                "is_live": False,
                "pad_score": pad_score,
                "error": f"Passive presentation attack detected (spoof probability: {1.0 - pad_score:.2f}). Printed photo or digital screen replay rejected.",
            }

        # 2. Active challenge motion verification across sequential frames
        active_ok, msg = anti_spoof.verify_active_challenge(decoded_frames, req.instructions)
        if not active_ok:
            return {
                "is_live": False,
                "pad_score": pad_score,
                "error": msg,
            }

        return {
            "is_live": True,
            "pad_score": pad_score,
            "message": "Presentation attack detection and active liveness passed",
        }
    except FaceQualityError as fqe:
        return {
            "is_live": False,
            "pad_score": 0.0,
            "error": str(fqe),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Liveness evaluation error: {str(e)}")

@app.post("/extract/embedding", dependencies=[Depends(verify_internal_secret)])
def extract_embedding(req: ExtractEmbeddingRequest):
    if not models_loaded:
        raise HTTPException(status_code=503, detail="Biometric engine unavailable")

    try:
        img = detector.decode_image(req.image)
        face, quality = detector.detect_single_face(img)
        embedding = recognizer.extract_embedding(img, face)

        return {
            "success": True,
            "embedding": embedding.tolist(),
            "modelIdentifier": recognizer.model_identifier,
            "modelVersion": recognizer.model_version,
            "embeddingDimension": recognizer.embedding_dimension,
            "quality": quality,
        }
    except FaceQualityError as fqe:
        return {
            "success": False,
            "error": str(fqe),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Feature extraction error: {str(e)}")

@app.post("/verify/match", dependencies=[Depends(verify_internal_secret)])
def verify_match(req: MatchRequest):
    if not models_loaded:
        raise HTTPException(status_code=503, detail="Biometric engine unavailable")

    try:
        matched, score = recognizer.compare_embeddings(
            req.candidateEmbedding,
            req.registeredEmbedding
        )
        return {
            "matched": matched,
            "similarity": score,
            "threshold": recognizer.match_threshold,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Embedding comparison error: {str(e)}")
