import dotenv from "dotenv";
dotenv.config();

import request from "supertest";
import { createConnection, Connection } from "typeorm";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import app from "../server";
import { User, RegistrationStatus } from "../entity/User";
import { EmailDeliveryLog, EmailDeliveryStatus, EmailType } from "../entity/EmailDeliveryLog";
import { EmailService } from "../services/email/EmailService";
import { rateLimiter } from "../utils/rateLimiter";

describe("Administrator Approval Before Voter ID Generation Test Suite", () => {
  let connection: Connection;
  let sendMailSpy: jest.SpyInstance;
  let adminToken: string;
  let adminUser: User;

  beforeAll(async () => {
    connection = await createConnection();

    // Mock nodemailer transporter sendMail to intercept live SMTP traffic while exercising full outbox log flow
    sendMailSpy = jest
      .spyOn(EmailService.getTransporter(), "sendMail" as any)
      .mockImplementation(async () => ({ messageId: "test-mock-msg-id" } as any));

    // Locate seed admin user (John) without mutating credentials
    const foundAdmin = await User.findOne({ where: { email: "john@gmail.com", admin: true } });
    if (!foundAdmin) {
      throw new Error("Seed admin account (john@gmail.com) not found in test database.");
    }
    adminUser = foundAdmin;

    // Login via real admin endpoint to obtain authenticated admin token with current runtime secret
    const loginRes = await request(app)
      .post("/auth/login")
      .send({
        email: "john@gmail.com",
        password: "john@gmail.com",
        portal: "admin",
      });

    if (loginRes.status !== 200 || !loginRes.body.accessToken) {
      throw new Error(`Admin login failed during test setup: ${loginRes.text}`);
    }
    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    sendMailSpy.mockRestore();
    if (connection && connection.isConnected) {
      await connection.close();
    }
  });

  beforeEach(() => {
    rateLimiter.reset();
    sendMailSpy.mockClear();
    sendMailSpy.mockImplementation(async () => ({ messageId: "test-mock-msg-id" } as any));
  });

  // =========================================================================
  // Section 1: User Registration Lifecycle (Pending Approval, No Voter ID)
  // =========================================================================

  test("1. Voter registration saves user as PENDING_APPROVAL with NULL voterId and sends acknowledgement email", async () => {
    const timestamp = Date.now();
    const email = `voter_approval_${timestamp}@example.com`;
    const cit = `CIT_APP_${timestamp}`;

    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "Approval Candidate",
        email,
        citizenshipNumber: cit,
        password: "Password123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.voterId).toBeUndefined(); // Crucial: NO Voter ID returned at signup
    expect(res.body.registrationStatus).toBe(RegistrationStatus.PENDING_APPROVAL);
    expect(res.body.emailDelivery.sent).toBe(true);

    // Verify in database
    const dbUser = await User.findOne({ where: { email } });
    expect(dbUser).toBeDefined();
    expect(dbUser!.voterId).toBeNull();
    expect(dbUser!.registrationStatus).toBe(RegistrationStatus.PENDING_APPROVAL);
    expect(dbUser!.registrationSubmittedAt).toBeDefined();
    expect(dbUser!.registrationReviewedAt).toBeNull();
    expect(dbUser!.reviewedBy).toBeNull();
    expect(dbUser!.admin).toBe(false);
    expect(dbUser!.isActive).toBe(true);

    // Verify acknowledgement email was dispatched via sendMail
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    expect(sendMailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: email,
        subject: expect.stringContaining("Voter Registration Request Received"),
      })
    );

    // Verify email delivery log was saved in MySQL with SENT status
    const deliveryLog = await EmailDeliveryLog.findOne({
      where: { recipientEmail: email, emailType: EmailType.REGISTRATION_ACKNOWLEDGEMENT },
    });
    expect(deliveryLog).toBeDefined();
    expect(deliveryLog!.status).toBe(EmailDeliveryStatus.SENT);
  });

  test("2. Duplicate email rejection prevents duplicate registration (409 Conflict)", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "Duplicate Voter",
        email: "liza@gmail.com",
        citizenshipNumber: `CIT_DUP_${Date.now()}`,
        password: "Password123!",
      });

    expect(res.status).toBe(409);
    expect(res.text).toContain("email address already exists");
  });

  test("3. Duplicate citizenship / national ID returns 409 Conflict", async () => {
    const existing = await User.findOne({ where: { id: 2 } });
    expect(existing).toBeDefined();

    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "Duplicate Cit Voter",
        email: `cit_dup_${Date.now()}@example.com`,
        citizenshipNumber: existing!.citizenshipNumber,
        password: "Password123!",
      });

    expect(res.status).toBe(409);
    expect(res.text).toContain("citizenship / national ID already exists");
  });

  test("4. Graceful handling of SMTP failure on registration: user persisted and failure logged", async () => {
    sendMailSpy.mockImplementationOnce(async () => {
      throw new Error("SMTP connection timeout");
    }); // Simulate SMTP failure
    const email = `smtp_fail_reg_${Date.now()}@example.com`;

    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "SMTP Failure Candidate",
        email,
        citizenshipNumber: `CIT_SMTP_FAIL_${Date.now()}`,
        password: "Password123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.voterId).toBeUndefined();
    expect(res.body.emailDelivery.sent).toBe(false);

    const dbUser = await User.findOne({ where: { email } });
    expect(dbUser).toBeDefined();
    expect(dbUser!.registrationStatus).toBe(RegistrationStatus.PENDING_APPROVAL);

    // Verify persistent EmailDeliveryLog reflects failure
    const deliveryLog = await EmailDeliveryLog.findOne({
      where: { recipientEmail: email, emailType: EmailType.REGISTRATION_ACKNOWLEDGEMENT },
    });
    expect(deliveryLog).toBeDefined();
    expect(deliveryLog!.status).toBe(EmailDeliveryStatus.FAILED);
  });

  // =========================================================================
  // Section 2: Gatekeeping - Pending & Rejected Users Cannot Log In
  // =========================================================================

  test("5. Pending user cannot request OTP / log in (403 Forbidden)", async () => {
    // Create a pending applicant with known password
    const user = new User();
    user.name = "Pending Login Candidate";
    user.email = `pending_login_${Date.now()}@example.com`;
    user.citizenshipNumber = `CIT_PEND_LOG_${Date.now()}`;
    user.password = await bcrypt.hash("Password123!", 10);
    user.admin = false;
    user.voterId = null; // No voter ID
    user.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    user.registrationSubmittedAt = new Date();
    user.isActive = true;
    await user.save();

    // Since user has no voterId, any attempt with empty/synthetic voterId fails 401
    const resNoId = await request(app)
      .post("/auth/voter/request-otp")
      .send({ voterId: "BBVS-2026-999991", password: "Password123!" });
    expect(resNoId.status).toBe(401);

    // Even if an attacker assigned a synthetic voter ID:
    const syntheticVoterId = `BBVS-2026-${Date.now().toString().slice(-6)}`;
    user.voterId = syntheticVoterId;
    await user.save();

    const resWithId = await request(app)
      .post("/auth/voter/request-otp")
      .send({ voterId: syntheticVoterId, password: "Password123!" });
    expect(resWithId.status).toBe(403);
    expect(resWithId.text).toContain("pending administrator approval");
  });

  test("6. Rejected applicant cannot request OTP / log in (403 Forbidden)", async () => {
    const user = new User();
    user.name = "Rejected Candidate";
    user.email = `rejected_login_${Date.now()}@example.com`;
    user.citizenshipNumber = `CIT_REJ_LOG_${Date.now()}`;
    user.voterId = `BBVS-2026-${Date.now().toString().slice(-6)}`;
    user.password = await bcrypt.hash("Password123!", 10);
    user.admin = false;
    user.registrationStatus = RegistrationStatus.REJECTED;
    user.registrationSubmittedAt = new Date();
    user.registrationReviewedAt = new Date();
    user.isActive = true;
    await user.save();

    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({ voterId: user.voterId, password: "Password123!" });

    expect(res.status).toBe(403);
    expect(res.text).toContain("rejected");
  });

  // =========================================================================
  // Section 3: Admin Dashboard Telemetry & SLA Tracking
  // =========================================================================

  test("7. Unauthenticated or non-admin request to pending-registrations is rejected", async () => {
    const noToken = await request(app).get("/users/pending-registrations");
    expect(noToken.status).toBe(401);

    const secret =
      process.env.ACCESS_TOKEN_SECRET ||
      "148048f54ffc112cc3f42b6c2d991badce5f5b5ad8003819c8753047767052f458bdd4ed63d65ace97c038a4d63a7497f3c0eec98acdb26fa032cab1bcb3e2e6";
    const voterToken = jwt.sign({ id: 2, admin: false }, secret, { expiresIn: "1h" });
    const voterReq = await request(app)
      .get("/users/pending-registrations")
      .set("Authorization", `Bearer ${voterToken}`);
    expect(voterReq.status).toBe(403);
  });

  test("8. Admin can fetch pending registrations with SLA status and deadline tracking", async () => {
    const now = Date.now();

    // User A: Normal (< 18 hours)
    const userNormal = new User();
    userNormal.name = "SLA Normal User";
    userNormal.email = `sla_norm_${now}@example.com`;
    userNormal.citizenshipNumber = `CIT_SLA_N_${now}`;
    userNormal.password = "hash";
    userNormal.admin = false;
    userNormal.voterId = null;
    userNormal.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    userNormal.registrationSubmittedAt = new Date(now - 2 * 60 * 60 * 1000); // 2 hours ago
    userNormal.isActive = true;
    await userNormal.save();

    // User B: Approaching deadline (18-24 hours)
    const userWarning = new User();
    userWarning.name = "SLA Warning User";
    userWarning.email = `sla_warn_${now}@example.com`;
    userWarning.citizenshipNumber = `CIT_SLA_W_${now}`;
    userWarning.password = "hash";
    userWarning.admin = false;
    userWarning.voterId = null;
    userWarning.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    userWarning.registrationSubmittedAt = new Date(now - 20 * 60 * 60 * 1000); // 20 hours ago
    userWarning.isActive = true;
    await userWarning.save();

    // User C: Overdue (> 24 hours)
    const userOverdue = new User();
    userOverdue.name = "SLA Overdue User";
    userOverdue.email = `sla_over_${now}@example.com`;
    userOverdue.citizenshipNumber = `CIT_SLA_O_${now}`;
    userOverdue.password = "hash";
    userOverdue.admin = false;
    userOverdue.voterId = null;
    userOverdue.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    userOverdue.registrationSubmittedAt = new Date(now - 26 * 60 * 60 * 1000); // 26 hours ago
    userOverdue.isActive = true;
    await userOverdue.save();

    const res = await request(app)
      .get("/users/pending-registrations?status=PENDING_APPROVAL")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.users).toBeInstanceOf(Array);
    expect(res.body.slaCounts.overdue).toBeGreaterThanOrEqual(1);
    expect(res.body.slaCounts.approachingDeadline).toBeGreaterThanOrEqual(1);

    const norm = res.body.users.find((u: any) => u.id === userNormal.id);
    expect(norm).toBeDefined();
    expect(norm.slaStatus).toBe("NORMAL");
    expect(norm.hoursRemaining).toBeGreaterThan(18);

    const warn = res.body.users.find((u: any) => u.id === userWarning.id);
    expect(warn).toBeDefined();
    expect(warn.slaStatus).toBe("APPROACHING_DEADLINE");
    expect(warn.hoursRemaining).toBeLessThanOrEqual(6);
    expect(warn.hoursRemaining).toBeGreaterThan(0);

    const over = res.body.users.find((u: any) => u.id === userOverdue.id);
    expect(over).toBeDefined();
    expect(over.slaStatus).toBe("OVERDUE");
    expect(over.hoursRemaining).toBeLessThanOrEqual(0);
  });

  test("9. Search and status filters on pending-registrations endpoint work accurately", async () => {
    const timestamp = Date.now();
    const uniqueTerm = `searchterm_${timestamp}`;

    const user = new User();
    user.name = `FindMe ${uniqueTerm}`;
    user.email = `${uniqueTerm}@domain.com`;
    user.citizenshipNumber = `CIT_${uniqueTerm}`;
    user.password = "hash";
    user.admin = false;
    user.voterId = null;
    user.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    user.registrationSubmittedAt = new Date();
    user.isActive = true;
    await user.save();

    const searchRes = await request(app)
      .get(`/users/pending-registrations?search=${uniqueTerm}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.users).toHaveLength(1);
    expect(searchRes.body.users[0].id).toBe(user.id);
  });

  // =========================================================================
  // Section 4: Approval Workflow & Voter ID Generation
  // =========================================================================

  test("10. Admin approving a pending registration generates permanent Voter ID and dispatches approval email", async () => {
    const timestamp = Date.now();
    const candidate = new User();
    candidate.name = "Approve Me Candidate";
    candidate.email = `approve_target_${timestamp}@example.com`;
    candidate.citizenshipNumber = `CIT_APPR_${timestamp}`;
    candidate.password = await bcrypt.hash("CandidatePass123!", 10);
    candidate.admin = false;
    candidate.voterId = null;
    candidate.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    candidate.registrationSubmittedAt = new Date();
    candidate.isActive = true;
    await candidate.save();

    const res = await request(app)
      .post("/users/approve-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: candidate.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.voterId).toMatch(/^BBVS-\d{4}-\d{6}$/);
    expect(res.body.user.registrationStatus).toBe(RegistrationStatus.APPROVED);
    expect(res.body.emailDelivery.sent).toBe(true);

    const generatedVoterId = res.body.user.voterId;

    // Verify in database
    const dbUser = await User.findOne({ where: { id: candidate.id } });
    expect(dbUser!.voterId).toBe(generatedVoterId);
    expect(dbUser!.registrationStatus).toBe(RegistrationStatus.APPROVED);
    expect(dbUser!.registrationReviewedAt).toBeDefined();
    expect(dbUser!.reviewedBy).toBe(adminUser.id);

    // Verify approval email dispatch via sendMail
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    expect(sendMailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: candidate.email,
        subject: expect.stringContaining("Registration Has Been Approved"),
      })
    );

    // Verify persistent email delivery log
    const emailLog = await EmailDeliveryLog.findOne({
      where: { recipientEmail: candidate.email, emailType: EmailType.REGISTRATION_APPROVAL },
    });
    expect(emailLog).toBeDefined();
    expect(emailLog!.status).toBe(EmailDeliveryStatus.SENT);

    // Approved candidate can now successfully log in via OTP
    const loginRes = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: generatedVoterId,
        password: "CandidatePass123!",
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.challengeId).toBeDefined();
  });

  test("11. Approval idempotency: Repeated approval does not regenerate or overwrite existing Voter ID", async () => {
    const candidate = new User();
    candidate.name = "Idempotent Candidate";
    candidate.email = `idempotent_${Date.now()}@example.com`;
    candidate.citizenshipNumber = `CIT_IDEMP_${Date.now()}`;
    candidate.password = "hash";
    candidate.admin = false;
    candidate.voterId = null;
    candidate.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    candidate.registrationSubmittedAt = new Date();
    candidate.isActive = true;
    await candidate.save();

    // First approval
    const res1 = await request(app)
      .post("/users/approve-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: candidate.id });

    expect(res1.status).toBe(200);
    const initialVoterId = res1.body.user.voterId;

    // Second approval (repeated)
    const res2 = await request(app)
      .post("/users/approve-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: candidate.id });

    expect(res2.status).toBe(200);
    expect(res2.body.user.voterId).toBe(initialVoterId); // Must NOT change!
    expect(res2.body.message).toContain("already approved");

    const finalDb = await User.findOne({ where: { id: candidate.id } });
    expect(finalDb!.voterId).toBe(initialVoterId);
  });

  test("12. Cannot approve an administrator account", async () => {
    const res = await request(app)
      .post("/users/approve-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: adminUser.id });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Administrator accounts cannot be processed");
  });

  // =========================================================================
  // Section 5: Rejection Workflow & Protection (Refinement 2)
  // =========================================================================

  test("13. Admin rejecting a pending registration updates status to REJECTED and dispatches rejection email", async () => {
    const candidate = new User();
    candidate.name = "Reject Target Candidate";
    candidate.email = `reject_target_${Date.now()}@example.com`;
    candidate.citizenshipNumber = `CIT_REJ_T_${Date.now()}`;
    candidate.password = "hash";
    candidate.admin = false;
    candidate.voterId = null;
    candidate.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    candidate.registrationSubmittedAt = new Date();
    candidate.isActive = true;
    await candidate.save();

    const res = await request(app)
      .post("/users/reject-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: candidate.id,
        reason: "Citizenship document unreadable.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbUser = await User.findOne({ where: { id: candidate.id } });
    expect(dbUser!.registrationStatus).toBe(RegistrationStatus.REJECTED);
    expect(dbUser!.voterId).toBeNull(); // No Voter ID generated!
    expect(dbUser!.rejectionReason).toBe("Citizenship document unreadable.");
    expect(dbUser!.reviewedBy).toBe(adminUser.id);
    expect(dbUser!.registrationReviewedAt).toBeDefined();

    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    expect(sendMailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: candidate.email,
        subject: expect.stringContaining("Status Update"),
      })
    );
  });

  test("14. Refinement 2: Rejecting an APPROVED registration is blocked with 400 Bad Request", async () => {
    // Liza is an approved voter
    const liza = await User.findOne({ where: { email: "liza@gmail.com" } });
    expect(liza).toBeDefined();
    expect(liza!.registrationStatus).toBe(RegistrationStatus.APPROVED);

    const res = await request(app)
      .post("/users/reject-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: liza!.id,
        reason: "Accidental rejection attempt.",
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Cannot reject an already approved voter registration");

    // Verify Liza remains APPROVED and retains Voter ID
    const recheckLiza = await User.findOne({ where: { email: "liza@gmail.com" } });
    expect(recheckLiza!.registrationStatus).toBe(RegistrationStatus.APPROVED);
    expect(recheckLiza!.voterId).toBe(liza!.voterId);
  });

  test("15. Rejecting an already REJECTED registration returns 400 Bad Request", async () => {
    const candidate = new User();
    candidate.name = "Double Reject User";
    candidate.email = `double_rej_${Date.now()}@example.com`;
    candidate.citizenshipNumber = `CIT_DREJ_${Date.now()}`;
    candidate.password = "hash";
    candidate.admin = false;
    candidate.voterId = null;
    candidate.registrationStatus = RegistrationStatus.REJECTED;
    candidate.isActive = true;
    await candidate.save();

    const res = await request(app)
      .post("/users/reject-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: candidate.id, reason: "Second attempt" });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Registration has already been rejected");
  });

  // =========================================================================
  // Section 6: Reopen Rejected Application (Refinement 4)
  // =========================================================================

  test("16. Reopening a rejected registration restores PENDING_APPROVAL and resets SLA", async () => {
    const candidate = new User();
    candidate.name = "Reopen Candidate";
    candidate.email = `reopen_${Date.now()}@example.com`;
    candidate.citizenshipNumber = `CIT_REOP_${Date.now()}`;
    candidate.password = "hash";
    candidate.admin = false;
    candidate.voterId = null;
    candidate.registrationStatus = RegistrationStatus.REJECTED;
    candidate.rejectionReason = "Previously missing documents";
    candidate.registrationSubmittedAt = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
    candidate.isActive = true;
    await candidate.save();

    const res = await request(app)
      .post("/users/reopen-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: candidate.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbUser = await User.findOne({ where: { id: candidate.id } });
    expect(dbUser!.registrationStatus).toBe(RegistrationStatus.PENDING_APPROVAL);
    expect(dbUser!.voterId).toBeNull(); // Still NO Voter ID!
    expect(dbUser!.registrationReviewedAt).toBeNull();
    expect(dbUser!.reviewedBy).toBeNull();

    // Verify SLA timer is fresh (< 5 seconds elapsed)
    const elapsedMs = Date.now() - new Date(dbUser!.registrationSubmittedAt!).getTime();
    expect(elapsedMs).toBeLessThan(5000);
  });

  test("17. Reopening a non-rejected registration returns 400 Bad Request", async () => {
    const liza = await User.findOne({ where: { email: "liza@gmail.com" } });
    const res = await request(app)
      .post("/users/reopen-registration")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: liza!.id });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Only rejected applications can be reopened");
  });

  // =========================================================================
  // Section 7: Resend Voter ID Email (Refinement 3)
  // =========================================================================

  test("18. Resend Voter ID email sends approval email using existing Voter ID without regenerating", async () => {
    const liza = await User.findOne({ where: { email: "liza@gmail.com" } });
    const originalVoterId = liza!.voterId;

    const res = await request(app)
      .post("/users/resend-voter-id-email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: liza!.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.voterId).toBe(originalVoterId);

    // Verify email was sent with original Voter ID via sendMail
    expect(sendMailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: liza!.email,
        text: expect.stringContaining(originalVoterId!),
      })
    );

    // Verify DB still has original Voter ID
    const recheck = await User.findOne({ where: { email: "liza@gmail.com" } });
    expect(recheck!.voterId).toBe(originalVoterId);
  });

  test("19. Cannot resend Voter ID email for pending or rejected user", async () => {
    const pendingUser = new User();
    pendingUser.name = "Pending Resend User";
    pendingUser.email = `pend_resend_${Date.now()}@example.com`;
    pendingUser.citizenshipNumber = `CIT_PRES_${Date.now()}`;
    pendingUser.password = "hash";
    pendingUser.admin = false;
    pendingUser.voterId = null;
    pendingUser.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    pendingUser.isActive = true;
    await pendingUser.save();

    const res = await request(app)
      .post("/users/resend-voter-id-email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: pendingUser.id });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Cannot resend Voter ID");
  });

  // =========================================================================
  // Section 8: Concurrency & Race Condition Safety
  // =========================================================================

  test("20. Concurrent approvals for the same applicant serialize safely without duplicate IDs", async () => {
    const candidate = new User();
    candidate.name = "Concurrent Candidate";
    candidate.email = `concurrent_appr_${Date.now()}@example.com`;
    candidate.citizenshipNumber = `CIT_CONCUR_${Date.now()}`;
    candidate.password = "hash";
    candidate.admin = false;
    candidate.voterId = null;
    candidate.registrationStatus = RegistrationStatus.PENDING_APPROVAL;
    candidate.registrationSubmittedAt = new Date();
    candidate.isActive = true;
    await candidate.save();

    // Fire 2 simultaneous approval requests
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/users/approve-registration")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: candidate.id }),
      request(app)
        .post("/users/approve-registration")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: candidate.id }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Both must agree on the exact same Voter ID
    expect(res1.body.user.voterId).toBe(res2.body.user.voterId);

    const finalUser = await User.findOne({ where: { id: candidate.id } });
    expect(finalUser!.voterId).toBe(res1.body.user.voterId);
    expect(finalUser!.registrationStatus).toBe(RegistrationStatus.APPROVED);
  });

  // =========================================================================
  // Section 9: Legacy Account Preservation & System Integrity
  // =========================================================================

  test("21. Legacy Voter ID and seed admin credentials remain intact", async () => {
    // Verify Liza (legacy voter)
    const liza = await User.findOne({ where: { email: "liza@gmail.com" } });
    expect(liza).toBeDefined();
    expect(liza!.voterId).toBe("BBVS-2026-000002");
    expect(liza!.registrationStatus).toBe(RegistrationStatus.APPROVED);

    // Verify John (seed administrator)
    const john = await User.findOne({ where: { email: "john@gmail.com" } });
    expect(john).toBeDefined();
    expect(john!.admin).toBe(true);
    expect(john!.voterId).toBe("BBVS-2026-000001");
    // Original seed hash: $2b$10$6sdkothEwAguhA0FytsGF.gcWPmTDB5hosif6rGX5FFJK8PdBgRHu
    const match = await bcrypt.compare("john@gmail.com", john!.password);
    expect(match).toBe(true);
  });
});
