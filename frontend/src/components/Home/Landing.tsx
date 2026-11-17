import React from "react";
import { Link } from "react-router-dom";

const Landing = () => {
  return (
    <section className="landing">
      <div className="left">
        <div className="badge-pill">
          <span className="pulse-dot"></span>
          <span>Next-Gen Decentralized Governance</span>
        </div>

        <div className="logo">
          <img src="logo.png" alt="Blockchain Voting System Logo" />
        </div>

        <h1 className="title-large">Blockchain-Based</h1>
        <h1 className="title-large highlight">Voting System</h1>
        <p className="title-small">
          Secure, immutable, and transparent electronic elections powered by Ethereum smart contracts and biometric identity verification.
        </p>

        <div className="button-wrapper">
          <Link to="/login">
            <button type="button" className="button-primary">
              <i className="bi bi-box-arrow-in-right"></i> Voter Portal
            </button>
          </Link>

          <Link to="/admin/login">
            <button type="button" className="button-black">
              <i className="bi bi-shield-lock"></i> Admin Portal
            </button>
          </Link>

          <Link to="/view">
            <button type="button" className="button-outline">
              <i className="bi bi-bar-chart-line"></i> View Live Votes
            </button>
          </Link>
        </div>
      </div>

      <div className="right">
        <img src="vote.gif" alt="Blockchain voting protocol visualization" />
      </div>
    </section>
  );
};

export default Landing;
