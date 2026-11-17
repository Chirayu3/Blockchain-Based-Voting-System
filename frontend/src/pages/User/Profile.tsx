import React, { useContext, useEffect, useState, useCallback } from "react";
import { RouteProps } from "react-router";
import { AuthContext } from "../../contexts/Auth";
import axios from "../../axios";
import { BiometricCaptureModal } from "../../components/Biometrics/BiometricCaptureModal";

interface BiometricStatusState {
  hasEnrolled: boolean;
  status: string;
  enrolledAt: string | null;
  lastVerifiedAt: string | null;
  modelIdentifier?: string;
  loading: boolean;
}

const Profile = (props: RouteProps) => {
  const authContext = useContext(AuthContext);

  const [bioStatus, setBioStatus] = useState<BiometricStatusState>({
    hasEnrolled: false,
    status: "none",
    enrolledAt: null,
    lastVerifiedAt: null,
    loading: true,
  });

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);

  const fetchBiometricStatus = useCallback(async () => {
    try {
      setBioStatus((prev) => ({ ...prev, loading: true }));
      const res = await axios.get("/auth/biometrics/status");
      setBioStatus({
        hasEnrolled: res.data.hasEnrolled || false,
        status: res.data.status || "none",
        enrolledAt: res.data.enrolledAt,
        lastVerifiedAt: res.data.lastVerifiedAt,
        modelIdentifier: res.data.modelIdentifier,
        loading: false,
      });
    } catch (err) {
      setBioStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchBiometricStatus();
  }, [fetchBiometricStatus]);

  const handleDeleteBiometrics = async () => {
    try {
      await axios.delete("/auth/biometrics");
      setActionMessage({
        type: "success",
        text: "Biometric profile deleted successfully in compliance with right to erasure.",
      });
      setDeleteConfirm(false);
      fetchBiometricStatus();
    } catch (err: any) {
      const msg = err?.response?.data || "Failed to delete biometric profile.";
      setActionMessage({
        type: "error",
        text: typeof msg === "string" ? msg : JSON.stringify(msg),
      });
    }
  };

  const handleEnrollSuccess = () => {
    setActionMessage({
      type: "success",
      text: "Facial biometrics enrolled and encrypted with AES-256-GCM successfully!",
    });
    fetchBiometricStatus();
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <div className="profile-wrapper">
      <div className="left-panel">
        <div className="person-icon">
          <i className="bi bi-person-circle"></i>
        </div>
        <div className="username">{authContext.name || "User"}</div>
        <div
          className={`role-badge ${authContext.isAdmin ? "admin" : "voter"}`}
        >
          <i className={`bi ${authContext.isAdmin ? "bi-shield-lock-fill" : "bi-patch-check-fill"}`}></i>
          <span>{authContext.isAdmin ? "System Administrator" : "Verified Blockchain Voter"}</span>
        </div>

        {authContext.voterId && (
          <div
            style={{
              fontSize: "0.85rem",
              fontFamily: "monospace",
              color: "#475569",
              background: "#f1f5f9",
              padding: "4px 10px",
              borderRadius: "6px",
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            {authContext.voterId}
          </div>
        )}

        <button
          type="button"
          onClick={authContext.logout}
          className="logout-button"
        >
          <i className="bi bi-box-arrow-right"></i> Sign Out
        </button>
      </div>

      <div className="right-panel">
        <div className="title-small">
          <i className="bi bi-person-vcard-fill"></i>
          <span>Voter Credentials & Security Status</span>
        </div>

        {actionMessage && (
          <div
            style={{
              margin: "0 0 16px 0",
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: "0.875rem",
              background: actionMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${actionMessage.type === "success" ? "#bbf7d0" : "#fee2e2"}`,
              color: actionMessage.type === "success" ? "#166534" : "#991b1b",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <i
              className={actionMessage.type === "success" ? "bi bi-check-circle-fill" : "bi bi-exclamation-octagon-fill"}
              style={{ fontSize: "1.1rem" }}
            ></i>
            <span>{actionMessage.text}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="credential-card">
            <div className="card-label">Official Registered Name</div>
            <div className="card-value">{authContext.name || "N/A"}</div>
          </div>

          <div className="credential-card">
            <div className="card-label">Assigned Permanent Voter ID</div>
            <div className="card-value mono">{authContext.voterId || "BBVS-OFFICIAL"}</div>
          </div>

          <div className="credential-card">
            <div className="card-label">Registered Contact Email</div>
            <div className="card-value">{authContext.email || "Registered via election ledger"}</div>
          </div>

          <div className="credential-card">
            <div className="card-label">Verification & Authorization Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  background: authContext.emailVerified ? "#f0fdf4" : "#fef2f2",
                  color: authContext.emailVerified ? "#16a34a" : "#dc2626",
                  border: `1px solid ${authContext.emailVerified ? "#bbf7d0" : "#fecaca"}`,
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <i className={authContext.emailVerified ? "bi bi-shield-check" : "bi bi-shield-x"}></i>
                {authContext.emailVerified ? "Email OTP Verified" : "Email Unverified"}
              </span>

              <span
                style={{
                  background: authContext.verified ? "#f0fdf4" : "#fffbeb",
                  color: authContext.verified ? "#16a34a" : "#b45309",
                  border: `1px solid ${authContext.verified ? "#bbf7d0" : "#fde68a"}`,
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <i className={authContext.verified ? "bi bi-person-check" : "bi bi-hourglass-split"}></i>
                {authContext.verified ? "Administrator Approved" : "Pending Admin Review"}
              </span>

              <span
                style={{
                  background: authContext.isAdmin ? "#eff6ff" : "#f1f5f9",
                  color: authContext.isAdmin ? "#2563eb" : "#475569",
                  border: `1px solid ${authContext.isAdmin ? "#bfdbfe" : "#e2e8f0"}`,
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <i className={`bi ${authContext.isAdmin ? "bi-shield-lock" : "bi-person"}`}></i>
                {authContext.isAdmin ? "Administrator" : "Electorate Citizen"}
              </span>
            </div>
          </div>

          {/* Biometric Face Security Panel */}
          <div
            style={{
              padding: "18px 20px",
              background: "#ffffff",
              borderRadius: 12,
              border: "1.5px solid #cbd5e1",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <i className="bi bi-person-bounding-box" style={{ fontSize: "1.35rem", color: "#2563eb" }}></i>
                <div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
                    Biometric Facial Authentication
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Encrypted with AES-256-GCM authenticated cipher
                  </div>
                </div>
              </div>

              <span
                style={{
                  background: bioStatus.hasEnrolled ? "#f0fdf4" : "#f8fafc",
                  color: bioStatus.hasEnrolled ? "#16a34a" : "#64748b",
                  border: `1px solid ${bioStatus.hasEnrolled ? "#bbf7d0" : "#e2e8f0"}`,
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: "0.775rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {bioStatus.loading
                  ? "Checking..."
                  : bioStatus.hasEnrolled
                  ? "✓ Enrolled & Active"
                  : "Not Enrolled"}
              </span>
            </div>

            {bioStatus.hasEnrolled && (
              <div
                style={{
                  marginTop: 14,
                  padding: "12px 14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: "0.825rem",
                  color: "#334155",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ color: "#475569" }}>Enrolled On:</strong>{" "}
                  <span>{formatDate(bioStatus.enrolledAt)}</span>
                </div>
                <div>
                  <strong style={{ color: "#475569" }}>Last Verified:</strong>{" "}
                  <span>{formatDate(bioStatus.lastVerifiedAt)}</span>
                </div>
                {bioStatus.modelIdentifier && (
                  <div style={{ gridColumn: "span 2", fontSize: "0.775rem", color: "#64748b" }}>
                    Biometric Model: {bioStatus.modelIdentifier} (128-d L2-normalized embedding)
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {!authContext.emailVerified ? (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fee2e2",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: "0.825rem",
                    color: "#991b1b",
                  }}
                >
                  <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }}></i>
                  Please verify your email address via OTP before enrolling facial biometrics.
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="button-primary"
                    style={{ fontSize: "0.85rem", padding: "8px 16px" }}
                  >
                    <i className="bi bi-camera"></i>
                    <span>{bioStatus.hasEnrolled ? "Re-enroll Face Biometrics" : "Set Up Face Biometrics"}</span>
                  </button>

                  {bioStatus.hasEnrolled && (
                    <>
                      {deleteConfirm ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>
                            Permanently delete template?
                          </span>
                          <button
                            type="button"
                            onClick={handleDeleteBiometrics}
                            style={{
                              background: "#dc2626",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: "0.8rem",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(false)}
                            style={{
                              background: "transparent",
                              border: "1px solid #cbd5e1",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: "0.8rem",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(true)}
                          style={{
                            background: "transparent",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            borderRadius: 6,
                            padding: "8px 14px",
                            fontSize: "0.825rem",
                            cursor: "pointer",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <i className="bi bi-trash"></i>
                          <span>Delete Face Profile</span>
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Biometric Enrollment Modal */}
      <BiometricCaptureModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mode="enrollment"
        onSuccess={handleEnrollSuccess}
      />
    </div>
  );
};

export default Profile;
