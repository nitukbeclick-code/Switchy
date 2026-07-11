// Pure intent-classification helpers for the whatsapp-webhook edge function —
// extracted so they can be unit-tested without booting `Deno.serve` (the
// notify-lead/*.ts pattern). These decide how an inbound WhatsApp text is routed:
// human handoff, recommendation, greeting, or plain catalogue Q&A.

// Marketing opt-out / STOP — Spam Law (Communications Law §30A) compliance is now
// owned by _shared/compliance.ts (isOptOut), the UNIFIED contains-match detector
// (he/en/ar/ru + multi-word + slash) shared across every channel so the rule can
// never drift. The webhook imports it from there; the old narrow RE_OPTOUT/isOptOut
// that lived here were removed so there is exactly one source of truth.

// A request to reach a human agent — short-circuits to lead creation + Telegram.
export const RE_HANDOFF =
  /(נציג|אנושי|בן אדם|לדבר עם|תחזרו אלי|תתקשרו|שיחת טלפון|רוצה לדבר|מישהו אמיתי)/;

// "Recommend me a plan" — switches the chat prompt into advisor mode.
export const RE_RECOMMEND =
  /(תמליצ|המלצה|מצא לי|תמצא לי|איזה מסלול|מה הכי|הכי משתלם|הכי זול|מה כדאי|מתאים לי)/;

// An opening greeting / help request — drives the catalogue Q&A with no extra hint.
export const RE_GREETING =
  /^(start|hi|hello|help|היי|שלום|הי|עזרה|מה נשמע|אהלן)\b/i;

// ── refinement intent cue (objection) ─────────────────────────────────────────
// This does NOT change the top-level routing decision (handoff/recommend/greeting/
// qa) — it is an EXTRA, additive signal the agent uses to answer honestly
// instead of re-pitching the same plan. classifyTextIntent stays unchanged;
// detectObjection reads it on the side.
//
// An objection: the user pushed back on a suggestion (too expensive, locked in,
// not enough data, prefers a specific provider/network, distrust). Detecting it
// lets the agent address the concern (grounded) rather than repeat the pitch.
export const RE_OBJECTION =
  /(יקר|ביוקר|מדי|לא שווה|לא משתלם|לא מתאים|לא אהבתי|לא בא לי|פחות|זול יותר|יותר זול|התחייבות|נעול|קנס|לא בטוח|לא סומך|כבר יש לי|לא רוצה את|משהו אחר|אחר|פחות מ)/;

export type Intent = "human" | "recommend" | "greeting" | "qa";

// Contact statuses that mean "this person opted out of marketing". The outbound
// path must never send a PROACTIVE/marketing message (e.g. the welcome menu) to
// such a contact — only reactive service replies to their own inbound, and even
// those degrade to plain text (no marketing menu).
export function isOptedOut(status: unknown): boolean {
  return String(status ?? "").toLowerCase() === "opted_out";
}

/**
 * Classify an inbound text message into an intent. Mirrors the ordering in
 * handleMessage: handoff wins outright, otherwise recommend > greeting > qa.
 * (Image messages are classified as "bill" upstream and never reach here.)
 * NOTE: opt-out is handled separately (isOptOut) and short-circuits before this.
 */
export function classifyTextIntent(text: string): Intent {
  const t = (text ?? "").trim();
  if (RE_HANDOFF.test(t)) return "human";
  if (RE_RECOMMEND.test(t)) return "recommend";
  if (RE_GREETING.test(t)) return "greeting";
  return "qa";
}

/**
 * True if the inbound text reads like an OBJECTION to a suggestion the bot just
 * made — "too expensive", "I'm locked in", "not enough data", "something else".
 * Pure + additive: it never changes classifyTextIntent's routing, it only tells
 * the agent the user pushed back so it can answer the concern (grounded, from the
 * catalogue) rather than re-pitch the same plan. Empty → false. A handoff request
 * is NOT an objection (the person wants a human, not a better plan).
 */
export function detectObjection(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (RE_HANDOFF.test(t)) return false;
  return RE_OBJECTION.test(t);
}

// The single confirmation we send when a contact opts out. After this the bot
// goes silent for proactive/marketing messages; the person can still write again
// and get a reply (their re-engagement is itself a fresh inbound).
export const OPTOUT_CONFIRM_REPLY =
  "הוסרת מרשימת הדיוור. לא נשלח אליך הודעות יזומות. אפשר לכתוב שוב בכל עת.";

// One-line §11 (Privacy Protection Law) transparency notice, appended to the
// FIRST bot reply a contact ever gets — who we are, where the privacy policy is,
// and how to stop. Kept to one short paragraph so it doesn't bury the greeting,
// and NOT repeated on later messages.
export const FIRST_CONTACT_NOTICE =
  'ℹ️ זהו השירות של Switchy AI. ההודעות מטופלות בהתאם למדיניות הפרטיות שלנו: https://app.switchy-ai.com/privacy . בכל רגע אפשר להשיב "הסר" כדי להפסיק לקבל הודעות.';

/**
 * Append the one-time §11 privacy notice to a bot reply, but only on a contact's
 * FIRST inbound (first === true). On every later message the reply is returned
 * unchanged, so the notice is shown exactly once. Pure + side-effect-free so the
 * "first contact only" gate is unit-testable without the DB.
 */
export function withFirstContactNotice(reply: string, first: boolean): string {
  if (!first) return reply;
  const body = reply ?? "";
  return body ? `${body}\n\n${FIRST_CONTACT_NOTICE}` : FIRST_CONTACT_NOTICE;
}

/**
 * Extract the human-readable text from a Meta message envelope: the `text.body`
 * for text messages, or the `image.caption` for image messages. Tolerant of the
 * loosely-typed Graph payload — anything missing collapses to "".
 */
export function messageText(m: Record<string, unknown>): string {
  const type = String(m?.type ?? "text");
  if (type === "text") {
    return String((m as { text?: { body?: string } }).text?.body ?? "");
  }
  return String((m as { image?: { caption?: string } }).image?.caption ?? "");
}
