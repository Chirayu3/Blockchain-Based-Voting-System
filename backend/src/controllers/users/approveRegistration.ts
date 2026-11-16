import { Response } from "express";
import * as yup from "yup";
import { getConnection } from "typeorm";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User, RegistrationStatus } from "../../entity/User";
import { generateUniqueVoterId } from "../../utils/voterId";
import { EmailService } from "../../services/email/EmailService";

const schema = yup.object({
  body: yup.object({
    userId: yup.number().integer().required("User ID is required"),
  }),
});

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const { userId } = req.body;
  const adminId = req.user?.id;

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let approvedUser: User;
  let assignedVoterId: string;
  let wasAlreadyApproved = false;

  try {
    // Acquire pessimistic write lock on the target user row to serialize approvals
    const user = await queryRunner.manager
      .createQueryBuilder(User, "user")
      .setLock("pessimistic_write")
      .where("user.id = :userId", { userId })
      .getOne();

    if (!user) {
      await queryRunner.rollbackTransaction();
      return res.status(404).send("Registration applicant not found.");
    }

    if (user.admin) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send("Administrator accounts cannot be processed through voter registration approval.");
    }

    // Idempotency check: If user is already approved and has a Voter ID, do NOT regenerate
    if (user.registrationStatus === RegistrationStatus.APPROVED && user.voterId) {
      wasAlreadyApproved = true;
      assignedVoterId = user.voterId;
      approvedUser = user;
      await queryRunner.commitTransaction();
    } else {
      // Validate that status is PENDING_APPROVAL
      if (user.registrationStatus === RegistrationStatus.REJECTED) {
        await queryRunner.rollbackTransaction();
        return res
          .status(400)
          .send("Cannot approve a rejected registration. Reopen the application before approving.");
      }

      if (user.registrationStatus !== RegistrationStatus.PENDING_APPROVAL) {
        await queryRunner.rollbackTransaction();
        return res
          .status(400)
          .send(`Cannot approve registration with status: ${user.registrationStatus}`);
      }

      // Generate a collision-safe, permanent Voter ID
      assignedVoterId = await generateUniqueVoterId();

      user.voterId = assignedVoterId;
      user.registrationStatus = RegistrationStatus.APPROVED;
      user.registrationReviewedAt = new Date();
      user.reviewedBy = adminId || null;
      user.rejectionReason = null;

      approvedUser = await queryRunner.manager.save(user);
      await queryRunner.commitTransaction();
    }
  } catch (error: any) {
    await queryRunner.rollbackTransaction();
    console.error("[ApproveRegistration] Database transaction error:", error);
    return res
      .status(500)
      .send("An error occurred while approving voter registration.");
  } finally {
    await queryRunner.release();
  }

  // Dispatch approval email with permanent Voter ID
  const emailSent = await EmailService.sendRegistrationApprovalEmail({
    userId: approvedUser.id,
    to: approvedUser.email,
    name: approvedUser.name,
    voterId: assignedVoterId,
  });

  return res.send({
    success: true,
    message: wasAlreadyApproved
      ? "User is already approved. Voter ID retained."
      : "Registration approved successfully. Permanent Voter ID generated.",
    user: {
      id: approvedUser.id,
      name: approvedUser.name,
      email: approvedUser.email,
      citizenshipNumber: approvedUser.citizenshipNumber,
      voterId: assignedVoterId,
      registrationStatus: approvedUser.registrationStatus,
      registrationReviewedAt: approvedUser.registrationReviewedAt,
      reviewedBy: approvedUser.reviewedBy,
    },
    emailDelivery: {
      sent: emailSent,
      message: emailSent
        ? "Voter ID approval email dispatched successfully."
        : "Voter approved and Voter ID assigned, but email dispatch failed. You may retry delivery using Resend Voter ID Email.",
    },
  });
};
