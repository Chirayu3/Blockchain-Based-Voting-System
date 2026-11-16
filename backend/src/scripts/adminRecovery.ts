import { createConnection, getConnection, Connection } from "typeorm";
import bcrypt from "bcrypt";
import { User } from "../entity/User";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

/**
 * Secure Local Administrator Password Recovery Utility
 *
 * Requirements:
 * - Explicitly identifies the administrator account (by email or admin flag).
 * - Accepts new password securely via CLI arguments or interactive prompt.
 * - Enforces minimum password strength.
 * - Hashes using the project's standard bcrypt configuration (10 rounds).
 * - Updates only the intended administrator record.
 * - Validates the resulting hash with bcrypt.compare() before confirming.
 * - Preserves admin=true, verified, isActive, voterId, and all existing voter records.
 * - Never logs or stores plaintext passwords.
 */
export async function recoverAdminPassword(
  adminEmail: string,
  newPassword?: string
): Promise<{ success: boolean; message: string; email?: string }> {
  if (!adminEmail || typeof adminEmail !== "string") {
    throw new Error("Administrator email is required.");
  }

  const normalizedEmail = adminEmail.toLowerCase().trim();
  let connection: Connection | null = null;
  let shouldCloseConnection = false;

  try {
    try {
      const existing = getConnection();
      if (existing && existing.isConnected) {
        connection = existing;
      } else {
        connection = await createConnection();
        shouldCloseConnection = true;
      }
    } catch {
      connection = await createConnection();
      shouldCloseConnection = true;
    }

    const admin = await User.findOne({ where: { email: normalizedEmail } });

    if (!admin) {
      throw new Error(`Account not found for email: ${normalizedEmail}`);
    }

    if (!admin.admin) {
      throw new Error(`Account ${normalizedEmail} does not possess administrator privileges.`);
    }

    let passwordToSet = newPassword;

    if (!passwordToSet) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      passwordToSet = await new Promise<string>((resolve) => {
        rl.question("Enter new administrator password (min 6 chars): ", (ans) => {
          rl.close();
          resolve(ans);
        });
      });
    }

    if (!passwordToSet || passwordToSet.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    // Hash password with standard bcrypt 10 rounds
    const hashedPassword = await bcrypt.hash(passwordToSet, 10);

    // Save only to this specific administrator user
    admin.password = hashedPassword;
    await admin.save();

    // Verify hash integrity with bcrypt.compare
    const verifyMatch = await bcrypt.compare(passwordToSet, admin.password);
    if (!verifyMatch) {
      throw new Error("Critical error: Password verification failed after hashing.");
    }

    return {
      success: true,
      message: `Administrator credentials successfully updated and verified for ${admin.email}.`,
      email: admin.email,
    };
  } finally {
    if (shouldCloseConnection && connection && connection.isConnected) {
      await connection.close();
    }
  }
}

// Allow execution directly from CLI: ts-node src/scripts/adminRecovery.ts <adminEmail> [newPassword]
if (require.main === module) {
  const args = process.argv.slice(2);
  const email = args[0] || "john@gmail.com";
  const password = args[1]; // optional CLI argument, otherwise prompts

  recoverAdminPassword(email, password)
    .then((result) => {
      console.log(result.message);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Recovery failed:", err.message);
      process.exit(1);
    });
}
