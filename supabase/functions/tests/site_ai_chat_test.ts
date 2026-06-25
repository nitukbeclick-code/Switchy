// Unit tests for the site-ai-chat Track-2E pure helpers:
//   • _shared/leads.ts  — normalizeLeadPhone, buildAiLeadRow (consent gating),
//                          detectSwitchIntent
//   • _shared/catalogue.ts — buildCitedCatalogueContext (citation markers,
//                            grounded-only rows)
// The handler's agent-routing + memory-merge behavior is covered separately in
// site_ai_chat_agent_test.ts (which captures the Deno.serve handler).
// No network, no env. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  type AiLeadInput,
  buildAiLeadRow,
  detectSwitchIntent,
  normalizeLeadPhone,
} from "../_shared/leads.ts";
import { buildCitedCatalogueContext, type Plan } from "../_shared/catalogue.ts";

// ── normalizeLeadPhone ───────────────────────────────────────────────────────

Deno.test("normalizeLeadPhone accepts a standard IL mobile", () => {
  assertEquals(normalizeLeadPhone("050-1234567"), "0501234567");
  assertEquals(normalizeLeadPhone("054 765 4321"), "0547654321");
});

Deno.test("normalizeLeadPhone strips +972 / 972 back to national 0-form", () => {
  assertEquals(normalizeLeadPhone("+972501234567"), "0501234567");
  assertEquals(normalizeLeadPhone("972 50 123 4567"), "0501234567");
});

Deno.test("normalizeLeadPhone accepts a 9-digit landline", () => {
  assertEquals(normalizeLeadPhone("03-1234567"), "031234567");
});

Deno.test("normalizeLeadPhone rejects junk / too-short / non-IL", () => {
  assertEquals(normalizeLeadPhone(""), "");
  assertEquals(normalizeLeadPhone("12345"), "");
  assertEquals(normalizeLeadPhone("hello"), "");
  // Doesn't start with 0 after normalization and isn't a 972 intl form.
  assertEquals(normalizeLeadPhone("1501234567"), "");
});

// ── buildAiLeadRow — consent is NEVER fabricated ─────────────────────────────

Deno.test("buildAiLeadRow returns null without mandatory consent", () => {
  const input: AiLeadInput = { name: "דנה כהן", phone: "0501234567", consent: false };
  assertEquals(buildAiLeadRow(input), null);
});

Deno.test("buildAiLeadRow returns null when consent is omitted entirely", () => {
  const input: AiLeadInput = { name: "דנה כהן", phone: "0501234567" };
  assertEquals(buildAiLeadRow(input), null);
});

Deno.test("buildAiLeadRow returns null with an invalid phone even if consent is true", () => {
  const input: AiLeadInput = { name: "דנה כהן", phone: "123", consent: true };
  assertEquals(buildAiLeadRow(input), null);
});

Deno.test("buildAiLeadRow returns null with a too-short name", () => {
  const input: AiLeadInput = { name: "ד", phone: "0501234567", consent: true };
  assertEquals(buildAiLeadRow(input), null);
});

Deno.test("buildAiLeadRow builds a clean row with consent and stamps terms+privacy", () => {
  const now = "2026-06-23T10:00:00.000Z";
  const input: AiLeadInput = {
    name: "  דנה כהן  ",
    phone: "+972-50-123-4567",
    provider: "סלקום",
    category: "cellular",
    notes: "רוצה לעבור לחבילה זולה יותר",
    consent: true,
  };
  const row = buildAiLeadRow(input, now);
  assert(row !== null);
  assertEquals(row!.name, "דנה כהן");
  assertEquals(row!.phone, "0501234567");
  assertEquals(row!.provider, "סלקום");
  assertEquals(row!.source, "advisor");
  assertEquals(row!.terms_accepted_at, now);
  assertEquals(row!.privacy_accepted_at, now);
  // No marketing opt-in → marketing timestamp stays null + all channels false.
  assertEquals(row!.marketing_accepted_at, null);
  assertEquals(row!.consent_marketing_sms, false);
  assertEquals(row!.consent_marketing_email, false);
  assertEquals(row!.consent_marketing_whatsapp, false);
  assert(row!.notes !== null);
  assertStringIncludes(row!.notes!, "Switchy AI");
  assertStringIncludes(row!.notes!, "cellular");
  assertStringIncludes(row!.notes!, "רוצה לעבור");
});

