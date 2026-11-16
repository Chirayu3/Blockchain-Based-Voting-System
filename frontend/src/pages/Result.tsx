import React, { useEffect, useState } from "react";
import axios from "../axios";
import Panel from "../components/Polls/Panel";
import ResultAnalytics, { AnalyticsData } from "../components/Polls/ResultAnalytics";

const Result = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    id?: number;
    name: string;
    description: string;
    status: string;
    analytics?: AnalyticsData;
  }>({ name: "", description: "", status: "running" });

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
    const interval = setInterval(fetchResults, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading)
    return (
      <div className="app-loading-screen">
        <div className="app-spinner"></div>
        <div className="app-loading-text">Loading Election Results & Analytics...</div>
      </div>
    );

  return (
    <Panel name={data.name} description={data.description}>
      <div>
        {data.analytics ? (
          <ResultAnalytics
            electionId={data.id}
            electionName={data.name}
            electionDescription={data.description}
            analytics={data.analytics}
            isAdmin={false}
            onRefresh={fetchResults}
          />
        ) : (
          <div>No analytics data available.</div>
        )}
      </div>
    </Panel>
  );
};

export default Result;
