// Unit tests for the PURE meeting-book helpers (meeting-book/lib.ts): OTP code
// generation + hashing, constant-time hex compare, email shape, and the booking
// slot validator that MIRRORS public.meetings_guard. No network / env — the
// edge handlers are fail-soft without env and are not exercised here. Run from
// supabase/functions/:
//   deno test --allow-env --allow-net --allow-read --allow-import tests/meeting_book_test.ts

import { assert, assertEquals, assertFalse, assertMatch } from "@std/assert";
import {
  DEFAULT_OTP_RATE_LIMITS,
  evaluateOtpRateLimit,
  evaluateOtpVerify,
  genCode,
  hashCode,
  isValidEmail,
  normalizeEmail,
  timingSafeEqualHex,
  validBookingSlot,
} from "../meeting-book/lib.ts";

// A fixed "now": Wednesday 2026-06-10 08:00 UTC (= 11:00 Asia/Jerusalem, summer
// UTC+3). Israel-local today is therefore 2026-06-10. Booking must be for
// [2026-06-11, 2026-07-10].
const NOW = Date.parse("2026-06-10T08:00:00.000Z");

// ── genCode ───────────────────────────────────────────────────────────────────

Deno.test("genCode returns a zero-padded 6-digit string", () => {
  for (let i = 0; i < 200; i++) {
    const c = genCode();
    assertMatch(c, /^\d{6}$/, `not 6 digits: ${c}`);
  }
});

Deno.test("genCode varies across calls (not a constant)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) seen.add(genCode());
  // With 50 draws over a 1e6 space, collisions to a single value are effectively
  // impossible — require clear variation.
  assert(seen.size > 40, `expected high variety, got ${seen.size} distinct`);
});

// ── hashCode ──────────────────────────────────────────────────────────────────

Deno.test("hashCode is a stable lowercase 64-char sha-256 hex", async () => {
  const h1 = await hashCode("123456");
  const h2 = await hashCode("123456");
  assertEquals(h1, h2); // deterministic
  assertMatch(h1, /^[0-9a-f]{64}$/);
  // Known vector: sha-256("123456")
  assertEquals(h1, "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92");
});

Deno.test("hashCode differs per code", async () => {
  assert((await hashCode("000000")) !== (await hashCode("000001")));
});

// ── timingSafeEqualHex ────────────────────────────────────────────────────────

Deno.test("timingSafeEqualHex matches equal hex and rejects differences", async () => {
  const a = await hashCode("424242");
  assert(timingSafeEqualHex(a, a));
  assert(timingSafeEqualHex(a, (await hashCode("424242"))));
  assertFalse(timingSafeEqualHex(a, await hashCode("424243")));
  // length mismatch fails fast
  assertFalse(timingSafeEqualHex(a, a.slice(0, 63)));
  assertFalse(timingSafeEqualHex("", a));
});

// ── normalizeEmail / isValidEmail ─────────────────────────────────────────────

Deno.test("normalizeEmail trims and lowercases", () => {
  assertEquals(normalizeEmail("  User@Example.COM "), "user@example.com");
  assertEquals(normalizeEmail(null), "");
  assertEquals(normalizeEmail(undefined), "");
});

Deno.test("isValidEmail accepts ordinary addresses", () => {
  for (const ok of [
    "a@b.co",
    "user@example.com",
    "First.Last@Sub.Domain.org",
    "user+tag@example.co.il",
    "x_y-z@mail.example.com",
  ]) {
    assert(isValidEmail(ok), `expected valid: ${ok}`);
  }
});

Deno.test("isValidEmail rejects garbage and over-long input", () => {
  for (const bad of [
    "",
    "plainstring",
    "no-at-sign.com",
    "@nolocal.com",
    "nodomain@",
    "notld@example",
    "two@@at.com",
    "spaces in@example.com",
    "a@b.c\nd@e.f", // newline / multi-line
    `${"x".repeat(250)}@example.com`, // > 254 chars
  ]) {
    assertFalse(isValidEmail(bad), `expected invalid: ${JSON.stringify(bad)}`);
  }
});

// ── validBookingSlot — mirrors meetings_guard ─────────────────────────────────

