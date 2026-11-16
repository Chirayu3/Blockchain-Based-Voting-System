import express from "express";

import startController from "../controllers/polls/start";
import fetchController from "../controllers/polls/fetch";
import statusController from "../controllers/polls/status";
import endController from "../controllers/polls/end";
import resetController from "../controllers/polls/reset";
import votesController from "../controllers/polls/votes";
import voteController, { checkVoteability } from "../controllers/polls/vote";
import statsController from "../controllers/polls/stats";
import {
  getAllTransactions,
  getVoterHistory,
} from "../controllers/polls/transactions";
import exportCsvController from "../controllers/polls/export-csv";
import singleElectionController from "../controllers/polls/single-election";
import {
  authenticateToken,
  requireAdmin,
  requireVerifiedVoter,
} from "../middlewares/auth";
import asyncHandler from "../middlewares/asyncHandler";

const router = express.Router();

// Public / general poll routes
router.get("/", asyncHandler(fetchController));
router.get("/status", asyncHandler(statusController));
router.get("/votes", asyncHandler(votesController));
router.post("/check-voteability", asyncHandler(checkVoteability));

// Voter actions (Requires verified voter)
router.post("/vote", requireVerifiedVoter, asyncHandler(voteController));
router.get("/voter/history", authenticateToken, asyncHandler(getVoterHistory));

// Admin-only routes (Requires admin authorization)
router.post("/start", requireAdmin, startController);
router.post("/end", requireAdmin, endController);
router.post("/reset", requireAdmin, resetController);
router.get("/admin/stats", requireAdmin, statsController);
router.get("/admin/transactions", requireAdmin, getAllTransactions);
router.get("/export-csv", requireAdmin, exportCsvController);
router.get("/export-csv/:id", requireAdmin, exportCsvController);

export default router;
