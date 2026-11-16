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

    // 2. Current smart contract telemetry & votes (Blockchain is the source of truth)
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

    // Synchronize MySQL status with blockchain reality
    if (currentElectionStatus !== "running") {
      await Poll.update({ status: "running" }, { status: "finished" });
    }

    // 3. Election statistics
    const totalElections = await Poll.count();
    const activeElections =
      currentElectionStatus === "running"
        ? Math.max(1, await Poll.count({ where: { status: "running" } }))
        : 0;
    const completedElections = totalElections - activeElections;

    // 4. Total votes cast (from Transactions table and blockchain)
    const totalSuccessfulTx = await Transaction.count({
      where: { status: "success" },
    });

    // Total votes cast across all elections
    const totalVotesAcrossAllElections = Math.max(
      totalSuccessfulTx,
      blockchainVotesCount
    );

    // 5. Retrieve all elections ordered by ID descending
    const allPolls = await Poll.find({
      relations: ["candidates"],
      order: { id: "DESC" },
    });

    // Build rich historical data for every single election
    const electionsData = await Promise.all(
      allPolls.map(async (poll) => {
        const pollTxs = await Transaction.find({
          where: { electionId: poll.id, status: "success" },
          order: { id: "DESC" },
        });

        let pollVotesCount = pollTxs.length;
        const candidateCounts: Record<string, number> = {};

        if (poll.candidates && poll.candidates.length > 0) {
          for (const c of poll.candidates) {
            candidateCounts[c.name] = 0;
          }
        }

        for (const tx of pollTxs) {
          if (candidateCounts[tx.candidateName] !== undefined) {
            candidateCounts[tx.candidateName]++;
          } else {
            candidateCounts[tx.candidateName] = 1;
          }
        }

        if (
          poll.status === "running" &&
          currentElectionStatus === "running" &&
          currentElectionName === poll.name
        ) {
          try {
            const instance = await ElectionContract.deployed();
            const liveVotes = await instance.getVotes();
            if (liveVotes.length > pollVotesCount) {
              pollVotesCount = liveVotes.length;
              for (const v of liveVotes) {
                const cand = v[3];
                if (candidateCounts[cand] !== undefined) {
                  candidateCounts[cand]++;
                } else {
                  candidateCounts[cand] = 1;
                }
              }
            }
          } catch (e) {
            console.warn("Could not fetch live contract votes for poll:", poll.id);
          }
        }

        const turnoutPercentage =
          verifiedVoters > 0
            ? Number(((pollVotesCount / verifiedVoters) * 100).toFixed(2))
            : 0;

        const candidateStats = Object.keys(candidateCounts).map((cName) => {
          const count = candidateCounts[cName] || 0;
          const percentage =
            pollVotesCount > 0
              ? Number(((count / pollVotesCount) * 100).toFixed(2))
              : 0;
          const candEntity = poll.candidates?.find((c) => c.name === cName);
          return {
            name: cName,
            info: candEntity?.info || "",
            count,
            percentage,
          };
        });

        const sortedCandidates = [...candidateStats].sort(
          (a, b) => b.count - a.count
        );
        const winner =
          sortedCandidates.length > 0 && sortedCandidates[0].count > 0
            ? sortedCandidates[0]
            : null;

        return {
          id: poll.id,
          name: poll.name,
          description: poll.description || "",
          status: poll.status,
          createdAt: poll.createdAt,
          updatedAt: poll.updatedAt,
          totalVotes: pollVotesCount,
          turnoutPercentage,
          eligibleVoters: verifiedVoters,
          remainingEligibleVoters: Math.max(0, verifiedVoters - pollVotesCount),
          candidateStats,
          winner,
        };
      })
    );

    // 6. Recent voting activity
    const recentTransactions = await Transaction.find({
      relations: ["election"],
      order: { id: "DESC" },
      take: 10,
    });

    const recentActivity = recentTransactions.map((tx) => ({
      id: tx.id,
      transactionHash: tx.transactionHash,
      shortHash:
        tx.transactionHash.length > 14
          ? `${tx.transactionHash.slice(0, 8)}...${tx.transactionHash.slice(-6)}`
          : tx.transactionHash,
      voterId: tx.voterId,
      electionId: tx.electionId,
      electionName: tx.election ? tx.election.name : `Election #${tx.electionId}`,
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
        currentContractStatus: currentElectionStatus,
        currentElectionName,
        currentContractName: currentElectionName,
      },
      votingStats: {
        totalVotesCast: totalVotesAcrossAllElections,
        totalVotesAcrossAllElections,
        liveElectionVotes: blockchainVotesCount,
        candidates: currentCandidates,
        candidateVotes: currentVotesPerCandidate,
      },
      elections: electionsData,
      recentActivity,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard statistics:", error);
    return res.status(500).send("Failed to retrieve dashboard statistics");
  }
};
