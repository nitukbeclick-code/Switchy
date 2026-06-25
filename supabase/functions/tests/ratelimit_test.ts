// Unit tests for the shared in-memory rate limiter that fronts the
// authenticated POST paths of notify-lead and renewal-reminders. Run from
// supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertMatch } from "@std/assert";
import {
  __resetRateLimitForTests,
  rateLimit,
  secretFingerprint,
} from "../_shared/ratelimit.ts";

function reset() {
  __resetRateLimitForTests();
}

Deno.test("rateLimit allows up to the cap then rejects within one window", () => {
  reset();
  const t0 = 1_000_000;
  for (let i = 1; i <= 5; i++) {
    const r = rateLimit("k", 5, 60_000, t0);
    assert(r.allowed, `request ${i} should be allowed`);
    assertEquals(r.count, i);
    assertEquals(r.retryAfterSec, 0);
  }
  const over = rateLimit("k", 5, 60_000, t0);
  assertFalse(over.allowed);
  assertEquals(over.count, 5); // count is not incremented past the cap
  assert(over.retryAfterSec >= 1);
});

Deno.test("rateLimit reports a sane Retry-After that shrinks as the window elapses", () => {
  reset();
  const t0 = 2_000_000;
  for (let i = 0; i < 3; i++) rateLimit("k", 3, 60_000, t0);
  const early = rateLimit("k", 3, 60_000, t0); // 60s left
  assertFalse(early.allowed);
  assertEquals(early.retryAfterSec, 60);
  const late = rateLimit("k", 3, 60_000, t0 + 59_500); // ~0.5s left
  assertFalse(late.allowed);
  assertEquals(late.retryAfterSec, 1); // clamped to a 1s minimum
});

Deno.test("rateLimit resets after the window passes", () => {
  reset();
  const t0 = 3_000_000;
  for (let i = 0; i < 2; i++) rateLimit("k", 2, 60_000, t0);
  assertFalse(rateLimit("k", 2, 60_000, t0).allowed); // capped in window 1
  // Once the window fully elapses, a fresh request starts a new window.
  const next = rateLimit("k", 2, 60_000, t0 + 60_001);
  assert(next.allowed);
  assertEquals(next.count, 1);
});

Deno.test("rateLimit keeps distinct keys in independent buckets", () => {
  reset();
  const t0 = 4_000_000;
  for (let i = 0; i < 2; i++) rateLimit("a", 2, 60_000, t0);
  assertFalse(rateLimit("a", 2, 60_000, t0).allowed); // 'a' is capped
  // A different key (e.g. a different route or secret fingerprint) is untouched.
  assert(rateLimit("b", 2, 60_000, t0).allowed);
});

Deno.test("rateLimit treats limit<1 as a floor of 1", () => {
  reset();
  const t0 = 5_000_000;
  assert(rateLimit("k", 0, 60_000, t0).allowed);        // first call still passes
  assertFalse(rateLimit("k", 0, 60_000, t0).allowed);   // second in window rejected
});

Deno.test("rateLimit does not throw under a key-varying flood (eviction)", () => {
  reset();
  const t0 = 6_000_000;
  // Far exceed MAX_KEYS to exercise the eviction path; must stay allowed + safe.
  for (let i = 0; i < 5000; i++) {
    const r = rateLimit(`flood:${i}`, 10, 60_000, t0 + i);
    assert(r.allowed);
  }
});

Deno.test("secretFingerprint is deterministic, short hex, and not the raw secret", async () => {
  const a = await secretFingerprint("super-secret-value");
  assertEquals(a, await secretFingerprint("super-secret-value"));
  assertMatch(a, /^[0-9a-f]{12}$/);
  assert(!a.includes("super")); // non-reversible — raw secret not embedded
  assert(a !== (await secretFingerprint("different-secret")));
});

Deno.test("secretFingerprint returns a stable sentinel for an empty secret", async () => {
  assertEquals(await secretFingerprint(""), "none");
});
