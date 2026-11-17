import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import { User } from "../../entity/User";

export default async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) return res.status(401).send("Authentication required");

  try {
    const accessTokenSecret =
      process.env.ACCESS_TOKEN_SECRET ||
      "976a66a5bd23b2050019f380c4decbbefdf8ff91cf502c68a3fe1ced91d7448cc54ce6c847657d53294e40889cef5bd996ec5b0fefc1f56270e06990657eeb6e";
    const refreshTokenSecret =
      process.env.REFRESH_TOKEN_SECRET ||
      "5f567afa6406225c4a759daae77e07146eca5df8149353a844fa9ab67fba22780cb4baa5ea508214934531a6f35e67e96f16a0328559111c597856c660f177c2";

    const decoded: any = jwt.verify(refreshToken, refreshTokenSecret);

    const dbUser = await User.findOne({ where: { id: decoded.id } });
    if (!dbUser) {
      res.clearCookie("refreshToken");
      return res.status(401).send("User account not found");
    }

    if (!dbUser.isActive) {
      res.clearCookie("refreshToken");
      return res.status(403).send("Account deactivated");
    }

    const userPlainObj = {
      id: dbUser.id,
      name: dbUser.name,
      citizenshipNumber: dbUser.citizenshipNumber,
      email: dbUser.email,
      voterId: dbUser.voterId,
      admin: Boolean(dbUser.admin),
      verified: Boolean(dbUser.verified || dbUser.registrationStatus === "APPROVED"),
      emailVerified: Boolean(dbUser.emailVerified),
      isActive: Boolean(dbUser.isActive),
    };

    const accessToken = jwt.sign(userPlainObj, accessTokenSecret, {
      expiresIn: "1h",
    });

    const newRefreshToken = jwt.sign(userPlainObj, refreshTokenSecret, {
      expiresIn: "7d",
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: dayjs().add(7, "days").toDate(),
    });

    return res.status(200).send({ user: userPlainObj, accessToken });
  } catch (error) {
    res.clearCookie("refreshToken");
    return res.status(401).send("Invalid or expired session");
  }
};
