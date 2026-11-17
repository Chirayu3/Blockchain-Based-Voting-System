import { Response } from "express";
import * as yup from "yup";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User, RegistrationStatus } from "../../entity/User";
import { EmailService } from "../../services/email/EmailService";
import { rateLimiter } from "../../utils/rateLimiter";

const schema = yup.object({
  body: yup.object({
    userId: yup.number().integer().required("User ID is required"),
  }),
});

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const { userId } = req.body;
  const adminId = req.user?.id || "admin";

  // Admin rate limiting (max 10 resend requests per minute per admin)
  const rateCheck = rateLimiter.checkLimit(`admin:resend_voter_id:${adminId}`, 10, 60);
  if (rateCheck.limited) {
    return res
      .status(429)
      .send(`Too many email resend requests. Please wait ${rateCheck.retryAfterSeconds} seconds.`);
  }

  const user = await User.findOne({ where: { id: userId } });
  if (!user) {
    return res.status(404).send("User account not found.");
  }

  if (user.admin) {
    return res
      .status(400)
      .send("Administrator accounts do not have voter IDs to resend.");
  }

  if (user.registrationStatus !== RegistrationStatus.APPROVED || !user.voterId) {
    return res
      .status(400)
      .send("Cannot resend Voter ID: User registration has not been approved or has no Voter ID assigned.");
  }

  rateLimiter.hit(`admin:resend_voter_id:${adminId}`);

  // Dispatch email using strictly existing Voter ID without regenerating
  const emailSent = await EmailService.sendRegistrationApprovalEmail({
    userId: user.id,
    to: user.email,
    name: user.name,
    voterId: user.voterId,
  });

  return res.send({
    success: true,
    message: emailSent
      ? "Voter ID email dispatched successfully."
      : "Failed to dispatch Voter ID email via SMTP. Please check server logs and email configuration.",
    voterId: user.voterId,
    emailDelivery: {
      sent: emailSent,
      message: emailSent
        ? "Delivered to registered email address."
        : "SMTP dispatch failed.",
    },
  });
};
