import React from "react";
import { Link } from "react-router-dom";

const Landing = () => {
  return (
    <div className="landing">
      <div className="left">
        <div className="logo">
          <img src="logo.png" alt="System Logo" />
        </div>

        <div className="title-large">Blockchain Based</div>
        <div className="title-large">Voting System</div>
        <div className="title-small">the future of voting</div>

        <div className="button-wrapper">
          <Link to="/login">
            <button className="button-primary">
              <i className="bi bi-box-arrow-in-right"></i> Voter Portal
            </button>
          </Link>

          <Link to="/admin/login">
            <button className="button-black">
              <i className="bi bi-shield-lock"></i> Admin Portal
            </button>
          </Link>

          <Link to="/view">
            <button>View Votes</button>
          </Link>
        </div>
      </div>

      <div className="right">
        <img src="vote.gif" alt="Voting illustration" />
      </div>
    </div>
  );
};

export default Landing;
