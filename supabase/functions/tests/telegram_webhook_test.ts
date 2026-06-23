// Unit tests for the telegram-webhook edge function (telegram-webhook/index.ts).
//
// This function authenticates inbound Telegram updates with the
// `x-telegram-bot-api-secret-token` header, which must equal
// tgWebhookToken(lead_webhook_secret) — a SHA-256 hex digest, NOT the raw secret
// (Telegram restricts the secret_token charset, see config.ts). It then guards
// the account-link deep link (`/start user_<uuid>`) against a notification-
// hijack: the payload is attacker-controllable, so the id must match a canonical
// UUID *before* any DB access.
//
// The handler is registered via std/http `serve(...)` (not Deno.serve) and
// instantiates a Supabase client at module top level, so it can't be captured
// cleanly under the plain `deno test tests/` runner the way the community
// functions can. We therefore (1) verify the real secret-verification primitives
// the handler uses, imported from _shared/config.ts, and (2) PIN the exact
// UUID_RE + /start parse the handler applies inline, with the attack vectors it
// must reject. If the source regex ever changes, these pins force a deliberate,
// visible update.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertMatch } from "@std/assert";
import { safeEqual, tgWebhookToken } from "../_shared/config.ts";

// ── webhook-secret verification contract ───────────────────────────────────────
// The handler computes `await tgWebhookToken(cfg.webhookSecret)` and compares it
// (constant-time) to the inbound header. These pin that the header an attacker
// must forge is the DIGEST, not the secret, and that a wrong/empty token fails.

Deno.test("telegram-webhook secret token is the SHA-256 digest of the secret, not the secret", async () => {
  const secret = "lead-webhook-secret-xyz";
  const token = await tgWebhookToken(secret);
  assertMatch(token, /^[0-9a-f]{64}$/); // 64-char hex digest
  assert(token !== secret); // never the raw secret on the wire
  // The gate accepts exactly this token…
  assert(await safeEqual(token, await tgWebhookToken(secret)));
});

Deno.test("telegram-webhook gate rejects a wrong or empty secret token (fail-closed)", async () => {
  const expected = await tgWebhookToken("the-real-secret");
  assertFalse(await safeEqual("", expected)); // no header → unauthorized
  assertFalse(await safeEqual("deadbeef", expected)); // arbitrary token
  // The raw secret itself is NOT a valid token (must be digested first).
  assertFalse(await safeEqual("the-real-secret", expected));
});

// ── /start deep-link UUID validation (notification-hijack guard) ────────────────
// Pins the exact validation telegram-webhook/index.ts applies before any DB
// query. parseStart mirrors the handler: `payload.match(/^user_(.+)$/)` then
// `UUID_RE.test(trimmed)`. Keep these two literals in sync with the source.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStart(payload: string): { appUserId: string; valid: boolean } {
  const match = payload.match(/^user_(.+)$/);
  const appUserId = match?.[1]?.trim() ?? "";
  return { appUserId, valid: !!match && UUID_RE.test(appUserId) };
}

Deno.test("parseStart accepts a well-formed `user_<uuid>` deep link", () => {
  const r = parseStart("user_11111111-2222-3333-4444-555555555555");
  assert(r.valid);
  assertEquals(r.appUserId, "11111111-2222-3333-4444-555555555555");
});

Deno.test("parseStart trims surrounding whitespace around the uuid", () => {
  const r = parseStart("user_ 11111111-2222-3333-4444-555555555555 ");
  assert(r.valid);
  assertEquals(r.appUserId, "11111111-2222-3333-4444-555555555555");
});

Deno.test("parseStart is case-insensitive on the hex uuid", () => {
  assert(parseStart("user_AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE").valid);
});

Deno.test("parseStart rejects a SQL-injection payload before any DB access", () => {
  const r = parseStart("user_'; DROP TABLE profiles;--");
  assertFalse(r.valid);
});

Deno.test("parseStart rejects an uuid with a trailing injection suffix", () => {
  // The $ anchor in UUID_RE means a valid prefix + extra chars is still invalid —
  // this is the guard against binding a victim's profile via a crafted id.
  assertFalse(parseStart("user_11111111-2222-3333-4444-555555555555 OR 1=1").valid);
});

Deno.test("parseStart rejects empty / prefix-only / missing-prefix payloads", () => {
  assertFalse(parseStart("").valid);
  assertFalse(parseStart("user_").valid);
  assertFalse(parseStart("user_   ").valid);
  // No `user_` prefix at all (a bare uuid is not a valid /start payload).
  assertFalse(parseStart("11111111-2222-3333-4444-555555555555").valid);
});

Deno.test("parseStart rejects a malformed uuid (wrong segment lengths)", () => {
  assertFalse(parseStart("user_1111-2222-3333-4444-555555555555").valid);
  assertFalse(parseStart("user_11111111222233334444555555555555").valid);
  assertFalse(parseStart("user_zzzzzzzz-2222-3333-4444-555555555555").valid); // non-hex
});

// UUID_RE itself, pinned directly (the handler also calls UUID_RE.test on the id).
Deno.test("UUID_RE matches a canonical uuid and nothing longer or shorter", () => {
  assert(UUID_RE.test("11111111-2222-3333-4444-555555555555"));
  assertFalse(UUID_RE.test("11111111-2222-3333-4444-555555555555-extra"));
  assertFalse(UUID_RE.test(" 11111111-2222-3333-4444-555555555555")); // unanchored leading space
});
