import { Request, Response } from "express";
import * as yup from "yup";
import { User } from "../../entity/User";
import bcrypt from "bcrypt";
import { saveUserWithRetry } from "../../utils/voterId";
import { EmailService } from "../../services/email/EmailService";

const schema = yup.object({
  body: yup.object({
    name: yup.string().trim().min(3, "Name must be at least 3 characters").required("Name is required"),
    email: yup.string().trim().email("Invalid email format").required("Email is required"),
    password: yup.string().min(6, "Password must be at least 6 characters").required("Password is required"),
    citizenshipNumber: yup.string().trim().min(4, "Citizenship number must be at least 4 characters").required("Citizenship number is required"),
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
    return res.status(409).send("An account with this email address already exists.");
  }

  // Check for duplicate citizenship number
  const existingCitizen = await User.findOne({ where: { citizenshipNumber } });
  if (existingCitizen) {
    return res.status(409).send("An account with this citizenship / national ID already exists.");
  }

  let hashedPassword: string;
  try {
    hashedPassword = await bcrypt.hash(password, 10);
  } catch (error) {
    return res.status(500).send("Error securing password.");
  }

  let savedUser: User;
  try {
    savedUser = await saveUserWithRetry((voterId) => {
      const u = new User();
      u.voterId = voterId;
      u.name = name.trim();
      u.email = normalizedEmail;
      u.password = hashedPassword;
      u.citizenshipNumber = citizenshipNumber.trim();
      u.admin = false;
      u.verified = false; // Legacy administrator approval
      u.emailVerified = false; // Email ownership verified via OTP
      u.isActive = true;
      return u;
    });
  } catch (error: any) {
    return res.status(500).send("Failed to complete voter registration. Please try again.");
  }

  // Attempt to dispatch registration email with Voter ID
  const emailSent = await EmailService.sendRegistrationEmail({
    to: savedUser.email,
    name: savedUser.name,
    voterId: savedUser.voterId,
  });

  return res.status(201).send({
    success: true,
    message: "Registration successful. Please save your Voter ID.",
    voterId: savedUser.voterId,
    name: savedUser.name,
    email: savedUser.email,
    emailDelivery: {
      sent: emailSent,
      message: emailSent
        ? "Confirmation email delivered with your Voter ID."
        : "Voter account created, but email delivery failed. Please record your Voter ID safely.",
    },
  });
};
