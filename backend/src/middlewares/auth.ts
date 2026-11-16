import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../entity/User";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    name: string;
    email: string;
    admin: boolean;
    verified: boolean;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.split(" ")[1];
  let isRefreshToken = false;

  if (!token && req.cookies && req.cookies.refreshToken) {
    token = req.cookies.refreshToken;
    isRefreshToken = true;
  }

  if (!token) {
    return res.status(401).send("Authentication required");
  }

  try {
    const secret = isRefreshToken
      ? process.env.REFRESH_TOKEN_SECRET || "5f567afa6406225c4a759daae77e07146eca5df8149353a844fa9ab67fba22780cb4baa5ea508214934531a6f35e67e96f16a0328559111c597856c660f177c2"
      : process.env.ACCESS_TOKEN_SECRET || "976a66a5bd23b2050019f380c4decbbefdf8ff91cf502c68a3fe1ced91d7448cc54ce6c847657d53294e40889cef5bd996ec5b0fefc1f56270e06990657eeb6e";

    let decoded: any;
    try {
      decoded = jwt.verify(token, secret);
    } catch (verifyErr) {
      // If access token expired, try refreshToken cookie
      if (!isRefreshToken && req.cookies && req.cookies.refreshToken) {
        const refreshSecret =
          process.env.REFRESH_TOKEN_SECRET ||
          "5f567afa6406225c4a759daae77e07146eca5df8149353a844fa9ab67fba22780cb4baa5ea508214934531a6f35e67e96f16a0328559111c597856c660f177c2";
        decoded = jwt.verify(req.cookies.refreshToken, refreshSecret);
      } else {
        throw verifyErr;
      }
    }

    // Verify user still exists in database and get fresh verified/admin status
    const dbUser = await User.findOne({ where: { id: decoded.id } });
    if (!dbUser) {
      return res.status(401).send("User not found");
    }

    req.user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      admin: Boolean(dbUser.admin),
      verified: Boolean(dbUser.verified),
    };

    next();
  } catch (error) {
    return res.status(401).send("Invalid or expired session");
  }
};

export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  await authenticateToken(req, res, () => {
    if (!req.user || !req.user.admin) {
      return res.status(403).send("Access denied: Administrator privileges required");
    }
    next();
  });
};

export const requireVerifiedVoter = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  await authenticateToken(req, res, () => {
    if (!req.user) {
      return res.status(401).send("Authentication required");
    }
    if (!req.user.verified) {
      return res.status(403).send("Your account is pending administrator verification");
    }
    next();
  });
};
