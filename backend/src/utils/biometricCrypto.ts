import crypto from "crypto";

const DEFAULT_DEV_KEY =
  "c3a728b9d3e8f1a25490bcde671234ef980123456789abcdef0123456789abcd";

/**
 * Derives a strictly 32-byte binary key from the provided secret.
 */
function getDerivedKey(keySecret?: string): Buffer {
  const secret = keySecret || process.env.BIOMETRIC_ENCRYPTION_KEY || DEFAULT_DEV_KEY;
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a biometric embedding (array of floats) using AES-256-GCM.
 * Output format: "ivHex:authTagHex:ciphertextHex"
 */
export function encryptEmbedding(
  embedding: number[],
  keySecret?: string,
  keyVersion: number = 1
): { encryptedData: string; keyVersion: number } {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Invalid embedding: must be a non-empty array of floats");
  }

  const key = getDerivedKey(keySecret);
  const iv = crypto.randomBytes(12); // Recommended 12 bytes for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key as any, iv as any);

  const plaintext = JSON.stringify(embedding);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  const encryptedData = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  return { encryptedData, keyVersion };
}

/**
 * Decrypts an AES-256-GCM encrypted embedding string and returns the float array.
 * Throws an error if ciphertext or authentication tag is invalid.
 */
export function decryptEmbedding(
  encryptedData: string,
  keySecret?: string
): number[] {
  if (!encryptedData || typeof encryptedData !== "string") {
    throw new Error("Invalid encrypted embedding data");
  }

  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted embedding payload");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error("Invalid IV or authentication tag length");
  }

  const key = getDerivedKey(keySecret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key as any, iv as any);
  decipher.setAuthTag(authTag as any);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  const embedding = JSON.parse(decrypted);
  if (!Array.isArray(embedding)) {
    throw new Error("Decrypted payload is not a valid embedding array");
  }

  return embedding;
}

/**
 * Generates an unpredictable cryptographic authorization token and its SHA-256 hash.
 */
export function generateAuthorizationToken(): {
  token: string;
  tokenHash: string;
} {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

/**
 * Hashes a token using SHA-256.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Performs a constant-time comparison of a token against an expected SHA-256 hash.
 */
export function verifyTokenHash(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const computedHash = hashToken(token);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex") as any,
      Buffer.from(expectedHash, "hex") as any
    );
  } catch {
    return false;
  }
}
