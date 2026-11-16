import React, { useState, useContext } from "react";
import axios from "../../axios";
import { AuthContext } from "../../contexts/Auth";
import { BiometricCaptureModal } from "../Biometrics/BiometricCaptureModal";

interface ChartProps {
  votes: any;
  enableVote?: boolean;
  userId?: number;
  userName?: string;
  electionId?: number;
}

const Chart = (props: ChartProps) => {
  const votes = props.votes;
  const authContext = useContext(AuthContext);
  const [submitting, setSubmitting] = useState<string>("");
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");
  const [bioModalOpen, setBioModalOpen] = useState<boolean>(false);
  const [bioModalMode, setBioModalMode] = useState<"voting" | "enroll_and_vote">("voting");
  const [showEnrollPrompt, setShowEnrollPrompt] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [successTx, setSuccessTx] = useState<any>(null);

  const handleVoteInitiation = async (candidate: string) => {
    setError("");
    setSelectedCandidate(candidate);

    // If administrator approval is pending, stop before actual voting and display approval status
    if (!authContext.verified) {
      setError(
        "Administrator identity approval is required before you can participate in voting. Your registration is currently pending review by election officials."
      );
      return;
    }

    setCheckingStatus(true);

    try {
      // Check if this voter has already registered their biometric face profile
      const res = await axios.get("/auth/biometrics/status");
      setCheckingStatus(false);

      if (res.data && res.data.hasEnrolled) {
        // Enrolled voter: proceed directly to live face verification
        setBioModalMode("voting");
        setBioModalOpen(true);
      } else {
        // First-time voter: show "Set Up Face Verification" prompt
        setShowEnrollPrompt(true);
      }
    } catch (err: any) {
      setCheckingStatus(false);
      // Fallback to voting mode if status endpoint fails (backend will enforce gating)
      setBioModalMode("voting");
      setBioModalOpen(true);
    }
  };

  const handleStartFirstTimeEnrollment = () => {
    setShowEnrollPrompt(false);
    setBioModalMode("enroll_and_vote");
    setBioModalOpen(true);
  };

  const handleCancelEnrollment = () => {
    setShowEnrollPrompt(false);
    setSelectedCandidate("");
  };

  const handleBiometricSuccess = (resultData: any) => {
    const token = resultData.votingAuthorizationToken;
    if (!token) {
      setError("Biometric verification succeeded but failed to receive voting authorization token.");
      return;
    }

    setSubmitting(selectedCandidate);
    setError("");

    axios
      .post("/polls/vote", {
        candidate: selectedCandidate,
        votingAuthorizationToken: token,
        id: props.userId?.toString(),
        name: props.userName,
      })
      .then((res) => {
        setSubmitting("");
        if (res.data?.transaction) {
          setSuccessTx(res.data.transaction);
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        } else {
          window.location.reload();
        }
      })
      .catch((err) => {
        setSubmitting("");
        let message = err.message;
        if (err?.response?.data) {
          message =
            typeof err.response.data === "string"
              ? err.response.data
              : JSON.stringify(err.response.data);
        }
        setError(message);
      });
  };

  const getButtons = () => {
    const names = [];

    for (const name in votes) {
      const isCurrentSubmitting = submitting === name;
      names.push(
        <button
          onClick={() => handleVoteInitiation(name)}
          key={name}
          disabled={submitting !== "" || checkingStatus}
          className="button-wrapper text-normal"
          style={{
            opacity: submitting !== "" || checkingStatus ? 0.7 : 1,
            cursor: submitting !== "" || checkingStatus ? "not-allowed" : "pointer",
          }}
        >
          {isCurrentSubmitting ? "Submitting Ballot..." : `Vote for ${name}`}
        </button>
      );
    }

    return names;
  };

  const getNames = () => {
    const names = [];

    for (const name in votes) {
      names.push(
        <div key={name} className="name-wrapper text-normal">
          {name}
        </div>
      );
    }

    return names;
  };

  const getTotal = () => {
    let total = 0;

    for (const name in votes) {
      total += parseInt(votes[name]);
    }

    return total;
  };

  const getBars = () => {
    const bars = [];
    const total = getTotal();

    for (const name in votes) {
      const count = votes[name];
      bars.push(
        <div key={name} className="bar-wrapper">
          <div
            style={{
              height: count !== 0 ? `${(count * 100) / (total || 1)}%` : "auto",
              border: "2px solid #2563eb",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
              color: "white",
              backgroundColor: "#2563eb",
              borderRadius: "6px 6px 0 0",
              paddingBottom: 10,
              paddingTop: 10,
            }}
          >
            {votes[name]}
          </div>
        </div>
      );
    }

    return bars;
  };

  return (
    <div>
      {error && (
        <div className="error-message" style={{ margin: "12px 0" }}>
          <span>
            <i className="bi bi-exclamation-triangle"></i>
          </span>
          <span>{error}</span>
        </div>
      )}

      {successTx && (
        <div className="success-message" style={{ margin: "12px 0" }}>
          <span>
            <i className="bi bi-shield-check"></i>
          </span>
          <span>
            Ballot recorded on Blockchain! Block #{successTx.blockNumber}. Tx Hash:{" "}
            {successTx.transactionHash?.slice(0, 14)}...
          </span>
        </div>
      )}

      <div className="bars-container">{getBars()}</div>
      <div className="names-wrapper">{getNames()}</div>

      {props.enableVote ? (
        <div className="buttons-wrapper">{getButtons()}</div>
      ) : null}

      {/* First-Time Voter Enrollment Prompt Modal */}
      {showEnrollPrompt && (
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
            zIndex: 9998,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "480px",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
          >
            <div style={{ padding: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#2563eb",
                    fontSize: "1.3rem",
                  }}
                >
                  <i className="bi bi-person-bounding-box"></i>
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1.15rem",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Set Up Face Verification
                  </h3>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 2 }}>
                    One-time biometric registration required
                  </div>
                </div>
              </div>

              <p
                style={{
                  color: "#334155",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  marginBottom: 16,
                }}
              >
                Your biometric profile has not been registered yet. Complete facial
                enrollment before casting your first vote for{" "}
                <strong>{selectedCandidate}</strong>.
              </p>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "0.8rem",
                  color: "#475569",
                  lineHeight: 1.4,
                  marginBottom: 20,
                }}
              >
                <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>
                  How this works:
                </div>
                <div>1. Quick face scan registers your encrypted biometric template.</div>
                <div>2. A separate live verification immediately authenticates your ballot.</div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={handleCancelEnrollment}
                  style={{
                    background: "transparent",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "0.85rem",
                    color: "#475569",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartFirstTimeEnrollment}
                  className="button-primary"
                  style={{
                    padding: "8px 18px",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <i className="bi bi-camera"></i> Set Up Biometrics & Vote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Identity Verification / First-Time Enrollment Modal */}
      <BiometricCaptureModal
        isOpen={bioModalOpen}
        onClose={() => setBioModalOpen(false)}
        mode={bioModalMode}
        electionId={props.electionId || 1}
        onSuccess={handleBiometricSuccess}
      />
    </div>
  );
};

export default Chart;
