import React, { useContext } from "react";
import { useNavigate } from "react-router";
import { AuthContext } from "../contexts/Auth";

type NavbarContainerProps = {
  children: JSX.Element;
};

const NavbarContainer = (props: NavbarContainerProps) => {
  const navigate = useNavigate();

  return (
    <nav className="top-navbar">
      <div className="navbar-brand">
        <span className="brand-dot"></span>
        <span className="brand-title">BBVS</span>
      </div>
      <div className="navbar-center">{props.children}</div>
      <div className="navbar-profile" onClick={() => navigate("/profile")}>
        <i className="bi bi-person-circle"></i>
        <span>Profile</span>
      </div>
    </nav>
  );
};

const Navbar = () => {
  const authContext = useContext(AuthContext);

  const getNavbar = (): JSX.Element => {
    if (!authContext.authenticated) {
      return <div></div>;
    }

    if (authContext.isAdmin) {
      return (
        <NavbarContainer>
          <div>admin</div>
        </NavbarContainer>
      );
    }

    return (
      <NavbarContainer>
        <div>user</div>
      </NavbarContainer>
    );
  };

  return getNavbar();
};

export default Navbar;
