// ─────────────────────────────────────────────────────────────────────────────
// _shared/compliance.ts — the SINGLE source of truth for marketing/privacy
// compliance across every channel (WhatsApp, Telegram, site). It CONSOLIDATES the
// rules that were previously duplicated per channel so they can never drift:
//
//   • §7b commission disclosure  — re-exported from _shared/tools.ts (the original).
//   • Quiet hours (23:00–08:00 IL)/Israel wall-clock hour — re-exported from
//     site-push-notify/deals.ts (the original; just a pass-through so new code
//     imports it from here).
//   • §30A opt-out detection — the UNIFIED detector: the UNION of the WhatsApp
//     keyword set (whatsapp-webhook/intents.ts RE_OPTOUT) and the Telegram keyword
//     set (telegram-user-webhook/lib.ts OPTOUT_PATTERNS), matched by CONTAINS so a
//     real opt-out is NEVER missed however it's phrased ("אנא הסירו אותי מהרשימה").
//   • The durable suppression registry (public.marketing_suppression) read/write
//     helpers, fail-soft.
//   • Amendment-13 data-subject helpers (access / erasure) — READ-ONLY summaries
//     and a logged, human-reviewed erasure intake (NO hard delete here).
//
// §30A PRINCIPLE — ERR TOWARD CATCHING AN OPT-OUT. A missed opt-out is an illegal
// proactive contact; a false-positive merely sends one extra confirmation and
// stops. So isOptOut matching is intentionally BROAD (contains/substring across
// he/en/ar/ru), never narrowly anchored.
//
// Everything here is pure or fail-soft: a network/DB error NEVER throws to the
// caller — it logs a structured line and degrades safely.
// ─────────────────────────────────────────────────────────────────────────────

import { jlog } from "./log.ts";
import { serviceFetch } from "./db.ts";

// ── §7b commission disclosure (re-export the original; do NOT redefine) ────────
export { COMMISSION_DISCLOSURE } from "./tools.ts";

// ── Quiet hours / Israel wall-clock hour (re-export the originals) ─────────────
// site-push-notify/deals.ts owns the DST-aware Israel clock + the 23:00–08:00
// quiet window. New compliance-aware code imports them from here so there is one
// import surface; the implementations stay single-source in deals.ts.
export { inQuietHours, israelHour } from "../site-push-notify/deals.ts";

// ─────────────────────────────────────────────────────────────────────────────
// §30A OPT-OUT — the UNIFIED detector
// ─────────────────────────────────────────────────────────────────────────────
// The UNION of the two existing keyword sets, matched by CONTAINS (case-insensitive,
// trimmed) so neither channel can miss a real opt-out:
//   • whatsapp-webhook/intents.ts RE_OPTOUT — Hebrew unsubscribe verbs + EN carriers.
//   • telegram-user-webhook/lib.ts OPTOUT_PATTERNS — he/ar/ru/en STOP tokens.
//
// Contains (not whole-message anchored) is deliberate: "אנא הסירו אותי מהרשימה"
// and "please stop" both opt out. The §30A principle is to ERR TOWARD catching it
// — a false-positive is recoverable; a missed opt-out is an illegal contact.
//
// Two shapes are kept distinct so the matcher stays correct:
//   • OPTOUT_KEYWORDS — Hebrew/Arabic/Russian substrings (no word boundary; \b is
//     ASCII-only and never matches around non-Latin letters).
//   • OPTOUT_SLASH_OR_WORD — Latin tokens kept as whole words / slash-commands
//     (/stop, stop, unsubscribe, cancel) so an English word inside a longer word
//     (e.g. "cancellation policy") still trips — by design we err toward catching.
export const OPTOUT_KEYWORDS: readonly string[] = [
  // Hebrew — remove / stop / cancel (covers both WhatsApp + Telegram sets).
  "הסר", "הסרה", "הסירו", "להסיר", "תסיר", "תסירו",
  "עצור", "עצרו",
  "הפסיק", "הפסיקו", "תפסיק", "תפסיקו", "הפסק",
  "ביטול", "בטל", "בטלו", "לבטל",
  "אל תשלח", "לא לשלוח", "הפסק לשלוח",
  // Arabic — stop / cancel.
  "إلغاء", "توقف", "الغاء", "إيقاف",
  // Russian — stop / unsubscribe / cancel.
  "стоп", "отписаться", "отмена",
];

