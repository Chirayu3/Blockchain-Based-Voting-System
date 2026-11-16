import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User } from "../../entity/User";
import { Poll } from "../../entity/Poll";
import { Transaction } from "../../entity/Transaction";
import ElectionContract from "../../web3";

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Registered Voters (non-admins)
    const totalVoters = await User.count({ where: { admin: false } });
    const verifiedVoters = await User.count({
      where: { admin: false, verified: true },
    });
    const pendingApprovals = await User.count({
      where: { admin: false, verified: false },
    });

    // 2. Election stats
    const totalElections = await Poll.count();
    const activeElections = await Poll.count({ where: { status: "running" } });
    const completedElections = await Poll.count({
      where: { status: "finished" },
    });

    // 3. Total votes cast (from Transactions table and blockchain)
    const totalSuccessfulTx = await Transaction.count({
      where: { status: "success" },
    });

    // Current smart contract votes
    let blockchainVotesCount = 0;
    let currentElectionStatus = "not-started";
    let currentElectionName = "";
    let currentCandidates: string[] = [];
    let currentVotesPerCandidate: Record<string, number> = {};

    try {
      const instance = await ElectionContract.deployed();
      currentElectionStatus = await instance.getStatus();
      if (currentElectionStatus !== "not-started") {
        currentElectionName = await instance.getElectionName();
        currentCandidates = await instance.getCandidates();
        const rawVotes = await instance.getVotes();
        blockchainVotesCount = rawVotes.length;

        for (const c of currentCandidates) {
          currentVotesPerCandidate[c] = 0;
        }
        for (const v of rawVotes) {
          const cand = v[3];
          if (currentVotesPerCandidate[cand] !== undefined) {
            currentVotesPerCandidate[cand]++;
          }
        }
      }
    } catch (bcErr) {
      console.warn("Could not query live smart contract for stats:", bcErr);
    }

    // Total votes cast is at least total successful transactions recorded or blockchain votes
    const totalVotesCast = Math.max(totalSuccessfulTx, blockchainVotesCount);

    // 4. Recent voting activity (latest 10 transactions with voter & election relations)
    const recentTransactions = await Transaction.find({
      relations: ["voter", "election"],
      order: { id: "DESC" },
      take: 10,
    });

    const recentActivity = recentTransactions.map((tx) => ({
      id: tx.id,
      transactionHash: tx.transactionHash,
      voterId: tx.voterId,
      voterName: tx.voter ? tx.voter.name : `Voter #${tx.voterId}`,
      electionId: tx.electionId,
      electionName: tx.election ? tx.election.name : "Active Election",
      candidateName: tx.candidateName,
      blockNumber: tx.blockNumber,
      gasUsed: tx.gasUsed,
      status: tx.status,
      timestamp: tx.timestamp,
    }));

    return res.send({
      voterStats: {
        totalRegistered: totalVoters,
        verified: verifiedVoters,
        pendingApprovals,
      },
      electionStats: {
        total: totalElections,
        active: activeElections,
        completed: completedElections,
        currentStatus: currentElectionStatus,
        currentElectionName,
      },
      votingStats: {
        totalVotesCast,
        liveElectionVotes: blockchainVotesCount,
        candidates: currentCandidates,
        candidateVotes: currentVotesPerCandidate,
      },
      recentActivity,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard statistics:", error);
    return res.status(500).send("Failed to retrieve dashboard statistics");
  }
};