Deno.test("validBookingSlot accepts a valid Sun–Thu slot in range", () => {
  // 2026-06-11 is a Thursday (isodow 4) — within [today+1, today+30].
  const r = validBookingSlot("2026-06-11", "14:30", NOW);
  assert(r.ok, JSON.stringify(r));
  // boundary slots on the Sun–Thu grid
  assert(validBookingSlot("2026-06-11", "09:00", NOW).ok);
  assert(validBookingSlot("2026-06-11", "20:30", NOW).ok);
});

Deno.test("validBookingSlot rejects a Saturday", () => {
  // 2026-06-13 is a Saturday (isodow 6).
  const r = validBookingSlot("2026-06-13", "10:00", NOW);
  assertFalse(r.ok);
  if (!r.ok) assertMatch(r.error, /saturday/i);
});

Deno.test("validBookingSlot rejects a past / too-soon date", () => {
  // today (2026-06-10) is < today+1 → must be booked at least one day ahead
  assertFalse(validBookingSlot("2026-06-10", "10:00", NOW).ok);
  // a clearly past date
  assertFalse(validBookingSlot("2026-06-01", "10:00", NOW).ok);
});

Deno.test("validBookingSlot rejects a date more than 30 days ahead", () => {
  // today+31 = 2026-07-11
  const r = validBookingSlot("2026-07-11", "10:00", NOW);
  assertFalse(r.ok);
  if (!r.ok) assertMatch(r.error, /too far/i);
  // today+30 = 2026-07-10 (a Friday) — within range at a valid Friday slot
  assert(validBookingSlot("2026-07-10", "10:00", NOW).ok);
});

Deno.test("validBookingSlot rejects an off-grid slot (Sun–Thu)", () => {
  for (const bad of ["14:15", "08:30", "21:00", "9:00", "14:00:00", ""]) {
    assertFalse(validBookingSlot("2026-06-11", bad, NOW).ok, `expected invalid slot: ${bad}`);
  }
});

Deno.test("validBookingSlot enforces Friday mornings-only (09:00–12:30)", () => {
  // 2026-06-12 is a Friday (isodow 5).
  assert(validBookingSlot("2026-06-12", "09:00", NOW).ok);
  assert(validBookingSlot("2026-06-12", "12:30", NOW).ok);
  // afternoon Friday slots are rejected even though they're on the 30-min grid
  for (const pm of ["13:00", "14:30", "20:00"]) {
    const r = validBookingSlot("2026-06-12", pm, NOW);
    assertFalse(r.ok, `expected Friday-afternoon reject: ${pm}`);
    if (!r.ok) assertMatch(r.error, /friday/i);
  }
});

Deno.test("validBookingSlot rejects a malformed or impossible date", () => {
  assertFalse(validBookingSlot("2026-13-01", "10:00", NOW).ok); // bad month
  assertFalse(validBookingSlot("2026-02-30", "10:00", NOW).ok); // impossible day
  assertFalse(validBookingSlot("not-a-date", "10:00", NOW).ok);
  assertFalse(validBookingSlot("2026/06/11", "10:00", NOW).ok); // wrong separators
});

// ── evaluateOtpRateLimit (DURABLE OTP send throttle) ───────────────────────────
// Pure decision used by request-code BEFORE emailing/inserting a code. A denial
// is what stops email-bombing; the in-memory limiter is only a hot-isolate
// pre-filter, so these are the tests that actually pin the anti-abuse contract.

const T0 = Date.parse("2026-06-10T12:00:00.000Z");
const MIN = 60_000;
// A tiny, explicit limit set so the edge cases are unambiguous in the assertions.
const LIMITS = {
  cooldownMs: 45_000,
  emailWindowMs: 15 * MIN,
  emailMax: 4,
  emailDayMs: 24 * 60 * MIN,
  emailDayMax: 12,
  ipWindowMs: 60 * MIN,
  ipMax: 15,
};

Deno.test("otp-rl: a first-ever request is allowed (no history)", () => {
  const d = evaluateOtpRateLimit({ now: T0, emailTimestamps: [], ipTimestamps: [], limits: LIMITS });
  assert(d.allowed);
});

