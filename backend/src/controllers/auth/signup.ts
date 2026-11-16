import { Request, Response } from "express";
import * as yup from "yup";
import { User, RegistrationStatus } from "../../entity/User";
import bcrypt from "bcrypt";
import { EmailService } from "../../services/email/EmailService";

const schema = yup.object({
  body: yup.object({
    name: yup
      .string()
      .trim()
      .min(3, "Name must be at least 3 characters")
      .required("Name is required"),
    email: yup
      .string()
      .trim()
      .email("Invalid email format")
      .required("Email is required"),
    password: yup
      .string()
      .min(6, "Password must be at least 6 characters")
      .required("Password is required"),
    citizenshipNumber: yup
      .string()
      .trim()
      .min(4, "Citizenship number must be at least 4 characters")
      .required("Citizenship number is required"),
  }),
});

export default async (req: Request, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const { name, email, password, citizenshipNumber } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  // Check for duplicate email
  const existingEmail = await User.findOne({ where: { email: normalizedEmail } });
  if (existingEmail) {
    return res
      .status(409)
      .send("An account with this email address already exists.");
  }

  // Check for duplicate citizenship number
  const existingCitizen = await User.findOne({
    where: { citizenshipNumber: citizenshipNumber.trim() },
  });
  if (existingCitizen) {
    return res
      .status(409)
      .send("An account with this citizenship / national ID already exists.");
  }

  let hashedPassword: string;
  try {
    hashedPassword = await bcrypt.hash(password, 10);
  } catch (error) {
    return res.status(500).send("Error securing password.");
  }

  let savedUser: User;
  try {
    const user = new User();
    user.voterId = null; // No Voter ID generated at registration stage
    user.name = name.trim();
    user.email = normalizedEmail;
    user.password = hashedPassword;
    user.citizenshipNumber = citizenshipNumber.trim();
    user.admin = false;
    user.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    user.registrationSubmittedAt = new Date();
    user.registrationReviewedAt = null;
    user.reviewedBy = null;
    user.rejectionReason = null;
    user.verified = false; // Legacy administrator approval
    user.emailVerified = false; // Email ownership verified via OTP
    user.isActive = true;

    savedUser = await user.save();
  } catch (error: any) {
    console.error("[Signup] Error saving pending registration user:", error);
    return res
      .status(500)
      .send("Failed to complete voter registration. Please try again.");
  }

  // Attempt to dispatch registration acknowledgement email (NO Voter ID included)
  const emailSent = await EmailService.sendRegistrationAcknowledgementEmail({
    userId: savedUser.id,
    to: savedUser.email,
    name: savedUser.name,
  });

  return res.status(201).send({
    success: true,
    message:
      "Registration request submitted successfully. Administrator verification is pending.",
    registrationStatus: savedUser.registrationStatus,
    name: savedUser.name,
    email: savedUser.email,
    emailDelivery: {
      sent: emailSent,
      message: emailSent
        ? "Acknowledgement email delivered. Our administrator will review your application within 24 hours."
        : "Registration request recorded, but acknowledgement email delivery failed. Your application is still pending administrator review.",
    },
  });
};
