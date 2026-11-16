import { Router } from "express";
import loginController from "../controllers/auth/login";
import checkController from "../controllers/auth/check";
import logoutController from "../controllers/auth/logout";
import signupController from "../controllers/auth/signup";
import resendRegistrationEmailController from "../controllers/auth/resendRegistrationEmail";
import requestOtpController from "../controllers/auth/voter/requestOtp";
import verifyOtpController from "../controllers/auth/voter/verifyOtp";
import resendOtpController from "../controllers/auth/voter/resendOtp";

const router = Router();

// Registration routes
router.post("/signup", signupController);
router.post("/resend-registration-email", resendRegistrationEmailController);

// Voter two-stage OTP authentication routes
router.post("/voter/request-otp", requestOtpController);
router.post("/voter/verify-otp", verifyOtpController);
router.post("/voter/resend-otp", resendOtpController);

// Session & Admin login routes
router.post("/login", loginController);
router.post("/check", checkController);
router.post("/logout", logoutController);

export default router;
