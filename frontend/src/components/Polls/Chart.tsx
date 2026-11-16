import React, { useState } from "react";
import axios from "../../axios";
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
  const [submitting, setSubmitting] = useState<string>("");
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");
  const [bioModalOpen, setBioModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [successTx, setSuccessTx] = useState<any>(null);

  const handleVoteInitiation = (candidate: string) => {
    setError("");
    setSelectedCandidate(candidate);
    setBioModalOpen(true);
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
          disabled={submitting !== ""}
          className="button-wrapper text-normal"
          style={{
            opacity: submitting !== "" ? 0.7 : 1,
            cursor: submitting !== "" ? "not-allowed" : "pointer",
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

      {/* Biometric Identity Verification Modal */}
      <BiometricCaptureModal
        isOpen={bioModalOpen}
        onClose={() => setBioModalOpen(false)}
        mode="voting"
        electionId={props.electionId || 1}
        onSuccess={handleBiometricSuccess}
      />
    </div>
  );
};

export default Chart;
