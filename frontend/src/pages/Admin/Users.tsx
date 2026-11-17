import React, { useEffect, useState, useCallback } from "react";
import axios from "../../axios";

interface EmailDeliveryInfo {
  id: number;
  emailType: string;
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  sentAt: string | null;
  errorMessage: string | null;
}

interface RegistrationRecord {
  id: number;
  name: string;
  citizenshipNumber: string;
  email: string;
  voterId: string | null;
  registrationStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  registrationSubmittedAt: string | null;
  registrationReviewedAt: string | null;
  reviewedBy: number | null;
  rejectionReason: string | null;
  verified: boolean;
  emailVerified: boolean;
  isActive: boolean;
  deadline: string;
  hoursElapsed: number;
  hoursRemaining: number;
  slaStatus: "NORMAL" | "APPROACHING_DEADLINE" | "OVERDUE";
  latestEmailDelivery: EmailDeliveryInfo | null;
}

interface RegistrationSummary {
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  approachingDeadline: number;
  overdue: number;
}

type TabType = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ALL";

const Users = (): JSX.Element => {
  const [activeTab, setActiveTab] = useState<TabType>("PENDING_APPROVAL");
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [summary, setSummary] = useState<RegistrationSummary>({
    totalPending: 0,
    totalApproved: 0,
    totalRejected: 0,
    approachingDeadline: 0,
    overdue: 0,
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modals state
  const [selectedApplicant, setSelectedApplicant] =
    useState<RegistrationRecord | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    userId: number;
    name: string;
  } | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>("");

  const fetchRegistrations = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (activeTab !== "ALL") {
      params.status = activeTab;
    }
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }

    axios
      .get("/users/pending-registrations", { params })
      .then((res) => {
        setRegistrations(res.data.registrations || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch registrations:", err);
        setFeedback({
          type: "error",
          message: "Failed to load registrations. Please try again.",
        });
        setLoading(false);
      });
  }, [activeTab, searchQuery]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  // Approve a pending registration
  const handleApprove = async (userId: number, name: string) => {
    if (actionInProgress !== null) return;
    setActionInProgress(userId);
    setFeedback(null);

    try {
      const res = await axios.post("/users/approve-registration", { userId });
      const voterId = res.data.user?.voterId || "";
      const emailNote = res.data.emailDelivery?.sent
        ? "Voter ID email delivered."
        : "Voter ID assigned (SMTP delivery failed; use Resend button to retry).";

      setFeedback({
        type: "success",
        message: `Approved ${name}! Permanent Voter ID: ${voterId}. ${emailNote}`,
      });
      fetchRegistrations();
    } catch (err: any) {
      const msg =
        err?.response?.data || err.message || "Failed to approve registration.";
      setFeedback({
        type: "error",
        message: typeof msg === "string" ? msg : JSON.stringify(msg),
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Open rejection modal
  const openRejectModal = (userId: number, name: string) => {
    setRejectModal({ userId, name });
    setRejectionReasonInput("");
  };

  // Confirm rejection
  const handleConfirmReject = async () => {
    if (!rejectModal || actionInProgress !== null) return;
    const { userId, name } = rejectModal;
    setActionInProgress(userId);
    setFeedback(null);

    try {
      await axios.post("/users/reject-registration", {
        userId,
        reason: rejectionReasonInput.trim() || undefined,
      });

      setFeedback({
        type: "success",
        message: `Application for ${name} has been rejected. Record preserved for audit.`,
      });
      setRejectModal(null);
      fetchRegistrations();
    } catch (err: any) {
      const msg =
        err?.response?.data || err.message || "Failed to reject registration.";
      setFeedback({
        type: "error",
        message: typeof msg === "string" ? msg : JSON.stringify(msg),
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Reopen a rejected application
  const handleReopen = async (userId: number, name: string) => {
    if (actionInProgress !== null) return;
    setActionInProgress(userId);
    setFeedback(null);

    try {
      await axios.post("/users/reopen-registration", { userId });
      setFeedback({
        type: "success",
        message: `Reopened application for ${name}. Restored to Pending Approval status.`,
      });
      fetchRegistrations();
    } catch (err: any) {
      const msg =
        err?.response?.data || err.message || "Failed to reopen application.";
      setFeedback({
        type: "error",
        message: typeof msg === "string" ? msg : JSON.stringify(msg),
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Resend Voter ID email to an approved user
  const handleResendVoterId = async (userId: number, name: string) => {
    if (actionInProgress !== null) return;
    setActionInProgress(userId);
    setFeedback(null);

    try {
      const res = await axios.post("/users/resend-voter-id-email", { userId });
      setFeedback({
        type: "success",
        message: `Dispatched Voter ID email to ${name} (${res.data.voterId}).`,
      });
      fetchRegistrations();
    } catch (err: any) {
      const msg =
        err?.response?.data || err.message || "Failed to resend Voter ID email.";
      setFeedback({
        type: "error",
        message: typeof msg === "string" ? msg : JSON.stringify(msg),
      });
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="users-wrapper">
      {/* Top Header & Refresh */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 4px 0", fontSize: "1.35rem", fontWeight: 800 }}>
            Voter Registration & Verification Hub
          </h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
            Review citizen identity applications, enforce 24h SLA review targets, and issue collision-safe Voter IDs.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchRegistrations}
          className="button-black"
          style={{ padding: "6px 14px", fontSize: "0.85rem" }}
        >
          <i className="bi bi-arrow-clockwise"></i> Refresh Records
        </button>
      </div>

      {/* SLA Target Banner */}
      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <i className="bi bi-info-circle-fill" style={{ color: "#2563eb", fontSize: "1.2rem" }}></i>
          <span style={{ fontSize: "0.825rem", color: "#334155", lineHeight: 1.4 }}>
            <strong>24-Hour Review SLA:</strong> Target turnaround is 24 hours. Normal: &lt;18h • Approaching: 18–24h • Overdue: &gt;24h.
            <em> Note: The SLA target is an administrative goal, not an automated approval guarantee.</em>
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {summary.approachingDeadline > 0 && (
            <span
              style={{
                background: "#fef3c7",
                color: "#92400e",
                padding: "3px 8px",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              ⚠ {summary.approachingDeadline} Approaching Limit
            </span>
          )}
          {summary.overdue > 0 && (
            <span
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "3px 8px",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              ⛔ {summary.overdue} Overdue
            </span>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "6px",
            marginBottom: 16,
            fontSize: "0.875rem",
            fontWeight: 600,
            background: feedback.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${feedback.type === "success" ? "#bbf7d0" : "#fecaca"}`,
            color: feedback.type === "success" ? "#166534" : "#991b1b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Navigation & Search Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveTab("PENDING_APPROVAL")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: activeTab === "PENDING_APPROVAL" ? "2px solid #2563eb" : "1px solid #cbd5e1",
              background: activeTab === "PENDING_APPROVAL" ? "#eff6ff" : "#ffffff",
              color: activeTab === "PENDING_APPROVAL" ? "#1d4ed8" : "#475569",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Pending Approval
            <span
              style={{
                background: summary.totalPending > 0 ? "#ef4444" : "#e2e8f0",
                color: summary.totalPending > 0 ? "white" : "#475569",
                borderRadius: "9999px",
                padding: "1px 6px",
                fontSize: "0.75rem",
              }}
            >
              {summary.totalPending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("APPROVED")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: activeTab === "APPROVED" ? "2px solid #16a34a" : "1px solid #cbd5e1",
              background: activeTab === "APPROVED" ? "#f0fdf4" : "#ffffff",
              color: activeTab === "APPROVED" ? "#15803d" : "#475569",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Approved Voters ({summary.totalApproved})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("REJECTED")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: activeTab === "REJECTED" ? "2px solid #dc2626" : "1px solid #cbd5e1",
              background: activeTab === "REJECTED" ? "#fef2f2" : "#ffffff",
              color: activeTab === "REJECTED" ? "#b91c1c" : "#475569",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Rejected ({summary.totalRejected})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ALL")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: activeTab === "ALL" ? "2px solid #475569" : "1px solid #cbd5e1",
              background: activeTab === "ALL" ? "#f1f5f9" : "#ffffff",
              color: activeTab === "ALL" ? "#0f172a" : "#475569",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            All Registrations
          </button>
        </div>

        {/* Search Input */}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="Search by name, email, citizen ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "0.85rem",
              width: 260,
            }}
          />
        </div>
      </div>

      {/* Registrations List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 36, color: "#64748b" }}>
          <div className="app-spinner" style={{ margin: "0 auto 12px auto" }}></div>
          Loading registration records...
        </div>
      ) : registrations.length === 0 ? (
        <div className="empty-users-state">
          <i className="bi bi-shield-check"></i>
          <h3>No Records Found</h3>
          <p>
            {activeTab === "PENDING_APPROVAL"
              ? "All submitted registrations have been reviewed. There are no pending approvals!"
              : "No registrations match your current filter criteria."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {registrations.map((user) => {
            const isProcessing = actionInProgress === user.id;

            return (
              <div
                key={user.id}
                className="user-wrapper"
                style={{
                  borderLeft:
                    user.registrationStatus === "APPROVED"
                      ? "4px solid #16a34a"
                      : user.registrationStatus === "REJECTED"
                      ? "4px solid #dc2626"
                      : user.slaStatus === "OVERDUE"
                      ? "4px solid #dc2626"
                      : user.slaStatus === "APPROACHING_DEADLINE"
                      ? "4px solid #f59e0b"
                      : "4px solid #2563eb",
                }}
              >
                <div className="user-info">
                  <span
                    className="user-avatar"
                    style={{
                      background:
                        user.registrationStatus === "APPROVED"
                          ? "#f0fdf4"
                          : user.registrationStatus === "REJECTED"
                          ? "#fef2f2"
                          : "#eff6ff",
                      color:
                        user.registrationStatus === "APPROVED"
                          ? "#16a34a"
                          : user.registrationStatus === "REJECTED"
                          ? "#dc2626"
                          : "#2563eb",
                    }}
                  >
                    <i
                      className={
                        user.registrationStatus === "APPROVED"
                          ? "bi bi-check-circle"
                          : user.registrationStatus === "REJECTED"
                          ? "bi bi-x-circle"
                          : "bi bi-hourglass-split"
                      }
                    ></i>
                  </span>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="user-name">{user.name}</span>
                      <span
                        style={{
                          fontSize: "0.725rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          background:
                            user.registrationStatus === "APPROVED"
                              ? "#dcfce7"
                              : user.registrationStatus === "REJECTED"
                              ? "#fee2e2"
                              : "#fef3c7",
                          color:
                            user.registrationStatus === "APPROVED"
                              ? "#15803d"
                              : user.registrationStatus === "REJECTED"
                              ? "#b91c1c"
                              : "#b45309",
                        }}
                      >
                        {user.registrationStatus.replace("_", " ")}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
                      <span className="user-meta">
                        <i className="bi bi-envelope"></i> {user.email}
                      </span>
                      <span className="user-meta">
                        <i className="bi bi-card-heading"></i> Citizen ID: {user.citizenshipNumber}
                      </span>
                      {user.voterId && (
                        <span
                          className="user-meta"
                          style={{
                            fontFamily: "monospace",
                            color: "#16a34a",
                            fontWeight: 700,
                          }}
                        >
                          <i className="bi bi-award"></i> Voter ID: {user.voterId}
                        </span>
                      )}
                    </div>

                    {/* SLA and Submission Time info */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 6, fontSize: "0.775rem" }}>
                      <span style={{ color: "#64748b" }}>
                        Submitted: {user.registrationSubmittedAt ? new Date(user.registrationSubmittedAt).toLocaleString() : "N/A"}
                      </span>

                      {user.registrationStatus === "PENDING_APPROVAL" && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontWeight: 700,
                            background:
                              user.slaStatus === "OVERDUE"
                                ? "#fee2e2"
                                : user.slaStatus === "APPROACHING_DEADLINE"
                                ? "#fef3c7"
                                : "#ecfdf5",
                            color:
                              user.slaStatus === "OVERDUE"
                                ? "#991b1b"
                                : user.slaStatus === "APPROACHING_DEADLINE"
                                ? "#92400e"
                                : "#065f46",
                          }}
                        >
                          {user.slaStatus === "OVERDUE"
                            ? `⛔ OVERDUE (${user.hoursElapsed}h elapsed)`
                            : user.slaStatus === "APPROACHING_DEADLINE"
                            ? `⚠ DUE SOON (${user.hoursRemaining}h remaining)`
                            : `✓ On Track (${user.hoursRemaining}h remaining)`}
                        </span>
                      )}

                      {/* Persistent Email Delivery Status */}
                      {user.latestEmailDelivery && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color:
                              user.latestEmailDelivery.status === "SENT"
                                ? "#16a34a"
                                : user.latestEmailDelivery.status === "FAILED"
                                ? "#dc2626"
                                : "#b45309",
                          }}
                        >
                          Email: <strong>{user.latestEmailDelivery.status}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions with double-click protection */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedApplicant(user)}
                    className="button-black"
                    style={{ padding: "6px 12px", fontSize: "0.825rem" }}
                  >
                    <i className="bi bi-eye"></i> Details
                  </button>

                  {user.registrationStatus === "PENDING_APPROVAL" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(user.id, user.name)}
                        disabled={isProcessing}
                        className="button-primary"
                        style={{ padding: "6px 14px", fontSize: "0.825rem" }}
                      >
                        {isProcessing ? (
                          "Processing..."
                        ) : (
                          <>
                            <i className="bi bi-check-lg"></i> Approve
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => openRejectModal(user.id, user.name)}
                        disabled={isProcessing}
                        className="button-black button-danger"
                        style={{ padding: "6px 12px", fontSize: "0.825rem" }}
                      >
                        <i className="bi bi-x-lg"></i> Reject
                      </button>
                    </>
                  )}

                  {user.registrationStatus === "APPROVED" && (
                    <button
                      type="button"
                      onClick={() => handleResendVoterId(user.id, user.name)}
                      disabled={isProcessing}
                      className="button-black"
                      style={{ padding: "6px 12px", fontSize: "0.825rem" }}
                      title="Resend Voter ID to registered email"
                    >
                      {isProcessing ? "Sending..." : "Resend Voter ID"}
                    </button>
                  )}

                  {user.registrationStatus === "REJECTED" && (
                    <button
                      type="button"
                      onClick={() => handleReopen(user.id, user.name)}
                      disabled={isProcessing}
                      className="button-primary"
                      style={{ padding: "6px 12px", fontSize: "0.825rem" }}
                      title="Reopen application for reconsideration"
                    >
                      {isProcessing ? "Reopening..." : "Reopen Application"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Inspection Modal */}
      {selectedApplicant && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              maxWidth: 540,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: 12,
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Applicant Details: {selectedApplicant.name}
              </h3>
              <button
                onClick={() => setSelectedApplicant(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.875rem" }}>
              <div>
                <strong style={{ color: "#475569" }}>Registration ID:</strong> #{selectedApplicant.id}
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Full Name:</strong> {selectedApplicant.name}
              </div>
              <div>
                <strong style={{ color: "#475569" }}>National / Citizenship ID:</strong> {selectedApplicant.citizenshipNumber}
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Email Address:</strong> {selectedApplicant.email}
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Registration Status:</strong>{" "}
                <span style={{ fontWeight: 700 }}>{selectedApplicant.registrationStatus}</span>
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Voter ID:</strong>{" "}
                {selectedApplicant.voterId ? (
                  <span style={{ fontFamily: "monospace", color: "#16a34a", fontWeight: 700 }}>
                    {selectedApplicant.voterId}
                  </span>
                ) : (
                  <span style={{ color: "#94a3b8" }}>Not generated (Pending approval)</span>
                )}
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Submission Timestamp:</strong>{" "}
                {selectedApplicant.registrationSubmittedAt
                  ? new Date(selectedApplicant.registrationSubmittedAt).toLocaleString()
                  : "N/A"}
              </div>
              <div>
                <strong style={{ color: "#475569" }}>24-Hour Review Deadline:</strong>{" "}
                {new Date(selectedApplicant.deadline).toLocaleString()}
              </div>

              {selectedApplicant.registrationReviewedAt && (
                <div>
                  <strong style={{ color: "#475569" }}>Reviewed Timestamp:</strong>{" "}
                  {new Date(selectedApplicant.registrationReviewedAt).toLocaleString()}
                </div>
              )}

              {selectedApplicant.rejectionReason && (
                <div style={{ background: "#fef2f2", padding: 10, borderRadius: 6, color: "#991b1b" }}>
                  <strong>Rejection Reason:</strong> {selectedApplicant.rejectionReason}
                </div>
              )}

              {selectedApplicant.latestEmailDelivery && (
                <div style={{ background: "#f8fafc", padding: 10, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <strong>Latest Email Delivery:</strong> {selectedApplicant.latestEmailDelivery.emailType} (
                  {selectedApplicant.latestEmailDelivery.status}) - Attempts: {selectedApplicant.latestEmailDelivery.attempts}
                  {selectedApplicant.latestEmailDelivery.errorMessage && (
                    <div style={{ color: "#dc2626", marginTop: 4 }}>
                      Error: {selectedApplicant.latestEmailDelivery.errorMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setSelectedApplicant(null)}
                className="button-black"
                style={{ padding: "6px 16px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              maxWidth: 480,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.15rem", fontWeight: 700, color: "#991b1b" }}>
              Reject Registration for {rejectModal.name}
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#64748b" }}>
              Please provide an optional reason. The applicant will receive a notification email and will NOT receive a Voter ID. The registration record is preserved for audit purposes.
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Citizenship ID document does not match national records..."
              value={rejectionReasonInput}
              onChange={(e) => setRejectionReasonInput(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.875rem",
                marginBottom: 16,
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="button-black"
                disabled={actionInProgress !== null}
                style={{ padding: "6px 14px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={actionInProgress !== null}
                className="button-black button-danger"
                style={{ padding: "6px 16px", fontSize: "0.85rem" }}
              >
                {actionInProgress !== null ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
