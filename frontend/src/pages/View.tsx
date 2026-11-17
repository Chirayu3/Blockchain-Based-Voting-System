import React, { useEffect, useState } from "react";
import { RouteProps, useNavigate } from "react-router";
import axios from "../axios";
import Polls from "./Polls";
import Result from "./Result";
import Start from "./Start";
import Back from "../components/Back";

const View = (props: RouteProps): JSX.Element => {
  const [loading, setLoading] = useState<boolean>(true);
  const [status, setStatus] = useState<"not-started" | "running" | "finished">(
    "not-started"
  );

  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    axios
      .get("/polls/status")
      .then((res) => {
        setStatus(res.data.status);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching ballot status:", error);
        setLoading(false);
      });
  }, []);

  let comp = (
    <div className="app-loading-screen">
      <div className="app-spinner"></div>
      <div className="app-loading-text">Fetching Live Ballot Ledger...</div>
    </div>
  );

  if (!loading) {
    if (status === "finished") comp = <Result />;
    if (status === "running") comp = <Polls />;
    if (status === "not-started") comp = <Start />;
  }

  return (
    <div className="view-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Back call={() => navigate("/")} label="Return Home" />
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: status === "running" ? "#16a34a" : "#64748b",
            background: status === "running" ? "#f0fdf4" : "#f1f5f9",
            border: `1px solid ${status === "running" ? "#bbf7d0" : "#e2e8f0"}`,
            padding: "5px 12px",
            borderRadius: 9999,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: status === "running" ? "#16a34a" : "#94a3b8",
            }}
          ></span>
          <span>
            {status === "running"
              ? "Live Election in Progress"
              : status === "finished"
                ? "Election Concluded"
                : "Awaiting Election Initiation"}
          </span>
        </div>
      </div>

      <div>{comp}</div>
    </div>
  );
};

export default View;
