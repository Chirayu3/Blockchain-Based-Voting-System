import React, { useState, useContext, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../contexts/Auth";

type MenuLink = {
  name: string;
  link: string;
};

type DefaultProps = {
  menu: MenuLink[];
  children: JSX.Element;
};

const getMenuIcon = (name: string) => {
  switch (name.toLowerCase()) {
    case "dashboard":
    case "polls":
      return "bi-grid-1x2-fill";
    case "manage elections":
      return "bi-gear-wide-connected";
    case "verify users":
      return "bi-person-check-fill";
    case "transactions":
    case "my ballots":
      return "bi-receipt-cutoff";
    case "profile":
      return "bi-person-badge-fill";
    default:
      return "bi-circle-fill";
  }
};

const Default = (props: DefaultProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const authContext = useContext(AuthContext);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="default-container">
      {/* Universal Top Navigation Header */}
      <header className="app-top-header">
        <div className="header-inner">
          {/* Brand */}
          <div className="header-brand" onClick={() => navigate("/")}>
            <div className="brand-logo-badge">
              <i className="bi bi-shield-shaded"></i>
            </div>
            <div className="brand-text">
              <span className="brand-name">BBVS</span>
              <span className="brand-subtitle">
                {authContext.isAdmin ? "Admin Console" : "Voter Portal"}
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="header-desktop-nav">
            {props.menu.map(({ name, link }) => {
              const isActive = pathname === link;
              return (
                <button
                  key={link}
                  type="button"
                  onClick={() => navigate(link)}
                  className={`nav-tab-button ${isActive ? "active" : ""}`}
                >
                  <i className={`bi ${getMenuIcon(name)}`}></i>
                  <span>{name}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Header Status & Profile Controls */}
          <div className="header-right-controls">
            {/* Live Network Status Chip */}
            <div className="network-status-chip" title="Connected to Ethereum Blockchain Testnet Node">
              <span className="network-dot"></span>
              <span className="network-label">Ethereum Live</span>
            </div>

            {/* User Profile Chip */}
            <div
              className="user-profile-chip"
              onClick={() => navigate("/profile")}
              title="View account credentials & security"
            >
              <div className="user-avatar-circle">
                <i className="bi bi-person-fill"></i>
              </div>
              <div className="user-meta-text">
                <span className="user-display-name">{authContext.name || "User"}</span>
                <span className="user-role-label">
                  {authContext.isAdmin ? "Administrator" : authContext.voterId || "Verified"}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={authContext.logout}
              className="header-logout-button"
              title="End session and log out"
            >
              <i className="bi bi-box-arrow-right"></i>
              <span>Logout</span>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="mobile-menu-trigger"
              aria-label="Toggle navigation menu"
            >
              <i className={`bi ${mobileMenuOpen ? "bi-x-lg" : "bi-list"}`}></i>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation Backdrop */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer Sidebar */}
      <aside className={`mobile-sidebar-drawer ${mobileMenuOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <div className="brand-text">
            <span className="brand-name">BBVS Protocol</span>
            <span className="brand-subtitle">
              {authContext.isAdmin ? "Administrator Access" : "Voter Access"}
            </span>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Drawer User Card */}
        <div className="drawer-user-card" onClick={() => navigate("/profile")}>
          <div className="user-avatar-circle">
            <i className="bi bi-person-fill"></i>
          </div>
          <div>
            <div className="user-display-name">{authContext.name || "User"}</div>
            <div className="user-role-label">
              {authContext.isAdmin ? "Administrator" : authContext.voterId || "Registered Voter"}
            </div>
          </div>
        </div>

        {/* Drawer Navigation Links */}
        <nav className="drawer-nav-links">
          {props.menu.map(({ name, link }) => {
            const isActive = pathname === link;
            return (
              <button
                key={link}
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(link);
                }}
                className={`drawer-link-button ${isActive ? "active" : ""}`}
              >
                <i className={`bi ${getMenuIcon(name)}`}></i>
                <span>{name}</span>
              </button>
            );
          })}
        </nav>

        {/* Drawer Footer Logout */}
        <div className="drawer-footer">
          <button
            type="button"
            onClick={authContext.logout}
            className="drawer-logout-button"
          >
            <i className="bi bi-box-arrow-right"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Page Content Body */}
      <main className="default-content">{props.children}</main>
    </div>
  );
};

export default Default;
