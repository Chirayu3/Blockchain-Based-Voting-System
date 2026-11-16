import { Request, Response } from "express";
import * as yup from "yup";
import crypto from "crypto";
import { getConnection, IsNull } from "typeorm";
import { OtpChallenge } from "../../../entity/OtpChallenge";
import { User } from "../../../entity/User";
import { EmailService } from "../../../services/email/EmailService";
import { maskEmail } from "../../../utils/maskEmail";
import { hashOtp } from "../../../utils/otpSecurity";
import { rateLimiter } from "../../../utils/rateLimiter";

const schema = yup.object({
  body: yup.object({
    challengeId: yup.string().trim().required("Challenge ID is required"),
  }),
});

export default async (req: Request, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
  const { challengeId } = req.body;

  // Rate limit resend by IP
  const ipCheck = rateLimiter.checkLimit(`ip:resend_otp:${clientIp}`, 15, 3600);
  if (ipCheck.limited) {
    return res
      .status(429)
      .send(`Too many requests from this network. Please wait ${ipCheck.retryAfterSeconds} seconds.`);
  }

  // Find previous challenge and user
  const previousChallenge = await OtpChallenge.findOne({
    where: { challengeId },
    relations: ["user"],
  });

  if (!previousChallenge || !previousChallenge.user) {
    return res.status(400).send("Invalid or expired verification session.");
  }

  const user = previousChallenge.user;

  if (!user.isActive) {
    return res
      .status(403)
      .send("Your account has been deactivated. Please contact an administrator.");
  }

  if (user.admin) {
    return res
      .status(403)
      .send("Administrators must log in through the Admin Portal.");
  }

  // Enforce 60-second cooldown from previous challenge creation
  const nowMs = Date.now();
  const createdMs = new Date(previousChallenge.createdAt).getTime();
  const elapsedSeconds = Math.floor((nowMs - createdMs) / 1000);
  const cooldownPeriod = 60;

  if (elapsedSeconds < cooldownPeriod) {
    const remainingCooldown = cooldownPeriod - elapsedSeconds;
    return res
      .status(429)
      .send(`Please wait ${remainingCooldown} seconds before requesting another code.`);
  }

  // Rate limit by account (max 5 OTP requests per hour)
  const accountCheck = rateLimiter.checkLimit(
    `account:request_otp:${user.voterId}`,
    5,
    3600
  );
  if (accountCheck.limited) {
    return res
      .status(429)
      .send(`Too many OTP requests for this account. Please wait ${accountCheck.retryAfterSeconds} seconds.`);
  }

  rateLimiter.hit(`ip:resend_otp:${clientIp}`);
  rateLimiter.hit(`account:request_otp:${user.voterId}`);

  // Generate new OTP and challengeId
  const plainOtp = crypto.randomInt(100000, 1000000).toString();
  const newChallengeId = crypto.randomUUID();
  const otpHash = hashOtp(newChallengeId, plainOtp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Execute in a MySQL transaction with user row lock
  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let createdChallenge: OtpChallenge;
  try {
    await queryRunner.manager
      .createQueryBuilder(User, "user")
      .setLock("pessimistic_write")
      .where("user.id = :id", { id: user.id })
      .getOne();

    // Invalidate all prior challenges for this user
    await queryRunner.manager.update(
      OtpChallenge,
      { userId: user.id, consumedAt: IsNull() },
      { consumedAt: new Date() }
    );

    const challenge = new OtpChallenge();
    challenge.challengeId = newChallengeId;
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
    return res.status(500).send("Unable to generate new verification code. Please try again.");
  } finally {
    await queryRunner.release();
  }

  // Dispatch new OTP email
  const emailSent = await EmailService.sendOtpEmail({
    to: user.email,
    name: user.name,
    otp: plainOtp,
    expiresMinutes: 5,
  });

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
