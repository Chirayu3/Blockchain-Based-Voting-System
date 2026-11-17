import React from "react";
import { useNavigate } from "react-router";
import BackButton from "../components/Back";

interface LayoutProps {
  error: string;
  success?: string;
  children: JSX.Element;
}

const Login = (props: LayoutProps) => {
  const navigate = useNavigate();

  return (
    <div className="login-layout-wrapper">
      <div className="left">
        <div className="login-back-container">
          <BackButton call={() => navigate("/")} />
        </div>

        <div className="left-content">
          <div className="security-badge">
            <span className="pulse-dot"></span>
            <span>Secured by Ethereum Smart Contracts</span>
          </div>

          <h1 className="title-large title-gradient">Blockchain-Based</h1>
          <h1 className="title-large title-gradient">Voting System</h1>
          <p className="title-small">
            Next-generation cryptographic elections ensuring immutability, biometric liveness verification, and transparent ballot auditing.
          </p>

          <div className="feature-bullets">
            <div className="bullet-item">
              <i className="bi bi-shield-check"></i>
              <span>Zero-Tampering Guarantee via Distributed Ledger</span>
            </div>
            <div className="bullet-item">
              <i className="bi bi-person-bounding-box"></i>
              <span>Live Biometric Facial Identity Verification</span>
            </div>
            <div className="bullet-item">
              <i className="bi bi-receipt"></i>
              <span>Cryptographic Proof-of-Vote Receipts</span>
            </div>
          </div>
        </div>
      </div>

      <div className="right">
        {props.error && props.error.trim() !== "" ? (
          <div className="error-message">
            <span>
              <i className="bi bi-exclamation-triangle-fill"></i>
            </span>
            <span>{props.error}</span>
          </div>
        ) : null}

        {props.success && props.success.trim() !== "" ? (
          <div className="success-message">
            <span>
              <i className="bi bi-check-circle-fill"></i>
            </span>
            <span>{props.success}</span>
          </div>
        ) : null}

        <div className="login-form-wrapper">{props.children}</div>
      </div>
    </div>
  );
};

export default Login;
