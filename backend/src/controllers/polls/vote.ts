import { Response } from "express";
import ElectionContract, { web3 } from "../../web3";
import * as yup from "yup";
import { getConnection } from "typeorm";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { Poll } from "../../entity/Poll";
import { Transaction } from "../../entity/Transaction";
import { User } from "../../entity/User";
import { VotingAuthorization } from "../../entity/VotingAuthorization";
import { hashToken } from "../../utils/biometricCrypto";

const checkSchema = yup.object({
  body: yup.object({
    id: yup.string().optional(),
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

  // Derive voter database ID from authenticated session if available, else fallback to body for public queries
  const voterIdStr = req.user ? req.user.id.toString() : req.body.id;
  if (!voterIdStr) {
    return res.status(400).send("Voter identity required");
  }

  try {
    const instance = await ElectionContract.deployed();
    const status: "not-started" | "running" | "finished" =
      await instance.getStatus();

    if (status !== "running") return res.send("not-running");
    const voters: Array<any> = await instance.getVoters();
    if (voters.includes(voterIdStr)) return res.send("already-voted");

    return res.send("not-voted");
  } catch (err: any) {
    console.warn("[Check Voteability] Contract check failed:", err.message);
    return res.send("not-running");
  }
};

const schema = yup.object({
  body: yup.object({
    candidate: yup.string().trim().min(2, "Candidate name must be at least 2 characters").required("Candidate is required"),
    votingAuthorizationToken: yup
      .string()
      .trim()
      .required("Biometric voting authorization token is required to cast a ballot"),
    // Optional client-supplied fields maintained for backwards protocol compatibility
    id: yup.string().optional(),
    name: yup.string().optional(),
  }),
});

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  if (!req.user) {
    return res.status(401).send("Authentication required");
  }

  // Identity derivation: strictly derive voter ID and name from authenticated database user
  const voterDbId = req.user.id;
  const voterDbIdStr = voterDbId.toString();

  // If client provided id, verify it matches the authenticated session
  if (req.body.id && req.body.id.toString() !== voterDbIdStr) {
    return res
      .status(403)
      .send("Voter identity mismatch: you can only cast a ballot for yourself");
  }

  const voter = await User.findOne({ where: { id: voterDbId } });
  if (!voter) {
    return res.status(404).send("Voter not found");
  }
  if (!voter.isActive) {
    return res.status(403).send("Voter account is deactivated");
  }
  if (!voter.emailVerified) {
    return res.status(403).send("Voter account email is not verified");
  }
  const isApproved = Boolean(voter.verified || voter.registrationStatus === "APPROVED");
  if (!isApproved) {
    return res.status(403).send("Voter account has not received administrator approval");
  }

  const voterName = voter.name;
  const candidateName = req.body.candidate.trim();
  const rawAuthToken = req.body.votingAuthorizationToken;
  const tokenHash = hashToken(rawAuthToken);

  // Check active election in MySQL
  let currentPoll = await Poll.findOne({
    where: { status: "running" },
    order: { id: "DESC" },
  });

  const accounts = await web3.eth.getAccounts();
  const instance = await ElectionContract.deployed();

  const status = await instance.getStatus();
  if (status !== "running") {
    return res.status(400).send("Election is not currently active");
  }

  const candidates: Array<any> = await instance.getCandidates();
  if (!candidates.includes(candidateName)) {
    return res.status(400).send("Candidate does not exist in this election");
  }

  const onChainVoters: Array<any> = await instance.getVoters();
  if (onChainVoters.includes(voterDbIdStr) || (voter.voterId && onChainVoters.includes(voter.voterId))) {
    return res.status(400).send("Already voted in this election according to blockchain records");
  }

  // Check if a transaction already exists for this voter and election in MySQL
  if (currentPoll) {
    const existingTx = await Transaction.findOne({
      where: { voterId: voterDbId, electionId: currentPoll.id },
    });
    if (existingTx) {
      return res.status(400).send("A transaction record already exists for this ballot");
    }
  }

  // Verify and lock voting authorization token atomically
  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let authorization: VotingAuthorization;
  try {
    const foundAuth = await queryRunner.manager
      .createQueryBuilder(VotingAuthorization, "auth")
      .setLock("pessimistic_write")
      .where("auth.authorizationTokenHash = :tokenHash", { tokenHash })
      .getOne();

    if (!foundAuth) {
      await queryRunner.rollbackTransaction();
      return res.status(403).send("Invalid or missing biometric voting authorization.");
    }

    if (foundAuth.status !== "issued") {
      await queryRunner.rollbackTransaction();
      return res
        .status(403)
        .send(`Voting authorization token is no longer valid (status: ${foundAuth.status}).`);
    }

    if (foundAuth.userId !== voterDbId) {
      await queryRunner.rollbackTransaction();
      return res.status(403).send("Voting authorization belongs to a different voter.");
    }

    if (currentPoll && foundAuth.electionId !== currentPoll.id) {
      await queryRunner.rollbackTransaction();
      return res.status(403).send("Voting authorization was issued for a different election.");
    }

    if (new Date(foundAuth.expiresAt) < new Date()) {
      foundAuth.status = "expired";
      await queryRunner.manager.save(foundAuth);
      await queryRunner.commitTransaction();
      return res.status(403).send("Voting authorization token has expired. Please re-authenticate your face.");
    }

    // Atomically transition status to processing before invoking blockchain
    foundAuth.status = "processing";
    authorization = await queryRunner.manager.save(foundAuth);
    await queryRunner.commitTransaction();
  } catch (authError) {
    await queryRunner.rollbackTransaction();
    return res.status(500).send("Failed to lock voting authorization token");
  } finally {
    await queryRunner.release();
  }

  // Record vote on Ethereum Blockchain
  let result: any;
  let blockchainError: any = null;

  try {
    result = await instance.vote(
      voterDbIdStr,
      voterName,
      candidateName,
      {
        from: accounts[0],
        gas: 6721975,
      }
    );
  } catch (error: any) {
    blockchainError = error;
    console.error("Smart contract vote error:", error);
  }

  // Handle blockchain outcome and timeout reconciliation
  if (blockchainError) {
    // Reconcile: Query blockchain state to determine if transaction actually succeeded despite client error/timeout
    let reconciledSuccess = false;
    try {
      const refreshedVoters: Array<any> = await instance.getVoters();
      if (refreshedVoters.includes(voterDbIdStr)) {
        reconciledSuccess = true;
      }
    } catch (checkErr) {
      console.warn("Could not query blockchain for reconciliation:", checkErr);
    }

    if (!reconciledSuccess) {
      // Mark authorization failed so token cannot be reused
      await VotingAuthorization.update(
        { id: authorization.id },
        { status: "failed" }
      );
      return res
        .status(400)
        .send(
          blockchainError.reason ||
            blockchainError.message ||
            "Failed to record vote on blockchain. State reconciled: vote was not cast."
        );
    }

    // If reconciled as successfully recorded on-chain:
    await VotingAuthorization.update(
      { id: authorization.id },
      { status: "consumed", consumedAt: new Date() }
    );
  } else {
    // Normal success: mark authorization consumed
    await VotingAuthorization.update(
      { id: authorization.id },
      {
        status: "consumed",
        consumedAt: new Date(),
        transactionHash: result?.receipt?.transactionHash || result?.tx || null,
      }
    );
  }

  // Ensure MySQL active poll exists
  if (!currentPoll) {
    const electionName = await instance.getElectionName();
    const electionDesc = await instance.getElectionDescription();
    currentPoll = new Poll();
    currentPoll.name = electionName || "Active Election";
    currentPoll.description = electionDesc || "";
    currentPoll.status = "running";
    await currentPoll.save();
  }

  // Extract Web3 transaction receipt
  const receipt = result?.receipt || {};
  const txHash = receipt.transactionHash || result?.tx || "0xRECONCILED";
  const blockNumber = Number(receipt.blockNumber) || 0;
  const gasUsed = Number(receipt.gasUsed) || 0;
  const txStatus =
    receipt.status === true ||
    receipt.status === 1 ||
    receipt.status === "0x1" ||
    txHash !== "0xRECONCILED"
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

  // Save transaction tracking record in MySQL
  try {
    const existingByHash = await Transaction.findOne({
      where: { transactionHash: txHash },
    });
    if (!existingByHash) {
      const transaction = new Transaction();
      transaction.transactionHash = txHash;
      transaction.voterId = voterDbId;
      transaction.electionId = currentPoll.id;
      transaction.candidateName = candidateName;
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
      candidate: candidateName,
    },
  });
};
