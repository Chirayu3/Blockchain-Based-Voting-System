import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Formik } from "formik";
import LoginLayout from "../layouts/Login";
import * as Yup from "yup";
import axios from "../axios";

const schema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(3, "Name must be at least 3 characters")
    .required("Full name is required"),
  citizenshipNumber: Yup.string()
    .trim()
    .min(4, "National ID must be at least 4 characters")
    .required("Citizenship / National ID is required"),
  email: Yup.string()
    .trim()
    .email("Invalid email address format")
    .required("Email address is required"),
  password: Yup.string()
    .min(6, "Password must be at least 6 characters")
    .required("Password is required"),
  confirm: Yup.string()
    .oneOf([Yup.ref("password")], "Passwords do not match")
    .required("Please confirm your password"),
});

const Signup = (): JSX.Element => {
  const navigate = useNavigate();

  const [error, setError] = useState<string>("");
  const [successData, setSuccessData] = useState<{
    email: string;
    name: string;
    emailSent: boolean;
  } | null>(null);
  const [resendStatus, setResendStatus] = useState<string>("");

  const handleResendEmail = async () => {
    if (!successData?.email) return;
    setResendStatus("Dispatching acknowledgement email...");
    try {
      await axios.post("/auth/resend-registration-email", {
        email: successData.email,
      });
      setResendStatus("Acknowledgement email re-sent successfully!");
    } catch (err: any) {
      const msg = err?.response?.data || "Failed to resend email.";
      setResendStatus(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  // If registration succeeded, show the dedicated Registration Confirmation screen (No Voter ID displayed)
  if (successData) {
    return (
      <LoginLayout error={""} success={"Registration Request Received"}>
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
              ✓ Request Submitted
            </span>
            <span
              style={{
                background: "#fef3c7",
                color: "#b45309",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "0.775rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Pending Verification
            </span>
          </div>

          <div className="form-title">Registration Request Received</div>
          <div className="form-subtitle">
            Thank you, <strong>{successData.name}</strong>. Your voter registration application has been submitted to the election administration team.
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "20px",
              margin: "20px 0",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <i className="bi bi-clock-history" style={{ fontSize: "1.5rem", color: "#2563eb", marginTop: 2 }}></i>
              <div>
                <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem", marginBottom: 4 }}>
                  24-Hour Review Target
                </div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#475569", lineHeight: 1.5 }}>
                  Your details are currently under administrator review. You should receive an update within <strong>24 hours</strong>.
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "6px",
              padding: "14px 16px",
              fontSize: "0.85rem",
              color: "#166534",
              lineHeight: 1.5,
              marginBottom: "20px",
            }}
          >
            <i className="bi bi-shield-check" style={{ marginRight: 6 }}></i>
            <strong>Voter ID Notice:</strong> Once your registration is approved by an administrator, your unique, permanent Voter ID will be generated and dispatched to:
            <div style={{ fontWeight: 700, marginTop: 4, fontFamily: "monospace" }}>
              {successData.email}
            </div>
          </div>

          {successData.emailSent ? (
            <div
              style={{
                fontSize: "0.825rem",
                color: "#475569",
                marginBottom: "20px",
                lineHeight: 1.4,
              }}
            >
              <i className="bi bi-envelope-check" style={{ color: "#16a34a", marginRight: 6 }}></i>
              An acknowledgement email has been sent to <strong>{successData.email}</strong>.
            </div>
          ) : (
            <div
              style={{
                fontSize: "0.825rem",
                color: "#b45309",
                marginBottom: "20px",
                lineHeight: 1.4,
              }}
            >
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }}></i>
              Your registration was saved successfully, but the automated acknowledgement email could not be sent.
              <button
                onClick={handleResendEmail}
                type="button"
                style={{
                  display: "block",
                  marginTop: "6px",
                  background: "transparent",
                  border: "none",
                  color: "#2563eb",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "0.825rem",
                  padding: 0,
                }}
              >
                Resend acknowledgement email
              </button>
              {resendStatus && (
                <div style={{ marginTop: "4px", color: "#1e293b", fontWeight: 500 }}>
                  {resendStatus}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => navigate("/login")}
            className="button-primary"
            type="button"
          >
            <i className="bi bi-arrow-left"></i> Return to Voter Sign In
          </button>
        </div>
      </LoginLayout>
    );
  }

  return (
    <div>
      <LoginLayout error={error} success={""}>
        <div className="form-container">
          <div className="form-title">Create Voter Account</div>
          <div className="form-subtitle">
            Submit your identity for administrator verification. Once approved, your Voter ID will be emailed to you.
          </div>

          <Formik
            initialValues={{
              name: "",
              email: "",
              citizenshipNumber: "",
              password: "",
              confirm: "",
            }}
            validationSchema={schema}
            onSubmit={({ name, email, citizenshipNumber, password }) => {
              setError("");
              axios
                .post("/auth/signup", {
                  name,
                  email,
                  citizenshipNumber,
                  password,
                })
                .then((res) => {
                  setSuccessData({
                    email: res.data.email,
                    name: res.data.name,
                    emailSent: res.data.emailDelivery?.sent ?? true,
                  });
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
            {({ errors, touched, getFieldProps, handleSubmit, isSubmitting }) => (
              <form onSubmit={handleSubmit}>
                <div className="input-container">
                  <label htmlFor="name" className="input-label">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="e.g. John Doe"
                    {...getFieldProps("name")}
                  />
                  <div className="form-error-text">
                    {touched.name && errors.name ? errors.name : null}
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="citizenshipNumber" className="input-label">
                    Citizenship / National ID Number
                  </label>
                  <input
                    id="citizenshipNumber"
                    type="text"
                    placeholder="e.g. CIT-987654"
                    {...getFieldProps("citizenshipNumber")}
                  />
                  <div className="form-error-text">
                    {touched.citizenshipNumber && errors.citizenshipNumber
                      ? errors.citizenshipNumber
                      : null}
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="email" className="input-label">
                    Email Address
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
                    Security Password
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

                <div className="input-container">
                  <label htmlFor="confirm" className="input-label">
                    Confirm Password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    {...getFieldProps("confirm")}
                  />
                  <div className="form-error-text">
                    {touched.confirm && errors.confirm ? errors.confirm : null}
                  </div>
                </div>

                <button
                  className="button-primary"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    "Submitting Application..."
                  ) : (
                    <>
                      <i className="bi bi-send-check"></i> Submit Voter Registration
                    </>
                  )}
                </button>
              </form>
            )}
          </Formik>

          <hr />
          <div className="form-info-text">Already approved and received your Voter ID?</div>

          <button
            onClick={() => navigate("/login")}
            className="button-secondary"
            type="button"
          >
            Sign In with Voter ID
          </button>
        </div>
      </LoginLayout>
    </div>
  );
};

export default Signup;
