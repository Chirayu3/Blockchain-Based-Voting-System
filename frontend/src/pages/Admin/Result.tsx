import React, { useEffect, useState } from "react";
import axios from "../../axios";
import Panel from "../../components/Polls/Panel";
import ResultAnalytics, { AnalyticsData } from "../../components/Polls/ResultAnalytics";

const Result = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    id?: number;
    name: string;
    description: string;
    status: string;
    analytics?: AnalyticsData;
  }>({ name: "", description: "", status: "finished" });

  const fetchResults = () => {
    axios
      .get("/polls/")
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching results:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchResults();
  }, []);

  const resetElection = () => {
    if (!window.confirm("Are you sure you want to reset this election?")) return;
    axios
      .post("/polls/reset")
      .then(() => window.location.reload())
      .catch((err) => console.log({ err }));
  };

  if (loading)
    return (
      <div className="app-loading-screen">
        <div className="app-spinner"></div>
        <div className="app-loading-text">Loading Election Results & Analytics...</div>
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
            onRefresh={fetchResults}
          />
        ) : null}

        <div style={{ marginTop: 20 }}>
          <button
            onClick={resetElection}
            className="end-election-button button-primary"
          >
            <i className="bi bi-arrow-repeat"></i> Reset Election
          </button>
        </div>
      </>
    </Panel>
  );
};

export default Result;
