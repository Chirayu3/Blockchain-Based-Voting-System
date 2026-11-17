import os
import base64
import cv2
import numpy as np

class FaceQualityError(Exception):
    pass

class FaceDetector:
    def __init__(self, model_path: str = None, conf_threshold: float = 0.6, nms_threshold: float = 0.3):
        if model_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_dir, "models", "face_detection_yunet_2023mar.onnx")
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"YuNet model not found at {model_path}")

        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold
        # Initial detector with default input size (will be updated dynamically on frame input)
        self.detector = cv2.FaceDetectorYN.create(
            self.model_path,
            "",
            (320, 320),
            self.conf_threshold,
            self.nms_threshold,
            5000
        )

    @staticmethod
    def decode_image(image_input: str | bytes) -> np.ndarray:
        """Decodes base64 string or raw bytes to an OpenCV BGR image."""
        if isinstance(image_input, str):
            if "," in image_input:
                image_input = image_input.split(",", 1)[1]
            raw_bytes = base64.b64decode(image_input)
        else:
            raw_bytes = image_input

        nparr = np.frombuffer(raw_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise FaceQualityError("Unable to decode image data into a valid image")
        return img

    def check_quality(self, img: np.ndarray) -> dict:
        """Evaluates blur (Laplacian variance) and illumination (mean luminance)."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(np.mean(gray))

        is_blurred = blur_score < 40.0
        is_poor_lighting = brightness < 35.0 or brightness > 225.0

        return {
            "blur_score": blur_score,
            "is_blurred": is_blurred,
            "brightness": brightness,
            "is_poor_lighting": is_poor_lighting,
        }

    def detect_single_face(self, img: np.ndarray) -> tuple[np.ndarray, dict]:
        """
        Detects faces in the image. Requires exactly one face meeting quality constraints.
        Returns:
            face_feature: 15-element array [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
            quality: dictionary of quality metrics
        """
        h, w = img.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(img)

        quality = self.check_quality(img)

        if faces is None or len(faces) == 0:
            raise FaceQualityError("No face detected in the image. Please position your face inside the frame.")

        if len(faces) > 1:
            raise FaceQualityError("Multiple faces detected. Exactly one face must be visible in the camera frame.")

        face = faces[0]
        score = float(face[-1])
        x, y, fw, fh = map(int, face[:4])

        if fw < 60 or fh < 60:
            raise FaceQualityError("Face is too far from camera. Please move closer to the lens.")

        if quality["is_blurred"]:
            raise FaceQualityError(f"Image is too blurry (blur variance: {quality['blur_score']:.1f}). Please hold still.")

        if quality["is_poor_lighting"]:
            raise FaceQualityError(f"Suboptimal lighting detected (mean luminance: {quality['brightness']:.1f}). Ensure adequate, even lighting.")

        quality["detection_score"] = score
        quality["bbox"] = {"x": x, "y": y, "width": fw, "height": fh}
        return face, quality
