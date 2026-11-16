import { Router } from "express";
import {
  requestEnrollmentChallenge,
  verifyEnrollment,
} from "../controllers/biometrics/enrollment";
import {
  getBiometricStatus,
  deleteBiometrics,
} from "../controllers/biometrics/status";
import { authenticateToken } from "../middlewares/auth";
import asyncHandler from "../middlewares/asyncHandler";

const router = Router();

// Biometric enrollment routes (requires authenticated session)
router.post(
  "/enrollment/challenge",
  authenticateToken,
  asyncHandler(requestEnrollmentChallenge)
);

router.post(
  "/enrollment/verify",
  authenticateToken,
  asyncHandler(verifyEnrollment)
);

// Biometric status and data deletion (right to erasure)
router.get("/status", authenticateToken, asyncHandler(getBiometricStatus));
router.delete("/", authenticateToken, asyncHandler(deleteBiometrics));

export default router;
