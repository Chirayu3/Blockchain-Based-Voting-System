import React, { useEffect, useState } from "react";
import axios from "../../axios";
import Panel from "../../components/Polls/Panel";
import ResultAnalytics, { AnalyticsData } from "../../components/Polls/ResultAnalytics";

const Polls = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    id?: number;
    name: string;
    description: string;
    status: string;
    analytics?: AnalyticsData;
  }>({ name: "", description: "", status: "running" });

  const fetchPolls = () => {
    axios
      .get("/polls/")
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching running poll:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPolls();
    const interval = setInterval(fetchPolls, 10000);
    return () => clearInterval(interval);
  }, []);

  const endElection = () => {
    if (!window.confirm("Are you sure you want to end this election? Voting will stop.")) return;
    axios
      .post("/polls/end")
      .then(() => window.location.reload())
      .catch((err) => console.log({ err }));
  };

  if (loading)
    return (
      <div className="app-loading-screen">
        <div className="app-spinner"></div>
        <div className="app-loading-text">Loading Live Election Status...</div>
      </div>
    );

  return (
    <Panel name={data.name} description={data.description}>
      <>
        {data.analytics ? (
          <ResultAnalytics
            electionId={data.id}
            electionName={data.name}
            electionDescription={data.description}
            analytics={data.analytics}
            isAdmin={true}
            onRefresh={fetchPolls}
          />
        ) : null}

        <div style={{ marginTop: 20 }}>
          <button
            onClick={endElection}
            className="end-election-button button-primary"
            style={{ background: "#dc2626" }}
          >
            <i className="bi bi-stop-circle"></i> End Election
          </button>
        </div>
      </>
    </Panel>
  );
};

export default Polls;
