import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import axios from "../../axios";

interface DashboardStats {
  voterStats: {
    totalRegistered: number;
    verified: number;
    pendingApprovals: number;
  };
  electionStats: {
    total: number;
    active: number;
    completed: number;
    currentStatus: string;
    currentElectionName: string;
  };
  votingStats: {
    totalVotesCast: number;
    liveElectionVotes: number;
    candidates: string[];
    candidateVotes: Record<string, number>;
  };
  recentActivity: Array<{
    id: number;
    transactionHash: string;
    voterId: number;
    voterName: string;
    electionId: number;
    electionName: string;
    candidateName: string;
    blockNumber: number;
    gasUsed: number;
    status: string;
    timestamp: string;
  }>;
}

const PALETTE = ["#2563eb", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];

const Dashboard = (): JSX.Element => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<DashboardStats | null>(null);
  const [copiedHash, setCopiedHash] = useState<string>("");

  const fetchStats = () => {
    axios
      .get("/polls/admin/stats")
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch admin dashboard statistics:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(""), 2000);
  };

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-spinner"></div>
        <div className="app-loading-text">Loading Admin Intelligence Hub...</div>
      </div>
    );
  }

  const voterStats = data?.voterStats || {
    totalRegistered: 0,
    verified: 0,
    pendingApprovals: 0,
  };
  const electionStats = data?.electionStats || {
    total: 0,
    active: 0,
    completed: 0,
    currentStatus: "not-started",
    currentElectionName: "",
  };
  const votingStats = data?.votingStats || {
    totalVotesCast: 0,
    liveElectionVotes: 0,
    candidates: [],
    candidateVotes: {},
  };
  const recentActivity = data?.recentActivity || [];

  return (
    <div className="analytics-dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1>Admin Command Dashboard</h1>
          <p>Real-time telemetry from Ethereum Smart Contracts and MySQL Ledger</p>
        </div>

        <div className="dashboard-actions">
          <button
            type="button"
            onClick={() => navigate("/admin/elections")}
            className="button-primary"
          >
            <i className="bi bi-gear-wide-connected"></i> Manage Elections
          </button>
          <button
            type="button"
            onClick={() => navigate("/users")}
            className="button-black"
          >
            <i className="bi bi-person-check"></i> Voter Approvals
            {voterStats.pendingApprovals > 0 && (
              <span
                style={{
                  background: "#ef4444",
                  color: "white",
                  borderRadius: "9999px",
                  padding: "2px 6px",
                  fontSize: "0.75rem",
                  marginLeft: 4,
                }}
              >
                {voterStats.pendingApprovals}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <i className="bi bi-people-fill"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Registered</span>
            <span className="stat-value">{voterStats.totalRegistered}</span>
            <span className="stat-desc">Voters on platform</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon emerald">
            <i className="bi bi-shield-check"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Verified Voters</span>
            <span className="stat-value">{voterStats.verified}</span>
            <span className="stat-desc">Eligible to cast ballots</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon amber">
            <i className="bi bi-hourglass-split"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Pending Approvals</span>
            <span className="stat-value">{voterStats.pendingApprovals}</span>
            <span className="stat-desc">Awaiting verification</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon indigo">
            <i className="bi bi-collection-play"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Elections</span>
            <span className="stat-value">{electionStats.total}</span>
            <span className="stat-desc">Lifetime polls created</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon sky">
            <i className="bi bi-broadcast-pin"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Active Elections</span>
            <span className="stat-value">{electionStats.active}</span>
            <span className="stat-desc">Accepting votes now</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <i className="bi bi-check2-all"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Completed</span>
            <span className="stat-value">{electionStats.completed}</span>
            <span className="stat-desc">Concluded elections</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <i className="bi bi-cpu-fill"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Votes Cast</span>
            <span className="stat-value">{votingStats.totalVotesCast}</span>
            <span className="stat-desc">On-chain cryptographic votes</span>
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="analytics-grid-two">
        {/* Voter Verification Breakdown */}
        <div className="analytics-card">
          <div className="card-header-row">
            <h3>
              <i className="bi bi-shield-lock-fill"></i> Voter Verification Status
            </h3>
            <span className="card-badge">Citizen Registry</span>
          </div>

          <div className="candidate-bars">
            <div className="candidate-bar-item">
              <div className="candidate-bar-header">
                <span className="candidate-name">Verified & Active Voters</span>
                <span className="candidate-count" style={{ color: "#10b981" }}>
                  {voterStats.verified} (
                  {voterStats.totalRegistered > 0
                    ? Math.round(
                        (voterStats.verified / voterStats.totalRegistered) * 100
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    backgroundColor: "#10b981",
                    width: `${
                      voterStats.totalRegistered > 0
                        ? (voterStats.verified / voterStats.totalRegistered) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="candidate-bar-item">
              <div className="candidate-bar-header">
                <span className="candidate-name">Pending Verification</span>
                <span className="candidate-count" style={{ color: "#f59e0b" }}>
                  {voterStats.pendingApprovals} (
                  {voterStats.totalRegistered > 0
                    ? Math.round(
                        (voterStats.pendingApprovals / voterStats.totalRegistered) *
                          100
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    backgroundColor: "#f59e0b",
                    width: `${
                      voterStats.totalRegistered > 0
                        ? (voterStats.pendingApprovals /
                            voterStats.totalRegistered) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Election Overview */}
        <div className="analytics-card">
          <div className="card-header-row">
            <h3>
              <i className="bi bi-graph-up"></i> Live Election Telemetry
            </h3>
            <span className="status-badge running">
              {electionStats.currentStatus.toUpperCase()}
            </span>
          </div>

          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: "0.85rem", color: "#64748b" }}>Current Ballot:</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                {electionStats.currentElectionName || "No election running"}
              </div>
            </div>

            <div className="candidate-bars">
              {votingStats.candidates.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: "0.9rem", padding: "12px 0" }}>
                  Start an election to visualize candidate standings.
                </div>
              ) : (
                votingStats.candidates.map((cand, idx) => {
                  const votes = votingStats.candidateVotes[cand] || 0;
                  const total = votingStats.liveElectionVotes;
                  const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                  return (
                    <div key={cand} className="candidate-bar-item">
                      <div className="candidate-bar-header">
                        <span className="candidate-name">{cand}</span>
                        <span className="candidate-count">
                          {votes} votes ({pct}%)
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: PALETTE[idx % PALETTE.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Voting Activity Table */}
      <div className="table-container">
        <div className="table-header-bar">
          <h3>Recent Cryptographic Voting Activity</h3>
          <button
            type="button"
            onClick={() => navigate("/admin/transactions")}
            className="button-black"
            style={{ padding: "6px 12px", fontSize: "0.85rem" }}
          >
            View All Transactions &rarr;
          </button>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Voter</th>
                <th>Election</th>
                <th>Candidate</th>
                <th>Tx Hash</th>
                <th>Block</th>
                <th>Timestamp</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                    No voting transactions recorded yet.
                  </td>
                </tr>
              ) : (
                recentActivity.map((act) => {
                  const shortHash =
                    act.transactionHash.length > 14
                      ? `${act.transactionHash.slice(0, 8)}...${act.transactionHash.slice(-6)}`
                      : act.transactionHash;
                  return (
                    <tr key={act.id}>
                      <td style={{ fontWeight: 600 }}>{act.voterName}</td>
                      <td>{act.electionName}</td>
                      <td style={{ fontWeight: 600, color: "#2563eb" }}>
                        {act.candidateName}
                      </td>
                      <td>
                        <div className="hash-container">
                          <span>{shortHash}</span>
                          <button
                            type="button"
                            className="copy-btn"
                            title="Copy full transaction hash"
                            onClick={() => copyToClipboard(act.transactionHash)}
                          >
                            <i
                              className={
                                copiedHash === act.transactionHash
                                  ? "bi bi-check-lg"
                                  : "bi bi-clipboard"
                              }
                            ></i>
                          </button>
                        </div>
                      </td>
                      <td>#{act.blockNumber}</td>
                      <td>{new Date(act.timestamp).toLocaleString()}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            act.status === "success" ? "success" : "failed"
                          }`}
                        >
                          {act.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