Deno.test("otp-rl: cooldown blocks a resend that arrives too soon", () => {
  // last send 20s ago < 45s cooldown → denied
  const d = evaluateOtpRateLimit({
    now: T0,
    emailTimestamps: [T0 - 20_000],
    ipTimestamps: [],
    limits: LIMITS,
  });
  assertFalse(d.allowed);
  if (!d.allowed) assertEquals(d.reason, "cooldown");
});

Deno.test("otp-rl: a resend after the cooldown elapses is allowed", () => {
  // last send 50s ago > 45s cooldown, and only 1 in the window → allowed
  const d = evaluateOtpRateLimit({
    now: T0,
    emailTimestamps: [T0 - 50_000],
    ipTimestamps: [],
    limits: LIMITS,
  });
  assert(d.allowed);
});

Deno.test("otp-rl: per-address burst cap blocks the (max+1)-th in the window", () => {
  // 4 sends inside the last 15 min (all older than the 45s cooldown) → emailMax hit
  const emailTimestamps = [2 * MIN, 5 * MIN, 9 * MIN, 13 * MIN].map((m) => T0 - m);
  const d = evaluateOtpRateLimit({ now: T0, emailTimestamps, ipTimestamps: [], limits: LIMITS });
  assertFalse(d.allowed);
  if (!d.allowed) assertEquals(d.reason, "email-window");
});

Deno.test("otp-rl: sends that aged out of the window don't count toward the burst cap", () => {
  // 4 sends but all > 15 min ago → window count is 0 → allowed
  const emailTimestamps = [16 * MIN, 20 * MIN, 40 * MIN, 90 * MIN].map((m) => T0 - m);
  const d = evaluateOtpRateLimit({ now: T0, emailTimestamps, ipTimestamps: [], limits: LIMITS });
  assert(d.allowed);
});

Deno.test("otp-rl: per-address daily cap blocks even when the 15-min window is clear", () => {
  // 12 sends spread across the last 24h, none in the last 15 min and none within
  // cooldown → window OK, but daily cap (12) reached → denied.
  const emailTimestamps = Array.from({ length: 12 }, (_, i) => T0 - (30 + i * 100) * MIN);
  const d = evaluateOtpRateLimit({ now: T0, emailTimestamps, ipTimestamps: [], limits: LIMITS });
  assertFalse(d.allowed);
  if (!d.allowed) assertEquals(d.reason, "email-day");
});

Deno.test("otp-rl: per-IP cap blocks bombing one mailbox via many aliases", () => {
  // A fresh alias (no per-address history) but the IP already sent ipMax in the
  // hour → the per-IP rule catches the +tag/dot bombing pattern.
  const ipTimestamps = Array.from({ length: 15 }, (_, i) => T0 - (i + 1) * MIN);
  const d = evaluateOtpRateLimit({ now: T0, emailTimestamps: [], ipTimestamps, limits: LIMITS });
  assertFalse(d.allowed);
  if (!d.allowed) assertEquals(d.reason, "ip-window");
});

Deno.test("otp-rl: per-IP rule cannot apply when the IP is unknown (empty)", () => {
  // Even with a huge implied IP flood, an empty ipTimestamps means no IP key —
  // the address rules still govern, and here they're clear → allowed.
  const d = evaluateOtpRateLimit({ now: T0, emailTimestamps: [], ipTimestamps: [], limits: LIMITS });
  assert(d.allowed);
});

Deno.test("otp-rl: decision is order-independent and ignores non-finite timestamps", () => {
  const shuffled = [9 * MIN, 2 * MIN, 13 * MIN, 5 * MIN].map((m) => T0 - m);
  const withJunk = [NaN, ...shuffled, Infinity];
  const d = evaluateOtpRateLimit({ now: T0, emailTimestamps: withJunk, ipTimestamps: [], limits: LIMITS });
  // 4 valid sends in the window → still the email-window denial, junk ignored.
  assertFalse(d.allowed);
  if (!d.allowed) assertEquals(d.reason, "email-window");
});