Deno.test("buildAiLeadRow stamps marketing timestamp only when a channel is opted-in", () => {
  const now = "2026-06-23T10:00:00.000Z";
  const row = buildAiLeadRow({
    name: "יוסי לוי",
    phone: "0521112233",
    consent: true,
    consent_marketing_whatsapp: true,
  }, now);
  assert(row !== null);
  assertEquals(row!.consent_marketing_whatsapp, true);
  assertEquals(row!.consent_marketing_sms, false);
  assertEquals(row!.marketing_accepted_at, now);
});

Deno.test("buildAiLeadRow clips an oversized notes blob under the DB gate cap", () => {
  const row = buildAiLeadRow({
    name: "ארוך מאוד",
    phone: "0501234567",
    consent: true,
    notes: "א".repeat(5000),
  });
  assert(row !== null);
  assert(row!.notes !== null);
  // The DB gate rejects notes > 2000 chars; we keep well under it.
  assert(row!.notes!.length <= 1900, `notes length ${row!.notes!.length} exceeds cap`);
});

// ── detectSwitchIntent — conservative: info questions are NOT intent ──────────

Deno.test("detectSwitchIntent fires on a genuine switch / contact wish", () => {
  assert(detectSwitchIntent("אני רוצה לעבור לספק אחר"));
  assert(detectSwitchIntent("תחזרו אלי עם הצעה"));
  assert(detectSwitchIntent("אפשר לדבר עם נציג?"));
  assert(detectSwitchIntent("מעוניין בהצעה מותאמת אישית"));
  assert(detectSwitchIntent("רוצה לחסוך בחשבון הסלולר"));
});

Deno.test("detectSwitchIntent does NOT fire on a pure price/info question", () => {
  assertFalse(detectSwitchIntent("כמה עולה מסלול 5G?"));
  assertFalse(detectSwitchIntent("מה ההבדל בין 4G ל-5G?"));
  assertFalse(detectSwitchIntent("איזה ספקים יש בארץ?"));
  assertFalse(detectSwitchIntent(""));
});

// ── buildCitedCatalogueContext — only real rows, each cited [Sn] ─────────────

const PLANS: Plan[] = [
  { cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 39, is5G: true, kind: "regular" },
  { cat: "cellular", provider: "פרטנר", plan: "Unlimited", price: 59, noCommit: true, kind: "regular" },
  { cat: "cellular", provider: "רמי לוי", plan: "כשר", price: 19, kind: "kosher" }, // excluded (kind!=regular)
  { cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, kind: "regular", specs: { speed: "1000Mb" } },
];

Deno.test("buildCitedCatalogueContext tags every row with a citation marker", () => {
  const ctx = buildCitedCatalogueContext(PLANS);
  assertStringIncludes(ctx, "[S1]");
  assertStringIncludes(ctx, "[S2]");
  assertStringIncludes(ctx, "סלקום");
  assertStringIncludes(ctx, "₪39");
  // Internet row carries its speed spec.
  assertStringIncludes(ctx, "1000Mb");
});

Deno.test("buildCitedCatalogueContext excludes non-regular (kosher) rows — grounded set only", () => {
  const ctx = buildCitedCatalogueContext(PLANS);
  assertFalse(ctx.includes("כשר"));
});

Deno.test("buildCitedCatalogueContext is empty for an empty catalogue", () => {
  assertEquals(buildCitedCatalogueContext([]), "");
});
