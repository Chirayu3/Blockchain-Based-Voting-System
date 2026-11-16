import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User } from "../../entity/User";
import { Poll } from "../../entity/Poll";
import { Transaction } from "../../entity/Transaction";
import ElectionContract from "../../web3";

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Registered Voters (Distinct non-admins in MySQL, avoiding double-counting)
    const totalVoters = await User.count({ where: { admin: false } });
    const verifiedVoters = await User.count({
      where: { admin: false, verified: true },
    });
    const pendingApprovals = await User.count({
      where: { admin: false, verified: false },
    });

    // 2. Election stats across all elections
    const totalElections = await Poll.count();
    const activeElections = await Poll.count({ where: { status: "running" } });
    const completedElections = await Poll.count({
      where: { status: "finished" },
    });

    // 3. Total votes cast across ALL elections in MySQL history
    const totalSuccessfulTx = await Transaction.count({
      where: { status: "success" },
    });

    // Current smart contract votes (if an election is actively running on blockchain)
    let blockchainVotesCount = 0;
    let currentContractStatus = "not-started";
    let currentContractName = "";

    try {
      const instance = await ElectionContract.deployed();
      currentContractStatus = await instance.getStatus();
      if (currentContractStatus !== "not-started") {
        currentContractName = await instance.getElectionName();
        const rawVotes = await instance.getVotes();
        blockchainVotesCount = rawVotes.length;
      }
    } catch (bcErr) {
      console.warn("Could not query live smart contract for stats:", bcErr);
    }

    // Total votes cast across all elections (ensures any live uncommitted votes are accounted for)
    const totalVotesAcrossAllElections = Math.max(
      totalSuccessfulTx,
      blockchainVotesCount
    );

    // 4. Retrieve ALL elections (both active and historical) ordered by ID descending
    const allPolls = await Poll.find({
      relations: ["candidates"],
      order: { id: "DESC" },
    });

    // 5. Build rich historical data for every single election
    const electionsData = await Promise.all(
      allPolls.map(async (poll) => {
        // Query transactions permanently stored in MySQL for this specific election
        const pollTxs = await Transaction.find({
          where: { electionId: poll.id, status: "success" },
          order: { id: "DESC" },
        });

        let pollVotesCount = pollTxs.length;
        const candidateCounts: Record<string, number> = {};

        // Initialize candidate counts
        if (poll.candidates && poll.candidates.length > 0) {
          for (const c of poll.candidates) {
            candidateCounts[c.name] = 0;
          }
        }

        // Tally votes from recorded transactions
        for (const tx of pollTxs) {
          if (candidateCounts[tx.candidateName] !== undefined) {
            candidateCounts[tx.candidateName]++;
          } else {
            candidateCounts[tx.candidateName] = 1;
          }
        }

        // If this poll is the currently active one on the smart contract, ensure live contract votes are synced
        if (
          poll.status === "running" &&
          currentContractStatus === "running" &&
          currentContractName === poll.name
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

        // Determine winner or leader
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

    // 6. Recent voting activity across all elections (latest 10 transactions)
    // Note: STRICTLY NO voter names (privacy protection requirement preserved)
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
        currentContractStatus,
        currentContractName,
      },
      votingStats: {
        totalVotesAcrossAllElections,
        totalVotesCast: totalVotesAcrossAllElections,
      },
      elections: electionsData,
      recentActivity,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard statistics:", error);
    return res.status(500).send("Failed to retrieve dashboard statistics");
  }
};
