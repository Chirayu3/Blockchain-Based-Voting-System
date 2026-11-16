import React from "react";
import { useParams } from "react-router";
import axios from "../../axios";

const Verify = () => {
  const { id, name } = useParams();

  const verifyUser = () => {
    axios
      .post("/users/verify", { userId: id })
      .then((res) => console.log({ res }))
      .catch((error) => console.log({ error }));
  };

  const deleteUser = () => {
    axios
      .delete(`/users/delete/${id}`)
      .then((res) => console.log({ res }))
      .catch((error) => console.log({ error }));
  };

  return (
    <div className="verify-user-card">
      <div className="verify-header">
        <div className="verify-icon">
          <i className="bi bi-shield-check"></i>
        </div>
        <div className="title-small">Voter Account Verification</div>
        <div className="text-normal">
          Review and approve verification for <strong>{name}</strong> (ID: #{id})
        </div>
      </div>

      <div className="verify-actions">
        <button onClick={verifyUser} className="button-primary">
          <i className="bi bi-check-lg"></i> verify {name}
        </button>

        <button onClick={deleteUser} className="button-black button-danger">
          <i className="bi bi-trash"></i> delete {name}
        </button>
      </div>
    </div>
  );
};

export default Verify;
