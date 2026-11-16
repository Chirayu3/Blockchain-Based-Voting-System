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

const Login = (): JSX.Element => {
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
                background: "#f0fdf4",
                color: "#16a34a",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "0.775rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              🗳️ Voter Portal
            </span>
          </div>

          <div className="form-title">Voter Identification Sign In</div>
          <div className="form-subtitle">
            Enter your credentials to cast cryptographic ballots in active elections.
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
                .post("/auth/login", { ...values, portal: "voter" })
                .then((res) => {
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
                  <label htmlFor="email" className="input-label">
                    Registered Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    {...getFieldProps("email")}
                  />
                  <div className="form-error-text">
                    {touched.email && errors.email ? errors.email : null}
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="password" className="input-label">
                    Password
                  </label>
                  <input
                    id="password"
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
                  <i className="bi bi-box-arrow-in-right"></i> Sign In to Vote
                </button>
              </form>
            )}
          </Formik>

          <hr />

          <button
            onClick={() => navigate("/signup")}
            className="button-secondary"
            type="button"
          >
            Register as a New Voter
          </button>

          <div className="portal-switch-banner">
            <span>Are you an election administrator?</span>
            <Link to="/admin/login">Access Admin Portal &rarr;</Link>
          </div>
        </div>
      </LoginLayout>
    </div>
  );
};

export default Login;
