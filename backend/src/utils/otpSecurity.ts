import crypto from "crypto";

export function getOtpSecret(): string {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing OTP_HASH_SECRET in production environment");
    }
    // Fallback only for non-production environments if undefined
    return "default_development_otp_secret_key_needs_replacement_64_bytes_long";
  }
  return secret;
}

/**
 * Computes an HMAC-SHA256 hash of (challengeId + ":" + otp).
 */
export function hashOtp(challengeId: string, otp: string): string {
  const secret = getOtpSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(`${challengeId}:${otp}`)
    .digest("hex");
}

/**
 * Validates the candidate OTP against the stored hash using constant-time comparison.
 */
export function verifyOtpHash(
  challengeId: string,
  candidateOtp: string,
  storedHash: string
): boolean {
  if (!candidateOtp || !storedHash) return false;
  try {
    const computedHash = hashOtp(challengeId, candidateOtp);
    const computedBuf = Buffer.from(computedHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");

    if (computedBuf.length !== storedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      new Uint8Array(computedBuf),
      new Uint8Array(storedBuf)
    );
  } catch {
    return false;
  }
}
