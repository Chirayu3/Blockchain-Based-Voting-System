import "dotenv/config";
import request from "supertest";
import { createConnection, Connection } from "typeorm";
import jwt from "jsonwebtoken";
import app from "../server";
import { User } from "../entity/User";
import { Poll } from "../entity/Poll";
import { Transaction } from "../entity/Transaction";
import { VotingAuthorization } from "../entity/VotingAuthorization";
import { generateAuthorizationToken } from "../utils/biometricCrypto";
import ElectionContract, { web3 } from "../web3";
import bcrypt from "bcrypt";

describe("Election Lifecycle, Blockchain Integration & Crash Protection Test Suite", () => {
  let connection: Connection;
  let adminToken: string;
  let voterUser: User;
  let voterToken: string;

  const accessTokenSecret =
    process.env.ACCESS_TOKEN_SECRET ||
    "976a66a5bd23b2050019f380c4decbbefdf8ff91cf502c68a3fe1ced91d7448cc54ce6c847657d53294e40889cef5bd996ec5b0fefc1f56270e06990657eeb6e";

  beforeAll(async () => {
    connection = await createConnection();

    // 1. Setup Admin user and token
    let admin = await User.findOne({ where: { admin: true } });
    if (!admin) {
      admin = new User();
      admin.name = "Admin User";
      admin.email = "admin_test@example.com";
      admin.citizenshipNumber = "CIT_ADMIN_TEST";
      admin.voterId = "BBVS-2026-000001";
      admin.password = await bcrypt.hash("AdminPass123!", 10);
      admin.admin = true;
      admin.verified = true;
      admin.emailVerified = true;
      admin.isActive = true;
      await admin.save();
    }
    adminToken = jwt.sign(
      {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        voterId: admin.voterId,
        admin: true,
        verified: true,
        emailVerified: true,
        isActive: true,
      },
      accessTokenSecret,
      { expiresIn: "2h" }
    );

    // 2. Setup Verified Voter user and token
    let voter = await User.findOne({
      where: { admin: false, verified: true, emailVerified: true },
    });
    if (!voter) {
      voter = new User();
      voter.name = "Verified Voter";
      voter.email = `voter_${Date.now()}@example.com`;
      voter.citizenshipNumber = `CIT_VOTER_${Date.now()}`;
      voter.voterId = `BBVS-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      voter.password = await bcrypt.hash("VoterPass123!", 10);
      voter.admin = false;
      voter.verified = true;
      voter.emailVerified = true;
      voter.isActive = true;
      await voter.save();
    }
    voterUser = voter;
    voterToken = jwt.sign(
      {
        id: voter.id,
        name: voter.name,
        email: voter.email,
        voterId: voter.voterId,
        admin: false,
        verified: true,
        emailVerified: true,
        isActive: true,
      },
      accessTokenSecret,
      { expiresIn: "2h" }
    );

    // Reset smart contract if it was previously in finished state
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
    } catch (e) {
      console.warn("Setup smart contract reset error (safe to ignore if fresh):", e);
    }
  });

  afterAll(async () => {
    if (connection && connection.isConnected) {
      await connection.close();
    }
  });

  // Test 1: Deployed contract verification and bytecode check
  test("1. Blockchain deployment: contract has bytecode and getStatus returns not-started", async () => {
    const instance = await ElectionContract.deployed();
    expect(instance.address).toBeDefined();

    const code = await web3.eth.getCode(instance.address);
    expect(code).not.toBe("0x");
    expect(code.length).toBeGreaterThan(100);

    const statusRes = await request(app).get("/polls/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("not-started");
  });

  // Test 2: Dashboard statistics when no active election
  test("2. Admin dashboard stats: returns correctly when no election is active", async () => {
    const res = await request(app)
      .get("/polls/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.electionStats).toBeDefined();
    expect(res.body.electionStats.currentStatus).toBe("not-started");
    expect(res.body.electionStats.active).toBe(0);
    expect(res.body.votingStats).toBeDefined();
    expect(res.body.voterStats).toBeDefined();
  });

  // Test 3: Start election
  test("3. Start election: initializes ballot on-chain and creates Poll in MySQL with status running", async () => {
    const electionPayload = {
      name: `General Presidential Election ${Date.now()}`,
      description: "Official ballot for presidential election cycle.",
      candidates: [
        { name: "Candidate Alice", info: "Platform A for educational reform" },
        { name: "Candidate Bob", info: "Platform B for economic investment" },
      ],
    };

    const res = await request(app)
      .post("/polls/start")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(electionPayload);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(electionPayload.name);

    // Verify smart contract status is running
    const statusRes = await request(app).get("/polls/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("running");

    // Verify MySQL record was created with status running
    const runningPoll = await Poll.findOne({
      where: { status: "running" },
      order: { id: "DESC" },
    });
    expect(runningPoll).toBeDefined();
    expect(runningPoll?.name).toBe(electionPayload.name);
    expect(runningPoll?.status).toBe("running");
  });

  // Test 4: Dashboard statistics when election is running
  test("4. Admin dashboard stats: displays active status and candidates when running", async () => {
    const res = await request(app)
      .get("/polls/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.electionStats.currentStatus).toBe("running");
    expect(res.body.electionStats.active).toBe(1);
    expect(res.body.votingStats.candidates).toContain("Candidate Alice");
    expect(res.body.votingStats.candidates).toContain("Candidate Bob");
  });

  // Test 5: Casting a vote
  test("5. Vote: records on blockchain first, then records transaction in MySQL", async () => {
    const runningPoll = await Poll.findOne({ where: { status: "running" } });
    const { token, tokenHash } = generateAuthorizationToken();
    const auth = new VotingAuthorization();
    auth.authorizationTokenHash = tokenHash;
    auth.userId = voterUser.id;
    auth.electionId = runningPoll!.id;
    auth.verificationId = "test-verification-id";
    auth.status = "issued";
    auth.expiresAt = new Date(Date.now() + 120000);
    await auth.save();

    const votePayload = {
      id: voterUser.id.toString(),
      name: voterUser.name,
      candidate: "Candidate Alice",
      votingAuthorizationToken: token,
    };

    const res = await request(app)
      .post("/polls/vote")
      .set("Authorization", `Bearer ${voterToken}`)
      .send(votePayload);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("successful");
    expect(res.body.transaction).toBeDefined();
    expect(res.body.transaction.transactionHash).toBeDefined();
    expect(res.body.transaction.status).toBe("success");

    // Verify transaction record exists in MySQL
    const tx = await Transaction.findOne({
      where: { transactionHash: res.body.transaction.transactionHash },
    });
    expect(tx).toBeDefined();
    expect(tx?.voterId).toBe(voterUser.id);
    expect(tx?.candidateName).toBe("Candidate Alice");
  });

  // Test 6: Duplicate voting is prevented
  test("6. Duplicate vote rejection: voter cannot vote twice in the same election", async () => {
    const runningPoll = await Poll.findOne({ where: { status: "running" } });
    const { token: token2, tokenHash: tokenHash2 } = generateAuthorizationToken();
    const auth2 = new VotingAuthorization();
    auth2.authorizationTokenHash = tokenHash2;
    auth2.userId = voterUser.id;
    auth2.electionId = runningPoll!.id;
    auth2.verificationId = "test-verification-id-2";
    auth2.status = "issued";
    auth2.expiresAt = new Date(Date.now() + 120000);
    await auth2.save();

    const votePayload = {
      id: voterUser.id.toString(),
      name: voterUser.name,
      candidate: "Candidate Bob",
      votingAuthorizationToken: token2,
    };

    const res = await request(app)
      .post("/polls/vote")
      .set("Authorization", `Bearer ${voterToken}`)
      .send(votePayload);

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Already voted/i);
  });

  // Test 7: End election
  test("7. End election: stops ballot on blockchain and marks MySQL Poll as finished", async () => {
    const res = await request(app)
      .post("/polls/end")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // Verify smart contract status is finished
    const statusRes = await request(app).get("/polls/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("finished");

    // Verify MySQL status updated to finished
    const finishedPoll = await Poll.findOne({
      where: { status: "finished" },
      order: { id: "DESC" },
    });
    expect(finishedPoll).toBeDefined();
    expect(finishedPoll?.status).toBe("finished");
  });

  // Test 8: Dashboard stats after election is finished
  test("8. Admin dashboard stats: reflects finished state with 0 active elections", async () => {
    const res = await request(app)
      .get("/polls/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.electionStats.currentStatus).toBe("finished");
    expect(res.body.electionStats.active).toBe(0);
    expect(res.body.electionStats.completed).toBeGreaterThanOrEqual(1);
  });

  // Test 9: Reset election preserves history
  test("9. Reset election: contract reverts to not-started while MySQL preserves historical records", async () => {
    const totalPollsBeforeReset = await Poll.count();
    const totalTxsBeforeReset = await Transaction.count();

    const res = await request(app)
      .post("/polls/reset")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe("successful");

    // Contract status is now not-started
    const statusRes = await request(app).get("/polls/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("not-started");

    // MySQL historical records are completely preserved
    const totalPollsAfterReset = await Poll.count();
    const totalTxsAfterReset = await Transaction.count();

    expect(totalPollsAfterReset).toBe(totalPollsBeforeReset);
    expect(totalTxsAfterReset).toBe(totalTxsBeforeReset);
  });

  // Test 10: Backend crash protection
  test("10. Crash protection: unhandled errors in async routes return HTTP error without terminating process", async () => {
    // 1. Validation error returns 400 Bad Request
    const valRes = await request(app)
      .post("/polls/start")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "ab" }); // missing fields and invalid min length

    expect(valRes.status).toBe(400);

    // 2. Route with missing auth returns 401
    const authRes = await request(app).get("/polls/admin/stats");
    expect(authRes.status).toBe(401);

    // 3. Process is healthy and continues serving subsequent requests
    const healthRes = await request(app).get("/");
    expect(healthRes.status).toBe(200);
    expect(healthRes.text).toContain("Blockchain Voting System API running");
  });
});
