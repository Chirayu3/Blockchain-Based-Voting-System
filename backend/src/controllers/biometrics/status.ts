import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { BiometricCredential } from "../../entity/BiometricCredential";

export const getBiometricStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user) {
    return res.status(401).send("Authentication required");
  }

  const credential = await BiometricCredential.findOne({
    where: { userId: req.user.id, status: "active" },
  });

  if (!credential) {
    return res.send({
      hasEnrolled: false,
      status: "none",
      enrolledAt: null,
      lastVerifiedAt: null,
    });
  }

  return res.send({
    hasEnrolled: true,
    status: credential.status,
    enrolledAt: credential.enrolledAt,
    lastVerifiedAt: credential.lastVerifiedAt,
    modelIdentifier: credential.modelIdentifier,
    modelVersion: credential.modelVersion,
  });
};

export const deleteBiometrics = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user) {
    return res.status(401).send("Authentication required");
  }

  const credential = await BiometricCredential.findOne({
    where: { userId: req.user.id },
  });

  if (!credential) {
    return res.status(404).send("No biometric profile found to delete.");
  }

  await BiometricCredential.delete({ userId: req.user.id });

  return res.send({
    success: true,
    message: "Biometric profile deleted successfully in compliance with right to erasure.",
  });
};
