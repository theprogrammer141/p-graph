// Pure in-memory sliding window rate limiter.
// Bounds memory consumption by automatically purging expired entries.

import { UserFacingError } from "./errors";

interface RateLimitOptions {
  /** Maximum number of allowed requests in the time window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

interface WindowRecord {
  timestamps: number[];
}

const store = new Map<string, WindowRecord>();
const MAX_TRACKED_KEYS = 5000;

/**
 * Checks and increments the rate limit counter for a given identifier key.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - options.windowMs;

  let record = store.get(key);
  if (!record) {
    if (store.size >= MAX_TRACKED_KEYS) {
      // Purge expired keys to prevent memory leak
      for (const [k, v] of store.entries()) {
        const active = v.timestamps.filter((ts) => ts > windowStart);
        if (active.length === 0) store.delete(k);
        else v.timestamps = active;
      }
    }
    record = { timestamps: [] };
    store.set(key, record);
  }

  // Filter out timestamps outside the current window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= options.limit) {
    const oldest = record.timestamps[0] ?? now;
    return {
      success: false,
      remaining: 0,
      resetAt: oldest + options.windowMs,
    };
  }

  record.timestamps.push(now);

  return {
    success: true,
    remaining: options.limit - record.timestamps.length,
    resetAt: now + options.windowMs,
  };
}

/**
 * Throws a UserFacingError if the rate limit is exceeded for the key.
 */
export function assertRateLimit(
  key: string,
  options: RateLimitOptions,
  errorMessage = "Too many requests. Please wait a moment before trying again."
): void {
  const result = checkRateLimit(key, options);
  if (!result.success) {
    throw new UserFacingError(errorMessage);
  }
}
