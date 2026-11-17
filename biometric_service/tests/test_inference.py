import os
import sys
import pytest
from fastapi.testclient import TestClient
import numpy as np
import cv2

# Add parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app, INTERNAL_SECRET
from recognizer import FaceRecognizer

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "detector" in data["models"]
    assert "recognizer" in data["models"]
    assert "pad" in data["models"]

def test_unauthorized_access_rejected():
    res = client.post("/extract/embedding", json={"image": "invalid"})
    assert res.status_code == 403

def test_embedding_cosine_match_genuine():
    rec = FaceRecognizer()
    # Identical vectors should have similarity = 1.0
    vec = np.random.randn(128).astype(np.float32)
    vec /= np.linalg.norm(vec)

    res = client.post(
        "/verify/match",
        headers={"X-Internal-Secret": INTERNAL_SECRET},
        json={
            "candidateEmbedding": vec.tolist(),
            "registeredEmbedding": vec.tolist(),
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["matched"] is True
    assert abs(data["similarity"] - 1.0) < 1e-4

def test_embedding_cosine_match_impostor():
    # Two orthogonal vectors should have similarity near 0.0, below threshold
    v1 = np.zeros(128, dtype=np.float32)
    v1[0] = 1.0
    v2 = np.zeros(128, dtype=np.float32)
    v2[1] = 1.0

    res = client.post(
        "/verify/match",
        headers={"X-Internal-Secret": INTERNAL_SECRET},
        json={
            "candidateEmbedding": v1.tolist(),
            "registeredEmbedding": v2.tolist(),
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["matched"] is False
    assert data["similarity"] < 0.363
