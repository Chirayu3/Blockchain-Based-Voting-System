import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRouter from "./routers/auth";
import pollsRouter from "./routers/polls";
import usersRouter from "./routers/users";
import biometricsRouter from "./routers/biometrics";
import errorHandler from "./middlewares/errorHandler";

const app = express();

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const allowedOrigins = [
  frontendUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter((url, index, self) => self.indexOf(url) === index);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: origin not allowed"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());
app.use("/auth", authRouter);
app.use("/auth/biometrics", biometricsRouter);
app.use("/polls", pollsRouter);
app.use("/users", usersRouter);

app.get("/", (req: Request, res: Response) => {
  res.status(200).send("Blockchain Voting System API running.");
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
