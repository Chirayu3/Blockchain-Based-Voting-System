import React, { useEffect, useState } from "react";
import axios from "../../axios";

interface TransactionItem {
  id: number;
  transactionHash: string;
  shortHash: string;
  voter: {
    id: number;
    name: string;
    email: string;
    citizenshipNumber: string;
  };
  election: {
    id: number;
    name: string;
  };
  candidateName: string;
  blockNumber: number;
  gasUsed: number;
  status: string;
  timestamp: string;
}

const Transactions: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [elections, setElections] = useState<any[]>([]);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [electionFilter, setElectionFilter] = useState<string>("all");
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);
  const [copiedHash, setCopiedHash] = useState<string>("");

  const fetchTransactions = () => {
    setLoading(true);
    const params: any = {};
    if (search.trim()) params.search = search.trim();
    if (statusFilter !== "all") params.status = statusFilter;
    if (electionFilter !== "all") params.electionId = electionFilter;

    axios
      .get("/polls/admin/transactions", { params })
      .then((res) => {
        setTransactions(res.data.transactions || []);
        if (res.data.elections) setElections(res.data.elections);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch blockchain transactions:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, electionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransactions();
  };

  const copyToClipboard = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(""), 2000);
  };

  return (
    <div className="analytics-dashboard-container">
      {/* Page Header */}
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1>Blockchain Transaction Ledger</h1>
          <p>Immutable cryptographic vote records verified on Ethereum blockchain</p>
        </div>

        <div className="dashboard-actions">
          <button
            type="button"
            onClick={fetchTransactions}
            className="button-black"
          >
            <i className="bi bi-arrow-clockwise"></i> Refresh Ledger
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="table-container" style={{ padding: 16 }}>
        <form onSubmit={handleSearchSubmit} className="search-filter-bar">
          <div className="search-input-wrapper">
            <i className="bi bi-search"></i>
            <input
              type="text"
              placeholder="Search by voter name, tx hash, candidate or election..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={electionFilter}
            onChange={(e) => setElectionFilter(e.target.value)}
          >
            <option value="all">All Elections</option>
            {elections.map((elec) => (
              <option key={elec.id} value={elec.id}>
                {elec.name} (ID: {elec.id})
              </option>
            ))}
          </select>

          <button type="submit" className="button-primary">
            Filter
          </button>
        </form>
      </div>

      {/* Transactions Table */}
      <div className="table-container">
        <div className="table-header-bar">
          <h3>Transaction Records ({transactions.length})</h3>
        </div>

        {loading ? (
          <div className="app-loading-screen" style={{ minHeight: "40vh" }}>
            <div className="app-spinner"></div>
            <div className="app-loading-text">Querying Blockchain Transactions...</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Tx Hash</th>
                  <th>Voter Name & ID</th>
                  <th>Election</th>
                  <th>Candidate Choice</th>
                  <th>Block #</th>
                  <th>Gas Used</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 32, color: "#64748b" }}>
                      No matching blockchain transactions found.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
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
                      <td>
                        <div style={{ fontWeight: 600 }}>{tx.voter.name}</div>
                        <div style={{ fontSize: "0.775rem", color: "#64748b" }}>
                          ID: {tx.voter.id}
                          {tx.voter.citizenshipNumber && ` • Cit: ${tx.voter.citizenshipNumber}`}
                        </div>
                      </td>
                      <td>{tx.election.name}</td>
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
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelectedTx(tx)}
                          className="button-black"
                          style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                        >
                          <i className="bi bi-eye"></i> Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full Transaction Details Modal */}
      {selectedTx && (
        <div className="tx-modal-backdrop" onClick={() => setSelectedTx(null)}>
          <div className="tx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cryptographic Transaction Receipt</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setSelectedTx(null)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-row">
                <label>Full Transaction Hash (Keccak-256)</label>
                <div className="modal-value" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ wordBreak: "break-all" }}>{selectedTx.transactionHash}</span>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyToClipboard(selectedTx.transactionHash)}
                  >
                    <i className="bi bi-clipboard"></i>
                  </button>
                </div>
              </div>

              <div className="modal-row">
                <label>Block Number</label>
                <div className="modal-value">Block #{selectedTx.blockNumber}</div>
              </div>

              <div className="modal-row">
                <label>Voter Identity</label>
                <div className="modal-value">
                  {selectedTx.voter.name} (Voter ID: {selectedTx.voter.id})
                  {selectedTx.voter.email && ` • ${selectedTx.voter.email}`}
                </div>
              </div>

              <div className="modal-row">
                <label>Election & Candidate</label>
                <div className="modal-value">
                  {selectedTx.election.name} &rarr; <strong>{selectedTx.candidateName}</strong>
                </div>
              </div>

              <div className="modal-row">
                <label>Execution Status & Gas Used</label>
                <div className="modal-value">
                  Status: <strong>{selectedTx.status.toUpperCase()}</strong> | Gas:{" "}
                  {selectedTx.gasUsed}
                </div>
              </div>

              <div className="modal-row">
                <label>Block Timestamp</label>
                <div className="modal-value">
                  {new Date(selectedTx.timestamp).toUTCString()} ({new Date(selectedTx.timestamp).toLocaleString()})
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="button-black"
                onClick={() => setSelectedTx(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;
