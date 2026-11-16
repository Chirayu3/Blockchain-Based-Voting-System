import React from "react";
import axios from "../../axios";

export interface CandidateStat {
  name: string;
  count: number;
  percentage: number;
}

export interface AnalyticsData {
  totalVotes: number;
  eligibleVoters: number;
  turnoutPercentage: number;
  remainingEligibleVoters: number;
  candidateStats: CandidateStat[];
  status: string;
}

interface ResultAnalyticsProps {
  electionId?: number;
  electionName: string;
  electionDescription: string;
  analytics: AnalyticsData;
  isAdmin?: boolean;
  onRefresh?: () => void;
}

const PALETTE = [
  "#2563eb", // blue
  "#4f46e5", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
];

const ResultAnalytics: React.FC<ResultAnalyticsProps> = ({
  electionId,
  electionName,
  electionDescription,
  analytics,
  isAdmin = false,
  onRefresh,
}) => {
  const {
    totalVotes,
    eligibleVoters,
    turnoutPercentage,
    remainingEligibleVoters,
    candidateStats,
  } = analytics;

  const handleExportCSV = async () => {
    try {
      const response = await axios.get("/polls/export-csv", {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `election_report_${electionId || 1}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download CSV report:", error);
      alert("Unable to export CSV report. Please verify administrator permissions.");
    }
  };

  // Turnout Circle parameters
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const turnoutClamped = Math.min(100, Math.max(0, turnoutPercentage));
  const strokeDashoffset = circumference - (turnoutClamped / 100) * circumference;

  // Doughnut Chart parameters
  const doughnutRadius = 60;
  const doughnutCircumference = 2 * Math.PI * doughnutRadius;
  let accumulatedAngle = 0;

  return (
    <div className="analytics-dashboard-container" style={{ padding: 0 }}>
      {/* Analytics Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <i className="bi bi-box-seam"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Votes Cast</span>
            <span className="stat-value">{totalVotes}</span>
            <span className="stat-desc">Cryptographically recorded</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon emerald">
            <i className="bi bi-shield-check"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Eligible Voters</span>
            <span className="stat-value">{eligibleVoters}</span>
            <span className="stat-desc">Admin-verified citizens</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon indigo">
            <i className="bi bi-pie-chart"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Voter Turnout</span>
            <span className="stat-value">{turnoutPercentage}%</span>
            <span className="stat-desc">Participation rate</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon amber">
            <i className="bi bi-person-dash"></i>
          </div>
          <div className="stat-info">
            <span className="stat-label">Remaining Voters</span>
            <span className="stat-value">{remainingEligibleVoters}</span>
            <span className="stat-desc">Yet to cast ballot</span>
          </div>
        </div>
      </div>

      {/* Visual Analytics Row */}
      <div className="analytics-grid-two">
        {/* Candidate Comparison Bar Chart */}
        <div className="analytics-card">
          <div className="card-header-row">
            <h3>
              <i className="bi bi-bar-chart-fill"></i> Candidate Comparison
            </h3>
            <span className="card-badge">Vote Shares</span>
          </div>

          <div className="candidate-bars">
            {candidateStats.length === 0 ? (
              <div style={{ color: "#64748b", padding: "16px 0", textAlign: "center" }}>
                No candidate data recorded yet.
              </div>
            ) : (
              candidateStats.map((cand, idx) => (
                <div key={cand.name} className="candidate-bar-item">
                  <div className="candidate-bar-header">
                    <span className="candidate-name">{cand.name}</span>
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

        {/* Vote Distribution Doughnut Chart & Voter Turnout Gauge */}
        <div className="analytics-card">
          <div className="card-header-row">
            <h3>
              <i className="bi bi-pie-chart-fill"></i> Vote Distribution & Turnout
            </h3>
            <span className="card-badge">Breakdown</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Doughnut Chart */}
            <div className="doughnut-container">
              <div style={{ position: "relative", width: 140, height: 140 }}>
                <svg className="doughnut-chart-svg" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r={doughnutRadius}
                    fill="transparent"
                    stroke="#f1f5f9"
                    strokeWidth="20"
                  />
                  {totalVotes > 0 &&
                    candidateStats.map((cand, idx) => {
                      const sliceLength =
                        (cand.percentage / 100) * doughnutCircumference;
                      const offset = -accumulatedAngle;
                      accumulatedAngle += sliceLength;
                      return (
                        <circle
                          key={cand.name}
                          cx="80"
                          cy="80"
                          r={doughnutRadius}
                          fill="transparent"
                          stroke={PALETTE[idx % PALETTE.length]}
                          strokeWidth="20"
                          strokeDasharray={`${sliceLength} ${doughnutCircumference - sliceLength}`}
                          strokeDashoffset={offset}
                        />
                      );
                    })}
                </svg>
              </div>

              <div className="doughnut-legend">
                {candidateStats.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                    No votes cast yet
                  </div>
                ) : (
                  candidateStats.map((cand, idx) => (
                    <div key={cand.name} className="legend-item">
                      <div
                        className="legend-color"
                        style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                      />
                      <span className="legend-label" title={cand.name}>
                        {cand.name}
                      </span>
                      <span className="legend-pct">{cand.percentage}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Voter Turnout Progress */}
            <div className="turnout-container" style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
              <div className="turnout-circle">
                <svg viewBox="0 0 140 140">
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke="#f1f5f9"
                    strokeWidth="14"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke="#2563eb"
                    strokeWidth="14"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                  />
                </svg>
                <div className="turnout-center-text">
                  <span className="percentage">{turnoutPercentage}%</span>
                  <span className="label">Turnout</span>
                </div>
              </div>

              <div className="turnout-meta">
                <div className="meta-item">
                  <span className="meta-dot voted"></span>
                  <span className="meta-text">
                    Ballots Cast: <strong>{totalVotes}</strong>
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-dot remaining"></span>
                  <span className="meta-text">
                    Remaining Eligible: <strong>{remainingEligibleVoters}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Breakdown Detailed Table */}
      <div className="table-container">
        <div className="table-header-bar">
          <h3>Official Candidate Standings</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isAdmin && (
              <button
                type="button"
                onClick={handleExportCSV}
                className="button-primary"
                style={{ padding: "6px 14px", fontSize: "0.85rem" }}
              >
                <i className="bi bi-file-earmark-spreadsheet"></i> Export CSV Report
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="button-black"
                style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                title="Refresh Live Analytics"
              >
                <i className="bi bi-arrow-clockwise"></i> Refresh
              </button>
            )}
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Candidate Name</th>
                <th>Votes Cast</th>
                <th>Vote Share</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {candidateStats.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                    No candidates registered for this ballot.
                  </td>
                </tr>
              ) : (
                [...candidateStats]
                  .sort((a, b) => b.count - a.count)
                  .map((cand, index) => (
                    <tr key={cand.name}>
                      <td style={{ fontWeight: 700, color: index === 0 && cand.count > 0 ? "#2563eb" : "#475569" }}>
                        #{index + 1}
                      </td>
                      <td style={{ fontWeight: 600, color: "#0f172a" }}>{cand.name}</td>
                      <td style={{ fontWeight: 700 }}>{cand.count}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{cand.percentage}%</span>
                      </td>
                      <td>
                        {index === 0 && cand.count > 0 ? (
                          <span className="status-badge success">Leading</span>
                        ) : (
                          <span className="status-badge running">Contender</span>
                        )}
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

export default ResultAnalytics;
