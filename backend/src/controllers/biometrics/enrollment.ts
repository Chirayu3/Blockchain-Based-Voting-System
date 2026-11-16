import { Response } from "express";
import crypto from "crypto";
import * as yup from "yup";
import { getConnection, IsNull } from "typeorm";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User } from "../../entity/User";
import { BiometricChallenge } from "../../entity/BiometricChallenge";
import { BiometricCredential } from "../../entity/BiometricCredential";
import { BiometricClient } from "../../services/biometric/BiometricClient";
import { encryptEmbedding } from "../../utils/biometricCrypto";
import { rateLimiter } from "../../utils/rateLimiter";

const AVAILABLE_ACTIONS = ["look_center", "turn_left", "turn_right"];

function generateRandomChallengeActions(): string[] {
  // Always start with look_center, followed by a randomized turn
  const secondary = Math.random() > 0.5 ? "turn_left" : "turn_right";
  return ["look_center", secondary];
}

export const requestEnrollmentChallenge = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user) {
    return res.status(401).send("Authentication required");
  }

  // Rate limiting (max 10 requests per 15 mins)
  const rateKey = `bio:enroll_challenge:${req.user.id}`;
  const rateCheck = rateLimiter.checkLimit(rateKey, 10, 900);
  if (rateCheck.limited) {
    return res
      .status(429)
      .send(`Too many enrollment attempts. Please wait ${rateCheck.retryAfterSeconds} seconds.`);
  }

  // Strict verification prerequisite checks
  const user = await User.findOne({ where: { id: req.user.id } });
  if (!user) {
    return res.status(404).send("User account not found");
  }

  if (!user.isActive) {
    return res.status(403).send("Account is deactivated");
  }

  if (!user.emailVerified) {
    return res
      .status(403)
      .send("Email ownership must be verified via OTP prior to biometric enrollment.");
  }

  if (!user.verified) {
    return res
      .status(403)
      .send(
        "Administrator identity approval is required before biometric face enrollment can be performed. Please contact an election administrator to review your registration."
      );
  }

  rateLimiter.hit(rateKey);

  const challengeId = crypto.randomUUID();
  const instructions = generateRandomChallengeActions();
  const nonce = crypto.randomBytes(32).toString("hex");
  const challengeNonceHash = crypto
    .createHash("sha256")
    .update(nonce + challengeId)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 120 * 1000); // 2 minutes TTL

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Invalidate existing active enrollment challenges for this user
    await queryRunner.manager.update(
      BiometricChallenge,
      {
        userId: user.id,
        challengeType: "enrollment",
        consumedAt: IsNull(),
      },
      { consumedAt: new Date() }
    );

    const challenge = new BiometricChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = user.id;
    challenge.electionId = null as any;
    challenge.challengeType = "enrollment";
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
    return res.status(500).send("Failed to issue biometric enrollment challenge");
  } finally {
    await queryRunner.release();
  }
};

const verifyEnrollmentSchema = yup.object({
  body: yup.object({
    challengeId: yup.string().trim().required("Challenge ID is required"),
    frames: yup
      .array()
      .of(yup.string().required())
      .min(2, "At least 2 frames required for active liveness evaluation")
      .required("Captured frames are required"),
    consentGiven: yup
      .boolean()
      .oneOf([true], "Biometric processing consent is required")
      .required("Consent is required"),
  }),
});

export const verifyEnrollment = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    await verifyEnrollmentSchema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  if (!req.user) {
    return res.status(401).send("Authentication required");
  }

  const { challengeId, frames, consentGiven } = req.body;

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Acquire row-level lock on the challenge
    const challenge = await queryRunner.manager
      .createQueryBuilder(BiometricChallenge, "challenge")
      .setLock("pessimistic_write")
      .where("challenge.challengeId = :challengeId", { challengeId })
      .getOne();

    if (!challenge) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Invalid or expired enrollment session.");
    }

    if (challenge.consumedAt !== null) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Enrollment challenge has already been used.");
    }

    if (challenge.userId !== req.user.id) {
      await queryRunner.rollbackTransaction();
      return res.status(403).send("Challenge does not belong to the authenticated voter.");
    }

    if (challenge.challengeType !== "enrollment") {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Invalid challenge type for face enrollment.");
    }

    if (new Date(challenge.expiresAt) < new Date()) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Enrollment session has expired. Please request a new session.");
    }

    // Check user approval status again under transaction
    const user = await queryRunner.manager.findOne(User, {
      where: { id: req.user.id },
    });
    if (!user || !user.isActive || !user.emailVerified || !user.verified) {
      await queryRunner.rollbackTransaction();
      return res
        .status(403)
        .send("Account is not eligible for face enrollment: administrator approval required.");
    }

    let parsedInstructions: string[];
    try {
      parsedInstructions = JSON.parse(challenge.challengeInstructions);
    } catch {
      parsedInstructions = ["look_center", "turn_left"];
    }

    // 1. Verify liveness & presentation-attack detection via BiometricClient
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

    // 2. Extract facial embedding from the primary (look_center) frame
    const embeddingResult = await BiometricClient.extractEmbedding(frames[0]);
    if (!embeddingResult.success || !embeddingResult.embedding) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send(
          embeddingResult.error ||
            "Failed to extract face template. Ensure adequate lighting and face visibility."
        );
    }

    // 3. Encrypt embedding using authenticated AES-256-GCM
    const { encryptedData, keyVersion } = encryptEmbedding(
      embeddingResult.embedding
    );

    // 4. Upsert BiometricCredential for the user
    let credential = await queryRunner.manager.findOne(BiometricCredential, {
      where: { userId: user.id },
    });

    if (!credential) {
      credential = new BiometricCredential();
      credential.userId = user.id;
    }

    credential.encryptedEmbedding = encryptedData;
    credential.encryptionKeyVersion = keyVersion;
    credential.modelIdentifier =
      embeddingResult.modelIdentifier || "sface-opencv-2021dec";
    credential.modelVersion = embeddingResult.modelVersion || "2021dec";
    credential.embeddingDimension = embeddingResult.embeddingDimension || 128;
    credential.status = "active";
    credential.lastVerifiedAt = new Date();

    await queryRunner.manager.save(credential);

    // 5. Consume challenge atomically
    challenge.consumedAt = new Date();
    await queryRunner.manager.save(challenge);

    await queryRunner.commitTransaction();

    return res.send({
      success: true,
      message: "Biometric face credential successfully enrolled and encrypted.",
      enrolledAt: credential.enrolledAt,
    });
  } catch (error: any) {
    await queryRunner.rollbackTransaction();
    const message = error.message || "Failed to process face enrollment.";
    return res.status(500).send(message);
  } finally {
    await queryRunner.release();
  }
};
