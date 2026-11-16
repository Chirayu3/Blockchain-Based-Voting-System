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
    voterId: string;
    email: string;
    name: string;
    emailSent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [resendStatus, setResendStatus] = useState<string>("");

  const handleCopy = () => {
    if (successData?.voterId) {
      navigator.clipboard.writeText(successData.voterId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleResendEmail = async () => {
    if (!successData?.voterId) return;
    setResendStatus("Sending confirmation email...");
    try {
      await axios.post("/auth/resend-registration-email", {
        voterId: successData.voterId,
      });
      setResendStatus("Confirmation email dispatched successfully!");
    } catch (err: any) {
      const msg = err?.response?.data || "Failed to resend confirmation email.";
      setResendStatus(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  // If registration succeeded, show the dedicated Voter ID display card
  if (successData) {
    return (
      <LoginLayout error={""} success={"Voter Account Created Successfully!"}>
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
              ✓ Registration Completed
            </span>
          </div>

          <div className="form-title">Your Voter ID</div>
          <div className="form-subtitle">
            Welcome, <strong>{successData.name}</strong>. Your permanent cryptographic voter identifier has been assigned.
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "2px dashed #3b82f6",
              borderRadius: "8px",
              padding: "20px",
              textAlign: "center",
              margin: "20px 0",
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                color: "#64748b",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "6px",
              }}
            >
              Permanent Voter ID
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "#1e293b",
                fontFamily: "monospace",
              }}
            >
              {successData.voterId}
            </div>

            <button
              onClick={handleCopy}
              type="button"
              style={{
                marginTop: "12px",
                background: copied ? "#16a34a" : "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              <i className={copied ? "bi bi-check2" : "bi bi-clipboard"}></i>{" "}
              {copied ? "Copied to Clipboard!" : "Copy Voter ID"}
            </button>
          </div>

          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fef3c7",
              borderRadius: "6px",
              padding: "12px 16px",
              fontSize: "0.85rem",
              color: "#92400e",
              lineHeight: 1.5,
              marginBottom: "16px",
            }}
          >
            <i className="bi bi-shield-exclamation" style={{ marginRight: 6 }}></i>
            <strong>Important:</strong> You must save this Voter ID. You will use this Voter ID and your password to authenticate and receive email OTPs.
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
              A confirmation email has been sent to <strong>{successData.email}</strong>.
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
              Automated email delivery could not be completed, but your account is active. Please record your Voter ID above.
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
                Resend confirmation email
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
            <i className="bi bi-box-arrow-in-right"></i> Proceed to Sign In
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
            Register your identity to receive your unique Voter ID and vote cryptographically.
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
                    voterId: res.data.voterId,
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
                    "Generating Voter ID..."
                  ) : (
                    <>
                      <i className="bi bi-person-plus"></i> Register & Generate Voter ID
                    </>
                  )}
                </button>
              </form>
            )}
          </Formik>

          <hr />
          <div className="form-info-text">Already registered with a Voter ID?</div>

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
