import { Response } from "express";
import * as yup from "yup";
import { getConnection } from "typeorm";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User, RegistrationStatus } from "../../entity/User";
import { EmailService } from "../../services/email/EmailService";

const schema = yup.object({
  body: yup.object({
    userId: yup.number().integer().required("User ID is required"),
    reason: yup.string().trim().max(500, "Rejection reason cannot exceed 500 characters").optional(),
  }),
});

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const { userId, reason } = req.body;
  const adminId = req.user?.id;

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let rejectedUser: User;

  try {
    // Acquire pessimistic write lock on the applicant row
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
        .send("Administrator accounts cannot be processed through registration rejection.");
    }

    // Refinement 2: Protect approved registrations from accidental rejection
    if (user.registrationStatus === RegistrationStatus.APPROVED) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send(
          "Cannot reject an already approved voter registration. Use account deactivation to restrict approved voters."
        );
    }

    if (user.registrationStatus === RegistrationStatus.REJECTED) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send("Registration has already been rejected.");
    }

    if (user.registrationStatus !== RegistrationStatus.PENDING_APPROVAL) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send(`Only pending registrations can be rejected. Current status: ${user.registrationStatus}`);
    }

    // Retain voterId as null (do NOT generate or alter voterId)
    user.registrationStatus = RegistrationStatus.REJECTED;
    user.verified = false;
    user.registrationReviewedAt = new Date();
    user.reviewedBy = adminId || null;
    user.rejectionReason = reason ? reason.trim() : null;

    rejectedUser = await queryRunner.manager.save(user);
    await queryRunner.commitTransaction();
  } catch (error: any) {
    await queryRunner.rollbackTransaction();
    console.error("[RejectRegistration] Database transaction error:", error);
    return res
      .status(500)
      .send("An error occurred while rejecting voter registration.");
  } finally {
    await queryRunner.release();
  }

  // Dispatch rejection notification email
  const emailSent = await EmailService.sendRegistrationRejectionEmail({
    userId: rejectedUser.id,
    to: rejectedUser.email,
    name: rejectedUser.name,
    reason: rejectedUser.rejectionReason || undefined,
  });

  return res.send({
    success: true,
    message: "Registration request has been rejected.",
    user: {
      id: rejectedUser.id,
      name: rejectedUser.name,
      email: rejectedUser.email,
      citizenshipNumber: rejectedUser.citizenshipNumber,
      registrationStatus: rejectedUser.registrationStatus,
      registrationReviewedAt: rejectedUser.registrationReviewedAt,
      reviewedBy: rejectedUser.reviewedBy,
      rejectionReason: rejectedUser.rejectionReason,
    },
    emailDelivery: {
      sent: emailSent,
      message: emailSent
        ? "Rejection notification email dispatched successfully."
        : "Registration rejected, but automated notification email delivery failed.",
    },
  });
};
