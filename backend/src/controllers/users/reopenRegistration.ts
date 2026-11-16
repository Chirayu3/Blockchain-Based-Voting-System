import { Response } from "express";
import * as yup from "yup";
import { getConnection } from "typeorm";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User, RegistrationStatus } from "../../entity/User";
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

  const connection = getConnection();
  const queryRunner = connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let reopenedUser: User;

  try {
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
      return res.status(400).send("Administrator accounts cannot be reopened.");
    }

    if (user.registrationStatus !== RegistrationStatus.REJECTED) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send(
          `Only rejected applications can be reopened. Current status: ${user.registrationStatus}`
        );
    }

    // Reopen application back to PENDING_APPROVAL
    user.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    user.registrationSubmittedAt = new Date(); // Start fresh 24h SLA review window
    user.registrationReviewedAt = null;
    user.reviewedBy = null;
    user.rejectionReason = null;
    user.voterId = null; // Explicitly enforce that no Voter ID exists

    reopenedUser = await queryRunner.manager.save(user);
    await queryRunner.commitTransaction();
  } catch (error: any) {
    await queryRunner.rollbackTransaction();
    console.error("[ReopenRegistration] Database transaction error:", error);
    return res
      .status(500)
      .send("An error occurred while reopening registration application.");
  } finally {
    await queryRunner.release();
  }

  // Dispatch fresh acknowledgement email
  const emailSent = await EmailService.sendRegistrationAcknowledgementEmail({
    userId: reopenedUser.id,
    to: reopenedUser.email,
    name: reopenedUser.name,
  });

  return res.send({
    success: true,
    message:
      "Registration reopened. Application restored to Pending Approval status.",
    user: {
      id: reopenedUser.id,
      name: reopenedUser.name,
      email: reopenedUser.email,
      citizenshipNumber: reopenedUser.citizenshipNumber,
      registrationStatus: reopenedUser.registrationStatus,
      registrationSubmittedAt: reopenedUser.registrationSubmittedAt,
    },
    emailDelivery: {
      sent: emailSent,
      message: emailSent
        ? "Reconsideration acknowledgement email delivered."
        : "Application reopened, but acknowledgement email delivery failed.",
    },
  });
};

