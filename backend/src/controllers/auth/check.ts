import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import { User } from "../../entity/User";

export default async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) return res.status(400).send("not authenticated");

  try {
    const accessTokenSecret =
      process.env.ACCESS_TOKEN_SECRET ||
      "976a66a5bd23b2050019f380c4decbbefdf8ff91cf502c68a3fe1ced91d7448cc54ce6c847657d53294e40889cef5bd996ec5b0fefc1f56270e06990657eeb6e";
    const refreshTokenSecret =
      process.env.REFRESH_TOKEN_SECRET ||
      "5f567afa6406225c4a759daae77e07146eca5df8149353a844fa9ab67fba22780cb4baa5ea508214934531a6f35e67e96f16a0328559111c597856c660f177c2";

    const decoded: any = jwt.verify(refreshToken, refreshTokenSecret);

    const dbUser = await User.findOne({ where: { id: decoded.id } });
    if (!dbUser) return res.status(401).send("User not found");

    const userPlainObj = {
      id: dbUser.id,
      name: dbUser.name,
      citizenshipNumber: dbUser.citizenshipNumber,
      email: dbUser.email,
      admin: Boolean(dbUser.admin),
      verified: Boolean(dbUser.verified),
    };

    const accessToken = jwt.sign(userPlainObj, accessTokenSecret, {
      expiresIn: "1h",
    });

    const newRefreshToken = jwt.sign(userPlainObj, refreshTokenSecret, {
      expiresIn: "7d",
    });

    res.cookie("refreshToken", newRefreshToken, {
      expires: dayjs().add(7, "days").toDate(),
    });

    return res.status(200).send({ user: userPlainObj, accessToken });
  } catch (error) {
    return res.status(400).send(error);
  }
};
