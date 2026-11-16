import { Router } from "express";
import notVerifiedController from "../controllers/users/not-verified";
import verifyController from "../controllers/users/verify";
import deleteController from "../controllers/users/delete";
import pendingRegistrationsController from "../controllers/users/pendingRegistrations";
import approveRegistrationController from "../controllers/users/approveRegistration";
import rejectRegistrationController from "../controllers/users/rejectRegistration";
import reopenRegistrationController from "../controllers/users/reopenRegistration";
import resendVoterIdEmailController from "../controllers/users/resendVoterIdEmail";
import { requireAdmin } from "../middlewares/auth";
import asyncHandler from "../middlewares/asyncHandler";

const router = Router();

// Registration approval workflow routes (Admin-only)
router.get(
  "/pending-registrations",
  requireAdmin,
  asyncHandler(pendingRegistrationsController)
);
router.post(
  "/approve-registration",
  requireAdmin,
  asyncHandler(approveRegistrationController)
);
router.post(
  "/reject-registration",
  requireAdmin,
  asyncHandler(rejectRegistrationController)
);
router.post(
  "/reopen-registration",
  requireAdmin,
  asyncHandler(reopenRegistrationController)
);
router.post(
  "/resend-voter-id-email",
  requireAdmin,
  asyncHandler(resendVoterIdEmailController)
);

// Legacy verification & management routes
router.get("/all", requireAdmin, asyncHandler(notVerifiedController));
router.post("/verify", requireAdmin, asyncHandler(verifyController));
router.delete("/delete/:id", requireAdmin, asyncHandler(deleteController));

export default router;
