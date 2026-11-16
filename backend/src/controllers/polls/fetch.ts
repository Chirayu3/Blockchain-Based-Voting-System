import { Request, Response } from "express";
import ElectionContract from "../../web3";
import { User } from "../../entity/User";
import { Poll } from "../../entity/Poll";
import { Transaction } from "../../entity/Transaction";

export default async (req: Request, res: Response) => {
  try {
    const requestedId = req.query.id ? Number(req.query.id) : null;
    let targetPoll: Poll | undefined;

    if (requestedId && !isNaN(requestedId)) {
      targetPoll = await Poll.findOne({
        where: { id: requestedId },
        relations: ["candidates"],
      });
    }

    const eligibleVoters = await User.count({
      where: { admin: false, verified: true },
    });

    // If a completed historical poll was explicitly requested and found in MySQL
    if (targetPoll && targetPoll.status === "finished") {
      const pollTxs = await Transaction.find({
        where: { electionId: targetPoll.id, status: "success" },
      });

      const totalVotes = pollTxs.length;
      const votesMap: Record<string, number> = {};

      if (targetPoll.candidates) {
        for (const c of targetPoll.candidates) {
          votesMap[c.name] = 0;
        }
      }

      for (const tx of pollTxs) {
        if (votesMap[tx.candidateName] !== undefined) {
          votesMap[tx.candidateName]++;
        } else {
          votesMap[tx.candidateName] = 1;
        }
      }

      const turnoutPercentage =
        eligibleVoters > 0
          ? Number(((totalVotes / eligibleVoters) * 100).toFixed(2))
          : 0;

      const candidateStats = Object.keys(votesMap).map((cName) => {
        const count = votesMap[cName] || 0;
        const percentage =
          totalVotes > 0
            ? Number(((count / totalVotes) * 100).toFixed(2))
            : 0;
        return {
          name: cName,
          count,
          percentage,
        };
      });

      return res.send({
        id: targetPoll.id,
        name: targetPoll.name,
        description: targetPoll.description || "",
        status: targetPoll.status,
        votes: votesMap,
        analytics: {
          totalVotes,
          eligibleVoters,
          turnoutPercentage,
          remainingEligibleVoters: Math.max(0, eligibleVoters - totalVotes),
          candidateStats,
          status: targetPoll.status,
        },
      });
    }

    // Otherwise, check live smart contract
    let name = "";
    let description = "";
    let status = "not-started";
    let candidates: string[] = [];
    const votesMap: Record<string, number> = {};
    let totalVotes = 0;

    try {
      const instance = await ElectionContract.deployed();
      name = await instance.getElectionName();
      description = await instance.getElectionDescription();
      status = await instance.getStatus();

      candidates = await instance.getCandidates();
      const rawVotes = await instance.getVotes();
      totalVotes = rawVotes.length;

      for (let i = 0; i < candidates.length; i++) {
        votesMap[candidates[i]] = 0;
      }

      for (let i = 0; i < rawVotes.length; i++) {
        const vote = rawVotes[i];
        const cand = vote[3];
        if (typeof votesMap[cand] !== "undefined") {
          votesMap[cand] = votesMap[cand] + 1;
        }
      }
    } catch (e) {
      console.warn("Could not query live smart contract in fetch:", e);
    }

    const turnoutPercentage =
      eligibleVoters > 0
        ? Number(((totalVotes / eligibleVoters) * 100).toFixed(2))
        : 0;

    const remainingEligibleVoters = Math.max(0, eligibleVoters - totalVotes);

    const candidateStats = candidates.map((candName) => {
      const count = votesMap[candName] || 0;
      const percentage =
        totalVotes > 0
          ? Number(((count / totalVotes) * 100).toFixed(2))
          : 0;
      return {
        name: candName,
        count,
        percentage,
      };
    });

    const activePoll = await Poll.findOne({
      where: { status: "running" },
      order: { id: "DESC" },
    });
    const latestPoll =
      activePoll ||
      (await Poll.findOne({
        order: { id: "DESC" },
      }));

    return res.send({
      id: latestPoll ? latestPoll.id : 1,
      name: name || latestPoll?.name || "Election",
      description: description || latestPoll?.description || "",
      status,
      votes: votesMap,
      analytics: {
        totalVotes,
        eligibleVoters,
        turnoutPercentage,
        remainingEligibleVoters,
        candidateStats,
        status,
      },
    });
  } catch (error) {
    console.error("Error in fetch poll results:", error);
    return res.status(500).send("Failed to fetch election results and analytics");
  }
};
