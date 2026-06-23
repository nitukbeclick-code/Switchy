// Unit tests for the crm-api pure helpers (crm-api/crm_logic.ts) — the status
// validation sets, snippet formatter, contact-name fallback and page-size clamp
// the function applies before any service-role write. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  clampLimit,
  contactName,
  CONTACT_STATUSES,
  CONVERSATION_STATUSES,
  EVENT_PREVIEW_LEN,
  eventPreview,
  isValidContactStatus,
  isValidConversationStatus,
  isValidLeadStatus,
  LEAD_STATUSES,
  MAX_REPLY_LEN,
  s,
  snippet,
  SNIPPET_LEN,
} from "../crm-api/crm_logic.ts";

// ── status validation sets ────────────────────────────────────────────────────

Deno.test("contact statuses mirror the Flutter CRM DTO exactly", () => {
  assertEquals(
    [...CONTACT_STATUSES].sort(),
    ["active", "blocked", "handed_off", "lost", "new", "qualified", "won"],
  );
  for (const st of CONTACT_STATUSES) assert(isValidContactStatus(st));
  // A malformed client can't stamp an arbitrary status.
  assertFalse(isValidContactStatus("vip"));
  assertFalse(isValidContactStatus(""));
  assertFalse(isValidContactStatus("WON")); // case-sensitive
});

Deno.test("lead statuses are the four pipeline columns", () => {
  assertEquals([...LEAD_STATUSES].sort(), ["contacted", "lost", "new", "won"]);
  for (const st of LEAD_STATUSES) assert(isValidLeadStatus(st));
  assertFalse(isValidLeadStatus("qualified")); // a contact status, not a lead one
  assertFalse(isValidLeadStatus("open"));
});

Deno.test("conversation statuses gate the ?status= filter param", () => {
  assertEquals([...CONVERSATION_STATUSES].sort(), ["bot", "closed", "human", "open"]);
  for (const st of CONVERSATION_STATUSES) assert(isValidConversationStatus(st));
  // A bad ?status= can't be smuggled into the PostgREST query string.
  assertFalse(isValidConversationStatus("won"));
  assertFalse(isValidConversationStatus("'; drop table"));
});

// ── snippet ───────────────────────────────────────────────────────────────────

Deno.test("snippet collapses whitespace to a single line", () => {
  assertEquals(snippet("היי   שם\n\nשורה שנייה"), "היי שם שורה שנייה");
  assertEquals(snippet("  trimmed  "), "trimmed");
});

Deno.test("snippet truncates with an ellipsis past the length cap", () => {
  const long = "א".repeat(SNIPPET_LEN + 20);
  const out = snippet(long);
  assertEquals(out.length, SNIPPET_LEN); // SNIPPET_LEN-1 chars + the "…"
  assert(out.endsWith("…"));
  // Exactly at the cap, nothing is clipped.
  const exact = "ב".repeat(SNIPPET_LEN);
  assertEquals(snippet(exact), exact);
});

Deno.test("snippet is null-safe", () => {
  assertEquals(snippet(null), "");
  assertEquals(snippet(undefined), "");
});

// ── contactName fallback chain ────────────────────────────────────────────────

Deno.test("contactName prefers wa_name, then phone, then a neutral placeholder", () => {
  assertEquals(contactName({ wa_name: "דנה לוי", wa_phone: "0521234567" }), "דנה לוי");
  assertEquals(contactName({ wa_name: "  ", wa_phone: "0521234567" }), "0521234567");
  assertEquals(contactName({}), "ללא שם");
  assertEquals(contactName({ wa_name: null, wa_phone: null }), "ללא שם");
});

// ── helpers ───────────────────────────────────────────────────────────────────

Deno.test("s null-safely stringifies", () => {
  assertEquals(s(null), "");
  assertEquals(s(undefined), "");
  assertEquals(s(42), "42");
  assertEquals(s("x"), "x");
});

Deno.test("clampLimit holds the requested page size inside 1..100 (default 50)", () => {
  assertEquals(clampLimit(undefined), 50);
  assertEquals(clampLimit(0), 50); // 0 is falsy → default
  assertEquals(clampLimit("not a number"), 50);
  assertEquals(clampLimit(25), 25);
  assertEquals(clampLimit(500), 100); // capped
  assertEquals(clampLimit(-10), 1); // floored
});

Deno.test("MAX_REPLY_LEN matches the stored-body slice cap", () => {
  assertEquals(MAX_REPLY_LEN, 4000);
});

// ── eventPreview (crm_events.preview snippet) ─────────────────────────────────

Deno.test("eventPreview collapses whitespace to a single PII-light line", () => {
  assertEquals(eventPreview("נציג  דנה\n\nהשתלט"), "נציג דנה השתלט");
  assertEquals(eventPreview("  trimmed  "), "trimmed");
});

Deno.test("eventPreview clips past the 80-char cap with an ellipsis", () => {
  const long = "א".repeat(EVENT_PREVIEW_LEN + 30);
  const out = eventPreview(long);
  assertEquals(out.length, EVENT_PREVIEW_LEN); // EVENT_PREVIEW_LEN-1 chars + "…"
  assert(out.endsWith("…"));
  // Exactly at the cap, nothing is clipped.
  const exact = "ב".repeat(EVENT_PREVIEW_LEN);
  assertEquals(eventPreview(exact), exact);
  assertEquals(EVENT_PREVIEW_LEN, 80);
});

Deno.test("eventPreview is null-safe", () => {
  assertEquals(eventPreview(null), "");
  assertEquals(eventPreview(undefined), "");
});
