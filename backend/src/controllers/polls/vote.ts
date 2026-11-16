import { Response } from "express";
import ElectionContract, { web3 } from "../../web3";
import * as yup from "yup";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { Poll } from "../../entity/Poll";
import { Transaction } from "../../entity/Transaction";
import { User } from "../../entity/User";

const checkSchema = yup.object({
  body: yup.object({
    id: yup.string().required(),
  }),
});

export const checkVoteability = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    await checkSchema.validate(req);
  } catch (error) {
    return res.status(400).send({ error });
  }

  const instance = await ElectionContract.deployed();
  const voters: Array<any> = await instance.getVoters();
  const status: "not-started" | "running" | "finished" =
    await instance.getStatus();

  if (status !== "running") return res.status(400).send("election not running");
  if (voters.includes(req.body.id)) return res.send("already-voted");

  return res.send("not-voted");
};

const schema = yup.object({
  body: yup.object({
    id: yup.string().required(),
    name: yup.string().min(3).required(),
    candidate: yup.string().min(3).required(),
  }),
});

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  // Voter identity verification
  if (req.user && req.user.id.toString() !== req.body.id.toString()) {
    return res
      .status(403)
      .send("Voter identity mismatch: you can only cast a ballot for yourself");
  }

  const voterIdNum = Number(req.body.id);
  const voter = await User.findOne({ where: { id: voterIdNum } });
  if (!voter) {
    return res.status(404).send("Voter not found");
  }
  if (!voter.isActive) {
    return res.status(403).send("Voter account is deactivated");
  }
  if (!voter.emailVerified) {
    return res.status(403).send("Voter account email is not verified");
  }

  const accounts = await web3.eth.getAccounts();
  const instance = await ElectionContract.deployed();

  const status = await instance.getStatus();
  if (status !== "running") {
    return res.status(400).send("Election is not currently active");
  }

  const voters: Array<any> = await instance.getVoters();
  const candidates: Array<any> = await instance.getCandidates();

  if (voters.includes(req.body.id)) {
    return res.status(400).send("Already voted in this election");
  }

  if (!candidates.includes(req.body.candidate)) {
    return res.status(400).send("Candidate does not exist in this election");
  }

  // Find active poll in database
  let currentPoll = await Poll.findOne({
    where: { status: "running" },
    order: { id: "DESC" },
  });

  // If no running poll in MySQL, find or create one matching the blockchain
  if (!currentPoll) {
    const electionName = await instance.getElectionName();
    const electionDesc = await instance.getElectionDescription();
    currentPoll = new Poll();
    currentPoll.name = electionName || "Active Election";
    currentPoll.description = electionDesc || "";
    currentPoll.status = "running";
    await currentPoll.save();
  }

  // Check if a transaction already exists for this voter and election in MySQL
  const existingTx = await Transaction.findOne({
    where: { voterId: voterIdNum, electionId: currentPoll.id },
  });
  if (existingTx) {
    return res.status(400).send("A transaction record already exists for this ballot");
  }

  let result: any;
  try {
    result = await instance.vote(
      req.body.id,
      req.body.name,
      req.body.candidate,
      {
        from: accounts[0],
      }
    );
  } catch (error: any) {
    console.error("Smart contract vote error:", error);
    return res
      .status(400)
      .send(error.reason || error.message || "Failed to record vote on blockchain");
  }

  // Extract Web3 transaction receipt
  const receipt = result.receipt || {};
  const txHash = receipt.transactionHash || result.tx;
  const blockNumber = Number(receipt.blockNumber);
  const gasUsed = Number(receipt.gasUsed) || 0;
  const txStatus =
    receipt.status === true ||
    receipt.status === 1 ||
    receipt.status === "0x1"
      ? "success"
      : "failed";

  // Fetch block timestamp
  let blockTimestamp = new Date();
  if (blockNumber) {
    try {
      const block = await web3.eth.getBlock(blockNumber);
      if (block && block.timestamp) {
        blockTimestamp = new Date(Number(block.timestamp) * 1000);
      }
    } catch (e) {
      console.warn("Could not retrieve block timestamp from Web3:", e);
    }
  }

  // Save transaction tracking record in MySQL (preventing duplicates)
  try {
    const existingByHash = await Transaction.findOne({
      where: { transactionHash: txHash },
    });
    if (!existingByHash) {
      const transaction = new Transaction();
      transaction.transactionHash = txHash;
      transaction.voterId = voterIdNum;
      transaction.electionId = currentPoll.id;
      transaction.candidateName = req.body.candidate;
      transaction.blockNumber = blockNumber;
      transaction.gasUsed = gasUsed;
      transaction.status = txStatus;
      transaction.timestamp = blockTimestamp;
      await transaction.save();
    }
  } catch (dbError) {
    console.error("Error saving transaction record to MySQL:", dbError);
  }

  return res.send({
    message: "successful",
    transaction: {
      transactionHash: txHash,
      blockNumber,
      gasUsed,
      timestamp: blockTimestamp,
      status: txStatus,
      candidate: req.body.candidate,
    },
  });
};
