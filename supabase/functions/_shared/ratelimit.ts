// Lightweight in-memory rate limiter for the cron/Telegram/internal POST paths.
//
// WHY: notify-lead and renewal-reminders already authenticate every POST with
// the shared x-webhook-secret (constant-time) and fail closed when it is unset.
// But authentication alone does not bound COST: a leaked secret, a buggy/looping
// pg_cron job, or a retry storm could POST these endpoints in a tight loop and
// fan out expensive Telegram + AI-triage + email work on every hit. This adds a
// cheap second layer — a fixed-window counter per logical key — so a burst is
// shed with a 429 long before it can amplify into real spend.
//
// SCOPE & LIMITS (deliberately modest):
//   • Process-local only. Supabase Edge isolates are short-lived and may run in
//     parallel, so this is best-effort throttling of a HOT isolate, not a global
//     quota. That is the right tradeoff for "stop a runaway loop / leaked-secret
//     flood" without standing up Redis. The secret gate remains the real auth.
//   • Keyed by caller-supplied string (we use the route + a short fingerprint of
//     the secret, NEVER the raw secret) so distinct legitimate callers don't
//     share a bucket and the key is safe to log.
//   • Generous defaults: legitimate traffic is a handful of pg_cron ticks and
//     trigger-driven lead/meeting INSERTs per minute. Real load stays far under
//     the cap; only abuse trips it.
//
// Pure & deterministic: the clock is injectable so tests need no timers.

export interface RateLimitResult {
  allowed: boolean;
  /** Requests already counted in the current window (including this one when allowed). */
  count: number;
  /** Seconds until the current window resets — surfaced as Retry-After on a 429. */
  retryAfterSec: number;
}

interface Window {
  count: number;
  resetAt: number; // epoch ms when the current window ends
}

const buckets = new Map<string, Window>();

// Stop the Map from growing without bound under a key-varying flood: evict the
// oldest windows once we cross this many distinct keys. The legitimate key space
// is tiny (a couple of routes × one secret), so this only ever trims attacker
// noise.
const MAX_KEYS = 2048;

function evictIfNeeded(now: number): void {
  if (buckets.size <= MAX_KEYS) return;
  // Drop everything already expired first (cheap, common case).
  for (const [k, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(k);
  }
  if (buckets.size <= MAX_KEYS) return;
  // Still oversized → evict the soonest-to-reset entries until back under cap.
  const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [k] of sorted) {
    if (buckets.size <= MAX_KEYS) break;
    buckets.delete(k);
  }
}

/**
 * Fixed-window rate limit. Returns whether the call is allowed and, when not,
 * how long to wait. `limit` requests are permitted per `windowMs`; the
 * (limit+1)-th in the same window is rejected.
 *
 * @param key        logical bucket key (route + secret fingerprint — never the raw secret)
 * @param limit      max allowed requests per window (must be >= 1)
 * @param windowMs   window length in milliseconds (must be > 0)
 * @param now        injectable clock (defaults to Date.now) — pass a fixed value in tests
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const cap = Math.max(1, Math.floor(limit));
  const win = Math.max(1, Math.floor(windowMs));
  evictIfNeeded(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    // Fresh window — this request is the first in it.
    buckets.set(key, { count: 1, resetAt: now + win });
    return { allowed: true, count: 1, retryAfterSec: 0 };
  }

  if (existing.count >= cap) {
    // Over the cap for this window — reject and report when it frees up.
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, count: existing.count, retryAfterSec };
  }

  existing.count += 1;
  return { allowed: true, count: existing.count, retryAfterSec: 0 };
}

/**
 * Short, non-reversible fingerprint of a secret, safe to use inside a bucket key
 * and to log. SHA-256 → first 12 hex chars. Distinct secrets get distinct
 * fingerprints; the raw secret can't be recovered from it.
 */
export async function secretFingerprint(secret: string): Promise<string> {
  if (!secret) return "none";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Test-only: clear all buckets so cases don't leak window state into each other. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
