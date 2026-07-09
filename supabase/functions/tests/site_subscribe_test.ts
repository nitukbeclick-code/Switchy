// Unit tests for the site-subscribe pure helpers (site-subscribe/lib.ts): the
// email-shape gate and the no-re-welcome rule (B7 — don't burn a paid Resend
// send re-welcoming an existing subscriber). No network or env. Run from
// supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import { EMAIL_RE, type InsertResult, sanitizeTopic, shouldWelcome } from "../site-subscribe/lib.ts";

// ── EMAIL_RE: pragmatic RFC-ish email gate ────────────────────────────────────

Deno.test("EMAIL_RE accepts ordinary addresses", () => {
  for (const ok of [
    "a@b.co",
    "user@example.com",
    "first.last@sub.domain.org",
    "user+tag@example.co.il",
    "x_y-z@mail.example.com",
  ]) {
    assert(EMAIL_RE.test(ok), `expected valid: ${ok}`);
  }
});

Deno.test("EMAIL_RE rejects obvious garbage", () => {
  for (const bad of [
    "",
    "plainstring",
    "no-at-sign.com",
    "@nolocal.com",
    "nodomain@",
    "notld@example", // no dot in the domain
    "two@@at.com",
    "spaces in@example.com",
    "trailing@space.com ",
    "a@b.c\nd@e.f", // newline / multi-line
  ]) {
    assertFalse(EMAIL_RE.test(bad), `expected invalid: ${JSON.stringify(bad)}`);
  }
});

// ── shouldWelcome: the no-re-welcome rule (B7) ────────────────────────────────

Deno.test("shouldWelcome only welcomes a genuinely NEW subscriber", () => {
  assert(shouldWelcome("inserted")); // brand-new row → send welcome
  assertFalse(shouldWelcome("exists")); // already subscribed → NO re-welcome
  assertFalse(shouldWelcome("error")); // write failed → no welcome
});

Deno.test("shouldWelcome is exhaustive over InsertResult", () => {
  const all: InsertResult[] = ["inserted", "exists", "error"];
  // Exactly one of the three outcomes triggers a welcome send.
  assertEquals(all.filter(shouldWelcome), ["inserted"]);
});

// ── sanitizeTopic: the per-plan price-watch tag ───────────────────────────────

Deno.test("sanitizeTopic keeps well-formed plan tags", () => {
  for (const ok of [
    "plan:cellular-golan-unlimited",
    "plan:internet_bezeq.fiber-1000",
    "plan:tv yes extra",
    "מסלול:סלולר גולן",
  ]) {
    assertEquals(sanitizeTopic(ok), ok);
  }
});

Deno.test("sanitizeTopic collapses malformed input to plain signup", () => {
  for (const bad of [
    "", null, undefined, 42,
    "a".repeat(81), // over the length cap
    "plan:<script>alert(1)</script>",
    "plan:x\ny", // newline
    'plan:"quoted"',
    "plan:{json}",
  ]) {
    assertEquals(sanitizeTopic(bad), "");
  }
});

Deno.test("sanitizeTopic trims surrounding whitespace", () => {
  assertEquals(sanitizeTopic("  plan:abc  "), "plan:abc");
});
