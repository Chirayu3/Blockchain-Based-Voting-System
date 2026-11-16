interface RateLimitRecord {
  timestamps: number[];
}

class MemoryRateLimiter {
  private store: Map<string, RateLimitRecord> = new Map();

  /**
   * Checks if a key has exceeded its allowed number of actions within a time window.
   */
  public checkLimit(
    key: string,
    maxHits: number,
    windowSeconds: number
  ): { limited: boolean; remainingHits: number; retryAfterSeconds: number } {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const record = this.store.get(key) || { timestamps: [] };

    // Filter out timestamps outside the sliding window
    const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);
    record.timestamps = validTimestamps;
    this.store.set(key, record);

    if (validTimestamps.length >= maxHits) {
      const oldestValid = validTimestamps[0];
      const retryAfterMs = oldestValid + windowMs - now;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      return {
        limited: true,
        remainingHits: 0,
        retryAfterSeconds: Math.max(retryAfterSeconds, 1),
      };
    }

    return {
      limited: false,
      remainingHits: maxHits - validTimestamps.length,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Records a hit for a key.
   */
  public hit(key: string): void {
    const record = this.store.get(key) || { timestamps: [] };
    record.timestamps.push(Date.now());
    this.store.set(key, record);
  }

  /**
   * Resets rate limit for a key (useful for tests).
   */
  public reset(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }
}

export const rateLimiter = new MemoryRateLimiter();
