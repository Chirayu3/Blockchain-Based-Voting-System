import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Link } from "react-router-dom";
import LoginLayout from "../layouts/Login";
import axios from "../axios";
import { AuthContext } from "../contexts/Auth";

const Login = (): JSX.Element => {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);

  // Flow stage: 'credentials' -> 'otp'
  const [stage, setStage] = useState<"credentials" | "otp">("credentials");

  // Stage 1 fields
  const [voterId, setVoterId] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  // Stage 2 fields
  const [challengeId, setChallengeId] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [otp, setOtp] = useState<string>("");

  // Feedback and timing
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [expiryCountdown, setExpiryCountdown] = useState<number>(300);

  const otpInputRef = useRef<HTMLInputElement>(null);

  // Handle countdown timers
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (stage === "otp" && (cooldown > 0 || expiryCountdown > 0)) {
      timer = setInterval(() => {
        setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        setExpiryCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [stage, cooldown, expiryCountdown]);

  // Focus OTP input when transitioning to OTP stage
  useEffect(() => {
    if (stage === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [stage]);

  // Stage 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!voterId.trim() || !password) {
      setError("Please provide both your Voter ID and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post("/auth/voter/request-otp", {
        voterId: voterId.trim(),
        password,
      });

      setChallengeId(res.data.challengeId);
      setMaskedEmail(res.data.maskedEmail);
      setCooldown(res.data.cooldownSeconds || 60);
      setExpiryCountdown(300); // 5 minutes
      setStage("otp");
      setInfo(`Verification code dispatched to ${res.data.maskedEmail}`);
    } catch (err: any) {
      const msg = err?.response?.data || err.message || "Failed to authenticate voter.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  // Stage 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!otp.trim() || otp.trim().length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post("/auth/voter/verify-otp", {
        challengeId,
        otp: otp.trim(),
      });

      authContext.authenticate(res.data.user, res.data.accessToken);
      navigate("/");
    } catch (err: any) {
      const msg = err?.response?.data || err.message || "Failed to verify OTP.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  // Stage 2: Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || !challengeId) return;

    setError("");
    setInfo("Dispatching a new verification code...");
    setLoading(true);

    try {
      const res = await axios.post("/auth/voter/resend-otp", {
        challengeId,
      });

      setChallengeId(res.data.challengeId);
      setMaskedEmail(res.data.maskedEmail);
      setCooldown(res.data.cooldownSeconds || 60);
      setExpiryCountdown(300);
      setOtp("");
      setInfo(`A fresh code has been sent to ${res.data.maskedEmail}`);
    } catch (err: any) {
      const msg = err?.response?.data || err.message || "Failed to resend verification code.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div>
      <LoginLayout error={error} success={info}>
        <div className="form-container">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span
              style={{
                background: "#f0fdf4",
                color: "#16a34a",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "0.775rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              🗳️ Voter Portal
            </span>
            {stage === "otp" && (
              <span
                style={{
                  background: "#eff6ff",
                  color: "#2563eb",
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  fontSize: "0.775rem",
                  fontWeight: 600,
                }}
              >
                Step 2 of 2
              </span>
            )}
          </div>

          {stage === "credentials" ? (
            <>
              <div className="form-title">Voter Sign In</div>
              <div className="form-subtitle">
                Enter your official Voter ID and password to receive a one-time verification code.
              </div>

              <form onSubmit={handleRequestOtp}>
                <div className="input-container">
                  <label htmlFor="voterId" className="input-label">
                    Official Voter ID
                  </label>
                  <input
                    id="voterId"
                    type="text"
                    placeholder="e.g. BBVS-2026-000001"
                    value={voterId}
                    onChange={(e) => setVoterId(e.target.value.toUpperCase())}
                    autoComplete="username"
                    required
                  />
                  <div className="form-info-text" style={{ fontSize: "0.75rem", marginTop: 4 }}>
                    Assigned during registration (BBVS-YYYY-######).
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="password" className="input-label">
                    Security Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <button
                  className="login-button button-primary"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    "Validating Credentials..."
                  ) : (
                    <>
                      <i className="bi bi-shield-lock"></i> Continue to Verification &rarr;
                    </>
                  )}
                </button>
              </form>

              <hr />

              <button
                onClick={() => navigate("/signup")}
                className="button-secondary"
                type="button"
              >
                Register as a New Voter
              </button>

              <div className="portal-switch-banner">
                <span>Are you an election administrator?</span>
                <Link to="/admin/login">Access Admin Portal &rarr;</Link>
              </div>
            </>
          ) : (
            <>
              <div className="form-title">Enter Verification Code</div>
              <div className="form-subtitle">
                A 6-digit security code was sent to your registered email:
                <br />
                <strong style={{ color: "#1e293b", fontSize: "0.95rem" }}>
                  {maskedEmail}
                </strong>
              </div>

              <form onSubmit={handleVerifyOtp}>
                <div className="input-container" style={{ margin: "20px 0" }}>
                  <label htmlFor="otp" className="input-label" style={{ textAlign: "center" }}>
                    6-Digit One-Time Password (OTP)
                  </label>
                  <input
                    ref={otpInputRef}
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    style={{
                      textAlign: "center",
                      fontSize: "1.75rem",
                      fontWeight: 700,
                      letterSpacing: "8px",
                      fontFamily: "monospace",
                      padding: "12px",
                    }}
                    autoComplete="one-time-code"
                    required
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "8px",
                      fontSize: "0.8rem",
                    }}
                  >
                    <span
                      style={{
                        color: expiryCountdown < 60 ? "#dc2626" : "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      <i className="bi bi-clock" style={{ marginRight: 4 }}></i>
                      Expires in {formatTime(expiryCountdown)}
                    </span>

                    {cooldown > 0 ? (
                      <span style={{ color: "#94a3b8" }}>
                        Resend in {cooldown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={loading}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          padding: 0,
                          textDecoration: "underline",
                        }}
                      >
                        Resend Code
                      </button>
                    )}
                  </div>
                </div>

                <button
                  className="login-button button-primary"
                  type="submit"
                  disabled={loading || expiryCountdown === 0}
                >
                  {loading ? (
                    "Verifying Code..."
                  ) : (
                    <>
                      <i className="bi bi-check-circle"></i> Verify & Sign In
                    </>
                  )}
                </button>

                <div style={{ marginTop: "16px", textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStage("credentials");
                      setOtp("");
                      setError("");
                      setInfo("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#64748b",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      padding: "6px",
                    }}
                  >
                    &larr; Back to Voter ID Sign In
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </LoginLayout>
    </div>
  );
};

export default Login;
