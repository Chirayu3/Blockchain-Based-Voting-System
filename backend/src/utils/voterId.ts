import crypto from "crypto";
import { User } from "../entity/User";

/**
 * Annual capacity: 1,000,000 unique voter identifiers per calendar year (000000 - 999999).
 */
export function formatVoterId(year: number, sequenceNumber: number): string {
  const padded = String(sequenceNumber).padStart(6, "0");
  return `BBVS-${year}-${padded}`;
}

/**
 * Generates a cryptographically random, collision-safe Voter ID.
 * Queries the database to ensure no collision exists, with up to 5 attempts.
 */
export async function generateUniqueVoterId(
  maxAttempts: number = 5
): Promise<string> {
  const year = new Date().getFullYear();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const randomSeq = crypto.randomInt(0, 1000000);
    const candidateId = formatVoterId(year, randomSeq);

    const existing = await User.findOne({ where: { voterId: candidateId } });
    if (!existing) {
      return candidateId;
    }
  }

  throw new Error(
    "Failed to generate a unique Voter ID after multiple attempts. Capacity limit reached or high collision density."
  );
}

/**
 * Saves a user with automatic retry if a duplicate key race condition occurs.
 */
export async function saveUserWithRetry(
  userBuilder: (voterId: string) => User,
  maxRetries: number = 3
): Promise<User> {
  for (let retry = 0; retry < maxRetries; retry++) {
    const voterId = await generateUniqueVoterId();
    const user = userBuilder(voterId);
    try {
      return await User.save(user);
    } catch (err: any) {
      // MySQL ER_DUP_ENTRY error code 1062
      const isDuplicateVoterId =
        (err.code === "ER_DUP_ENTRY" || err.errno === 1062) &&
        err.message &&
        err.message.includes("voterId");

      if (isDuplicateVoterId && retry < maxRetries - 1) {
        continue; // Retry with a newly generated voterId
      }
      throw err;
    }
  }
  throw new Error("Unable to save user due to repeated Voter ID collision.");
}
