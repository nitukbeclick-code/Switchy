// Unit tests for _shared/compliance.ts — the single-source compliance module.
// Run from supabase/functions/:  deno task test  (or the single-file command in
// the cell's self-verify note).
//
// Scope here is the PURE detectors + copy shape. isSuppressed / recordSuppression
// / recordErasureRequest / summarizeDataFor hit the network; without service-role
// env they MUST fail-soft (no throw, safe value) — we assert that no-op behaviour
// only, never a DB write.

import { assert, assertEquals, assertFalse, assertMatch, assertStringIncludes } from "@std/assert";
import {
  isDataAccessRequest,
  isErasureRequest,
  isOptOut,
  isSuppressed,
  OPTOUT_CONFIRM_REPLY,
  OPTOUT_KEYWORDS,
  OPTOUT_SLASH_OR_WORD,
  recordErasureRequest,
  recordSuppression,
  summarizeDataFor,
} from "../_shared/compliance.ts";

// ── isOptOut: the UNIFIED detector (he / ar / ru / en + multi-word + slash) ────

Deno.test("isOptOut catches a bare Hebrew unsubscribe", () => {
  assert(isOptOut("הסר"));
  assert(isOptOut("ביטול"));
  assert(isOptOut("הפסיקו"));
});

Deno.test("isOptOut catches a MULTI-WORD Hebrew opt-out (contains match)", () => {
  // The motivating case: a missed opt-out is an illegal contact, so a real
  // unsubscribe phrased as a sentence MUST still match.
  assert(isOptOut("אנא הסירו אותי מהרשימה"));
  assert(isOptOut("בבקשה תפסיקו לשלוח לי הודעות"));
});

Deno.test("isOptOut catches Arabic opt-out tokens", () => {
  assert(isOptOut("إلغاء"));
  assert(isOptOut("توقف"));
  assert(isOptOut("من فضلك إلغاء الاشتراك")); // "إلغاء" substring inside a sentence
});

Deno.test("isOptOut catches Russian opt-out tokens", () => {
  assert(isOptOut("стоп"));
  assert(isOptOut("отписаться"));
  assert(isOptOut("пожалуйста отмена")); // contains "отмена"
});

Deno.test("isOptOut catches English words + slash forms", () => {
  assert(isOptOut("STOP"));
  assert(isOptOut("please unsubscribe"));
  assert(isOptOut("/stop"));
  assert(isOptOut("/unsubscribe"));
  assert(isOptOut("cancel"));
});

Deno.test("isOptOut is false for empty / non-opt-out text", () => {
  assertFalse(isOptOut(""));
  assertFalse(isOptOut("   "));
  assertFalse(isOptOut(null as unknown as string));
  assertFalse(isOptOut("כמה עולה מסלול סלולר?"));
  assertFalse(isOptOut("what is the cheapest plan?"));
});

Deno.test("opt-out keyword sources are exported and non-empty", () => {
  assert(Array.isArray(OPTOUT_KEYWORDS) && OPTOUT_KEYWORDS.length > 0);
  assert(Array.isArray(OPTOUT_SLASH_OR_WORD) && OPTOUT_SLASH_OR_WORD.length > 0);
  // Union must include both channels' signature tokens.
  assert(OPTOUT_KEYWORDS.includes("הסירו")); // WhatsApp set
  assert(OPTOUT_KEYWORDS.includes("стоп")); // Telegram set
  assert(OPTOUT_SLASH_OR_WORD.includes("/stop"));
});

// ── OPTOUT_CONFIRM_REPLY shape ─────────────────────────────────────────────────

Deno.test("OPTOUT_CONFIRM_REPLY returns Hebrew confirmation with default brand", () => {
  const r = OPTOUT_CONFIRM_REPLY();
  assertStringIncludes(r, "הוסרתם");
  assertStringIncludes(r, "Switchy AI");
  assertStringIncludes(r, "הודעות יזומות");
});

Deno.test("OPTOUT_CONFIRM_REPLY names the channel when given one", () => {
  const r = OPTOUT_CONFIRM_REPLY("Switchy WhatsApp");
  assertStringIncludes(r, "Switchy WhatsApp");
});

// ── Amendment-13 detectors ─────────────────────────────────────────────────────

Deno.test("isDataAccessRequest detects he/en access phrasings", () => {
  assert(isDataAccessRequest("מה אתם יודעים עליי?"));
  assert(isDataAccessRequest("איזה מידע יש עליי"));
  assert(isDataAccessRequest("what data do you have"));
});

Deno.test("isDataAccessRequest is false for empty / unrelated", () => {
  assertFalse(isDataAccessRequest(""));
  assertFalse(isDataAccessRequest("מה המסלול הכי זול?"));
});

Deno.test("isErasureRequest detects he/en erasure phrasings", () => {
  assert(isErasureRequest("מחק את המידע שלי"));
  assert(isErasureRequest("מחיקת מידע"));
  assert(isErasureRequest("please delete my data"));
  assert(isErasureRequest("erase"));
});

Deno.test("erasure takes precedence over access for 'delete my data'", () => {
  // A deletion intent must NOT resolve to a read-only access summary.
  assert(isErasureRequest("delete my data"));
  assertFalse(isDataAccessRequest("delete my data"));
  assert(isErasureRequest("מחק את המידע שלי"));
  assertFalse(isDataAccessRequest("מחק את המידע שלי"));
});

// ── Network helpers: fail-soft / no-op WITHOUT service-role env ─────────────────
// We do NOT set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY here, so serviceFetch
// returns null and every helper must degrade safely (no throw, no DB write).

Deno.test("isSuppressed fail-soft → false without service-role env", async () => {
  assertEquals(await isSuppressed("whatsapp", "+972500000000"), false);
  assertEquals(await isSuppressed("telegram", "tg:123"), false);
  assertEquals(await isSuppressed("whatsapp", ""), false); // empty contact short-circuits
});

Deno.test("recordSuppression fail-soft → no throw without service-role env", async () => {
  // Must resolve (void) rather than reject.
  await recordSuppression("telegram", "tg:123", "telegram_stop");
  await recordSuppression("whatsapp", "+972500000000", "whatsapp_stop");
  assert(true);
});

Deno.test("summarizeDataFor fail-soft → Hebrew counts-only summary, no PII", async () => {
  const s = await summarizeDataFor("whatsapp", "+972500000000");
  assertStringIncludes(s, "סיכום המידע");
  // Counts unreadable without env → render as לא ידוע (never a fabricated 0 row).
  assertStringIncludes(s, "לא ידוע");
  // PII-minimal: the raw phone must NOT appear in the summary body.
  assertFalse(s.includes("+972500000000"));
  assertMatch(s, /סטטוס דיוור/);
});

Deno.test("recordErasureRequest fail-soft → Hebrew confirmation, request logged not deleted", async () => {
  const r = await recordErasureRequest("telegram", "tg:123");
  assertStringIncludes(r, "בקשת המחיקה");
  assertStringIncludes(r, "הפסקנו לשלוח"); // suppression acknowledged
  // Honest: tells the user it'll be completed within the legal timeframe.
  assertMatch(r, /פרק הזמן הקבוע|בהתאם לדרישת החוק/);
});
