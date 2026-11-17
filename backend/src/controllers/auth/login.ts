import { Request, Response } from "express";
import * as yup from "yup";
import { User } from "../../entity/User";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";

const schema = yup.object({
  body: yup.object({
    email: yup.string().email().required("Email is required"),
    password: yup.string().required("Password is required"),
    portal: yup.string().oneOf(["admin", "voter"]).optional(),
  }),
});

export default async (req: Request, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const { email, password, portal } = req.body;
  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

  if (!user) {
    return res.status(401).send("Invalid email or password.");
  }

  // Voter redirect instruction: Normal voters must authenticate through Voter ID + OTP flow
  if (portal === "voter" || !user.admin) {
    return res
      .status(403)
      .send("Voters must log in using their Voter ID and email verification code via the Voter Portal.");
  }

  // Administrator privilege check
  if (!user.admin) {
    return res
      .status(403)
      .send("Access denied. Administrator privileges required.");
  }

  if (!user.isActive) {
    return res
      .status(403)
      .send("Account has been deactivated. Please contact the system administrator.");
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).send("Invalid email or password.");
  }

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
    admin: true,
    verified: Boolean(user.verified || user.registrationStatus === "APPROVED"),
    emailVerified: Boolean(user.emailVerified),
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

  return res.send({ user: plainUserObject, accessToken });
};
