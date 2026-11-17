import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { User, RegistrationStatus } from "../../entity/User";
import { EmailDeliveryLog } from "../../entity/EmailDeliveryLog";

export default async (req: AuthenticatedRequest, res: Response) => {
  const statusParam = req.query.status as string | undefined;
  const searchParam = req.query.search as string | undefined;

  const qb = User.createQueryBuilder("user")
    .where("user.admin = :admin", { admin: false })
    .orderBy("user.registrationSubmittedAt", "ASC");

  if (statusParam && statusParam.toUpperCase() !== "ALL") {
    qb.andWhere("user.registrationStatus = :status", {
      status: statusParam.toUpperCase(),
    });
  }

  if (searchParam && searchParam.trim()) {
    const s = `%${searchParam.trim().toLowerCase()}%`;
    qb.andWhere(
      "(LOWER(user.name) LIKE :s OR LOWER(user.email) LIKE :s OR LOWER(user.citizenshipNumber) LIKE :s OR LOWER(COALESCE(user.voterId, '')) LIKE :s)",
      { s }
    );
  }

  const users = await qb.getMany();

  // Fetch latest email delivery logs for these users
  const userIds = users.map((u) => u.id);
  const emailLogs =
    userIds.length > 0
      ? await EmailDeliveryLog.createQueryBuilder("log")
          .where("log.userId IN (:...userIds)", { userIds })
          .orderBy("log.id", "DESC")
          .getMany()
      : [];

  const logsByUser: Record<number, EmailDeliveryLog> = {};
  for (const log of emailLogs) {
    if (log.userId && !logsByUser[log.userId]) {
      logsByUser[log.userId] = log;
    }
  }

  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const EIGHTEEN_HOURS = 18 * 60 * 60 * 1000;

  let totalPending = 0;
  let totalApproved = 0;
  let totalRejected = 0;
  let approachingDeadline = 0;
  let overdue = 0;

  // Global counts across all non-admin users
  const counts = await User.createQueryBuilder("user")
    .select("user.registrationStatus", "status")
    .addSelect("COUNT(*)", "count")
    .where("user.admin = :admin", { admin: false })
    .groupBy("user.registrationStatus")
    .getRawMany();

  for (const c of counts) {
    if (c.status === RegistrationStatus.PENDING_APPROVAL) {
      totalPending = parseInt(c.count, 10);
    } else if (c.status === RegistrationStatus.APPROVED) {
      totalApproved = parseInt(c.count, 10);
    } else if (c.status === RegistrationStatus.REJECTED) {
      totalRejected = parseInt(c.count, 10);
    }
  }

  // Calculate SLA for each returned user
  const mappedRegistrations = users.map((u) => {
    const submittedAt = u.registrationSubmittedAt
      ? new Date(u.registrationSubmittedAt).getTime()
      : now;
    const deadline = new Date(submittedAt + TWENTY_FOUR_HOURS);
    const elapsedMs = Math.max(0, now - submittedAt);
    const remainingMs = Math.max(0, deadline.getTime() - now);

    let slaStatus: "NORMAL" | "APPROACHING_DEADLINE" | "OVERDUE" = "NORMAL";
    if (u.registrationStatus === RegistrationStatus.PENDING_APPROVAL) {
      if (elapsedMs >= TWENTY_FOUR_HOURS) {
        slaStatus = "OVERDUE";
        overdue += 1;
      } else if (elapsedMs >= EIGHTEEN_HOURS) {
        slaStatus = "APPROACHING_DEADLINE";
        approachingDeadline += 1;
      } else {
        slaStatus = "NORMAL";
      }
    }

    const latestEmail = logsByUser[u.id] || null;

    return {
      id: u.id,
      name: u.name,
      citizenshipNumber: u.citizenshipNumber,
      email: u.email,
      voterId: u.voterId,
      registrationStatus: u.registrationStatus,
      registrationSubmittedAt: u.registrationSubmittedAt,
      registrationReviewedAt: u.registrationReviewedAt,
      reviewedBy: u.reviewedBy,
      rejectionReason: u.rejectionReason,
      verified: u.verified,
      emailVerified: u.emailVerified,
      isActive: u.isActive,
      deadline: deadline.toISOString(),
      hoursElapsed: parseFloat((elapsedMs / (1000 * 60 * 60)).toFixed(1)),
      hoursRemaining: parseFloat((remainingMs / (1000 * 60 * 60)).toFixed(1)),
      slaStatus,
      latestEmailDelivery: latestEmail
        ? {
            id: latestEmail.id,
            emailType: latestEmail.emailType,
            status: latestEmail.status,
            attempts: latestEmail.attempts,
            sentAt: latestEmail.sentAt,
            errorMessage: latestEmail.errorMessage,
          }
        : null,
    };
  });

  const summaryData = {
    totalPending,
    totalApproved,
    totalRejected,
    approachingDeadline,
    overdue,
  };

  return res.send({
    success: true,
    registrations: mappedRegistrations,
    users: mappedRegistrations,
    summary: summaryData,
    slaCounts: summaryData,
  });
};
