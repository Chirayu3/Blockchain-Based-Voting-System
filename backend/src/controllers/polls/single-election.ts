import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { Poll } from "../../entity/Poll";
import { Transaction } from "../../entity/Transaction";
import { User } from "../../entity/User";
import ElectionContract from "../../web3";

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    const electionId = Number(req.params.id);
    if (!electionId || isNaN(electionId)) {
      return res.status(400).send("Invalid election ID");
    }

    const poll = await Poll.findOne({
      where: { id: electionId },
      relations: ["candidates"],
    });

    if (!poll) {
      return res.status(404).send("Election record not found");
    }

    const verifiedVoters = await User.count({
      where: { admin: false, verified: true },
    });

    // Query transactions permanently stored in MySQL for this election
    const pollTxs = await Transaction.find({
      where: { electionId: poll.id },
      order: { id: "DESC" },
    });

    const successfulTxs = pollTxs.filter((tx) => tx.status === "success");
    let totalVotes = successfulTxs.length;

    const candidateCounts: Record<string, number> = {};
    if (poll.candidates && poll.candidates.length > 0) {
      for (const c of poll.candidates) {
        candidateCounts[c.name] = 0;
      }
    }

    for (const tx of successfulTxs) {
      if (candidateCounts[tx.candidateName] !== undefined) {
        candidateCounts[tx.candidateName]++;
      } else {
        candidateCounts[tx.candidateName] = 1;
      }
    }

    // Check if this election is currently live on the smart contract
    try {
      const instance = await ElectionContract.deployed();
      const contractStatus = await instance.getStatus();
      const contractName = await instance.getElectionName();

      if (
        poll.status === "running" &&
        contractStatus === "running" &&
        contractName === poll.name
      ) {
        const liveVotes = await instance.getVotes();
        if (liveVotes.length > totalVotes) {
          totalVotes = liveVotes.length;
          for (const v of liveVotes) {
            const cand = v[3];
            if (candidateCounts[cand] !== undefined) {
              candidateCounts[cand]++;
            } else {
              candidateCounts[cand] = 1;
            }
          }
        }
      }
    } catch (bcErr) {
      console.warn("Could not query live smart contract for election:", bcErr);
    }

    const turnoutPercentage =
      verifiedVoters > 0
        ? Number(((totalVotes / verifiedVoters) * 100).toFixed(2))
        : 0;

    const candidateStats = Object.keys(candidateCounts).map((cName) => {
      const count = candidateCounts[cName] || 0;
      const percentage =
        totalVotes > 0
          ? Number(((count / totalVotes) * 100).toFixed(2))
          : 0;
      const candEntity = poll.candidates?.find((c) => c.name === cName);
      return {
        id: candEntity?.id,
        name: cName,
        info: candEntity?.info || "",
        count,
        percentage,
      };
    });

    // Individual election voting history / transactions
    // STRICTLY NO voter names (voter privacy improvement maintained)
    const formattedTransactions = pollTxs.map((tx) => ({
      id: tx.id,
      transactionHash: tx.transactionHash,
      shortHash:
        tx.transactionHash.length > 14
          ? `${tx.transactionHash.slice(0, 8)}...${tx.transactionHash.slice(-6)}`
          : tx.transactionHash,
      voterId: tx.voterId,
      candidateName: tx.candidateName,
      blockNumber: tx.blockNumber,
      gasUsed: tx.gasUsed,
      status: tx.status,
      timestamp: tx.timestamp,
    }));

    return res.send({
      election: {
        id: poll.id,
        name: poll.name,
        description: poll.description || "",
        status: poll.status,
        createdAt: poll.createdAt,
        updatedAt: poll.updatedAt,
      },
      statistics: {
        totalVotes,
        eligibleVoters: verifiedVoters,
        turnoutPercentage,
        remainingEligibleVoters: Math.max(0, verifiedVoters - totalVotes),
        candidateStats,
      },
      transactions: formattedTransactions,
    });
  } catch (error) {
    console.error("Error fetching single election details:", error);
    return res.status(500).send("Failed to retrieve election details");
  }
};
