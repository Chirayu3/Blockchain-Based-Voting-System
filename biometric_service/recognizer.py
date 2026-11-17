import os
import cv2
import numpy as np

class FaceRecognizer:
    def __init__(self, model_path: str = None, match_threshold: float = None):
        if model_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_dir, "models", "face_recognition_sface_2021dec.onnx")

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"SFace model not found at {model_path}")

        self.model_path = model_path
        self.model_identifier = "sface-opencv-2021dec"
        self.model_version = "2021dec"
        self.embedding_dimension = 128

        # SFace official cosine distance threshold is 0.363 (higher similarity means genuine match)
        # SFace cosine similarity match return in OpenCV: higher is closer match
        env_threshold = os.environ.get("BIOMETRIC_MATCH_THRESHOLD")
        if match_threshold is not None:
            self.match_threshold = match_threshold
        elif env_threshold:
            self.match_threshold = float(env_threshold)
        else:
            self.match_threshold = 0.363

        self.recognizer = cv2.FaceRecognizerSF.create(self.model_path, "")

    def extract_embedding(self, img: np.ndarray, face_feature: np.ndarray) -> np.ndarray:
        """
        Aligns the face and extracts 128-d normalized feature embedding.
        """
        aligned_face = self.recognizer.alignCrop(img, face_feature)
        feature = self.recognizer.feature(aligned_face)
        # Ensure 1D float32 array
        embedding = np.squeeze(feature).astype(np.float32)
        # Ensure L2 unit norm
        norm = np.linalg.norm(embedding)
        if norm > 1e-6:
            embedding = embedding / norm
        return embedding

    def compare_embeddings(self, emb1: np.ndarray, emb2: np.ndarray) -> tuple[bool, float]:
        """
        Computes cosine similarity between two 128-d embeddings.
        Returns: (is_match, similarity_score)
        """
        e1 = np.asarray(emb1, dtype=np.float32).flatten()
        e2 = np.asarray(emb2, dtype=np.float32).flatten()

        norm1 = np.linalg.norm(e1)
        norm2 = np.linalg.norm(e2)

        if norm1 < 1e-6 or norm2 < 1e-6:
            return False, 0.0

        # Cosine similarity
        score = float(np.dot(e1, e2) / (norm1 * norm2))
        is_match = score >= self.match_threshold
        return is_match, score