// Latin opt-out tokens + their slash-command forms. Matched case-insensitively as
// a substring too (the §30A "err toward catching" rule), so "/stop", "STOP",
// "please unsubscribe", "cancel my plan" all opt out.
export const OPTOUT_SLASH_OR_WORD: readonly string[] = [
  "/stop", "/unsubscribe", "/cancel",
  "stop", "unsubscribe", "cancel",
];

/**
 * The UNIFIED §30A opt-out detector. True when the inbound text CONTAINS any
 * opt-out keyword (he/en/ar/ru) — case-insensitive, trimmed. Broad on purpose:
 * a missed opt-out is an illegal proactive contact, a false-positive merely sends
 * one confirmation and stops. Pure; empty/whitespace → false.
 *
 * Replaces (and is the union of) whatsapp-webhook/intents.ts isOptOut and
 * telegram-user-webhook/lib.ts isOptOut so the two channels share one rule.
 */
export function isOptOut(text: string): boolean {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return false;
  // Latin tokens (already lowercased) — substring match incl. slash forms.
  for (const w of OPTOUT_SLASH_OR_WORD) {
    if (s.includes(w)) return true;
  }
  // Hebrew/Arabic/Russian keywords — case folding is a no-op for these scripts,
  // but lowercasing the haystack is harmless; substring (contains) match.
  for (const k of OPTOUT_KEYWORDS) {
    if (s.includes(k.toLowerCase())) return true;
  }
  return false;
}

/**
 * The single Hebrew confirmation we send once a contact opts out. Mirrors the
 * existing telegram-user-webhook/lib.ts copy. After this the bot is silent for
 * proactive/marketing messages; the person can always write again (a fresh
 * inbound) and still get a reply. `channelName` lets a caller name the channel in
 * the line; omitted → the generic "Switchy AI" wording.
 */
