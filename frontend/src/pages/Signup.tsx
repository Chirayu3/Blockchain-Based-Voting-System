import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Formik } from "formik";
import LoginLayout from "../layouts/Login";
import * as Yup from "yup";
import axios from "../axios";

const schema = Yup.object().shape({
  name: Yup.string().min(3).required(),
  email: Yup.string().email("Invalid email").required("Required"),
  citizenshipNumber: Yup.string().min(4).required(),
  password: Yup.string().min(3).required("Required"),
  confirm: Yup.string()
    .oneOf([Yup.ref("password")], "must be same as password")
    .required(),
});

const Signup = (): JSX.Element => {
  const navigate = useNavigate();

  const [error, setError] = useState<any>("");
  const [success, setSuccess] = useState<string>("");

  return (
    <div>
      <LoginLayout error={error} success={success}>
        <div className="form-container">
          <div className="form-title">Create Voter Account</div>
          <div className="form-subtitle">Register your identity to participate in cryptographic voting</div>

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
              axios
                .post("/auth/signup", {
                  name,
                  email,
                  citizenshipNumber,
                  password,
                })
                .then((res) => {
                  setError("");
                  setSuccess("Signup Successful!");
                })
                .catch((err) => {
                  let error: string = err.message;
                  if (err?.response?.data)
                    error = JSON.stringify(err.response.data);
                  setError(error.slice(0, 50));
                });
            }}
          >
            {({ errors, touched, getFieldProps, handleSubmit }) => (
              <form onSubmit={handleSubmit}>
                <div className="input-container">
                  <label htmlFor="name" className="input-label">Full Name</label>
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
                  <label htmlFor="citizenshipNumber" className="input-label">Citizenship / National ID Number</label>
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
                  <label htmlFor="email" className="input-label">Email Address</label>
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
                  <label htmlFor="password" className="input-label">Password</label>
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
                  <label htmlFor="confirm" className="input-label">Confirm Password</label>
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

                <button className="button-primary" type="submit">
                  Create a New Account
                </button>
              </form>
            )}
          </Formik>

          <hr />
          <div className="form-info-text">Already have an account?</div>

          <button
            onClick={() => navigate("/login")}
            className="button-secondary"
            type="button"
          >
            Login
          </button>
        </div>
      </LoginLayout>
    </div>
  );
};

export default Signup;
