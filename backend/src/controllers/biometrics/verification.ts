import { Response } from "express";
import crypto from "crypto";
import * as yup from "yup";
import { getConnection, IsNull } from "typeorm";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User } from "../../entity/User";
import { Poll } from "../../entity/Poll";
import { Transaction } from "../../entity/Transaction";
import { BiometricChallenge } from "../../entity/BiometricChallenge";
import { BiometricCredential } from "../../entity/BiometricCredential";
import { VotingAuthorization } from "../../entity/VotingAuthorization";
import { BiometricClient } from "../../services/biometric/BiometricClient";
import {
  decryptEmbedding,
  generateAuthorizationToken,
} from "../../utils/biometricCrypto";
import ElectionContract from "../../web3";
import { rateLimiter } from "../../utils/rateLimiter";

function generateRandomChallengeActions(): string[] {
  const secondary = Math.random() > 0.5 ? "turn_left" : "turn_right";
  return ["look_center", secondary];
}

export const requestVotingChallenge = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user) {
    return res.status(401).send("Authentication required");
  }

  const electionId = Number(req.params.electionId);
  if (!electionId || isNaN(electionId)) {
    return res.status(400).send("Invalid election identifier");
  }

  // Rate limiting (max 15 attempts / 15 mins)
  const rateKey = `bio:vote_challenge:${req.user.id}:${electionId}`;
  const rateCheck = rateLimiter.checkLimit(rateKey, 15, 900);
  if (rateCheck.limited) {
    return res
      .status(429)
      .send(`Too many verification attempts. Please wait ${rateCheck.retryAfterSeconds} seconds.`);
  }

  // Verify voter status
  const user = await User.findOne({ where: { id: req.user.id } });
  if (!user || !user.isActive) {
    return res.status(403).send("Voter account is inactive or not found");
  }
  if (!user.emailVerified) {
    return res.status(403).send("Email verification required");
  }
  const isApproved = Boolean(user.verified || user.registrationStatus === "APPROVED");
  if (!isApproved) {
    return res.status(403).send("Administrator approval required before voting");
  }

  // Verify voter has enrolled biometric credentials
  const credential = await BiometricCredential.findOne({
    where: { userId: user.id, status: "active" },
  });
  if (!credential) {
    return res
      .status(403)
      .send(
        "No active biometric face profile enrolled. You must complete face enrollment before participating in the election."
      );
  }

  // Verify active election in DB
  const poll = await Poll.findOne({ where: { id: electionId } });
  if (!poll || poll.status !== "running") {
    return res.status(400).send("The selected election is not currently running");
  }

  // Check if voter already cast ballot in MySQL
  const existingTx = await Transaction.findOne({
    where: { voterId: user.id, electionId },
  });
  if (existingTx) {
    return res.status(400).send("You have already cast a ballot in this election");
  }

  // Check on-chain duplicate vote status
  try {
    const instance = await ElectionContract.deployed();
    const voters: Array<any> = await instance.getVoters();
    if (voters.includes(user.id.toString()) || voters.includes(user.voterId)) {
      return res.status(400).send("Already voted in this election according to blockchain records");
    }
  } catch (err: any) {
    // If contract call fails, proceed only if DB is clean, but log error
    console.warn("Could not query blockchain voter status:", err.message);
  }

  rateLimiter.hit(rateKey);

  const challengeId = crypto.randomUUID();
  const instructions = generateRandomChallengeActions();
  const nonce = crypto.randomBytes(32).toString("hex");
  const challengeNonceHash = crypto
    .createHash("sha256")
    .update(nonce + challengeId)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 120 * 1000); // 120 seconds TTL

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Invalidate prior voting challenges for this user and election
    await queryRunner.manager.update(
      BiometricChallenge,
      {
        userId: user.id,
        electionId,
        challengeType: "voting",
        consumedAt: IsNull(),
      },
      { consumedAt: new Date() }
    );

    const challenge = new BiometricChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = user.id;
    challenge.electionId = electionId;
    challenge.challengeType = "voting";
    challenge.challengeNonceHash = challengeNonceHash;
    challenge.challengeInstructions = JSON.stringify(instructions);
    challenge.expiresAt = expiresAt;
    challenge.consumedAt = null;
    challenge.ipAddress = req.ip || req.socket.remoteAddress || null;

    await queryRunner.manager.save(challenge);
    await queryRunner.commitTransaction();

    return res.send({
      success: true,
      challengeId,
      instructions,
      expiresAt,
      ttlSeconds: 120,
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    return res.status(500).send("Failed to issue biometric voting challenge");
  } finally {
    await queryRunner.release();
  }
};

