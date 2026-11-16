import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { Transaction } from "../../entity/Transaction";
import { Poll } from "../../entity/Poll";

export const getAllTransactions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { search, status, electionId } = req.query;

    const query = Transaction.createQueryBuilder("tx")
      .leftJoinAndSelect("tx.voter", "voter")
      .leftJoinAndSelect("tx.election", "election")
      .orderBy("tx.id", "DESC");

    if (status && typeof status === "string" && status !== "all") {
      query.andWhere("tx.status = :status", { status });
    }

    if (electionId && typeof electionId === "string" && electionId !== "all") {
      query.andWhere("tx.electionId = :electionId", {
        electionId: Number(electionId),
      });
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      query.andWhere(
        "(tx.transactionHash LIKE :term OR tx.candidateName LIKE :term OR voter.name LIKE :term OR voter.email LIKE :term OR election.name LIKE :term)",
        { term }
      );
    }

    const transactions = await query.getMany();
    const elections = await Poll.find({ select: ["id", "name", "status"] });

    const formatted = transactions.map((tx) => ({
      id: tx.id,
      transactionHash: tx.transactionHash,
      shortHash:
        tx.transactionHash.length > 14
          ? `${tx.transactionHash.slice(0, 8)}...${tx.transactionHash.slice(-6)}`
          : tx.transactionHash,
      voter: {
        id: tx.voter ? tx.voter.id : tx.voterId,
        name: tx.voter ? tx.voter.name : `Voter #${tx.voterId}`,
        email: tx.voter ? tx.voter.email : "",
        citizenshipNumber: tx.voter ? tx.voter.citizenshipNumber : "",
      },
      election: {
        id: tx.election ? tx.election.id : tx.electionId,
        name: tx.election ? tx.election.name : "Election",
      },
      candidateName: tx.candidateName,
      blockNumber: tx.blockNumber,
      gasUsed: tx.gasUsed,
      status: tx.status,
      timestamp: tx.timestamp,
    }));

    return res.send({
      transactions: formatted,
      total: formatted.length,
      elections,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return res.status(500).send("Failed to retrieve transaction records");
  }
};

export const getVoterHistory = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!req.user) return res.status(401).send("Authentication required");

    const transactions = await Transaction.find({
      where: { voterId: req.user.id },
      relations: ["election"],
      order: { id: "DESC" },
    });

    const formatted = transactions.map((tx) => ({
      id: tx.id,
      transactionHash: tx.transactionHash,
      shortHash:
        tx.transactionHash.length > 14
          ? `${tx.transactionHash.slice(0, 8)}...${tx.transactionHash.slice(-6)}`
          : tx.transactionHash,
      electionName: tx.election ? tx.election.name : "Election",
      candidateName: tx.candidateName,
      blockNumber: tx.blockNumber,
      gasUsed: tx.gasUsed,
      status: tx.status,
      timestamp: tx.timestamp,
    }));

    return res.send({ transactions: formatted });
  } catch (error) {
    console.error("Error fetching voter history:", error);
    return res.status(500).send("Failed to retrieve personal voting history");
  }
};
