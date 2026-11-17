import React from "react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-badge">
          Decentralized E-Voting Protocol • Secured by Ethereum Smart Contracts & Biometrics
        </div>

        <div className="footer-links">
          <Link to="/">Home</Link>
          <span className="dot">•</span>
          <Link to="/view">Public Results</Link>
          <span className="dot">•</span>
          <Link to="/login">Voter Portal</Link>
          <span className="dot">•</span>
          <Link to="/admin/login">Admin Console</Link>
        </div>

        <div className="footer-copyright">
          &copy; {new Date().getFullYear()} BBVS (Blockchain-Based Voting System). Cryptographic integrity guaranteed on-chain.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
