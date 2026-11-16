import request from "supertest";
import { createConnection, getConnection, Connection, IsNull } from "typeorm";
import app from "../server";
import { User } from "../entity/User";
import { OtpChallenge } from "../entity/OtpChallenge";
import { EmailService } from "../services/email/EmailService";
import { rateLimiter } from "../utils/rateLimiter";
import { hashOtp } from "../utils/otpSecurity";
import { recoverAdminPassword } from "../scripts/adminRecovery";
import bcrypt from "bcrypt";

describe("Voter Registration & Email OTP Authentication Test Suite", () => {
  let connection: Connection;
  let sendRegEmailSpy: jest.SpyInstance;
  let sendOtpEmailSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Connect to database using ormconfig.js
    connection = await createConnection();

    // Mock EmailService to prevent real emails during tests
    sendRegEmailSpy = jest
      .spyOn(EmailService, "sendRegistrationEmail")
      .mockResolvedValue(true);
    sendOtpEmailSpy = jest
      .spyOn(EmailService, "sendOtpEmail")
      .mockResolvedValue(true);
  });

  afterAll(async () => {
    sendRegEmailSpy.mockRestore();
    sendOtpEmailSpy.mockRestore();
    if (connection && connection.isConnected) {
      await connection.close();
    }
  });

  beforeEach(async () => {
    rateLimiter.reset();
    sendRegEmailSpy.mockClear();
    sendOtpEmailSpy.mockClear();
    sendRegEmailSpy.mockResolvedValue(true);
    sendOtpEmailSpy.mockResolvedValue(true);
  });

  // 1. Successful voter registration
  test("1. Successful voter registration: generates Voter ID and dispatches confirmation email", async () => {
    const uniqueEmail = `testvoter_${Date.now()}@example.com`;
    const uniqueCit = `CIT_${Date.now()}`;

    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "Test Voter One",
        email: uniqueEmail,
        citizenshipNumber: uniqueCit,
        password: "Password123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.voterId).toMatch(/^BBVS-\d{4}-\d{6}$/);
    expect(res.body.emailDelivery.sent).toBe(true);

    const dbUser = await User.findOne({ where: { email: uniqueEmail } });
    expect(dbUser).toBeDefined();
    expect(dbUser?.admin).toBe(false);
    expect(dbUser?.verified).toBe(false); // Legacy admin verification
    expect(dbUser?.emailVerified).toBe(false); // Email ownership
    expect(dbUser?.isActive).toBe(true);
    expect(sendRegEmailSpy).toHaveBeenCalledTimes(1);
  });

  // 2. Duplicate email rejection
  test("2. Duplicate email rejection returns 409 Conflict", async () => {
    const existingUser = await User.findOne({ where: { email: "liza@gmail.com" } });
    expect(existingUser).toBeDefined();

    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "Duplicate Email User",
        email: "liza@gmail.com",
        citizenshipNumber: `CIT_${Date.now()}`,
        password: "Password123!",
      });

    expect(res.status).toBe(409);
    expect(res.text).toContain("email address already exists");
  });

  // 3. Duplicate citizenship number rejection
  test("3. Duplicate citizenship / national ID rejection returns 409 Conflict", async () => {
    const existingUser = await User.findOne({ where: { id: 2 } });
    expect(existingUser).toBeDefined();

    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "Duplicate Citizen User",
        email: `unique_${Date.now()}@example.com`,
        citizenshipNumber: existingUser!.citizenshipNumber,
        password: "Password123!",
      });

    expect(res.status).toBe(409);
    expect(res.text).toContain("citizenship / national ID already exists");
  });

  // 4. Collision-safe Voter ID generation format
  test("4. Collision-safe Voter ID matches BBVS-YYYY-###### format", async () => {
    const currentYear = new Date().getFullYear();
    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "Format Test Voter",
        email: `format_${Date.now()}@example.com`,
        citizenshipNumber: `CIT_FMT_${Date.now()}`,
        password: "Password123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.voterId.startsWith(`BBVS-${currentYear}-`)).toBe(true);
    expect(res.body.voterId).toHaveLength(16);
  });

  // 5. SMTP registration failure after account creation
  test("5. Registration survives SMTP failure: user saved and Voter ID returned with non-fatal status", async () => {
    sendRegEmailSpy.mockResolvedValueOnce(false); // Simulate SMTP failure
    const email = `smtp_fail_${Date.now()}@example.com`;

    const res = await request(app)
      .post("/auth/signup")
      .send({
        name: "SMTP Failure User",
        email,
        citizenshipNumber: `CIT_SMTP_${Date.now()}`,
        password: "Password123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.voterId).toBeDefined();
    expect(res.body.emailDelivery.sent).toBe(false);

    // Verify user is persisted in DB despite email failure
    const dbUser = await User.findOne({ where: { email } });
    expect(dbUser).toBeDefined();
    expect(dbUser?.voterId).toBe(res.body.voterId);
  });

  // 6. Resend registration confirmation email
  test("6. Resend registration confirmation email succeeds with rate limiting", async () => {
    const res = await request(app)
      .post("/auth/resend-registration-email")
      .send({ email: "liza@gmail.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sendRegEmailSpy).toHaveBeenCalledTimes(1);
  });

  // 7. Correct Voter ID and password request OTP
  test("7. Correct Voter ID and password returns challengeId and masked email", async () => {
    // Use legacy user Liza (id: 2, voterId: 'BBVS-2026-000002') with original password
    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: "BBVS-2026-000002",
        password: "liza@gmail.com",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.challengeId).toBeDefined();
    expect(res.body.maskedEmail).toMatch(/^l\*{5}a@gmail\.com$/);
    expect(res.body.cooldownSeconds).toBe(60);
    expect(sendOtpEmailSpy).toHaveBeenCalledTimes(1);
  });

  // 8. Incorrect password returns generic 401
  test("8. Incorrect password returns generic 401 Unauthorized", async () => {
    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: "BBVS-2026-000002",
        password: "WrongPassword123!",
      });

    expect(res.status).toBe(401);
    expect(res.text).toBe("Invalid Voter ID or password.");
  });

  // 9. Unknown Voter ID returns generic 401
  test("9. Unknown Voter ID returns generic 401 Unauthorized", async () => {
    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: "BBVS-2026-999999",
        password: "Password$$",
      });

    expect(res.status).toBe(401);
    expect(res.text).toBe("Invalid Voter ID or password.");
  });

  // 10. Deactivated / Inactive account rejection
  test("10. Deactivated account is rejected with 403 Forbidden", async () => {
    // Create an inactive user
    const inactiveUser = new User();
    inactiveUser.name = "Inactive Voter";
    inactiveUser.voterId = `BBVS-2026-${Date.now().toString().slice(-6)}`;
    inactiveUser.email = `inactive_${Date.now()}@example.com`;
    inactiveUser.citizenshipNumber = `CIT_INACT_${Date.now()}`;
    inactiveUser.password = await bcrypt.hash("Password123!", 10);
    inactiveUser.admin = false;
    inactiveUser.verified = false;
    inactiveUser.emailVerified = false;
    inactiveUser.isActive = false; // DEACTIVATED
    await User.save(inactiveUser);

    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: inactiveUser.voterId,
        password: "Password123!",
      });

    expect(res.status).toBe(403);
    expect(res.text).toContain("account has been deactivated");
  });

  // 11. Admin privilege isolation: Admin cannot log in through voter OTP
  test("11. Admin account is isolated: cannot authenticate through voter OTP request", async () => {
    // John is admin (id: 1, voterId: 'BBVS-2026-000001')
    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: "BBVS-2026-000001",
        password: "john@gmail.com",
      });

    expect(res.status).toBe(403);
    expect(res.text).toContain("Administrators must log in through the Admin Portal.");
  });

  // 12. Correct OTP verification succeeds and leaves legacy verified untouched
  test("12. Correct OTP verification marks emailVerified=true and leaves legacy verified untouched", async () => {
    // Create a new voter with verified=false, emailVerified=false
    const voter = new User();
    voter.name = "OTP Verify Voter";
    voter.voterId = `BBVS-2026-${Date.now().toString().slice(-6)}`;
    voter.email = `otp_verify_${Date.now()}@example.com`;
    voter.citizenshipNumber = `CIT_OTP_${Date.now()}`;
    voter.password = await bcrypt.hash("Password123!", 10);
    voter.admin = false;
    voter.verified = false; // Legacy admin verification
    voter.emailVerified = false;
    voter.isActive = true;
    await User.save(voter);

    // Request OTP
    let plainOtpCaptured = "";
    sendOtpEmailSpy.mockImplementationOnce(async (params) => {
      plainOtpCaptured = params.otp;
      return true;
    });

    const otpReq = await request(app)
      .post("/auth/voter/request-otp")
      .send({ voterId: voter.voterId, password: "Password123!" });

    expect(otpReq.status).toBe(200);
    const challengeId = otpReq.body.challengeId;
    expect(plainOtpCaptured).toHaveLength(6);

    // Verify OTP
    const verifyRes = await request(app)
      .post("/auth/voter/verify-otp")
      .send({ challengeId, otp: plainOtpCaptured });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.accessToken).toBeDefined();
    expect(verifyRes.body.user.emailVerified).toBe(true);
    expect(verifyRes.body.user.verified).toBe(false); // Legacy verified must NOT change!
    expect(verifyRes.headers["set-cookie"]).toBeDefined();
    expect(verifyRes.headers["set-cookie"][0]).toContain("HttpOnly");

    // Check challenge consumed in DB
    const challenge = await OtpChallenge.findOne({ where: { challengeId } });
    expect(challenge?.consumedAt).not.toBeNull();
  });

  // 13. Incorrect OTP decrements remaining attempts
  test("13. Incorrect OTP decrements remaining attempts and returns 400", async () => {
    const voter = await User.findOne({ where: { voterId: "BBVS-2026-000002" } });
    const challengeId = crypto.randomUUID();
    const challenge = new OtpChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = voter!.id;
    challenge.otpHash = hashOtp(challengeId, "123456");
    challenge.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    challenge.attempts = 0;
    challenge.consumedAt = null;
    await OtpChallenge.save(challenge);

    const res = await request(app)
      .post("/auth/voter/verify-otp")
      .send({ challengeId, otp: "999999" });

    expect(res.status).toBe(400);
    expect(res.text).toContain("4 attempt(s) remaining");

    const updated = await OtpChallenge.findOne({ where: { challengeId } });
    expect(updated?.attempts).toBe(1);
  });

  // 14. Maximum 5 failed attempts locks challenge
  test("14. Five failed attempts locks the OTP challenge", async () => {
    const voter = await User.findOne({ where: { voterId: "BBVS-2026-000002" } });
    const challengeId = crypto.randomUUID();
    const challenge = new OtpChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = voter!.id;
    challenge.otpHash = hashOtp(challengeId, "123456");
    challenge.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    challenge.attempts = 4; // 4 prior failed attempts
    challenge.consumedAt = null;
    await OtpChallenge.save(challenge);

    const res = await request(app)
      .post("/auth/voter/verify-otp")
      .send({ challengeId, otp: "000000" });

    expect(res.status).toBe(400);
    expect(res.text).toContain("locked");

    const nextAttempt = await request(app)
      .post("/auth/voter/verify-otp")
      .send({ challengeId, otp: "123456" });

    expect(nextAttempt.status).toBe(400);
    expect(nextAttempt.text).toContain("Maximum verification attempts exceeded");
  });

  // 15. Expired OTP rejection
  test("15. Expired OTP returns 400 Bad Request", async () => {
    const voter = await User.findOne({ where: { voterId: "BBVS-2026-000002" } });
    const challengeId = crypto.randomUUID();
    const challenge = new OtpChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = voter!.id;
    challenge.otpHash = hashOtp(challengeId, "123456");
    challenge.expiresAt = new Date(Date.now() - 1000); // EXPIRED
    challenge.attempts = 0;
    challenge.consumedAt = null;
    await OtpChallenge.save(challenge);

    const res = await request(app)
      .post("/auth/voter/verify-otp")
      .send({ challengeId, otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Verification code has expired");
  });

  // 16. Single-use OTP: Reused OTP is rejected
  test("16. Reused OTP is rejected with 400 Bad Request", async () => {
    const voter = await User.findOne({ where: { voterId: "BBVS-2026-000002" } });
    const challengeId = crypto.randomUUID();
    const challenge = new OtpChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = voter!.id;
    challenge.otpHash = hashOtp(challengeId, "123456");
    challenge.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    challenge.attempts = 1;
    challenge.consumedAt = new Date(); // ALREADY CONSUMED
    await OtpChallenge.save(challenge);

    const res = await request(app)
      .post("/auth/voter/verify-otp")
      .send({ challengeId, otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Verification code has already been used");
  });

  // 17. Atomic concurrent OTP verification
  test("17. Atomic concurrent OTP verification: simultaneous requests allow only one success", async () => {
    const voter = await User.findOne({ where: { voterId: "BBVS-2026-000002" } });
    const challengeId = `test-concurrent-${Date.now()}`;
    const otp = "889900";
    const challenge = new OtpChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = voter!.id;
    challenge.otpHash = hashOtp(challengeId, otp);
    challenge.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    challenge.attempts = 0;
    challenge.consumedAt = null;
    await OtpChallenge.save(challenge);

    // Dispatch two simultaneous verification requests
    const [res1, res2] = await Promise.all([
      request(app).post("/auth/voter/verify-otp").send({ challengeId, otp }),
      request(app).post("/auth/voter/verify-otp").send({ challengeId, otp }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 400]); // Exactly one 200 and one 400
  });

  // 18. Resend cooldown enforcement & invalidation of old challenge
  test("18. Resend cooldown (60s) rejects premature requests; successful resend invalidates old OTP", async () => {
    const voter = await User.findOne({ where: { voterId: "BBVS-2026-000002" } });
    const challengeId = `test-cooldown-${Date.now()}`;
    const challenge = new OtpChallenge();
    challenge.challengeId = challengeId;
    challenge.userId = voter!.id;
    challenge.otpHash = hashOtp(challengeId, "111111");
    challenge.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    challenge.attempts = 0;
    challenge.consumedAt = null;
    challenge.createdAt = new Date(); // Created just now
    await OtpChallenge.save(challenge);

    // Immediate resend should be blocked by 60s cooldown
    const prematureResend = await request(app)
      .post("/auth/voter/resend-otp")
      .send({ challengeId });

    expect(prematureResend.status).toBe(429);
    expect(prematureResend.text).toContain("Please wait");

    // Simulate elapsed time by backdating createdAt by 65 seconds
    challenge.createdAt = new Date(Date.now() - 65 * 1000);
    await OtpChallenge.save(challenge);

    let newOtpCaptured = "";
    sendOtpEmailSpy.mockImplementationOnce(async (params) => {
      newOtpCaptured = params.otp;
      return true;
    });

    const validResend = await request(app)
      .post("/auth/voter/resend-otp")
      .send({ challengeId });

    expect(validResend.status).toBe(200);
    expect(validResend.body.success).toBe(true);
    expect(validResend.body.challengeId).not.toBe(challengeId);

    // Old challenge must now be invalidated
    const oldChallenge = await OtpChallenge.findOne({ where: { challengeId } });
    expect(oldChallenge?.consumedAt).not.toBeNull();
  });

  // 19. OTP email delivery failure invalidates challenge
  test("19. OTP delivery failure invalidates the challenge and returns 500", async () => {
    sendOtpEmailSpy.mockResolvedValueOnce(false); // Simulate delivery failure

    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: "BBVS-2026-000002",
        password: "liza@gmail.com",
      });

    expect(res.status).toBe(500);
    expect(res.text).toContain("Failed to deliver verification code");

    // Verify all challenges for this user are consumed / not left active
    const active = await OtpChallenge.findOne({
      where: { userId: 2, consumedAt: IsNull() },
    });
    expect(active).toBeUndefined();
  });

  // 20. Session restoration and logout behavior
  test("20. Session check restores session and logout clears cookie", async () => {
    // Generate valid session by logging in admin
    const adminLogin = await request(app)
      .post("/auth/login")
      .send({
        email: "john@gmail.com",
        password: "john@gmail.com",
        portal: "admin",
      });

    expect(adminLogin.status).toBe(200);
    const cookie = adminLogin.headers["set-cookie"];
    expect(cookie).toBeDefined();

    // /auth/check with cookie
    const checkRes = await request(app)
      .post("/auth/check")
      .set("Cookie", cookie);

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.user.email).toBe("john@gmail.com");
    expect(checkRes.body.accessToken).toBeDefined();

    // /auth/logout
    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Cookie", cookie);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers["set-cookie"][0]).toContain("refreshToken=;");
  });

  // =========================================================================
  // Administrator Authentication & Regression Tests
  // =========================================================================

  // 21. Existing administrator can log in using original email and password
  test("21. Existing administrator can log in using original email and password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "john@gmail.com",
        password: "john@gmail.com",
        portal: "admin",
      });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("john@gmail.com");
    expect(res.body.user.admin).toBe(true);
    expect(res.body.accessToken).toBeDefined();
  });

  // 22. Incorrect administrator password is rejected
  test("22. Incorrect administrator password is rejected", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "john@gmail.com",
        password: "WrongAdminPassword!",
        portal: "admin",
      });

    expect(res.status).toBe(401);
    expect(res.text).toBe("Invalid email or password.");
  });

  // 23. Voter cannot log in through administrator authentication
  test("23. Voter cannot log in through administrator authentication", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "liza@gmail.com",
        password: "liza@gmail.com",
        portal: "admin",
      });

    expect(res.status).toBe(403);
    expect(res.text).toContain("Voters must log in using their Voter ID");
  });

  // 24. Administrator cannot log in through voter OTP authentication
  test("24. Administrator cannot log in through voter OTP authentication", async () => {
    const res = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: "BBVS-2026-000001",
        password: "john@gmail.com",
      });

    expect(res.status).toBe(403);
    expect(res.text).toContain("Administrators must log in through the Admin Portal.");
  });

  // 25. Administrator with emailVerified = false can still use administrator login flow
  test("25. Administrator with emailVerified = false can still use administrator login flow", async () => {
    const admin = await User.findOne({ where: { email: "john@gmail.com" } });
    expect(admin).toBeDefined();
    expect(admin?.emailVerified).toBeFalsy();
    expect(admin?.verified).toBeTruthy(); // Legacy admin verification

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "john@gmail.com",
        password: "john@gmail.com",
        portal: "admin",
      });

    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.user.admin).toBe(true);
  });

  // 26. Inactive administrator is rejected
  test("26. Inactive administrator is rejected", async () => {
    const inactiveAdmin = new User();
    inactiveAdmin.name = "Inactive Admin";
    inactiveAdmin.email = `inactive_admin_${Date.now()}@example.com`;
    inactiveAdmin.citizenshipNumber = `CIT_INACT_ADM_${Date.now()}`;
    inactiveAdmin.voterId = `BBVS-2026-${Date.now().toString().slice(-6)}`;
    inactiveAdmin.password = await bcrypt.hash("AdminPass123!", 10);
    inactiveAdmin.admin = true;
    inactiveAdmin.verified = true;
    inactiveAdmin.emailVerified = false;
    inactiveAdmin.isActive = false; // DEACTIVATED
    await User.save(inactiveAdmin);

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: inactiveAdmin.email,
        password: "AdminPass123!",
        portal: "admin",
      });

    expect(res.status).toBe(403);
    expect(res.text).toContain("Account has been deactivated");
  });

  // 27. Admin JWT and refresh cookie are issued correctly
  test("27. Admin JWT and refresh cookie are issued correctly", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "john@gmail.com",
        password: "john@gmail.com",
        portal: "admin",
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    const rawCookies = res.headers["set-cookie"];
    expect(rawCookies).toBeDefined();
    const cookies: string[] = Array.isArray(rawCookies) ? rawCookies : [rawCookies as string];
    const refreshCookie = cookies.find((c: string) => c.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("SameSite=Lax");
  });

  // 28. Admin session restoration works
  test("28. Admin session restoration works via /auth/check", async () => {
    const loginRes = await request(app)
      .post("/auth/login")
      .send({
        email: "john@gmail.com",
        password: "john@gmail.com",
        portal: "admin",
      });

    const cookie = loginRes.headers["set-cookie"];
    const checkRes = await request(app)
      .post("/auth/check")
      .set("Cookie", cookie);

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.user.email).toBe("john@gmail.com");
    expect(checkRes.body.user.admin).toBe(true);
    expect(checkRes.body.accessToken).toBeDefined();
  });

  // 29. Existing administrator password hash remains unchanged after voter migration
  test("29. Existing administrator password hash remains unchanged after voter migration", async () => {
    const admin = await User.findOne({ where: { email: "john@gmail.com" } });
    expect(admin).toBeDefined();

    // Verify bcrypt comparison with original password
    const match = await bcrypt.compare("john@gmail.com", admin!.password);
    expect(match).toBe(true);

    // Verify hash matches the original pre-migration seed hash
    const originalSeedHash = "$2b$10$6sdkothEwAguhA0FytsGF.gcWPmTDB5hosif6rGX5FFJK8PdBgRHu";
    expect(admin!.password).toBe(originalSeedHash);
  });

  // 30. Voter OTP authentication continues working
  test("30. Voter OTP authentication continues working end-to-end", async () => {
    // Stage 1: Request OTP
    let capturedOtp = "";
    sendOtpEmailSpy.mockImplementationOnce(async (params) => {
      capturedOtp = params.otp;
      return true;
    });

    const reqRes = await request(app)
      .post("/auth/voter/request-otp")
      .send({
        voterId: "BBVS-2026-000002",
        password: "liza@gmail.com",
      });

    expect(reqRes.status).toBe(200);
    expect(reqRes.body.challengeId).toBeDefined();
    expect(capturedOtp).toMatch(/^\d{6}$/);

    // Stage 2: Verify OTP
    const verifyRes = await request(app)
      .post("/auth/voter/verify-otp")
      .send({
        challengeId: reqRes.body.challengeId,
        otp: capturedOtp,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.user.voterId).toBe("BBVS-2026-000002");
    expect(verifyRes.body.accessToken).toBeDefined();
    expect(verifyRes.headers["set-cookie"]).toBeDefined();
  });

  // 31. Controlled administrator password recovery functions securely
  test("31. Controlled administrator password recovery functions securely without corrupting existing accounts", async () => {
    const tempAdmin = new User();
    tempAdmin.name = "Recovery Admin";
    tempAdmin.email = `temp_admin_${Date.now()}@example.com`;
    tempAdmin.citizenshipNumber = `CIT_REC_${Date.now()}`;
    tempAdmin.voterId = `BBVS-2026-${Date.now().toString().slice(-6)}`;
    tempAdmin.password = await bcrypt.hash("OldPass123!", 10);
    tempAdmin.admin = true;
    tempAdmin.verified = true;
    tempAdmin.emailVerified = false;
    tempAdmin.isActive = true;
    await User.save(tempAdmin);

    const result = await recoverAdminPassword(tempAdmin.email, "NewSecurePassword456!");
    expect(result.success).toBe(true);

    const updated = await User.findOne({ where: { id: tempAdmin.id } });
    const matchesNew = await bcrypt.compare("NewSecurePassword456!", updated!.password);
    expect(matchesNew).toBe(true);
    expect(updated?.admin).toBe(true);

    // Verify John's password remains completely untouched
    const john = await User.findOne({ where: { email: "john@gmail.com" } });
    const johnStillOriginal = await bcrypt.compare("john@gmail.com", john!.password);
    expect(johnStillOriginal).toBe(true);
  });
});
