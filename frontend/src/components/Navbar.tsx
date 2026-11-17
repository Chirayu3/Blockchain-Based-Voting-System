import React, { useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../contexts/Auth";

const Navbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const authContext = useContext(AuthContext);

  // If already authenticated, the layout is handled by Default.tsx
  if (authContext.authenticated) {
    return null;
  }

  return (
    <header className="public-navbar">
      <div className="navbar-container">
        {/* Brand */}
        <div className="brand" onClick={() => navigate("/")}>
          <div className="brand-icon">
            <i className="bi bi-shield-shaded"></i>
          </div>
          <div className="brand-info">
            <span className="brand-name">BBVS</span>
            <span className="brand-tagline">Blockchain Voting</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="nav-links">
          <button
            type="button"
            className={`nav-link ${pathname === "/" ? "active" : ""}`}
            onClick={() => {
              if (pathname === "/") {
                window.scrollTo({ top: 0, behavior: "smooth" });
              } else {
                navigate("/");
              }
            }}
          >
            Home
          </button>

          <button
            type="button"
            className="nav-link"
            onClick={() => {
              if (pathname === "/") {
                const el = document.getElementById("features");
                el?.scrollIntoView({ behavior: "smooth" });
              } else {
                navigate("/#features");
              }
            }}
          >
            Features
          </button>

          <button
            type="button"
            className={`nav-link ${pathname === "/view" ? "active" : ""}`}
            onClick={() => navigate("/view")}
          >
            <i className="bi bi-bar-chart-line" style={{ marginRight: 4 }}></i>
            Live Results
          </button>
        </nav>

        {/* Portal Action Buttons */}
        <div className="nav-actions">
          <button
            type="button"
            className="action-button-admin"
            onClick={() => navigate("/admin/login")}
          >
            <i className="bi bi-shield-lock"></i>
            <span>Admin</span>
          </button>

          <button
            type="button"
            className="action-button-voter button-primary"
            onClick={() => navigate("/login")}
          >
            <i className="bi bi-box-arrow-in-right"></i>
            <span>Voter Portal</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
