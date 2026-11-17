import { Request, Response } from "express";
import * as yup from "yup";
import { User } from "../../entity/User";
import { EmailService } from "../../services/email/EmailService";
import { rateLimiter } from "../../utils/rateLimiter";

const schema = yup.object({
  body: yup
    .object({
      email: yup.string().email(),
      voterId: yup.string(),
    })
    .test(
      "at-least-one",
      "Either email or voterId must be provided",
      (value) => Boolean(value.email || value.voterId)
    ),
});

export default async (req: Request, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
  const { email, voterId } = req.body;
  const targetKey = email ? email.toLowerCase().trim() : voterId?.trim();

  // Rate limit by IP (max 5 per hour)
  const ipCheck = rateLimiter.checkLimit(`ip:resend_reg:${clientIp}`, 5, 3600);
  if (ipCheck.limited) {
    return res
      .status(429)
      .send(`Too many requests from this IP. Please try again after ${ipCheck.retryAfterSeconds} seconds.`);
  }

  // Rate limit by target account (max 3 per hour)
  const targetCheck = rateLimiter.checkLimit(
    `account:resend_reg:${targetKey}`,
    3,
    3600
  );
  if (targetCheck.limited) {
    return res
      .status(429)
      .send(`Too many requests for this account. Please try again after ${targetCheck.retryAfterSeconds} seconds.`);
  }

  rateLimiter.hit(`ip:resend_reg:${clientIp}`);
  rateLimiter.hit(`account:resend_reg:${targetKey}`);

  // Lookup user
  let user: User | undefined;
  if (email) {
    user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  } else if (voterId) {
    user = await User.findOne({ where: { voterId: voterId.trim() } });
  }

  if (user) {
    if (user.voterId) {
      await EmailService.sendRegistrationEmail({
        userId: user.id,
        to: user.email,
        name: user.name,
        voterId: user.voterId,
      });
    } else {
      await EmailService.sendRegistrationAcknowledgementEmail({
        userId: user.id,
        to: user.email,
        name: user.name,
      });
    }
  }

  // Generic response to avoid enumeration
  return res.send({
    success: true,
    message: "If an account matching the provided identifier exists, a registration confirmation email has been sent.",
  });
};
