import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "../../axios";

interface BiometricCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "enrollment" | "voting";
  electionId?: number;
  onSuccess: (resultData: any) => void;
}

export const BiometricCaptureModal: React.FC<BiometricCaptureModalProps> = ({
  isOpen,
  onClose,
  mode,
  electionId,
  onSuccess,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string>("");
  const [challengeId, setChallengeId] = useState<string>("");
  const [instructions, setInstructions] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");
  const [consentGiven, setConsentGiven] = useState<boolean>(mode === "voting");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Stop camera tracks helper
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start camera and fetch challenge when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedFrames([]);
      setCurrentStepIndex(0);
      setErrorMsg("");
      setSuccessMsg("");
      setCameraError("");
      return;
    }

    let active = true;

    async function initCamera() {
      try {
        setCameraError("");
        const userStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });

        if (!active) {
          userStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(userStream);
        if (videoRef.current) {
          videoRef.current.srcObject = userStream;
        }
      } catch (err: any) {
        if (!active) return;
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setCameraError("Camera permission denied. Please enable camera access in your browser to proceed with biometric authentication.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setCameraError("No webcam found on this device. Biometric authentication requires a connected camera.");
        } else {
          setCameraError(`Failed to access camera: ${err.message || "Unknown error"}`);
        }
      }
    }

    async function fetchChallenge() {
      try {
        setErrorMsg("");
        const endpoint =
          mode === "enrollment"
            ? "/auth/biometrics/enrollment/challenge"
            : `/polls/${electionId}/biometric/challenge`;

        const res = await axios.post(endpoint);
        if (!active) return;
        setChallengeId(res.data.challengeId);
        setInstructions(res.data.instructions || ["look_center", "turn_left"]);
        setCurrentStepIndex(0);
        setCapturedFrames([]);
      } catch (err: any) {
        if (!active) return;
        const msg =
          err?.response?.data ||
          err?.message ||
          "Failed to initiate biometric challenge.";
        setErrorMsg(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
    }

    initCamera();
    fetchChallenge();

    return () => {
      active = false;
    };
  }, [isOpen, mode, electionId, stopCamera]);

  // Capture current video frame to base64 JPEG
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    const nextFrames = [...capturedFrames, dataUrl];
    setCapturedFrames(nextFrames);

    if (nextFrames.length < instructions.length) {
      setCurrentStepIndex(nextFrames.length);
    } else {
      // All required challenge frames captured: submit for verification
      submitVerification(nextFrames);
    }
  };

  const handleRetake = () => {
    setCapturedFrames([]);
    setCurrentStepIndex(0);
    setErrorMsg("");
    setSuccessMsg("");
  };

  const submitVerification = async (frames: string[]) => {
    if (mode === "enrollment" && !consentGiven) {
      setErrorMsg("Explicit biometric consent is required before enrolling.");
      return;
    }

    setVerifying(true);
    setErrorMsg("");

    try {
      if (mode === "enrollment") {
        const res = await axios.post("/auth/biometrics/enrollment/verify", {
          challengeId,
          frames,
          consentGiven: true,
        });
        setSuccessMsg("Facial biometrics enrolled and encrypted successfully!");
        setTimeout(() => {
          stopCamera();
          onSuccess(res.data);
          onClose();
        }, 1500);
      } else {
        const res = await axios.post(
          `/polls/${electionId}/biometric/verify`,
          {
            challengeId,
            frames,
          }
        );
        setSuccessMsg("Identity verified! Issuing voting authorization...");
        setTimeout(() => {
          stopCamera();
          onSuccess(res.data);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      let msg = err?.response?.data || err?.message || "Biometric verification failed.";
      if (typeof msg !== "string") msg = JSON.stringify(msg);
      setErrorMsg(msg);
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  const currentAction = instructions[currentStepIndex] || "look_center";
  const actionLabel =
    currentAction === "look_center"
      ? "Step 1: Look directly at the camera (hold still)"
      : currentAction === "turn_left"
      ? "Step 2: Turn your head slightly to the LEFT"
      : currentAction === "turn_right"
      ? "Step 2: Turn your head slightly to the RIGHT"
      : "Follow the camera instructions";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "540px",
          overflow: "hidden",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              {mode === "enrollment" ? "Facial Biometric Enrollment" : "Verify Your Identity"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 2 }}>
              {mode === "enrollment"
                ? "Enroll your face template to authenticate cryptographic ballots."
                : "Complete live facial authentication before casting your ballot."}
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            type="button"
            style={{
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px" }}>
          {cameraError ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fee2e2",
                borderRadius: "8px",
                padding: "16px",
                color: "#991b1b",
                fontSize: "0.9rem",
              }}
            >
              <i className="bi bi-camera-video-off" style={{ marginRight: 8, fontSize: "1.2rem" }}></i>
              <strong>Camera Access Notice:</strong> {cameraError}
            </div>
          ) : (
            <>
              {/* Webcam Preview Container with Guide Oval */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "280px",
                  background: "#0f172a",
                  borderRadius: "8px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)", // Mirror camera feed
                  }}
                />

                {/* Face Positioning Oval Overlay */}
                <div
                  style={{
                    position: "absolute",
                    top: "12%",
                    left: "28%",
                    width: "44%",
                    height: "76%",
                    borderRadius: "50%",
                    border: verifying
                      ? "3px dashed #3b82f6"
                      : errorMsg
                      ? "3px solid #ef4444"
                      : "3px solid #22c55e",
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
                    pointerEvents: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      bottom: "-24px",
                      background: "rgba(15, 23, 42, 0.8)",
                      color: "#ffffff",
                      fontSize: "0.7rem",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Keep face inside frame
                  </span>
                </div>

                {verifying && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "rgba(15, 23, 42, 0.7)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                    }}
                  >
                    <div className="app-spinner" style={{ marginBottom: 12 }}></div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Evaluating Presentation Attack & Biometrics...
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden canvas for snapshotting */}
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Active Liveness Guidance Bar */}
              <div
                style={{
                  marginTop: "14px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="bi bi-shield-check" style={{ color: "#16a34a", fontSize: "1.1rem" }}></i>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#166534" }}>
                    {actionLabel}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    background: "#dcfce7",
                    color: "#15803d",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                  }}
                >
                  Frame {capturedFrames.length + 1} of {instructions.length || 2}
                </span>
              </div>

              {/* Feedback messages */}
              {errorMsg && (
                <div
                  style={{
                    marginTop: "12px",
                    background: "#fef2f2",
                    border: "1px solid #fee2e2",
                    borderRadius: "6px",
                    padding: "10px 12px",
                    fontSize: "0.825rem",
                    color: "#b91c1c",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <i className="bi bi-exclamation-octagon-fill"></i>
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div
                  style={{
                    marginTop: "12px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    padding: "10px 12px",
                    fontSize: "0.825rem",
                    color: "#166534",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <i className="bi bi-check-circle-fill"></i>
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Explicit Biometric Privacy Consent (Enrollment mode only) */}
              {mode === "enrollment" && (
                <div style={{ marginTop: "14px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: "0.775rem",
                      color: "#475569",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={consentGiven}
                      onChange={(e) => setConsentGiven(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      I consent to biometric feature extraction and authenticated AES-256-GCM encryption.
                      No raw photos are permanently stored. I may delete my template at any time in my profile.
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div
          style={{
            padding: "14px 20px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={handleRetake}
            disabled={verifying || capturedFrames.length === 0}
            style={{
              background: "transparent",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              padding: "8px 14px",
              fontSize: "0.825rem",
              fontWeight: 600,
              color: "#475569",
              cursor: capturedFrames.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            <i className="bi bi-arrow-counterclockwise"></i> Retake
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              disabled={verifying}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "0.825rem",
                color: "#64748b",
                cursor: "pointer",
                padding: "8px 12px",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={captureFrame}
              disabled={verifying || !!cameraError || (mode === "enrollment" && !consentGiven)}
              className="button-primary"
              style={{
                padding: "8px 18px",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <i className="bi bi-camera"></i>
              {capturedFrames.length === 0
                ? "Capture Frame 1"
                : `Capture Frame ${capturedFrames.length + 1}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
