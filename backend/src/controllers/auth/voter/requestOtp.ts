import { Request, Response } from "express";
import * as yup from "yup";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { getConnection, IsNull } from "typeorm";
import { User, RegistrationStatus } from "../../../entity/User";
import { OtpChallenge } from "../../../entity/OtpChallenge";
import { EmailService } from "../../../services/email/EmailService";
import { maskEmail } from "../../../utils/maskEmail";
import { hashOtp } from "../../../utils/otpSecurity";
import { rateLimiter } from "../../../utils/rateLimiter";

const schema = yup.object({
  body: yup.object({
    voterId: yup.string().trim().required("Voter ID is required"),
    password: yup.string().required("Password is required"),
  }),
});

export default async (req: Request, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
  const { voterId, password } = req.body;
  const normalizedVoterId = voterId.trim().toUpperCase();

  // Rate limit by IP (max 15 attempts / hour)
  const ipCheck = rateLimiter.checkLimit(`ip:request_otp:${clientIp}`, 15, 3600);
  if (ipCheck.limited) {
    return res
      .status(429)
      .send(`Too many attempts from this network. Please wait ${ipCheck.retryAfterSeconds} seconds.`);
  }

  // Rate limit by account (max 5 OTP requests / hour)
  const accountCheck = rateLimiter.checkLimit(`account:request_otp:${normalizedVoterId}`, 5, 3600);
  if (accountCheck.limited) {
    return res
      .status(429)
      .send(`Too many OTP requests for this account. Please wait ${accountCheck.retryAfterSeconds} seconds.`);
  }

  const user = await User.findOne({ where: { voterId: normalizedVoterId } });

  // Generic 401 error if user not found to avoid user enumeration
  if (!user) {
    rateLimiter.hit(`ip:request_otp:${clientIp}`);
    return res.status(401).send("Invalid Voter ID or password.");
  }

  // Administrator isolation: Admins must not authenticate through voter OTP portal
  if (user.admin) {
    return res
      .status(403)
      .send("Administrators must log in through the Admin Portal.");
  }

  // Account status check
  if (!user.isActive) {
    return res
      .status(403)
      .send("Your account has been deactivated. Please contact an administrator.");
  }

  // Registration approval gatekeeping
  if (user.registrationStatus !== RegistrationStatus.APPROVED) {
    if (user.registrationStatus === RegistrationStatus.PENDING_APPROVAL) {
      return res
        .status(403)
        .send(
          "Your registration is currently pending administrator approval. You will receive your Voter ID via email once approved."
        );
    }
    if (user.registrationStatus === RegistrationStatus.REJECTED) {
      return res
        .status(403)
        .send(
          "Your voter registration request has been rejected. Please contact an administrator."
        );
    }
    return res.status(403).send("Your account is not approved for voting.");
  }

  // Validate password
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    rateLimiter.hit(`ip:request_otp:${clientIp}`);
    rateLimiter.hit(`account:request_otp:${normalizedVoterId}`);
    return res.status(401).send("Invalid Voter ID or password.");
  }

  rateLimiter.hit(`ip:request_otp:${clientIp}`);
  rateLimiter.hit(`account:request_otp:${normalizedVoterId}`);

  // Generate cryptographic 6-digit OTP and UUID v4 challengeId
  const plainOtp = crypto.randomInt(100000, 1000000).toString();
  const challengeId = crypto.randomUUID();
  const otpHash = hashOtp(challengeId, plainOtp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Execute challenge generation in a MySQL transaction with user row lock
  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let createdChallenge: OtpChallenge;
  try {
    // Acquire lock on user row to serialize concurrent challenge creation
    await queryRunner.manager
      .createQueryBuilder(User, "user")
      .setLock("pessimistic_write")
      .where("user.id = :id", { id: user.id })
      .getOne();

    // Invalidate all prior active challenges for this user
    await queryRunner.manager.update(
      OtpChallenge,
      { userId: user.id, consumedAt: IsNull() },
      { consumedAt: new Date() }
    );

    // Persist new challenge
    const challenge = new OtpChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = user.id;
    challenge.otpHash = otpHash;
    challenge.expiresAt = expiresAt;
    challenge.attempts = 0;
    challenge.consumedAt = null;
    challenge.ipAddress = typeof clientIp === "string" ? clientIp.slice(0, 45) : null;

    createdChallenge = await queryRunner.manager.save(challenge);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    return res.status(500).send("Unable to create verification challenge. Please try again.");
  } finally {
    await queryRunner.release();
  }

  // Dispatch OTP email
  const emailSent = await EmailService.sendOtpEmail({
    to: user.email,
    name: user.name,
    otp: plainOtp,
    expiresMinutes: 5,
  });

  // If email dispatch fails, immediately invalidate the challenge
  if (!emailSent) {
    await OtpChallenge.update(
      { challengeId: createdChallenge.challengeId },
      { consumedAt: new Date() }
    );
    return res
      .status(500)
      .send("Failed to deliver verification code to your registered email. Please try again later.");
  }

  return res.send({
    success: true,
    challengeId: createdChallenge.challengeId,
    maskedEmail: maskEmail(user.email),
    expiresAt: createdChallenge.expiresAt,
    cooldownSeconds: 60,
  });
};
