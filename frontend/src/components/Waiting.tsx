import React from "react";

const Waiting = () => {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="waiting-wrapper">
      <div className="cog">
        <i className="bi bi-gear-fill"></i>
      </div>

      <div className="waiting-badge">
        <i className="bi bi-hourglass-split"></i> Ballot Standby
      </div>

      <div className="title-small">Waiting for Election to Start</div>

      <p className="waiting-desc">
        The election smart contract has not been deployed or opened by the election officials yet. Please stand by or click refresh to check for live updates.
      </p>

      <div className="waiting-actions">
        <button
          type="button"
          onClick={handleRefresh}
          className="button-primary"
          style={{ padding: "8px 18px", fontSize: "0.85rem" }}
        >
          <i className="bi bi-arrow-clockwise"></i> Check Live Status
        </button>
      </div>
    </div>
  );
};

export default Waiting;
