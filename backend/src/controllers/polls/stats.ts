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

    // Total votes cast is at least total successful transactions recorded or blockchain votes
    const totalVotesCast = Math.max(totalSuccessfulTx, blockchainVotesCount);

    // 4. Recent voting activity (latest 10 transactions with voter & election relations)
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
