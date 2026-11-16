import React, { useContext } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import AdminLogin from "../pages/AdminLogin";
import Signup from "../pages/Signup";
import View from "../pages/View";
import { AuthContext } from "../contexts/Auth";
import UserPollsPage from "../pages/User/Polls";
import VoterHistoryPage from "../pages/User/History";
import HomePage from "../pages/Admin/Home";
import AdminElectionsPage from "../pages/Admin/Elections";
import AdminTransactionsPage from "../pages/Admin/Transactions";
import ProfilePage from "../pages/User/Profile";
import Default from "../layouts/Default";
import AdminUsersPage from "../pages/Admin/Users";
import AdminVerifyPage from "../pages/Admin/Verify";

const CustomRoutes = (): JSX.Element => {
  const authContext = useContext(AuthContext);

  if (authContext.loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-spinner"></div>
        <div className="app-loading-text">Connecting to Blockchain Network...</div>
      </div>
    );
  }

  if (authContext.authenticated) {
    if (authContext.isAdmin) {
      const adminMenu = [
        { name: "Dashboard", link: "/" },
        { name: "Manage Elections", link: "/admin/elections" },
        { name: "Verify Users", link: "/users" },
        { name: "Transactions", link: "/admin/transactions" },
        { name: "Profile", link: "/profile" },
      ];

      return (
        <Default menu={adminMenu}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin/elections" element={<AdminElectionsPage />} />
            <Route path="/users" element={<AdminUsersPage />} />
            <Route path="/verify/:name/:id" element={<AdminVerifyPage />} />
            <Route path="/admin/transactions" element={<AdminTransactionsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </Default>
      );
    } else {
      const userMenu = [
        { name: "Polls", link: "/" },
        { name: "My Ballots", link: "/voter/history" },
        { name: "Profile", link: "/profile" },
      ];

      return (
        <Default menu={userMenu}>
          <Routes>
            <Route path="/" element={<UserPollsPage />} />
            <Route path="/voter/history" element={<VoterHistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </Default>
      );
    }
  } else {
    return (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/voter/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/view" element={<View />} />
      </Routes>
    );
  }
};

export default CustomRoutes;
