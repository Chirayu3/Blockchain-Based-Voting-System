import "dotenv/config";
import request from "supertest";
import { createConnection, Connection } from "typeorm";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import app from "../server";
import { User } from "../entity/User";
import { Poll } from "../entity/Poll";
import { Candidate } from "../entity/Candidate";
import { Transaction } from "../entity/Transaction";
import { BiometricCredential } from "../entity/BiometricCredential";
import { BiometricChallenge } from "../entity/BiometricChallenge";
import { VotingAuthorization } from "../entity/VotingAuthorization";
import { BiometricClient } from "../services/biometric/BiometricClient";
import {
  encryptEmbedding,
  decryptEmbedding,
  generateAuthorizationToken,
  hashToken,
} from "../utils/biometricCrypto";
import ElectionContract, { web3 } from "../web3";

describe("Biometric Facial Registration & Blockchain Voting Authentication Test Suite", () => {
  let connection: Connection;
  const accessTokenSecret =
    process.env.ACCESS_TOKEN_SECRET ||
    "976a66a5bd23b2050019f380c4decbbefdf8ff91cf502c68a3fe1ced91d7448cc54ce6c847657d53294e40889cef5bd996ec5b0fefc1f56270e06990657eeb6e";

  let adminUser: User;
  let adminToken: string;
  let approvedVoter: User;
  let approvedVoterToken: string;
  let unapprovedVoter: User;
  let unapprovedVoterToken: string;
  let runningPoll: Poll;

  // Mock synthetic 128-d face embedding
  const mockEnrolledEmbedding = new Array(128).fill(0).map((_, i) => (i === 0 ? 1.0 : 0.0));
  const mockGenuineEmbedding = new Array(128).fill(0).map((_, i) => (i === 0 ? 0.98 : 0.02));
  const mockImpostorEmbedding = new Array(128).fill(0).map((_, i) => (i === 1 ? 1.0 : 0.0));

  beforeAll(async () => {
    connection = await createConnection();

    // 1. Setup Admin
    adminUser = new User();
    adminUser.voterId = `ADMIN-${Date.now()}`;
    adminUser.name = "Biometric Admin";
    adminUser.email = `admin_bio_${Date.now()}@example.com`;
    adminUser.password = "hashed_pass";
    adminUser.citizenshipNumber = `CIT_ADM_${Date.now()}`;
    adminUser.admin = true;
    adminUser.verified = true;
    adminUser.emailVerified = true;
    adminUser.isActive = true;
    await adminUser.save();

    adminToken = jwt.sign(
      { id: adminUser.id, voterId: adminUser.voterId, admin: true, email: adminUser.email },
      accessTokenSecret,
      { expiresIn: "1h" }
    );

    // 2. Setup Approved Voter (verified = true, emailVerified = true, isActive = true)
    approvedVoter = new User();
    approvedVoter.voterId = `VOTER-APP-${Date.now()}`;
    approvedVoter.name = "Approved Electorate";
    approvedVoter.email = `voter_app_${Date.now()}@example.com`;
    approvedVoter.password = "hashed_pass";
    approvedVoter.citizenshipNumber = `CIT_APP_${Date.now()}`;
    approvedVoter.admin = false;
    approvedVoter.verified = true;
    approvedVoter.emailVerified = true;
    approvedVoter.isActive = true;
    await approvedVoter.save();

    approvedVoterToken = jwt.sign(
      { id: approvedVoter.id, voterId: approvedVoter.voterId, admin: false, email: approvedVoter.email },
      accessTokenSecret,
      { expiresIn: "1h" }
    );

    // 3. Setup Unapproved Voter (verified = false)
    unapprovedVoter = new User();
    unapprovedVoter.voterId = `VOTER-UNAPP-${Date.now()}`;
    unapprovedVoter.name = "Unapproved Voter";
    unapprovedVoter.email = `voter_unapp_${Date.now()}@example.com`;
    unapprovedVoter.password = "hashed_pass";
    unapprovedVoter.citizenshipNumber = `CIT_UNAPP_${Date.now()}`;
    unapprovedVoter.admin = false;
    unapprovedVoter.verified = false;
    unapprovedVoter.emailVerified = true;
    unapprovedVoter.isActive = true;
    await unapprovedVoter.save();

    unapprovedVoterToken = jwt.sign(
      { id: unapprovedVoter.id, voterId: unapprovedVoter.voterId, admin: false, email: unapprovedVoter.email },
      accessTokenSecret,
      { expiresIn: "1h" }
    );

    // Reset smart contract and set up active poll on Ganache
    try {
      const instance = await ElectionContract.deployed();
      const accounts = await web3.eth.getAccounts();
      const st = await instance.getStatus();
      if (st === "running") {
        await instance.endElection({ from: accounts[0] });
        await instance.resetElection({ from: accounts[0] });
      } else if (st === "finished") {
        await instance.resetElection({ from: accounts[0] });
      }

      await instance.setElectionDetails("Biometric General Election", "Election with Biometric Gates", {
        from: accounts[0],
      });
      await instance.addCandidate("Dr. Alice Smith", "Tech Party", { from: accounts[0] });
      await instance.addCandidate("Bob Jones", "Public Voice", { from: accounts[0] });

      runningPoll = new Poll();
      runningPoll.name = "Biometric General Election";
      runningPoll.description = "Election with Biometric Gates";
      runningPoll.status = "running";
      await runningPoll.save();

      const c1 = new Candidate();
      c1.name = "Dr. Alice Smith";
      c1.info = "Tech Party";
      c1.poll = runningPoll;
      await c1.save();

      const c2 = new Candidate();
      c2.name = "Bob Jones";
      c2.info = "Public Voice";
      c2.poll = runningPoll;
      await c2.save();
    } catch (e: any) {
      console.warn("Smart contract init warning in biometrics test:", e.message);
    }
  });

  afterAll(async () => {
    if (connection && connection.isConnected) {
      await connection.close();
    }
  });

  // 1. Enrollment Prerequisite: Admin Approval is strictly required
  test("1. Enrollment rejected if voter has not received administrator approval (verified = false)", async () => {
    const res = await request(app)
      .post("/auth/biometrics/enrollment/challenge")
      .set("Authorization", `Bearer ${unapprovedVoterToken}`);

    expect(res.status).toBe(403);
    expect(res.text).toContain("Administrator identity approval is required");
  });

  // 2. Enrollment challenge generation for approved voter
  let activeEnrollChallengeId = "";
  test("2. Successful enrollment challenge generation for approved voter with active instructions", async () => {
    const res = await request(app)
      .post("/auth/biometrics/enrollment/challenge")
      .set("Authorization", `Bearer ${approvedVoterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.challengeId).toBeDefined();
    expect(res.body.instructions).toBeInstanceOf(Array);
    expect(res.body.instructions.length).toBeGreaterThanOrEqual(2);
    expect(res.body.ttlSeconds).toBe(120);

    activeEnrollChallengeId = res.body.challengeId;

    const chal = await BiometricChallenge.findOne({
      where: { challengeId: activeEnrollChallengeId },
    });
    expect(chal).toBeDefined();
    expect(chal?.userId).toBe(approvedVoter.id);
    expect(chal?.challengeType).toBe("enrollment");
  });

  // 3. Biometric quality / Liveness failure rejection
  test("3. Enrollment verification rejects presentation attack / liveness failure", async () => {
    jest.spyOn(BiometricClient, "verifyLiveness").mockResolvedValueOnce({
      is_live: false,
      pad_score: 0.12,
      error: "Passive presentation attack detected: digital screen replay rejected.",
    });

    const res = await request(app)
      .post("/auth/biometrics/enrollment/verify")
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        challengeId: activeEnrollChallengeId,
        frames: ["data:image/jpeg;base64,mock1", "data:image/jpeg;base64,mock2"],
        consentGiven: true,
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain("presentation attack detected");
  });

  // 4. Successful face enrollment with AES-256-GCM template encryption
  test("4. Successful face enrollment: extracts template, encrypts via AES-256-GCM, saves credential", async () => {
    // Generate fresh challenge
    const chalRes = await request(app)
      .post("/auth/biometrics/enrollment/challenge")
      .set("Authorization", `Bearer ${approvedVoterToken}`);

    const freshChalId = chalRes.body.challengeId;

    jest.spyOn(BiometricClient, "verifyLiveness").mockResolvedValueOnce({
      is_live: true,
      pad_score: 0.94,
      message: "Liveness and PAD verified",
    });

    jest.spyOn(BiometricClient, "extractEmbedding").mockResolvedValueOnce({
      success: true,
      embedding: mockEnrolledEmbedding,
      modelIdentifier: "sface-opencv-2021dec",
      modelVersion: "2021dec",
      embeddingDimension: 128,
    });

    const res = await request(app)
      .post("/auth/biometrics/enrollment/verify")
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        challengeId: freshChalId,
        frames: ["data:image/jpeg;base64,mockframe1", "data:image/jpeg;base64,mockframe2"],
        consentGiven: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify stored credential in MySQL
    const credential = await BiometricCredential.findOne({
      where: { userId: approvedVoter.id },
    });
    expect(credential).toBeDefined();
    expect(credential?.status).toBe("active");
    expect(credential?.modelIdentifier).toBe("sface-opencv-2021dec");
    expect(credential?.embeddingDimension).toBe(128);

    // Verify template is NOT plaintext and can be decrypted with AES-256-GCM
    expect(credential?.encryptedEmbedding).toContain(":");
    const decrypted = decryptEmbedding(credential!.encryptedEmbedding);
    expect(decrypted).toHaveLength(128);
    expect(decrypted[0]).toBeCloseTo(1.0);
  });

  // 5. Expired or reused challenge rejection
  test("5. Expired enrollment challenge is rejected", async () => {
    const expiredChal = new BiometricChallenge();
    expiredChal.challengeId = crypto.randomUUID();
    expiredChal.userId = approvedVoter.id;
    expiredChal.challengeType = "enrollment";
    expiredChal.challengeNonceHash = "hash123";
    expiredChal.challengeInstructions = JSON.stringify(["look_center", "turn_left"]);
    expiredChal.expiresAt = new Date(Date.now() - 5000); // Expired
    await expiredChal.save();

    const res = await request(app)
      .post("/auth/biometrics/enrollment/verify")
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        challengeId: expiredChal.challengeId,
        frames: ["mock1", "mock2"],
        consentGiven: true,
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain("expired");
  });

  // 6. Biometric status endpoint
  test("6. Biometric status endpoint reflects enrollment without exposing biometric ciphertext", async () => {
    const res = await request(app)
      .get("/auth/biometrics/status")
      .set("Authorization", `Bearer ${approvedVoterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasEnrolled).toBe(true);
    expect(res.body.status).toBe("active");
    expect(res.body.modelIdentifier).toBe("sface-opencv-2021dec");
    expect(res.body.encryptedEmbedding).toBeUndefined();
  });

  // 7. Voting Challenge Request bound to User and Election
  let votingChallengeId = "";
  test("7. Voting challenge generation bound to active election and authenticated voter", async () => {
    const res = await request(app)
      .post(`/polls/${runningPoll.id}/biometric/challenge`)
      .set("Authorization", `Bearer ${approvedVoterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.challengeId).toBeDefined();
    expect(res.body.instructions).toBeInstanceOf(Array);

    votingChallengeId = res.body.challengeId;

    const chal = await BiometricChallenge.findOne({
      where: { challengeId: votingChallengeId },
    });
    expect(chal?.userId).toBe(approvedVoter.id);
    expect(chal?.electionId).toBe(runningPoll.id);
    expect(chal?.challengeType).toBe("voting");
  });

  // 8. Impostor face mismatch rejection during voting
  test("8. Live face verification rejects impostor face mismatch (score below threshold)", async () => {
    jest.spyOn(BiometricClient, "verifyLiveness").mockResolvedValueOnce({
      is_live: true,
      pad_score: 0.91,
      message: "Liveness confirmed",
    });

    jest.spyOn(BiometricClient, "extractEmbedding").mockResolvedValueOnce({
      success: true,
      embedding: mockImpostorEmbedding,
      modelIdentifier: "sface-opencv-2021dec",
    });

    jest.spyOn(BiometricClient, "verifyMatch").mockResolvedValueOnce({
      matched: false,
      similarity: 0.05,
      threshold: 0.363,
    });

    const res = await request(app)
      .post(`/polls/${runningPoll.id}/biometric/verify`)
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        challengeId: votingChallengeId,
        frames: ["frame1", "frame2"],
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Facial verification failed: match score");
  });

  // 9. Genuine face verification succeeds and issues single-use voting authorization token
  let issuedAuthToken = "";
  test("9. Genuine face verification succeeds: issues single-use voting authorization token", async () => {
    // Generate fresh voting challenge
    const chalRes = await request(app)
      .post(`/polls/${runningPoll.id}/biometric/challenge`)
      .set("Authorization", `Bearer ${approvedVoterToken}`);

    const freshVoteChalId = chalRes.body.challengeId;

    jest.spyOn(BiometricClient, "verifyLiveness").mockResolvedValueOnce({
      is_live: true,
      pad_score: 0.96,
      message: "Liveness verified",
    });

    jest.spyOn(BiometricClient, "extractEmbedding").mockResolvedValueOnce({
      success: true,
      embedding: mockGenuineEmbedding,
      modelIdentifier: "sface-opencv-2021dec",
    });

    jest.spyOn(BiometricClient, "verifyMatch").mockResolvedValueOnce({
      matched: true,
      similarity: 0.98,
      threshold: 0.363,
    });

    const res = await request(app)
      .post(`/polls/${runningPoll.id}/biometric/verify`)
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        challengeId: freshVoteChalId,
        frames: ["frame1", "frame2"],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.votingAuthorizationToken).toBeDefined();
    expect(res.body.votingAuthorizationToken).toHaveLength(64);

    issuedAuthToken = res.body.votingAuthorizationToken;

    // Verify authorization record in MySQL
    const tokenHash = hashToken(issuedAuthToken);
    const authRecord = await VotingAuthorization.findOne({
      where: { authorizationTokenHash: tokenHash },
    });
    expect(authRecord).toBeDefined();
    expect(authRecord?.userId).toBe(approvedVoter.id);
    expect(authRecord?.electionId).toBe(runningPoll.id);
    expect(authRecord?.status).toBe("issued");
  });

  // 10. Voting without authorization token is strictly rejected
  test("10. /polls/vote rejects ballot without biometric authorization token", async () => {
    const res = await request(app)
      .post("/polls/vote")
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        candidate: "Dr. Alice Smith",
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Biometric voting authorization token is required");
  });

  // 11. Voting with token belonging to another voter is rejected
  test("11. /polls/vote rejects authorization token belonging to another voter", async () => {
    const res = await request(app)
      .post("/polls/vote")
      .set("Authorization", `Bearer ${unapprovedVoterToken}`)
      .send({
        candidate: "Dr. Alice Smith",
        votingAuthorizationToken: issuedAuthToken,
      });

    expect(res.status).toBe(403);
  });

  // 12. Successful blockchain ballot submission with valid biometric authorization
  test("12. End-to-end: Valid authorization records vote on blockchain and marks token consumed", async () => {
    const res = await request(app)
      .post("/polls/vote")
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        candidate: "Dr. Alice Smith",
        votingAuthorizationToken: issuedAuthToken,
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("successful");
    expect(res.body.transaction).toBeDefined();
    expect(res.body.transaction.transactionHash).toBeDefined();
    expect(res.body.transaction.status).toBe("success");

    // Verify token is now marked consumed in MySQL
    const tokenHash = hashToken(issuedAuthToken);
    const authRecord = await VotingAuthorization.findOne({
      where: { authorizationTokenHash: tokenHash },
    });
    expect(authRecord?.status).toBe("consumed");
    expect(authRecord?.consumedAt).not.toBeNull();
    expect(authRecord?.transactionHash).toBe(res.body.transaction.transactionHash);

    // Verify Transaction record exists in MySQL
    const tx = await Transaction.findOne({
      where: { transactionHash: res.body.transaction.transactionHash },
    });
    expect(tx).toBeDefined();
    expect(tx?.voterId).toBe(approvedVoter.id);
    expect(tx?.candidateName).toBe("Dr. Alice Smith");
  });

  // 13. Replayed authorization token is strictly rejected
  test("13. Replayed voting authorization token is rejected (cannot vote twice with same token)", async () => {
    const res = await request(app)
      .post("/polls/vote")
      .set("Authorization", `Bearer ${approvedVoterToken}`)
      .send({
        candidate: "Bob Jones",
        votingAuthorizationToken: issuedAuthToken,
      });

    expect([400, 403]).toContain(res.status);
    expect(res.text).toMatch(/Already voted|token is no longer valid/i);
  });

  // 14. Right to erasure: biometric deletion
  test("14. Voter can delete biometric data (right to erasure)", async () => {
    const res = await request(app)
      .delete("/auth/biometrics")
      .set("Authorization", `Bearer ${approvedVoterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const credential = await BiometricCredential.findOne({
      where: { userId: approvedVoter.id },
    });
    expect(credential).toBeFalsy();
  });
});
