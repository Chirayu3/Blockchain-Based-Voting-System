import React, { useState } from "react";
import { useParams, useNavigate } from "react-router";
import axios from "../../axios";

const Verify = () => {
  const { id, name } = useParams();
  const navigate = useNavigate();

  const [feedback, setFeedback] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const approveUser = async () => {
    setLoading(true);
    setFeedback("");
    setError("");

    try {
      const res = await axios.post("/users/approve-registration", {
        userId: Number(id),
      });
      setFeedback(
        `Registration approved! Assigned Voter ID: ${res.data.user?.voterId}`
      );
    } catch (err: any) {
      const msg =
        err?.response?.data || err.message || "Failed to approve registration.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  const rejectUser = async () => {
    setLoading(true);
    setFeedback("");
    setError("");

    try {
      await axios.post("/users/reject-registration", {
        userId: Number(id),
      });
      setFeedback(`Registration for ${name} has been rejected.`);
    } catch (err: any) {
      const msg =
        err?.response?.data || err.message || "Failed to reject registration.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = () => {
    setLoading(true);
    axios
      .delete(`/users/delete/${id}`)
      .then(() => {
        setFeedback(`User ${name} has been removed.`);
        setTimeout(() => navigate("/users"), 1500);
      })
      .catch((err) => {
        setError("Failed to delete user.");
        setLoading(false);
      });
  };

  return (
    <div className="verify-user-card">
      <div className="verify-header">
        <div className="verify-icon">
          <i className="bi bi-shield-check"></i>
        </div>
        <div className="title-small">Voter Registration Approval</div>
        <div className="text-normal">
          Review and approve verification for <strong>{name}</strong> (ID: #{id})
        </div>
      </div>

      {feedback && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: "0.85rem",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {feedback}
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: "0.85rem",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div className="verify-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={approveUser}
          disabled={loading}
          className="button-primary"
        >
          <i className="bi bi-check-lg"></i> {loading ? "Approving..." : `Approve & Issue Voter ID`}
        </button>

        <button
          onClick={rejectUser}
          disabled={loading}
          className="button-black"
        >
          <i className="bi bi-x-circle"></i> Reject Application
        </button>

        <button
          onClick={deleteUser}
          disabled={loading}
          className="button-black button-danger"
        >
          <i className="bi bi-trash"></i> Delete User
        </button>

        <button
          onClick={() => navigate("/users")}
          className="button-secondary"
        >
          Back to Hub
        </button>
      </div>
    </div>
  );
};

export default Verify;
