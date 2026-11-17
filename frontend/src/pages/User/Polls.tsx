import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "../../axios";
import Chart from "../../components/Polls/Chart";
import Finished from "../../components/Polls/Finished";
import Panel from "../../components/Polls/Panel";
import Running from "../../components/Polls/Running";
import Waiting from "../../components/Waiting";
import { AuthContext } from "../../contexts/Auth";

const User = () => {
  const [voteState, setVoteStatus] = useState<
    "finished" | "running" | "not-started" | "checking"
  >("checking");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ id?: number; name: string; description: string; votes: any }>({
    id: 1,
    name: "",
    description: "",
    votes: {},
  });
  const [votable, setVotable] = useState("");

  const authContext = useContext(AuthContext);

  useEffect(() => {
    axios
      .get("/polls/status")
      .then((res) => {
        setVoteStatus(res.data.status);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching poll status:", error);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (voteState !== "checking") {
      axios
        .get("/polls/")
        .then((res) => {
          setData(res.data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching poll details:", err);
          setLoading(false);
        });

      if (authContext.id) {
        axios
          .post("/polls/check-voteability", {
            id: authContext.id.toString(),
          })
          .then((res) => {
            setVotable(res.data);
          })
          .catch((err) => console.error("Error checking voteability:", err));
      }
    }
  }, [voteState, authContext.id]);

  if (loading || voteState === "checking")
    return (
      <div className="app-loading-screen">
        <div className="app-spinner"></div>
        <div className="app-loading-text">Verifying Ballot Eligibility...</div>
      </div>
    );

  if (voteState === "not-started") return <Waiting />;

  return (
    <Panel name={data.name} description={data.description}>
      <>
        {voteState === "running" ? <Running /> : <Finished />}

        {votable === "voted" && (
          <div
            style={{
              width: "100%",
              maxWidth: "600px",
              margin: "12px auto 20px auto",
              padding: "12px 18px",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              color: "#065f46",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <i className="bi bi-shield-fill-check" style={{ fontSize: "1.25rem", color: "#10b981" }}></i>
              <span>Your ballot for this election is securely registered on chain.</span>
            </div>
            <Link
              to="/voter/history"
              style={{
                color: "#047857",
                fontWeight: 700,
                textDecoration: "underline",
                whiteSpace: "nowrap",
                fontSize: "0.825rem",
              }}
            >
              View Receipt &rarr;
            </Link>
          </div>
        )}

        <Chart
          enableVote={votable === "not-voted" && voteState === "running"}
          userId={authContext.id}
          userName={authContext.name}
          votes={data.votes}
          electionId={data.id}
        />
      </>
    </Panel>
  );
};

export default User;
