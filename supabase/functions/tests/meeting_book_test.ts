// Unit tests for the PURE meeting-book helpers (meeting-book/lib.ts): OTP code
// generation + hashing, constant-time hex compare, email shape, and the booking
// slot validator that MIRRORS public.meetings_guard. No network / env — the
// edge handlers are fail-soft without env and are not exercised here. Run from
// supabase/functions/:
//   deno test --allow-env --allow-net --allow-read --allow-import tests/meeting_book_test.ts

import { assert, assertEquals, assertFalse, assertMatch } from "@std/assert";
import {
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
