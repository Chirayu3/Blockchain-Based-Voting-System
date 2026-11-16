import { Request, Response } from "express";
import ElectionContract from "../../web3";
import { User } from "../../entity/User";
import { Poll } from "../../entity/Poll";

export default async (req: Request, res: Response) => {
  try {
    const instance = await ElectionContract.deployed();
    const name = await instance.getElectionName();
    const description = await instance.getElectionDescription();
    const status: string = await instance.getStatus();

    const candidates: string[] = await instance.getCandidates();
    const rawVotes = await instance.getVotes();

    const votesMap: Record<string, number> = {};
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

    const totalVotes = rawVotes.length;

    // Fetch verified voters (eligible voters) from MySQL
    const eligibleVoters = await User.count({
      where: { admin: false, verified: true },
    });

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

    // Also look up poll id from MySQL if available
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
      name,
      description,
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
