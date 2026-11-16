import React, { useContext } from "react";
import { RouteProps } from "react-router";
import { AuthContext } from "../../contexts/Auth";

const Profile = (props: RouteProps) => {
  const authContext = useContext(AuthContext);

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
        <span className="title-small">Voter Credentials</span>

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
              Authentication Status
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span
                style={{
                  background: "#f0fdf4",
                  color: "#16a34a",
                  padding: "3px 10px",
                  borderRadius: 9999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                <i className="bi bi-shield-check"></i> Email OTP Verified
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
        </div>
      </div>
    </div>
  );
};

export default Profile;
