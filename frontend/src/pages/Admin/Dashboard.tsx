import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import axios from "../../axios";

interface CandidateStat {
  name: string;
  info?: string;
  count: number;
  percentage: number;
}

interface HistoricalElection {
  id: number;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  totalVotes: number;
  turnoutPercentage: number;
  eligibleVoters: number;
  remainingEligibleVoters: number;
  candidateStats: CandidateStat[];
  winner?: CandidateStat | null;
}

interface ElectionDetailResponse {
  election: {
    id: number;
    name: string;
    description: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  statistics: {
    totalVotes: number;
    eligibleVoters: number;
    turnoutPercentage: number;
    remainingEligibleVoters: number;
    candidateStats: CandidateStat[];
  };
  transactions: Array<{
    id: number;
    transactionHash: string;
    shortHash: string;
    voterId: number;
    candidateName: string;
    blockNumber: number;
    gasUsed: number;
    status: string;
    timestamp: string;
  }>;
}

interface DashboardStats {
  voterStats: {
    totalRegistered: number;
    verified: number;
    pendingApprovals: number;
    approved?: number;
    rejected?: number;
    approachingDeadline?: number;
    overdue?: number;
  };
  electionStats: {
    total: number;
    active: number;
    completed: number;
    currentContractStatus: string;
    currentContractName: string;
  };
  votingStats: {
    totalVotesAcrossAllElections: number;
    totalVotesCast: number;
  };
  elections: HistoricalElection[];
  recentActivity: Array<{
    id: number;
    transactionHash: string;
    shortHash: string;
    voterId: number;
    electionId: number;
    electionName: string;
    candidateName: string;
    blockNumber: number;
    gasUsed: number;
    status: string;
    timestamp: string;
  }>;
}

const PALETTE = ["#2563eb", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

const Dashboard = (): JSX.Element => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<DashboardStats | null>(null);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [selectedElectionData, setSelectedElectionData] = useState<ElectionDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<string>("");

  const fetchStats = () => {
    axios
      .get("/polls/admin/stats")
      .then((res) => {
        setData(res.data);
        if (selectedElectionId === null && res.data.elections && res.data.elections.length > 0) {
          setSelectedElectionId(res.data.elections[0].id);
        }
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

  // Fetch full details and transaction history whenever selected election changes
  useEffect(() => {
    if (selectedElectionId !== null) {
      setLoadingDetail(true);
      axios
        .get(`/polls/admin/election/${selectedElectionId}`)
        .then((res) => {
          setSelectedElectionData(res.data);
          setLoadingDetail(false);
        })
        .catch((err) => {
          console.error("Failed to fetch election details:", err);
          setLoadingDetail(false);
        });
    }
  }, [selectedElectionId]);

  const copyToClipboard = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(""), 2000);
  };

  const handleExportCSV = (electionId: number) => {
    axios
      .get(`/polls/export-csv/${electionId}`, { responseType: "blob" })
      .then((response) => {
        const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `election_report_${electionId}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error("Failed to export CSV report:", err);
        alert("Failed to export CSV report.");
      });
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
    approved: 0,
    rejected: 0,
    approachingDeadline: 0,
    overdue: 0,
  };
  const electionStats = data?.electionStats || {
    total: 0,
    active: 0,
    completed: 0,
    currentContractStatus: "not-started",
    currentContractName: "",
  };
  const votingStats = data?.votingStats || {
    totalVotesAcrossAllElections: 0,
    totalVotesCast: 0,
  };
  const elections = data?.elections || [];
  const recentActivity = data?.recentActivity || [];

  // Selected election details
  const currentSelectedElection =
    elections.find((e) => e.id === selectedElectionId) || (elections.length > 0 ? elections[0] : null);

  const detailStats = selectedElectionData?.statistics || {
    totalVotes: currentSelectedElection?.totalVotes || 0,
    eligibleVoters: currentSelectedElection?.eligibleVoters || voterStats.verified,
    turnoutPercentage: currentSelectedElection?.turnoutPercentage || 0,
    remainingEligibleVoters: currentSelectedElection?.remainingEligibleVoters || 0,
    candidateStats: currentSelectedElection?.candidateStats || [],
  };

  const electionTransactions = selectedElectionData?.transactions || [];

  return (
    <div className="analytics-dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1>Admin Command Dashboard</h1>
          <p>Historical & real-time telemetry from Ethereum Smart Contracts and MySQL Ledger</p>
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

      {/* Voter Registration Review & 24h SLA Section */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#1e3a8a",
                background: "#dbeafe",
                padding: "3px 10px",
                borderRadius: "6px",
              }}
            >
              Voter Registration Approval & 24h SLA Hub
            </span>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Target: Process new registrations within 24 hours of submission
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate("/users")}
            className="button-primary"
            style={{ padding: "5px 12px", fontSize: "0.825rem" }}
          >
            Open Registration Hub &rarr;
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon amber">
              <i className="bi bi-person-lines-fill"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Pending Approval</span>
              <span className="stat-value">{voterStats.pendingApprovals}</span>
              <span className="stat-desc">Awaiting verification</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon emerald">
              <i className="bi bi-person-check-fill"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Approved Voters</span>
              <span className="stat-value">{voterStats.approved ?? voterStats.verified}</span>
              <span className="stat-desc">Voter IDs assigned</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon red" style={{ background: "#fee2e2", color: "#dc2626" }}>
              <i className="bi bi-person-x-fill"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Rejected Applications</span>
              <span className="stat-value">{voterStats.rejected ?? 0}</span>
              <span className="stat-desc">Preserved for audit</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon sky" style={{ background: (voterStats.approachingDeadline ?? 0) > 0 ? "#fef3c7" : "#f1f5f9", color: (voterStats.approachingDeadline ?? 0) > 0 ? "#b45309" : "#64748b" }}>
              <i className="bi bi-hourglass-split"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Due Soon (&lt; 6h)</span>
              <span className="stat-value">{voterStats.approachingDeadline ?? 0}</span>
              <span className="stat-desc">Approaching 24h limit</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon purple" style={{ background: (voterStats.overdue ?? 0) > 0 ? "#fee2e2" : "#f1f5f9", color: (voterStats.overdue ?? 0) > 0 ? "#dc2626" : "#64748b" }}>
              <i className="bi bi-exclamation-octagon-fill"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Overdue (&gt; 24h)</span>
              <span className="stat-value" style={{ color: (voterStats.overdue ?? 0) > 0 ? "#dc2626" : "inherit" }}>
                {voterStats.overdue ?? 0}
              </span>
              <span className="stat-desc">Exceeded review target</span>
            </div>
          </div>
        </div>
      </div>

      {/* Requirement 3: Overall Statistics Aggregated Across ALL Elections */}
      <div>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#475569",
              background: "#e2e8f0",
              padding: "3px 10px",
              borderRadius: "6px",
            }}
          >
            Overall System Statistics (All Elections)
          </span>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon indigo">
              <i className="bi bi-collection-play"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Elections</span>
              <span className="stat-value">{electionStats.total}</span>
              <span className="stat-desc">Lifetime conducted</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon blue">
              <i className="bi bi-cpu-fill"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Votes Cast</span>
              <span className="stat-value">{votingStats.totalVotesAcrossAllElections}</span>
              <span className="stat-desc">Across all elections</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon sky">
              <i className="bi bi-people-fill"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Registered Voters</span>
              <span className="stat-value">{voterStats.totalRegistered}</span>
              <span className="stat-desc">Unique citizen accounts</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon emerald">
              <i className="bi bi-shield-check"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Verified Voters</span>
              <span className="stat-value">{voterStats.verified}</span>
              <span className="stat-desc">Approved to vote</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon amber">
              <i className="bi bi-broadcast-pin"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Active Elections</span>
              <span className="stat-value">{electionStats.active}</span>
              <span className="stat-desc">Currently open</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon purple">
              <i className="bi bi-check2-all"></i>
            </div>
            <div className="stat-info">
              <span className="stat-label">Completed</span>
              <span className="stat-value">{electionStats.completed}</span>
              <span className="stat-desc">Safely concluded</span>
            </div>
          </div>
        </div>
      </div>

      {/* Requirement 4: Election History Section Displaying All Previous and Current Elections */}
      <div className="table-container">
        <div className="table-header-bar">
          <div>
            <h3>Election History & Archive ({elections.length})</h3>
            <span style={{ fontSize: "0.825rem", color: "#64748b" }}>
              Select any election below to inspect its individual statistics, candidate standings, and cryptographic voting ledger
            </span>
          </div>

          <button
            type="button"
            onClick={fetchStats}
            className="button-black"
            style={{ padding: "6px 12px", fontSize: "0.85rem" }}
          >
            <i className="bi bi-arrow-clockwise"></i> Refresh Records
          </button>
        </div>

        {elections.length === 0 ? (
          <div style={{ textAlign: "center", padding: 36, color: "#64748b" }}>
            <i className="bi bi-inbox" style={{ fontSize: "2rem", display: "block", marginBottom: 8 }}></i>
            No elections have been conducted yet. Click "Manage Elections" to start your first ballot.
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <div className="election-selector-grid">
              {elections.map((elec) => {
                const isSelected = elec.id === selectedElectionId;
                return (
                  <div
                    key={elec.id}
                    className={`election-selector-card ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedElectionId(elec.id)}
                  >
                    <div className="election-card-header">
                      <span className="election-id-tag">ID #{elec.id}</span>
                      <span className={`status-badge ${elec.status === "running" ? "running" : "finished"}`}>
                        {elec.status === "running" ? "ACTIVE" : "COMPLETED"}
                      </span>
                    </div>

                    <h4 className="election-card-title">{elec.name}</h4>
                    <p className="election-card-desc">{elec.description || "No description provided."}</p>

                    <div className="election-card-metrics">
                      <span>
                        Votes: <strong>{elec.totalVotes}</strong>
                      </span>
                      <span>
                        Turnout: <strong>{elec.turnoutPercentage}%</strong>
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        {new Date(elec.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {elec.winner && (
                      <div
                        style={{
                          fontSize: "0.775rem",
                          color: "#166534",
                          background: "#dcfce7",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <i className="bi bi-trophy-fill"></i> Leader: {elec.winner.name} ({elec.winner.count} votes)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Requirement 5: Selected Election Individual Statistics, Results, and Voting History */}
      {currentSelectedElection && (
        <div className="election-deepdive-container">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 12,
              borderBottom: "1px solid #f1f5f9",
              paddingBottom: 16,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    background: "#2563eb",
                    color: "white",
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  ELECTION ID #{currentSelectedElection.id}
                </span>
                <span
                  className={`status-badge ${
                    currentSelectedElection.status === "running" ? "running" : "finished"
                  }`}
                >
                  {currentSelectedElection.status === "running" ? "BALLOT IN PROGRESS" : "BALLOT CONCLUDED"}
                </span>
              </div>
              <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>
                {currentSelectedElection.name}
              </h2>
              <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
                {currentSelectedElection.description || "Official cryptographically recorded election."}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => handleExportCSV(currentSelectedElection.id)}
                className="button-primary"
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                <i className="bi bi-file-earmark-spreadsheet"></i> Export CSV Report
              </button>
            </div>
          </div>

          {/* Individual Election Metric Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <i className="bi bi-box-seam"></i>
              </div>
              <div className="stat-info">
                <span className="stat-label">Ballots Cast</span>
                <span className="stat-value">{detailStats.totalVotes}</span>
                <span className="stat-desc">In Election #{currentSelectedElection.id}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon emerald">
                <i className="bi bi-shield-check"></i>
              </div>
              <div className="stat-info">
                <span className="stat-label">Eligible Voters</span>
                <span className="stat-value">{detailStats.eligibleVoters}</span>
                <span className="stat-desc">Verified citizens</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon indigo">
                <i className="bi bi-pie-chart"></i>
              </div>
              <div className="stat-info">
                <span className="stat-label">Voter Turnout</span>
                <span className="stat-value">{detailStats.turnoutPercentage}%</span>
                <span className="stat-desc">Participation rate</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <i className="bi bi-person-dash"></i>
              </div>
              <div className="stat-info">
                <span className="stat-label">Remaining Voters</span>
                <span className="stat-value">{detailStats.remainingEligibleVoters}</span>
                <span className="stat-desc">Eligible but uncast</span>
              </div>
            </div>
          </div>

          {/* Candidate Standings & Comparison */}
          <div className="analytics-card">
            <div className="card-header-row">
              <h3>
                <i className="bi bi-bar-chart-fill"></i> Candidate Standings & Vote Shares
              </h3>
              <span className="card-badge">Election #{currentSelectedElection.id}</span>
            </div>

            <div className="candidate-bars">
              {detailStats.candidateStats.length === 0 ? (
                <div style={{ color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>
                  No candidate vote data recorded for this election.
                </div>
              ) : (
                detailStats.candidateStats.map((cand, idx) => (
                  <div key={cand.name} className="candidate-bar-item">
                    <div className="candidate-bar-header">
                      <div>
                        <span className="candidate-name">{cand.name}</span>
                        {cand.info && (
                          <span style={{ fontSize: "0.775rem", color: "#64748b", marginLeft: 8 }}>
                            ({cand.info})
                          </span>
                        )}
                      </div>
                      <span className="candidate-count">
                        {cand.count} {cand.count === 1 ? "vote" : "votes"} ({cand.percentage}%)
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${cand.percentage}%`,
                          backgroundColor: PALETTE[idx % PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dedicated Individual Election Voting History / Transactions */}
          <div className="table-container" style={{ margin: 0 }}>
            <div className="table-header-bar">
              <div>
                <h3>
                  <i className="bi bi-journal-text"></i> Voting History for Election #{currentSelectedElection.id} (
                  {electionTransactions.length} {electionTransactions.length === 1 ? "Record" : "Records"})
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Immutable cryptographic proof of ballots recorded on the Ethereum blockchain for this election
                </span>
              </div>
            </div>

            {loadingDetail ? (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                Loading individual election voting ledger...
              </div>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Tx Hash (Proof)</th>
                      <th>Voter ID</th>
                      <th>Candidate Selected</th>
                      <th>Block #</th>
                      <th>Gas Used</th>
                      <th>Timestamp</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {electionTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: 28, color: "#64748b" }}>
                          No ballots have been cast in Election #{currentSelectedElection.id} yet.
                        </td>
                      </tr>
                    ) : (
                      electionTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td>
                            <div className="hash-container">
                              <span>{tx.shortHash}</span>
                              <button
                                type="button"
                                className="copy-btn"
                                title="Copy full transaction hash"
                                onClick={() => copyToClipboard(tx.transactionHash)}
                              >
                                <i
                                  className={
                                    copiedHash === tx.transactionHash
                                      ? "bi bi-check-lg"
                                      : "bi bi-clipboard"
                                  }
                                ></i>
                              </button>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600 }}>ID: {tx.voterId}</td>
                          <td>
                            <strong style={{ color: "#2563eb" }}>{tx.candidateName}</strong>
                          </td>
                          <td>#{tx.blockNumber}</td>
                          <td>{tx.gasUsed.toLocaleString()} wei</td>
                          <td style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                            {new Date(tx.timestamp).toLocaleString()}
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                tx.status === "success" ? "success" : "failed"
                              }`}
                            >
                              <i
                                className={
                                  tx.status === "success"
                                    ? "bi bi-check-circle-fill"
                                    : "bi bi-x-circle-fill"
                                }
                              ></i>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global Recent Voting Activity Table */}
      <div className="table-container">
        <div className="table-header-bar">
          <div>
            <h3>Global Cryptographic Activity Feed</h3>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Most recent on-chain ballot transactions across all platform elections
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin/transactions")}
            className="button-black"
            style={{ padding: "6px 12px", fontSize: "0.85rem" }}
          >
            View Full Ledger &rarr;
          </button>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Voter ID</th>
                <th>Election</th>
                <th>Candidate</th>
                <th>Tx Hash</th>
                <th>Block #</th>
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
                recentActivity.map((act) => (
                  <tr key={act.id}>
                    <td style={{ fontWeight: 600 }}>ID: {act.voterId}</td>
                    <td>{act.electionName}</td>
                    <td style={{ fontWeight: 600, color: "#2563eb" }}>
                      {act.candidateName}
                    </td>
                    <td>
                      <div className="hash-container">
                        <span>{act.shortHash}</span>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
