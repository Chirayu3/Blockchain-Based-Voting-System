import React, { useState, useContext } from "react";
import { useNavigate } from "react-router";
import { Formik } from "formik";
import { Link } from "react-router-dom";
import LoginLayout from "../layouts/Login";
import * as Yup from "yup";
import axios from "../axios";
import { AuthContext } from "../contexts/Auth";

const schema = Yup.object().shape({
  email: Yup.string().email("Invalid email format").required("Email is required"),
  password: Yup.string().min(3).required("Password is required"),
});

const AdminLogin = (): JSX.Element => {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const [error, setError] = useState<string>("");

  return (
    <div>
      <LoginLayout error={error}>
        <div className="form-container">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span
              style={{
                background: "#eff6ff",
                color: "#2563eb",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "0.775rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              🔒 Administrator Portal
            </span>
          </div>

          <div className="form-title">Admin Cryptographic Sign In</div>
          <div className="form-subtitle">
            Restricted access for election officers and system administrators.
          </div>

          <Formik
            initialValues={{
              email: "",
              password: "",
            }}
            validationSchema={schema}
            onSubmit={(values) => {
              setError("");
              axios
                .post("/auth/login", { ...values, portal: "admin" })
                .then((res) => {
                  if (!res.data.user?.admin) {
                    setError("Access denied: Account is not an administrator");
                    return;
                  }
                  authContext.authenticate(res.data.user, res.data.accessToken);
                  navigate("/");
                })
                .catch((err) => {
                  let errMessage = err.message;
                  if (err?.response?.data) {
                    errMessage =
                      typeof err.response.data === "string"
                        ? err.response.data
                        : JSON.stringify(err.response.data);
                  }
                  setError(errMessage);
                });
            }}
          >
            {({ errors, touched, getFieldProps, handleSubmit }) => (
              <form onSubmit={handleSubmit}>
                <div className="input-container">
                  <label htmlFor="admin-email" className="input-label">
                    Administrator Email
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    placeholder="john@gmail.com"
                    {...getFieldProps("email")}
                  />
                  <div className="form-error-text">
                    {touched.email && errors.email ? errors.email : null}
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="admin-password" className="input-label">
                    Security Password
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    placeholder="••••••••"
                    {...getFieldProps("password")}
                  />
                  <div className="form-error-text">
                    {touched.password && errors.password
                      ? errors.password
                      : null}
                  </div>
                </div>

                <button className="login-button button-primary" type="submit">
                  <i className="bi bi-shield-lock"></i> Authorize & Sign In
                </button>
              </form>
            )}
          </Formik>

          <div className="portal-switch-banner">
            <span>Are you a registered citizen voter?</span>
            <Link to="/login">Go to Voter Login Portal &rarr;</Link>
          </div>
        </div>
      </LoginLayout>
    </div>
  );
};

export default AdminLogin;