export function OPTOUT_CONFIRM_REPLY(channelName?: string): string {
  const who = channelName && channelName.trim() ? channelName.trim() : "Switchy AI";
  return `הוסרתם מרשימת ההודעות של ${who} ✅ לא נשלח אליכם יותר הודעות יזומות. ` +
    `אם תרצו לחזור — פשוט כתבו לנו שוב כאן.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPRESSION REGISTRY — public.marketing_suppression (fail-soft)
// ─────────────────────────────────────────────────────────────────────────────
// channel = 'whatsapp' | 'telegram'; contact = phone (E.164) for whatsapp,
// "tg:<chatId>" for telegram. (channel, contact) is unique → re-opting-out is an
// idempotent no-op. service_role only; these go through the shared serviceFetch.

export type SuppressionChannel = "whatsapp" | "telegram";

// PostgREST-encode a value for a `column=eq.<value>` filter.
function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/**
 * True if (channel, contact) is on the durable do-not-contact registry. FAIL-SOFT:
 * on ANY error (missing service-role env, network, non-2xx) we return false — we do
 * NOT over-block on a transient failure — but we LOG it so the gap is visible. The
 * authoritative §30A gate at SEND time is this table; a reactive reply to the
 * person's own inbound is always allowed regardless.
 */
export async function isSuppressed(channel: SuppressionChannel, contact: string): Promise<boolean> {
  const c = String(contact ?? "").trim();
  if (!c) return false;
  try {
    const path = `/rest/v1/marketing_suppression?channel=${eq(channel)}&contact=${eq(c)}&select=channel&limit=1`;
    const r = await serviceFetch(path, { method: "GET" });
    if (!r || !r.ok) {
      jlog({ at: "isSuppressed", channel, ok: false, status: r?.status });
      return false; // fail-soft: never over-block on error
    }
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    jlog({ at: "isSuppressed", channel, ok: false, error: String(e) });
    return false;
  }
}

/**
 * Idempotent upsert of a do-not-contact row. ON CONFLICT (channel, contact) DO
 * NOTHING via PostgREST `resolution=ignore-duplicates`, so a repeat STOP is a
 * harmless no-op. FAIL-SOFT: never throws — logs and returns on error. `reason`
 * is audit context (e.g. 'whatsapp_stop' / 'telegram_stop' / 'erasure_request').
 */
export async function recordSuppression(
  channel: SuppressionChannel,
  contact: string,
  reason: string,
): Promise<void> {
  const c = String(contact ?? "").trim();
  if (!c) return;
  try {
    const r = await serviceFetch(
      "/rest/v1/marketing_suppression?on_conflict=channel,contact",
      {
        method: "POST",
        headers: { "Prefer": "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ channel, contact: c, reason: String(reason ?? "").slice(0, 120) }),
      },
    );
    if (!r || !r.ok) {
      jlog({ at: "recordSuppression", channel, ok: false, status: r?.status });
    }
  } catch (e) {
    jlog({ at: "recordSuppression", channel, ok: false, error: String(e) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENT-13 DATA-SUBJECT HELPERS (Privacy Protection Law)
// ─────────────────────────────────────────────────────────────────────────────
// A person may ask what data we hold ("access") or to delete it ("erasure"). The
// detectors below are BROAD (contains, he/en) so a genuine request is not missed.
// summarizeDataFor is READ-ONLY + PII-MINIMAL (counts only). recordErasureRequest
// does NOT hard-delete — it LOGS the request + suppresses future contact and tells
// the user a human will complete the deletion within the legal timeframe.

// "What do you know about me?" / "what data do you have" / "my data" — REQUEST-
// shaped phrases only. Deliberately NOT the bare token "data": an English
// customer asking "how much data does the plan include?" is a product question,
// not an Amendment-13 access request, and must reach the agent instead of the
// counts summary. Every remaining English keyword carries request context
// ("what …", "my …", "… about me"), so a genuine access request still trips the
// detector however it's phrased — this narrowing only removes the false
// positive, it does not weaken real requests (pinned in compliance_test.ts).
const DATA_ACCESS_KEYWORDS: readonly string[] = [
  "מה אתם יודעים עליי", "מה אתם יודעים עלי",
  "איזה מידע יש עליי", "איזה מידע יש עלי",
  "איזה מידע יש לכם עליי", "איזה מידע יש לכם עלי",
  "מה המידע שלי", "המידע שלי אצלכם",
  "what data", "my data", "data about me",
];

// "Delete my data" / "erase" / "מחק את המידע שלי" / "מחיקת מידע".
const ERASURE_KEYWORDS: readonly string[] = [
  "מחק את המידע שלי", "מחקו את המידע שלי", "מחיקת מידע", "מחק את הנתונים שלי",
  "תמחקו אותי", "מחקו אותי", "למחוק את המידע",
  "delete my data", "erase my data", "erase", "delete my information",
];

/**
 * True if the text reads like an Amendment-13 ACCESS request ("what do you know
 * about me?"). Contains-match (he/en), case-insensitive. Erasure takes precedence
 * upstream (see isErasureRequest) — a "delete my data" is handled as erasure, not
 * access. Pure; empty → false.
 */
export function isDataAccessRequest(text: string): boolean {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return false;
  // Erasure is the stronger, more specific intent — let it win so "delete my
  // data" never resolves to a read-only summary here.
  if (isErasureRequest(s)) return false;
  return DATA_ACCESS_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
}

/**
 * True if the text reads like an Amendment-13 ERASURE request ("delete my data").
 * Contains-match (he/en), case-insensitive. Pure; empty → false.
 */
export function isErasureRequest(text: string): boolean {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return false;
  return ERASURE_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
}

// Count rows matching a PostgREST filter using the exact-count header (no rows
// transferred). Returns null on any error so the summary can say "couldn't read"
// rather than confidently report 0. FAIL-SOFT.
async function countRows(path: string): Promise<number | null> {
  try {
    const r = await serviceFetch(path, {
      method: "GET",
      headers: { "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0" },
    });
    if (!r || (!r.ok && r.status !== 206)) {
      jlog({ at: "countRows", path, ok: false, status: r?.status });
      await r?.body?.cancel?.().catch(() => {});
      return null;
    }
    // PostgREST returns the total in Content-Range: "0-0/<total>" (or "*/<total>").
    const cr = r.headers.get("content-range") ?? "";
    await r.body?.cancel?.().catch(() => {});
    const total = cr.split("/")[1];
    const n = Number(total);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    jlog({ at: "countRows", path, ok: false, error: String(e) });
    return null;
  }
}

// Render a count for the Hebrew summary: a number, or "לא ידוע" when unreadable.
function fmtCount(n: number | null): string {
  return n === null ? "לא ידוע" : String(n);
}

/**
 * READ-ONLY, PII-MINIMAL Hebrew summary of what we hold for (channel, contact).
 * Returns COUNTS ONLY (#conversations, #messages, #leads, current opt-out status)
 * — NEVER raw names/phones/message bodies. FAIL-SOFT: a failed count renders as
 * "לא ידוע" rather than throwing or fabricating a 0.
 *
 * WhatsApp contact = phone; we resolve the contact_id then count its conversations
 * + messages, and the leads filed under that phone. Telegram has no first-class
 * conversation/message store here, so we report the suppression status + any leads
 * keyed by the namespaced contact (counts only).
 */
export async function summarizeDataFor(channel: SuppressionChannel, contact: string): Promise<string> {
  const c = String(contact ?? "").trim();
  const suppressed = await isSuppressed(channel, c);
  const optOutLine = suppressed
    ? "סטטוס דיוור: הוסרתם — לא יישלחו אליכם הודעות יזומות."
    : "סטטוס דיוור: פעיל (לא ביקשתם הסרה).";

  let convCount: number | null = 0;
  let msgCount: number | null = 0;
  let leadCount: number | null = 0;

  if (channel === "whatsapp" && c) {
    // Resolve the contact id (single row) so we can count its child rows.
    let contactId = "";
    try {
      const r = await serviceFetch(
        `/rest/v1/whatsapp_contacts?wa_phone=${eq(c)}&select=id&limit=1`,
        { method: "GET" },
      );
      if (r && r.ok) {
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.id) contactId = String(rows[0].id);
      } else {
        jlog({ at: "summarizeDataFor", step: "contact", ok: false, status: r?.status });
        convCount = null;
        msgCount = null;
      }
    } catch (e) {
      jlog({ at: "summarizeDataFor", step: "contact", ok: false, error: String(e) });
      convCount = null;
      msgCount = null;
    }
    if (contactId) {
      convCount = await countRows(
        `/rest/v1/whatsapp_conversations?contact_id=${eq(contactId)}&select=id`,
      );
      msgCount = await countRows(
        `/rest/v1/whatsapp_messages?contact_id=${eq(contactId)}&select=id`,
      );
    }
    leadCount = await countRows(`/rest/v1/leads?phone=${eq(c)}&select=id`);
  } else {
    // Telegram: no per-contact conversation/message store to read here.
    convCount = null;
    msgCount = null;
    leadCount = await countRows(`/rest/v1/leads?phone=${eq(c)}&select=id`);
  }

  return [
    "📋 סיכום המידע שיש לנו עליכם (ספירות בלבד, ללא פרטים מזהים):",
    `• שיחות: ${fmtCount(convCount)}`,
    `• הודעות: ${fmtCount(msgCount)}`,
    `• פניות/לידים: ${fmtCount(leadCount)}`,
    optOutLine,
    "",
    'לבקשת מחיקה כתבו «מחק את המידע שלי». לפרטים: מדיניות הפרטיות https://switchy-ai.com/privacy',
  ].join("\n");
}

/**
 * Intake for an Amendment-13 ERASURE request. Does NOT hard-delete (deletion stays
 * a HUMAN-reviewed team action). It:
 *   1. logs a "data_erasure_requested" row to public.security_audit_log,
 *   2. records a suppression row (no more proactive contact),
 *   3. returns a Hebrew confirmation: request logged, removal within the legal
 *      timeframe, no further proactive contact.
 * FAIL-SOFT: both writes never throw; the confirmation is returned regardless so
 * the user is always acknowledged.
 */
export async function recordErasureRequest(channel: SuppressionChannel, contact: string): Promise<string> {
  const c = String(contact ?? "").trim();
  // 1) Audit row (counts/ids only — no message bodies). Fail-soft.
  try {
    const r = await serviceFetch("/rest/v1/security_audit_log", {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({
        event: "data_erasure_requested",
        detail: { channel, contact: c, requested_at: new Date().toISOString() },
      }),
    });
    if (!r || !r.ok) {
      jlog({ at: "recordErasureRequest", step: "audit", ok: false, status: r?.status });
    }
  } catch (e) {
    jlog({ at: "recordErasureRequest", step: "audit", ok: false, error: String(e) });
  }
  // 2) Stop all future proactive contact immediately (idempotent, fail-soft).
  await recordSuppression(channel, c, "erasure_request");

  // 3) Honest Hebrew acknowledgement — logged, not yet deleted; human will finish.
  return [
    "בקשת המחיקה שלכם נרשמה ✅",
    "הפסקנו לשלוח אליכם הודעות יזומות לאלתר, והמידע יימחק בהתאם לדרישת החוק בתוך פרק הזמן הקבוע.",
    "אם תרצו לפנות אלינו שוב בעתיד — אתם מוזמנים לכתוב כאן בכל עת.",
  ].join("\n");
}
