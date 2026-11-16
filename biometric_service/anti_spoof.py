import os
import cv2
import numpy as np
import onnxruntime as ort

class AntiSpoofError(Exception):
    pass

class AntiSpoofDetector:
    def __init__(self, model_path: str = None, pad_threshold: float = 0.65):
        if model_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_dir, "models", "minifasnet_v2.onnx")

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"MiniFASNet model not found at {model_path}")

        self.model_path = model_path
        self.pad_threshold = pad_threshold
        # Load ONNX session for CPU execution
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        self.session = ort.InferenceSession(self.model_path, opts, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    @staticmethod
    def crop_face_scaled(img: np.ndarray, bbox: list | np.ndarray, scale: float = 2.7) -> np.ndarray:
        """
        Crops face region expanded by scale parameter for MiniFASNet context.
        bbox: [x, y, w, h]
        """
        x, y, w, h = [int(v) for v in bbox[:4]]
        img_h, img_w = img.shape[:2]

        cx = x + w / 2
        cy = y + h / 2
        max_side = max(w, h) * scale

        x1 = int(max(0, cx - max_side / 2))
        y1 = int(max(0, cy - max_side / 2))
        x2 = int(min(img_w, cx + max_side / 2))
        y2 = int(min(img_h, cy + max_side / 2))

        crop = img[y1:y2, x1:x2]
        if crop.size == 0:
            crop = img[max(0, y):min(img_h, y+h), max(0, x):min(img_w, x+w)]
        return crop

    def predict_passive_pad(self, img: np.ndarray, bbox: list | np.ndarray) -> tuple[bool, float]:
        """
        Runs MiniFASNet passive presentation attack detection.
        Returns: (is_live, real_face_probability)
        """
        crop = self.crop_face_scaled(img, bbox, scale=2.7)
        if crop.shape[0] < 10 or crop.shape[1] < 10:
            return False, 0.0

        # MiniFASNet expects 80x80 BGR image normalized
        resized = cv2.resize(crop, (80, 80))
        inp = resized.astype(np.float32)
        # Transpose HWC -> CHW and add batch dimension -> [1, 3, 80, 80]
        inp = np.transpose(inp, (2, 0, 1))
        inp = np.expand_dims(inp, axis=0)

        raw_outputs = self.session.run([self.output_name], {self.input_name: inp})[0]
        logits = raw_outputs[0]

        # Softmax
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)

        # In MiniFASNetV2, class 1 is genuine face, class 0/2 are 2D paper / screen spoof
        real_score = float(probs[1])
        is_live = real_score >= self.pad_threshold
        return is_live, real_score

    @staticmethod
    def calculate_pose_yaw_ratio(face_landmarks: np.ndarray) -> float:
        """
        Computes the ratio of distance(nose, left_eye) to distance(nose, right_eye).
        face_landmarks: 15-element array from YuNet.
        Landmark indices:
          right_eye: (face[4], face[5])
          left_eye: (face[6], face[7])
          nose_tip: (face[8], face[9])
        """
        rx, ry = face_landmarks[4], face_landmarks[5]
        lx, ly = face_landmarks[6], face_landmarks[7]
        nx, ny = face_landmarks[8], face_landmarks[9]

        dist_right = float(np.hypot(nx - rx, ny - ry)) + 1e-5
        dist_left = float(np.hypot(nx - lx, ny - ly)) + 1e-5

        # ratio = dist_left / dist_right
        # Close to 1.0 => looking forward
        # < 0.65 => turned left
        # > 1.5 => turned right
        return dist_left / dist_right

    def verify_active_challenge(
        self,
        frames_data: list[tuple[np.ndarray, np.ndarray]],
        expected_instructions: list[str]
    ) -> tuple[bool, str]:
        """
        Verifies that sequential frames comply with the issued challenge instructions.
        frames_data: list of (img, face_features) corresponding to frames.
        expected_instructions: list of actions (e.g. ['look_center', 'turn_left', 'turn_right'])
        """
        if len(frames_data) < len(expected_instructions):
            return False, f"Insufficient frames: received {len(frames_data)}, required {len(expected_instructions)}"

        # 1. Motion verification across frames: detect static photo / replay
        pose_ratios = []
        for i, (img, face) in enumerate(frames_data[:len(expected_instructions)]):
            ratio = self.calculate_pose_yaw_ratio(face)
            pose_ratios.append(ratio)

        # Check motion variance
        variance = float(np.var(pose_ratios))
        if len(expected_instructions) > 1 and variance < 0.005:
            return False, "Zero head motion detected. Static photo or frozen replay rejected."

        # Verify each instruction
        for i, instruction in enumerate(expected_instructions):
            ratio = pose_ratios[i]
            if instruction == "look_center":
                if not (0.60 <= ratio <= 1.65):
                    return False, f"Step {i+1} failed: Expected center gaze, detected yaw angle deviation (ratio {ratio:.2f})"
            elif instruction == "turn_left":
                if ratio > 0.85:
                    return False, f"Step {i+1} failed: Expected head turn to the left, but head remained forward or right (ratio {ratio:.2f})"
            elif instruction == "turn_right":
                if ratio < 1.15:
                    return False, f"Step {i+1} failed: Expected head turn to the right, but head remained forward or left (ratio {ratio:.2f})"

        return True, "Active challenge verified successfully"
