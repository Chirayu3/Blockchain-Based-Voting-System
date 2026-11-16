import React, { useEffect, useState } from "react";
import axios from "../../axios";

interface VoterTx {
  id: number;
  transactionHash: string;
  shortHash: string;
  electionName: string;
  candidateName: string;
  blockNumber: number;
  gasUsed: number;
  status: string;
  timestamp: string;
}

const History = (): JSX.Element => {
  const [loading, setLoading] = useState<boolean>(true);
  const [history, setHistory] = useState<VoterTx[]>([]);
  const [copiedHash, setCopiedHash] = useState<string>("");

  useEffect(() => {
    axios
      .get("/polls/voter/history")
      .then((res) => {
        setHistory(res.data.transactions || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch personal voter history:", err);
        setLoading(false);
      });
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
        <div className="app-loading-text">Retrieving Your Cryptographic Ballots...</div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1>My Voting Ledger & Proof of Ballot</h1>
          <p>Cryptographic receipts of your votes securely committed to the Ethereum network</p>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header-bar">
          <h3>Personal Ballot Receipts ({history.length})</h3>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Election Name</th>
                <th>Candidate Selected</th>
                <th>Transaction Hash (Proof)</th>
                <th>Block #</th>
                <th>Timestamp</th>
                <th>Receipt Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "#64748b" }}>
                    You have not cast any cryptographic ballots yet.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: "#0f172a" }}>{item.electionName}</td>
                    <td>
                      <strong style={{ color: "#2563eb" }}>{item.candidateName}</strong>
                    </td>
                    <td>
                      <div className="hash-container">
                        <span>{item.shortHash}</span>
                        <button
                          type="button"
                          className="copy-btn"
                          title="Copy full cryptographic transaction hash"
                          onClick={() => copyToClipboard(item.transactionHash)}
                        >
                          <i
                            className={
                              copiedHash === item.transactionHash
                                ? "bi bi-check-lg"
                                : "bi bi-clipboard"
                            }
                          ></i>
                        </button>
                      </div>
                    </td>
                    <td>#{item.blockNumber}</td>
                    <td>{new Date(item.timestamp).toLocaleString()}</td>
                    <td>
                      <span className="status-badge success">
                        <i className="bi bi-shield-check"></i> Confirmed on Chain
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

export default History;