const verifyVotingSchema = yup.object({
  body: yup.object({
    challengeId: yup.string().trim().required("Challenge ID is required"),
    frames: yup
      .array()
      .of(yup.string().required())
      .min(2, "At least 2 frames required for active liveness evaluation")
      .required("Captured frames are required"),
  }),
});

export const verifyVotingBiometrics = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    await verifyVotingSchema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  if (!req.user) {
    return res.status(401).send("Authentication required");
  }

  const electionId = Number(req.params.electionId);
  const { challengeId, frames } = req.body;

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Row lock challenge
    const challenge = await queryRunner.manager
      .createQueryBuilder(BiometricChallenge, "challenge")
      .setLock("pessimistic_write")
      .where("challenge.challengeId = :challengeId", { challengeId })
      .getOne();

    if (!challenge) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Invalid or expired authentication session.");
    }

    if (challenge.consumedAt !== null) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Authentication session has already been used.");
    }

    if (challenge.userId !== req.user.id) {
      await queryRunner.rollbackTransaction();
      return res.status(403).send("Authentication challenge belongs to a different voter session.");
    }

    if (challenge.electionId !== electionId) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Challenge was issued for a different election.");
    }

    if (new Date(challenge.expiresAt) < new Date()) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Authentication session expired. Please start over.");
    }

    // Retrieve active registered biometric credential
    const credential = await queryRunner.manager.findOne(BiometricCredential, {
      where: { userId: req.user.id, status: "active" },
    });
    if (!credential) {
      await queryRunner.rollbackTransaction();
      return res.status(403).send("No enrolled biometric profile found for voter.");
    }

    // Decrypt registered template with authenticated AES-256-GCM
    let enrolledEmbedding: number[];
    try {
      enrolledEmbedding = decryptEmbedding(credential.encryptedEmbedding);
    } catch (decryptErr) {
      await queryRunner.rollbackTransaction();
      return res.status(500).send("Failed to decrypt registered biometric template.");
    }

    let parsedInstructions: string[];
    try {
      parsedInstructions = JSON.parse(challenge.challengeInstructions);
    } catch {
      parsedInstructions = ["look_center", "turn_left"];
    }

    // 1. Verify passive PAD and active challenge motion
    const livenessResult = await BiometricClient.verifyLiveness(
      frames,
      parsedInstructions
    );
    if (!livenessResult.is_live) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send(livenessResult.error || "Biometric liveness verification failed.");
    }

    // 2. Extract live embedding from primary frame
    const embeddingResult = await BiometricClient.extractEmbedding(frames[0]);
    if (!embeddingResult.success || !embeddingResult.embedding) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send(
          embeddingResult.error ||
            "Failed to extract face features from live camera feed."
        );
    }

    // 3. Perform 1-to-1 match against registered template
    const matchResult = await BiometricClient.verifyMatch(
      embeddingResult.embedding,
      enrolledEmbedding
    );

    if (!matchResult.matched) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send(
          `Facial verification failed: match score (${matchResult.similarity.toFixed(3)}) fell below the required threshold (${matchResult.threshold.toFixed(3)}). Access denied.`
        );
    }

    // 4. Mark challenge consumed atomically
    challenge.consumedAt = new Date();
    await queryRunner.manager.save(challenge);

    // Update credential lastVerifiedAt
    credential.lastVerifiedAt = new Date();
    await queryRunner.manager.save(credential);

    // 5. Generate unpredictable one-time voting authorization token
    const { token, tokenHash } = generateAuthorizationToken();
    const verificationId = crypto.randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 120 * 1000); // 120 seconds TTL

    const authorization = new VotingAuthorization();
    authorization.authorizationTokenHash = tokenHash;
    authorization.userId = req.user.id;
    authorization.electionId = electionId;
    authorization.verificationId = verificationId;
    authorization.status = "issued";
    authorization.expiresAt = tokenExpiresAt;
    authorization.consumedAt = null;

    await queryRunner.manager.save(authorization);

    await queryRunner.commitTransaction();

    return res.send({
      success: true,
      message: "Biometric authentication successful. Voting authorization issued.",
      votingAuthorizationToken: token,
      expiresAt: tokenExpiresAt,
      ttlSeconds: 120,
    });
  } catch (error: any) {
    await queryRunner.rollbackTransaction();
    return res.status(500).send(error.message || "Biometric verification error");
  } finally {
    await queryRunner.release();
  }
};
