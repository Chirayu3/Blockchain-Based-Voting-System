import React, { useEffect, useState } from "react";
import axios from "../../axios";
import StartPage from "./Start";
import ResultAnalytics, { AnalyticsData } from "../../components/Polls/ResultAnalytics";

const Elections = (): JSX.Element => {
  const [loading, setLoading] = useState<boolean>(true);
  const [status, setStatus] = useState<"not-started" | "running" | "finished">(
    "not-started"
  );
  const [data, setData] = useState<{
    id?: number;
    name: string;
    description: string;
    status: string;
    analytics?: AnalyticsData;
  }>({
    name: "",
    description: "",
    status: "not-started",
  });

  const fetchElectionData = () => {
    setLoading(true);
    axios
      .get("/polls/status")
      .then((res) => {
        setStatus(res.data.status);
        if (res.data.status !== "not-started") {
          axios
            .get("/polls/")
            .then((pollRes) => {
              setData(pollRes.data);
              setLoading(false);
            })
            .catch(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching election status:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchElectionData();
  }, []);

  const endElection = () => {
    if (!window.confirm("Are you sure you want to end this election? Voting will cease immediately.")) return;
    axios
      .post("/polls/end")
      .then(() => fetchElectionData())
      .catch((err) => {
        console.error("Error ending election:", err);
        alert("Failed to end election.");
      });
  };

  const resetElection = () => {
    if (!window.confirm("Are you sure you want to reset this election? This will allow a new election to be started.")) return;
    axios
      .post("/polls/reset")
      .then(() => fetchElectionData())
      .catch((err) => {
        console.error("Error resetting election:", err);
        alert("Failed to reset election.");
      });
  };

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-spinner"></div>
        <div className="app-loading-text">Loading Election Controls...</div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1>Election Management & Analytics</h1>
          <p>Supervise ballot lifecycle, monitor live participation and export audited returns</p>
        </div>

        <div className="dashboard-actions">
          {status === "running" && (
            <button
              type="button"
              onClick={endElection}
              className="button-black"
              style={{ background: "#dc2626" }}
            >
              <i className="bi bi-stop-circle"></i> End Election
            </button>
          )}

          {status === "finished" && (
            <button
              type="button"
              onClick={resetElection}
              className="button-primary"
            >
              <i className="bi bi-arrow-repeat"></i> Reset for New Election
            </button>
          )}
        </div>
      </div>

      {status === "not-started" ? (
        <div>
          <div style={{ marginBottom: 16 }}>
            <span className="status-badge finished">NO ACTIVE ELECTION</span>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "8px 0" }}>
              Initialize a New Election Ballot
            </h2>
            <p style={{ color: "#64748b", margin: 0 }}>
              Specify the title, description, and candidates to deploy a new ballot on the Ethereum blockchain.
            </p>
          </div>
          <StartPage />
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className={`status-badge ${status === "running" ? "running" : "finished"}`}>
                {status === "running" ? "● BALLOT IN PROGRESS" : "✓ ELECTION COMPLETED"}
              </span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "6px 0 2px 0", color: "#0f172a" }}>
                {data.name}
              </h2>
              <p style={{ color: "#64748b", margin: 0 }}>{data.description}</p>
            </div>
          </div>

          {data.analytics ? (
            <ResultAnalytics
              electionId={data.id}
              electionName={data.name}
              electionDescription={data.description}
              analytics={data.analytics}
              isAdmin={true}
              onRefresh={fetchElectionData}
            />
          ) : (
            <div>Loading results telemetry...</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Elections;
