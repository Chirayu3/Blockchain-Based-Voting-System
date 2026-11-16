import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "../../axios";

export interface BiometricCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "enrollment" | "voting" | "enroll_and_vote";
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
  // Current active phase: "enrollment" or "voting"
  const [currentPhase, setCurrentPhase] = useState<"enrollment" | "voting">(
    mode === "voting" ? "voting" : "enrollment"
  );

  // Camera states
  const [cameraState, setCameraState] = useState<"idle" | "requesting" | "ready" | "error">("idle");
  const [cameraError, setCameraError] = useState<string>("");
  const [videoReady, setVideoReady] = useState<boolean>(false);

  // Challenge and instruction states
  const [challengeId, setChallengeId] = useState<string>("");
  const [instructions, setInstructions] = useState<string[]>(["look_center", "turn_left"]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  // Frame capture states
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);

  // Feedback states
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");
  const [consentGiven, setConsentGiven] = useState<boolean>(mode === "voting");

  // Persistent refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const challengeIdRef = useRef<string>("");
  const framesRef = useRef<string[]>([]);
  const isStartingRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  // Total required frames for current phase
  const requiredFramesCount = instructions && instructions.length > 0 ? instructions.length : 2;

  // Format clean human-readable error messages from Axios / Yup
  const formatErrorMessage = (err: any): string => {
    if (err?.response?.data) {
      const data = err.response.data;
      if (typeof data === "string") return data;
      if (Array.isArray(data)) return data.join(", ");
      if (data.error) {
        return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
      }
      if (data.message) {
        return typeof data.message === "string" ? data.message : JSON.stringify(data.message);
      }
      return JSON.stringify(data);
    }
    return err?.message || "Biometric authentication failed. Please retry.";
  };

  // Stable stopCamera function - empty dependencies, uses refs
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoReady(false);
    setCameraState("idle");
  }, []);

  // Stable startCamera function - handles constraints and fallbacks gracefully
  const startCamera = useCallback(async () => {
    // If stream is already live, ensure video is playing
    if (streamRef.current && streamRef.current.active) {
      const liveTrack = streamRef.current.getVideoTracks().find((t) => t.readyState === "live");
      if (liveTrack) {
        if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
        setCameraState("ready");
        return;
      }
    }

    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraState("requesting");
    setCameraError("");
    setVideoReady(false);

    try {
      let mediaStream: MediaStream;
      try {
        // Preferred user-facing ideal constraints
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch (constraintErr) {
        console.warn("[Biometrics] Preferred camera constraints failed; falling back to default video device:", constraintErr);
        // Fallback to basic video constraint
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!mountedRef.current) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = mediaStream;
      setCameraState("ready");

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("[Biometrics] Video autoplay was postponed by browser:", playErr);
        }
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setCameraState("error");
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera access permission was denied. Please allow camera permissions in your browser address bar.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No webcam was detected on this computer. A working camera is required for facial authentication.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setCameraError("Webcam is already in use by another application. Please close other camera apps and retry.");
      } else {
        setCameraError(`Unable to start webcam: ${err.message || "Unknown hardware error"}`);
      }
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  // Fetch biometric challenge for the current phase and store synchronously in ref
  const fetchChallengeForPhase = useCallback(
    async (targetPhase: "enrollment" | "voting") => {
      setErrorMsg("");
      setSuccessMsg("");
      framesRef.current = [];
      setCapturedFrames([]);
      setCurrentStepIndex(0);
      challengeIdRef.current = "";
      setChallengeId("");

      try {
        const endpoint =
          targetPhase === "enrollment"
            ? "/auth/biometrics/enrollment/challenge"
            : `/polls/${electionId || 1}/biometric/challenge`;

        const res = await axios.post(endpoint);
        if (!mountedRef.current) return;

        const newId = res.data?.challengeId || "";
        const newInstructions =
          res.data?.instructions && Array.isArray(res.data.instructions) && res.data.instructions.length > 0
            ? res.data.instructions
            : ["look_center", "turn_left"];

        // Set synchronously in ref and React state
        challengeIdRef.current = newId;
        setChallengeId(newId);
        setInstructions(newInstructions);
      } catch (err: any) {
        if (!mountedRef.current) return;
        challengeIdRef.current = "";
        setChallengeId("");
        setErrorMsg(formatErrorMessage(err));
      }
    },
    [electionId]
  );

  // Monitor video element readiness
  const handleVideoCanPlay = () => {
    const video = videoRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoReady(true);
    }
  };

  // Main lifecycle effect triggered when modal opens or closes
  useEffect(() => {
    mountedRef.current = true;

    if (isOpen) {
      const initialPhase = mode === "voting" ? "voting" : "enrollment";
      setCurrentPhase(initialPhase);
      setConsentGiven(mode === "voting");
      setErrorMsg("");
      setSuccessMsg("");
      framesRef.current = [];
      setCapturedFrames([]);
      setCurrentStepIndex(0);

      startCamera();
      fetchChallengeForPhase(initialPhase);
    } else {
      stopCamera();
    }

    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [isOpen, mode, startCamera, stopCamera, fetchChallengeForPhase]);

  // Strictly bounded frame capture
  const handleCaptureFrame = () => {
    if (capturing || verifying) return;

    // Guard: strictly bounded capture limit
    if (framesRef.current.length >= requiredFramesCount) return;

    // Guard: ensure challenge ID exists synchronously
    const activeChallengeId = challengeIdRef.current || challengeId;
    if (!activeChallengeId) {
      setErrorMsg("No active challenge session found. Please click Retake to request a fresh challenge session.");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (!videoReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMsg("Video stream is still warming up. Please wait for your live face preview to appear.");
      return;
    }

    setCapturing(true);
    setErrorMsg("");

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setErrorMsg("Failed to initialize canvas rendering context.");
        setCapturing(false);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

      if (!dataUrl || dataUrl.length < 500) {
        setErrorMsg("Captured image is blank or invalid. Ensure the camera lens is unobstructed.");
        setCapturing(false);
        return;
      }

      // Valid frame captured! Strictly append to ref and state
      const nextFrames = [...framesRef.current, dataUrl];
      framesRef.current = nextFrames;
      setCapturedFrames(nextFrames);

      if (nextFrames.length < requiredFramesCount) {
        setCurrentStepIndex(nextFrames.length);
        setCapturing(false);
      } else {
        // Exactly required frames captured: stop capture and submit once
        setCapturing(false);
        submitVerification(nextFrames, activeChallengeId);
      }
    } catch (err: any) {
      setErrorMsg(`Error capturing frame: ${err.message}`);
      setCapturing(false);
    }
  };

  // Handle explicit Retake action: resets frames and generates fresh challenge
  const handleRetake = () => {
    framesRef.current = [];
    setCapturedFrames([]);
    setCurrentStepIndex(0);
    setErrorMsg("");
    setSuccessMsg("");
    setCapturing(false);
    setVerifying(false);

    // Request a brand new challenge for current phase to prevent reusing consumed/expired challenges
    fetchChallengeForPhase(currentPhase);
  };

  // Submit captured frames for verification / enrollment
  const submitVerification = async (frames: string[], activeChallengeId: string) => {
    if (currentPhase === "enrollment" && !consentGiven) {
      setErrorMsg("Explicit biometric consent is required before face enrollment.");
      setCapturing(false);
      return;
    }

    if (!activeChallengeId) {
      setErrorMsg("Challenge session identifier is missing. Please click Retake to request a new session.");
      setCapturing(false);
      return;
    }

    setVerifying(true);
    setErrorMsg("");

    try {
      if (currentPhase === "enrollment") {
        // Send to enrollment verify endpoint
        const res = await axios.post("/auth/biometrics/enrollment/verify", {
          challengeId: activeChallengeId,
          frames,
          consentGiven: true,
        });

        if (mode === "enroll_and_vote") {
          // Seamlessly transition to Voting phase without stopping camera!
          setSuccessMsg("Biometric face profile enrolled! Starting live ballot verification...");
          setTimeout(async () => {
            if (!mountedRef.current) return;
            setCurrentPhase("voting");
            setSuccessMsg("");
            setVerifying(false);
            setCapturing(false);
            framesRef.current = [];
            setCapturedFrames([]);
            setCurrentStepIndex(0);
            // Fetch fresh challenge for the actual voting transaction
            await fetchChallengeForPhase("voting");
          }, 1500);
        } else {
          // Standalone enrollment completed
          setSuccessMsg("Facial biometrics enrolled and encrypted with AES-256-GCM successfully!");
          setTimeout(() => {
            stopCamera();
            onSuccess(res.data);
            onClose();
          }, 1400);
        }
      } else {
        // Voting verification phase
        const res = await axios.post(`/polls/${electionId || 1}/biometric/verify`, {
          challengeId: activeChallengeId,
          frames,
        });

        setSuccessMsg("Identity verified! Authorizing cryptographic ballot submission...");
        setTimeout(() => {
          stopCamera();
          onSuccess(res.data);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(formatErrorMessage(err));
      setCapturing(false);
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  const currentAction = instructions[currentStepIndex] || "look_center";
  let actionPrompt = "Look directly into the camera lens";
  if (currentAction === "turn_left") {
    actionPrompt = "Turn your head slightly to your LEFT";
  } else if (currentAction === "turn_right") {
    actionPrompt = "Turn your head slightly to your RIGHT";
  }

  const isEnrollAndVote = mode === "enroll_and_vote";
  const isCaptureComplete = capturedFrames.length >= requiredFramesCount;

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
          borderRadius: "14px",
          width: "100%",
          maxWidth: "520px",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#ffffff",
          }}
        >
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a" }}>
              {isEnrollAndVote
                ? currentPhase === "enrollment"
                  ? "Step 1: Set Up Face Verification"
                  : "Step 2: Live Ballot Authentication"
                : currentPhase === "enrollment"
                ? "Facial Biometric Enrollment"
                : "Verify Your Identity"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 3 }}>
              {isEnrollAndVote
                ? currentPhase === "enrollment"
                  ? "Enroll your facial template before casting your first ballot."
                  : "Complete live facial verification to authorize your vote."
                : currentPhase === "enrollment"
                ? "Register your face template with AES-256-GCM authenticated encryption."
                : "Live biometric authentication is required to cast a vote."}
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            type="button"
            disabled={verifying}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              color: "#94a3b8",
              cursor: verifying ? "not-allowed" : "pointer",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px" }}>
          {/* Camera Error Message */}
          {cameraError ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fee2e2",
                borderRadius: "8px",
                padding: "16px",
                color: "#991b1b",
                fontSize: "0.875rem",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <i className="bi bi-camera-video-off" style={{ fontSize: "1.4rem" }}></i>
                <div>
                  <strong>Camera Unavailable:</strong> {cameraError}
                </div>
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="button-primary"
                style={{
                  alignSelf: "flex-start",
                  padding: "6px 14px",
                  fontSize: "0.8rem",
                }}
              >
                <i className="bi bi-arrow-repeat" style={{ marginRight: 6 }}></i> Retry Camera
              </button>
            </div>
          ) : (
            <>
              {/* Stable Webcam Viewport */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "300px",
                  background: "#0f172a",
                  borderRadius: "10px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Persistent Video Element */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={handleVideoCanPlay}
                  onCanPlay={handleVideoCanPlay}
                  onPlaying={handleVideoCanPlay}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)", // Mirror camera feed
                    display: cameraState === "ready" ? "block" : "none",
                  }}
                />

                {/* Camera Initializing Overlay */}
                {(!videoReady || cameraState === "requesting") && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "#0f172a",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94a3b8",
                      gap: 12,
                    }}
                  >
                    <div className="app-spinner"></div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Connecting to webcam preview...
                    </div>
                  </div>
                )}

                {/* Face Positioning Guide (Oval) */}
                {videoReady && (
                  <div
                    style={{
                      position: "absolute",
                      top: "10%",
                      left: "26%",
                      width: "48%",
                      height: "80%",
                      borderRadius: "50%",
                      border: verifying
                        ? "3px dashed #3b82f6"
                        : errorMsg
                        ? "3px solid #ef4444"
                        : isCaptureComplete
                        ? "3px solid #3b82f6"
                        : "3px solid #22c55e",
                      boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
                      pointerEvents: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "border-color 0.2s ease",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        bottom: "-26px",
                        background: "rgba(15, 23, 42, 0.85)",
                        color: "#ffffff",
                        fontSize: "0.7rem",
                        padding: "3px 10px",
                        borderRadius: "4px",
                        letterSpacing: "0.03em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isCaptureComplete ? "Verifying template..." : "Position face in oval"}
                    </span>
                  </div>
                )}

                {/* Evaluating / Verifying Overlay */}
                {verifying && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "rgba(15, 23, 42, 0.8)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      gap: 12,
                      zIndex: 10,
                    }}
                  >
                    <div className="app-spinner"></div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      {currentPhase === "enrollment"
                        ? "Analyzing presentation attacks & extracting template..."
                        : "Verifying live biometric identity..."}
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden Canvas for High-Resolution Frame Snapshot */}
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Strictly Bounded Liveness Guidance Banner */}
              <div
                style={{
                  marginTop: "14px",
                  background: isCaptureComplete ? "#eff6ff" : "#f0fdf4",
                  border: isCaptureComplete ? "1px solid #bfdbfe" : "1px solid #bbf7d0",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <i
                    className={isCaptureComplete ? "bi bi-check2-all" : "bi bi-shield-check"}
                    style={{ color: isCaptureComplete ? "#2563eb" : "#16a34a", fontSize: "1.15rem" }}
                  ></i>
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: isCaptureComplete ? "#1e40af" : "#166534",
                    }}
                  >
                    {isCaptureComplete ? "All frames captured — verifying..." : actionPrompt}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    background: isCaptureComplete ? "#dbeafe" : "#dcfce7",
                    color: isCaptureComplete ? "#1d4ed8" : "#15803d",
                    padding: "3px 10px",
                    borderRadius: "9999px",
                  }}
                >
                  {isCaptureComplete
                    ? `Complete (${requiredFramesCount} of ${requiredFramesCount})`
                    : `Frame ${Math.min(capturedFrames.length + 1, requiredFramesCount)} of ${requiredFramesCount}`}
                </span>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div
                  style={{
                    marginTop: "12px",
                    background: "#fef2f2",
                    border: "1px solid #fee2e2",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "0.825rem",
                    color: "#b91c1c",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <i className="bi bi-exclamation-octagon-fill" style={{ fontSize: "1.1rem" }}></i>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Success Alert */}
              {successMsg && (
                <div
                  style={{
                    marginTop: "12px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "0.825rem",
                    color: "#166534",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <i className="bi bi-check-circle-fill" style={{ fontSize: "1.1rem" }}></i>
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Privacy Consent Checkbox (Enrollment phase only) */}
              {currentPhase === "enrollment" && (
                <div style={{ marginTop: "14px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: "0.775rem",
                      color: "#475569",
                      cursor: "pointer",
                      lineHeight: 1.4,
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
                      No raw photos are permanently stored. I may delete my template at any time in my voter profile.
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
            padding: "14px 22px",
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
            disabled={verifying || capturing}
            style={{
              background: "transparent",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              padding: "8px 14px",
              fontSize: "0.825rem",
              fontWeight: 600,
              color: "#475569",
              cursor: verifying || capturing ? "not-allowed" : "pointer",
              opacity: verifying || capturing ? 0.6 : 1,
            }}
          >
            <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 4 }}></i> Retake
          </button>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
                cursor: verifying ? "not-allowed" : "pointer",
                padding: "8px 12px",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCaptureFrame}
              disabled={
                verifying ||
                capturing ||
                !videoReady ||
                !!cameraError ||
                !challengeId ||
                isCaptureComplete ||
                (currentPhase === "enrollment" && !consentGiven)
              }
              className="button-primary"
              style={{
                padding: "8px 20px",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: !videoReady || verifying || capturing || isCaptureComplete || !challengeId ? 0.7 : 1,
                cursor: !videoReady || verifying || capturing || isCaptureComplete || !challengeId ? "not-allowed" : "pointer",
              }}
            >
              <i className="bi bi-camera"></i>
              {isCaptureComplete
                ? "Capture Complete"
                : capturedFrames.length === 0
                ? "Capture Frame 1"
                : `Capture Frame ${capturedFrames.length + 1}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
