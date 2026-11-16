import express from "express";

import startController from "../controllers/polls/start";
import fetchController from "../controllers/polls/fetch";
import statusController from "../controllers/polls/status";
import endController from "../controllers/polls/end";
import resetController from "../controllers/polls/reset";
import votesController from "../controllers/polls/votes";
import voteController, { checkVoteability } from "../controllers/polls/vote";
import statsController from "../controllers/polls/stats";
import singleElectionController from "../controllers/polls/single-election";
import {
  getAllTransactions,
  getVoterHistory,
} from "../controllers/polls/transactions";
import exportCsvController from "../controllers/polls/export-csv";
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
router.post("/start", requireAdmin, asyncHandler(startController));
router.post("/end", requireAdmin, asyncHandler(endController));
router.post("/reset", requireAdmin, asyncHandler(resetController));
router.get("/admin/stats", requireAdmin, asyncHandler(statsController));
router.get(
  "/admin/election/:id",
  requireAdmin,
  asyncHandler(singleElectionController)
);
router.get("/admin/transactions", requireAdmin, asyncHandler(getAllTransactions));
router.get("/export-csv", requireAdmin, asyncHandler(exportCsvController));
router.get("/export-csv/:id", requireAdmin, asyncHandler(exportCsvController));

export default router;
