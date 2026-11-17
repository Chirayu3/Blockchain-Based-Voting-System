import React, { useRef, useState } from "react";
import { Formik } from "formik";
import axios from "../../axios";
import * as yup from "yup";

const schema = yup.object({
  name: yup
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .required("Election title is required"),
  description: yup
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .required("Description is required"),
});

interface Candidate {
  name: string;
  info: string;
}

const Start = () => {
  const [candidates, setCandidates] = useState<Array<Candidate>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [candidateNameInput, setCandidateNameInput] = useState<string>("");
  const [candidateInfoInput, setCandidateInfoInput] = useState<string>("");
  const [candidateFormError, setCandidateFormError] = useState<string>("");

  const candidateField = useRef<HTMLInputElement>(null);
  const candidateInfoField = useRef<HTMLInputElement>(null);

  const handleAddCandidate = () => {
    const trimmedName = candidateNameInput.trim();
    const trimmedInfo = candidateInfoInput.trim();

    if (!trimmedName || trimmedName.length < 3) {
      setCandidateFormError("Candidate name must be at least 3 characters.");
      return;
    }

    if (!trimmedInfo || trimmedInfo.length < 10) {
      setCandidateFormError("Candidate bio / manifesto must be at least 10 characters.");
      return;
    }

    if (candidates.some((c) => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setCandidateFormError("A candidate with this name has already been added.");
      return;
    }

    setCandidateFormError("");
    setCandidates([...candidates, { name: trimmedName, info: trimmedInfo }]);
    setCandidateNameInput("");
    setCandidateInfoInput("");

    if (candidateField.current) candidateField.current.value = "";
    if (candidateInfoField.current) candidateInfoField.current.value = "";
  };

  const handleRemoveCandidate = (index: number) => {
    const updated = [...candidates];
    updated.splice(index, 1);
    setCandidates(updated);
  };

  return (
    <div className="form-container start-election-container">
      <div className="start-election-header">
        <h3>Deploy New Election Ballot</h3>
        <p>
          Configure the title, parameters, and candidates. Once launched, this ballot is registered onto the blockchain.
        </p>
      </div>

      {error ? (
        <div className="error-message">
          <span>
            <i className="bi bi-exclamation-triangle-fill"></i>
          </span>
          <span>{error}</span>
        </div>
      ) : null}

      <Formik
        initialValues={{
          name: "",
          description: "",
        }}
        validationSchema={schema}
        onSubmit={({ name, description }) => {
          setError("");

          if (candidates.length < 2) {
            setError("At least two nominated candidates are required to start an election.");
            return;
          }

          setLoading(true);

          axios
            .post("/polls/start", { name: name.trim(), description: description.trim(), candidates })
            .then(() => {
              window.location.reload();
            })
            .catch((err) => {
              let msg = err.message;
              if (err?.response?.data) {
                msg =
                  typeof err.response.data === "string"
                    ? err.response.data
                    : JSON.stringify(err.response.data);
              }
              setError(msg);
              setLoading(false);
            });
        }}
      >
        {({ errors, touched, getFieldProps, handleSubmit }) => (
          <form onSubmit={handleSubmit}>
            <div className="input-container">
              <label htmlFor="election-name" className="input-label">
                Official Election Title
              </label>
              <input
                id="election-name"
                type="text"
                placeholder="e.g. 2026 Presidential General Election"
                {...getFieldProps("name")}
              />
              <div className="form-error-text">
                {touched.name && errors.name ? errors.name : null}
              </div>
            </div>

            <div className="input-container">
              <label htmlFor="election-description" className="input-label">
                Election Description & Guidelines
              </label>
              <input
                id="election-description"
                type="text"
                placeholder="Describe election purpose, participating offices, and term..."
                {...getFieldProps("description")}
              />
              <div className="form-error-text">
                {touched.description && errors.description
                  ? errors.description
                  : null}
              </div>
            </div>

            {/* Nominated Candidates Review */}
            <div className="candidates-container">
              <div className="candidates-header-label">
                <i className="bi bi-people-fill"></i> Nominated Candidates ({candidates.length})
                {candidates.length < 2 && (
                  <span style={{ color: "#b45309", fontSize: "0.75rem", fontWeight: 500, textTransform: "none", marginLeft: 4 }}>
                    (Minimum 2 required)
                  </span>
                )}
              </div>

              {candidates.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: "#94a3b8", padding: "8px 0" }}>
                  No candidates added yet. Use the section below to add candidates.
                </div>
              ) : (
                <div className="candidates-list">
                  {candidates.map((cand, index) => (
                    <div key={cand.name} className="candidate-wrapper">
                      <div className="candidate-details">
                        <span className="cand-name">{cand.name}</span>
                        <span className="cand-bio" title={cand.info}>
                          {cand.info}
                        </span>
                      </div>
                      <span
                        onClick={() => handleRemoveCandidate(index)}
                        className="remove"
                        title="Remove candidate"
                        role="button"
                        aria-label={`Remove candidate ${cand.name}`}
                      >
                        <i className="bi bi-x-circle-fill"></i>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Candidate Form Section */}
            <div className="add-candidate-section">
              <div className="section-label">
                <i className="bi bi-person-plus-fill" style={{ color: "#2563eb" }}></i>
                <span>Add Nominee Candidate</span>
              </div>

              <div className="add-candidate-inputs">
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Candidate Full Name (e.g. Alice Walker)"
                    ref={candidateField}
                    value={candidateNameInput}
                    onChange={(e) => setCandidateNameInput(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Candidate Manifesto / Bio (min 10 chars)"
                    ref={candidateInfoField}
                    value={candidateInfoInput}
                    onChange={(e) => setCandidateInfoInput(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleAddCandidate}
                    className="button-primary"
                  >
                    <i className="bi bi-plus-lg"></i> Add
                  </button>
                </div>

                {candidateFormError && (
                  <div className="form-error-text" style={{ marginTop: 2 }}>
                    {candidateFormError}
                  </div>
                )}
              </div>
            </div>

            <button
              className="login-button button-primary"
              type="submit"
              disabled={loading || candidates.length < 2}
            >
              {loading ? (
                "Deploying Smart Contract Ballot..."
              ) : (
                <>
                  <i className="bi bi-shield-check"></i> Launch & Deploy Election
                </>
              )}
            </button>
          </form>
        )}
      </Formik>
    </div>
  );
};

export default Start;
