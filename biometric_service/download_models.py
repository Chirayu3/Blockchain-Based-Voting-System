import os
import hashlib
import urllib.request

MODELS = {
    "yunet": {
        "filename": "face_detection_yunet_2023mar.onnx",
        "url": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "sha256": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
        "license": "Apache-2.0 (OpenCV)",
        "version": "2023mar",
    },
    "sface": {
        "filename": "face_recognition_sface_2021dec.onnx",
        "url": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "sha256": "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
        "license": "Apache-2.0 (OpenCV / BUPT)",
        "version": "2021dec",
    },
    "minifasnet": {
        "filename": "minifasnet_v2.onnx",
        "url": "https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx",
        "sha256": "d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b",
        "license": "Apache-2.0 (Minivision)",
        "version": "v2_80x80",
    },
}

def verify_file_sha256(filepath: str, expected_sha256: str) -> bool:
    if not os.path.exists(filepath):
        return False
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().lower() == expected_sha256.lower()

def download_models(models_dir: str = None):
    if models_dir is None:
        models_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(models_dir, exist_ok=True)

    for name, info in MODELS.items():
        dest = os.path.join(models_dir, info["filename"])
        if verify_file_sha256(dest, info["sha256"]):
            print(f"[{name.upper()}] Verified valid model file: {info['filename']}")
            continue

        print(f"[{name.upper()}] Downloading {info['filename']} from {info['url']}...")
        req = urllib.request.Request(
            info["url"],
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req) as resp, open(dest, "wb") as out:
            while chunk := resp.read(65536):
                out.write(chunk)

        if not verify_file_sha256(dest, info["sha256"]):
            os.remove(dest)
            raise ValueError(
                f"Checksum mismatch for {name}! Download aborted for security."
            )
        print(f"[{name.upper()}] Downloaded and verified SHA256: {info['sha256']}")

if __name__ == "__main__":
    download_models()
