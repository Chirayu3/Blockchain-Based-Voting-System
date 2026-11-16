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
        <div className="text-normal username">{authContext.name}</div>
        {authContext.voterId && (
          <div
            style={{
              fontSize: "0.85rem",
              fontFamily: "monospace",
              color: "#64748b",
              marginTop: 4,
            }}
          >
            {authContext.voterId}
          </div>
        )}
        <button onClick={authContext.logout} className="button-primary" style={{ marginTop: 16 }}>
          Logout
        </button>
      </div>

      <div className="right-panel">
        <span className="title-small">Voter Credentials & Security</span>

        {actionMessage && (
          <div
            style={{
              margin: "16px 0",
              padding: "10px 14px",
              borderRadius: 6,
              fontSize: "0.85rem",
              background: actionMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${actionMessage.type === "success" ? "#bbf7d0" : "#fee2e2"}`,
              color: actionMessage.type === "success" ? "#166534" : "#991b1b",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <i
              className={actionMessage.type === "success" ? "bi bi-check-circle" : "bi bi-exclamation-circle"}
            ></i>
            <span>{actionMessage.text}</span>
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
              Full Name
            </div>
            <div style={{ fontSize: "1rem", color: "#1e293b", fontWeight: 600, marginTop: 4 }}>
              {authContext.name || "N/A"}
            </div>
          </div>

          <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
              Official Voter ID
            </div>
            <div style={{ fontSize: "1.1rem", color: "#1e293b", fontWeight: 700, fontFamily: "monospace", marginTop: 4 }}>
              {authContext.voterId || "BBVS-OFFICIAL"}
            </div>
          </div>

          <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
              Registered Email
            </div>
            <div style={{ fontSize: "0.95rem", color: "#1e293b", marginTop: 4 }}>
              {authContext.email || "Registered via system"}
            </div>
          </div>

          <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
              Account Verification Status
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <span
                style={{
                  background: authContext.emailVerified ? "#f0fdf4" : "#fef2f2",
                  color: authContext.emailVerified ? "#16a34a" : "#dc2626",
                  padding: "3px 10px",
                  borderRadius: 9999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                <i className={authContext.emailVerified ? "bi bi-shield-check" : "bi bi-shield-x"}></i>{" "}
                {authContext.emailVerified ? "Email OTP Verified" : "Email Unverified"}
              </span>

              <span
                style={{
                  background: authContext.verified ? "#f0fdf4" : "#fffbeb",
                  color: authContext.verified ? "#16a34a" : "#b45309",
                  padding: "3px 10px",
                  borderRadius: 9999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                <i className={authContext.verified ? "bi bi-person-check" : "bi bi-hourglass-split"}></i>{" "}
                {authContext.verified ? "Administrator Approved" : "Pending Admin Approval"}
              </span>

              <span
                style={{
                  background: authContext.isAdmin ? "#eff6ff" : "#f1f5f9",
                  color: authContext.isAdmin ? "#2563eb" : "#475569",
                  padding: "3px 10px",
                  borderRadius: 9999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                {authContext.isAdmin ? "Administrator" : "Electorate Voter"}
              </span>
            </div>
          </div>

          {/* Biometric Security Panel */}
          <div
            style={{
              padding: "16px",
              background: "#ffffff",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="bi bi-camera-fill" style={{ fontSize: "1.2rem", color: "#2563eb" }}></i>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1e293b" }}>
                  Biometric Face Security
                </div>
              </div>
              <span
                style={{
                  background: bioStatus.hasEnrolled ? "#f0fdf4" : "#f8fafc",
                  color: bioStatus.hasEnrolled ? "#16a34a" : "#64748b",
                  border: `1px solid ${bioStatus.hasEnrolled ? "#bbf7d0" : "#e2e8f0"}`,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  fontSize: "0.775rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {bioStatus.loading
                  ? "Checking..."
                  : bioStatus.hasEnrolled
                  ? "✓ Enrolled (Active)"
                  : "Not Enrolled"}
              </span>
            </div>

            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 8, lineHeight: 1.4 }}>
              Biometric face recognition and presentation attack detection (PAD) are required to cast
              cryptographic ballots. Templates are encrypted with authenticated AES-256-GCM.
            </div>

            {bioStatus.hasEnrolled && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px",
                  background: "#f8fafc",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  color: "#334155",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div>
                  <strong>Enrolled On:</strong> {formatDate(bioStatus.enrolledAt)}
                </div>
                <div>
                  <strong>Last Verified:</strong> {formatDate(bioStatus.lastVerifiedAt)}
                </div>
                {bioStatus.modelIdentifier && (
                  <div style={{ gridColumn: "span 2", fontSize: "0.75rem", color: "#64748b" }}>
                    Engine: {bioStatus.modelIdentifier} (128-d L2-normalized)
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {!authContext.verified ? (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fef3c7",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: "0.8rem",
                    color: "#92400e",
                  }}
                >
                  <i className="bi bi-info-circle" style={{ marginRight: 6 }}></i>
                  Administrator approval is required before you can enroll your facial biometrics.
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="button-primary"
                    style={{ fontSize: "0.85rem", padding: "8px 16px" }}
                  >
                    <i className="bi bi-person-bounding-box" style={{ marginRight: 6 }}></i>
                    {bioStatus.hasEnrolled ? "Re-enroll Face Biometrics" : "Enroll Face Biometrics"}
                  </button>

                  {bioStatus.hasEnrolled && (
                    <>
                      {deleteConfirm ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>
                            Confirm delete?
                          </span>
                          <button
                            type="button"
                            onClick={handleDeleteBiometrics}
                            style={{
                              background: "#dc2626",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              padding: "4px 8px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            Yes, Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(false)}
                            style={{
                              background: "transparent",
                              border: "1px solid #cbd5e1",
                              borderRadius: 4,
                              padding: "4px 8px",
                              fontSize: "0.75rem",
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
                          }}
                        >
                          <i className="bi bi-trash" style={{ marginRight: 4 }}></i> Delete Biometrics
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

      {/* Face Capture / Enrollment Modal */}
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
