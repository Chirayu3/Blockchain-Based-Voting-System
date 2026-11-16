import { Request, Response } from "express";
import * as yup from "yup";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import { getConnection } from "typeorm";
import { OtpChallenge } from "../../../entity/OtpChallenge";
import { User } from "../../../entity/User";
import { verifyOtpHash } from "../../../utils/otpSecurity";
import { rateLimiter } from "../../../utils/rateLimiter";

const schema = yup.object({
  body: yup.object({
    challengeId: yup.string().trim().required("Challenge ID is required"),
    otp: yup
      .string()
      .trim()
      .matches(/^\d{6}$/, "OTP must be exactly 6 digits")
      .required("OTP is required"),
  }),
});

export default async (req: Request, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
  const { challengeId, otp } = req.body;

  // Rate limit verification attempts by IP
  const ipCheck = rateLimiter.checkLimit(`ip:verify_otp:${clientIp}`, 20, 3600);
  if (ipCheck.limited) {
    return res
      .status(429)
      .send(`Too many verification attempts from this network. Please wait ${ipCheck.retryAfterSeconds} seconds.`);
  }

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Acquire row-level lock on the challenge to guarantee atomic verification
    const challenge = await queryRunner.manager
      .createQueryBuilder(OtpChallenge, "challenge")
      .setLock("pessimistic_write")
      .where("challenge.challengeId = :challengeId", { challengeId })
      .getOne();

    if (!challenge) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("Invalid or expired verification session.");
    }

    if (challenge.consumedAt !== null) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send("Verification code has already been used. Please request a new code.");
    }

    const now = new Date();
    if (new Date(challenge.expiresAt) < now) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send("Verification code has expired. Please request a new code.");
    }

    if (challenge.attempts >= 5) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send("Maximum verification attempts exceeded. Please request a new code.");
    }

    // Verify OTP hash with constant-time comparison
    const isMatch = verifyOtpHash(challenge.challengeId, otp, challenge.otpHash);

    if (!isMatch) {
      challenge.attempts += 1;
      await queryRunner.manager.save(challenge);
      await queryRunner.commitTransaction();

      const remainingAttempts = 5 - challenge.attempts;
      if (remainingAttempts <= 0) {
        return res
          .status(400)
          .send("Maximum verification attempts exceeded. Challenge has been locked.");
      }
      return res
        .status(400)
        .send(`Invalid verification code. ${remainingAttempts} attempt(s) remaining.`);
    }

    // Mark challenge consumed
    challenge.consumedAt = now;
    challenge.attempts += 1;
    await queryRunner.manager.save(challenge);

    // Fetch user and update emailVerified flag
    const user = await queryRunner.manager.findOne(User, {
      where: { id: challenge.userId },
    });

    if (!user) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send("User account not found.");
    }

    if (!user.isActive) {
      await queryRunner.rollbackTransaction();
      return res
        .status(403)
        .send("Your account has been deactivated. Please contact an administrator.");
    }

    // Update emailVerified (legacy 'verified' field is strictly NOT altered)
    user.emailVerified = true;
    await queryRunner.manager.save(user);

    await queryRunner.commitTransaction();

    // Issue short-lived access JWT and refresh token
    const accessTokenSecret =
      process.env.ACCESS_TOKEN_SECRET ||
      "976a66a5bd23b2050019f380c4decbbefdf8ff91cf502c68a3fe1ced91d7448cc54ce6c847657d53294e40889cef5bd996ec5b0fefc1f56270e06990657eeb6e";
    const refreshTokenSecret =
      process.env.REFRESH_TOKEN_SECRET ||
      "5f567afa6406225c4a759daae77e07146eca5df8149353a844fa9ab67fba22780cb4baa5ea508214934531a6f35e67e96f16a0328559111c597856c660f177c2";

    const plainUserObject = {
      id: user.id,
      name: user.name,
      citizenshipNumber: user.citizenshipNumber,
      email: user.email,
      voterId: user.voterId,
      admin: Boolean(user.admin),
      verified: Boolean(user.verified),
      emailVerified: true,
      isActive: Boolean(user.isActive),
    };

    const accessToken = jwt.sign(plainUserObject, accessTokenSecret, {
      expiresIn: "1h",
    });
    const refreshToken = jwt.sign(plainUserObject, refreshTokenSecret, {
      expiresIn: "7d",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: dayjs().add(7, "days").toDate(),
    });

    return res.send({
      success: true,
      user: plainUserObject,
      accessToken,
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    return res.status(500).send("Verification error. Please try again.");
  } finally {
    await queryRunner.release();
  }
};