Deno.test("otp-rl: ships with sane production defaults", () => {
  // Guard against an accidental edit that makes the shipped limits absurd.
  assert(DEFAULT_OTP_RATE_LIMITS.emailMax >= 1 && DEFAULT_OTP_RATE_LIMITS.emailMax <= 10);
  assert(DEFAULT_OTP_RATE_LIMITS.cooldownMs >= 10_000);
  assert(DEFAULT_OTP_RATE_LIMITS.ipMax >= DEFAULT_OTP_RATE_LIMITS.emailMax);
  // A legitimate single user (1 send, no prior history) is always allowed.
  const ok = evaluateOtpRateLimit({ now: T0, emailTimestamps: [], ipTimestamps: [] });
  assert(ok.allowed);
});

// ── evaluateOtpVerify (verify against ALL live codes) ──────────────────────────
// Guards the production bug: after a "resend" an address holds several live
// codes, and the user may enter the one from an EARLIER email — that must verify.

const FAR = "2999-01-01T00:00:00.000Z"; // always-unexpired
const PAST = "2000-01-01T00:00:00.000Z"; // always-expired
const TV = Date.parse("2026-06-28T02:12:00.000Z");

Deno.test("otp-verify: matches a code from an OLDER live row, not only the newest (the bug)", async () => {
  // Reproduces the real incident: SHA-256("926748") matched the 2nd-newest row
  // while a newer resend row existed; the old single-row check wrongly rejected.
  const rows = [
    { id: "row-new", code_hash: await hashCode("111111"), expires_at: FAR, attempts: 0 },
    { id: "row-old", code_hash: await hashCode("926748"), expires_at: FAR, attempts: 0 },
  ];
  const out = evaluateOtpVerify(rows, await hashCode("926748"), TV, 5);
  assertEquals(out.status, "match");
  if (out.status === "match") assertEquals(out.matchedId, "row-old");
});

Deno.test("otp-verify: matches the newest row too", async () => {
  const rows = [{ id: "a", code_hash: await hashCode("424242"), expires_at: FAR, attempts: 0 }];
  assertEquals(evaluateOtpVerify(rows, await hashCode("424242"), TV, 5).status, "match");
});

Deno.test("otp-verify: a wrong code is a mismatch and charges the newest row", async () => {
  const rows = [
    { id: "new", code_hash: await hashCode("222222"), expires_at: FAR, attempts: 1 },
    { id: "old", code_hash: await hashCode("333333"), expires_at: FAR, attempts: 0 },
  ];
  const out = evaluateOtpVerify(rows, await hashCode("999999"), TV, 5);
  assertEquals(out.status, "mismatch");
  if (out.status === "mismatch") {
    assertEquals(out.chargeId, "new");
    assertEquals(out.nextAttempts, 2);
  }
});

Deno.test("otp-verify: empty set and all-expired both yield no-live", async () => {
  assertEquals(evaluateOtpVerify([], await hashCode("000000"), TV, 5).status, "no-live");
  const expired = [{ id: "x", code_hash: await hashCode("121212"), expires_at: PAST, attempts: 0 }];
  assertEquals(evaluateOtpVerify(expired, await hashCode("121212"), TV, 5).status, "no-live");
});

Deno.test("otp-verify: an expired row is never matchable even if the code equals it", async () => {
  const h = await hashCode("777777");
  const rows = [
    { id: "expired", code_hash: h, expires_at: PAST, attempts: 0 },
    { id: "live", code_hash: await hashCode("888888"), expires_at: FAR, attempts: 0 },
  ];
  // The entered code equals ONLY the expired row → no live match → mismatch.
  assertEquals(evaluateOtpVerify(rows, h, TV, 5).status, "mismatch");
});

Deno.test("otp-verify: attempt budget is summed across live codes → too-many", async () => {
  const rows = [
    { id: "a", code_hash: await hashCode("100000"), expires_at: FAR, attempts: 3 },
    { id: "b", code_hash: await hashCode("200000"), expires_at: FAR, attempts: 2 },
  ];
  // sum = 5 >= maxAttempts 5 → locked out before any compare (even the right code).
  assertEquals(evaluateOtpVerify(rows, await hashCode("100000"), TV, 5).status, "too-many");
});
