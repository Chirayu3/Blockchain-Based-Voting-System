import { Router } from "express";
import notVerifiedController from "../controllers/users/not-verified";
import verifyController from "../controllers/users/verify";
import deleteController from "../controllers/users/delete";
import { requireAdmin } from "../middlewares/auth";
import asyncHandler from "../middlewares/asyncHandler";

const router = Router();

router.get("/all", requireAdmin, asyncHandler(notVerifiedController));
router.post("/verify", requireAdmin, asyncHandler(verifyController));
router.delete("/delete/:id", requireAdmin, asyncHandler(deleteController));

export default router;
