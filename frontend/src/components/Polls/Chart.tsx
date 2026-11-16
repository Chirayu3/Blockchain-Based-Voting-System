import React, { useState } from "react";
import axios from "../../axios";

interface ChartProps {
  votes: any;
  enableVote?: boolean;
  userId?: number;
  userName?: string;
}

const Chart = (props: ChartProps) => {
  const votes = props.votes;
  const [submitting, setSubmitting] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [successTx, setSuccessTx] = useState<any>(null);

  const getButtons = () => {
    const names = [];

    const vote = (candidate: string) => {
      setSubmitting(candidate);
      setError("");

      axios
        .post("/polls/vote", {
          id: props.userId?.toString(),
          name: props.userName,
          candidate,
        })
        .then((res) => {
          setSubmitting("");
          if (res.data?.transaction) {
            setSuccessTx(res.data.transaction);
            setTimeout(() => {
              window.location.reload();
            }, 2500);
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

    for (const name in votes) {
      const isCurrentSubmitting = submitting === name;
      names.push(
        <button
          onClick={() => vote(name)}
          key={name}
          disabled={submitting !== ""}
          className="button-wrapper text-normal"
          style={{
            opacity: submitting !== "" ? 0.7 : 1,
            cursor: submitting !== "" ? "not-allowed" : "pointer",
          }}
        >
          {isCurrentSubmitting ? "Casting..." : `Vote for ${name}`}
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
            Cryptographic ballot recorded! Block #{successTx.blockNumber}. Tx Hash:{" "}
            {successTx.transactionHash?.slice(0, 10)}...
          </span>
        </div>
      )}

      <div className="bars-container">{getBars()}</div>
      <div className="names-wrapper">{getNames()}</div>

      {props.enableVote ? (
        <div className="buttons-wrapper">{getButtons()}</div>
      ) : null}
    </div>
  );
};

export default Chart;
