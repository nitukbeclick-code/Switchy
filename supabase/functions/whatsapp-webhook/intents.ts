// Pure intent-classification helpers for the whatsapp-webhook edge function —
// extracted so they can be unit-tested without booting `Deno.serve` (the
// notify-lead/*.ts pattern). These decide how an inbound WhatsApp text is routed:
// human handoff, recommendation, greeting, or plain catalogue Q&A.

// Marketing opt-out / STOP — Spam Law (Communications Law §30A) compliance. A
// match short-circuits the WHOLE inbound flow: we flip the contact to opted_out,
// send ONE confirmation, log it, and never run the normal AI reply. Checked
// FIRST, before any other intent (and before any AI fan-out), so a person can
// always get out. Covers the common Hebrew unsubscribe verbs + the universal
// "stop"/"unsubscribe" carriers expect.
export const RE_OPTOUT =
  /(הסר|הסירו|להסיר|תסיר|תסירו|עצור|עצרו|הפסיק|הפסיקו|תפסיק|תפסיקו|ביטול|בטל|בטלו|אל תשלח|לא לשלוח|הפסק לשלוח|\bstop\b|\bunsubscribe\b|\bcancel\b)/i;

// A request to reach a human agent — short-circuits to lead creation + Telegram.
export const RE_HANDOFF =
  /(נציג|אנושי|בן אדם|לדבר עם|תחזרו אלי|תתקשרו|שיחת טלפון|רוצה לדבר|מישהו אמיתי)/;

// "Recommend me a plan" — switches the chat prompt into advisor mode.
export const RE_RECOMMEND =
  /(תמליצ|המלצה|מצא לי|תמצא לי|איזה מסלול|מה הכי|הכי משתלם|הכי זול|מה כדאי|מתאים לי)/;

// An opening greeting / help request — drives the catalogue Q&A with no extra hint.
export const RE_GREETING =
  /^(start|hi|hello|help|היי|שלום|הי|עזרה|מה נשמע|אהלן)\b/i;

export type Intent = "human" | "recommend" | "greeting" | "qa";

/**
 * True if the inbound text is a marketing opt-out / STOP request. Checked BEFORE
 * classifyTextIntent (and before any AI call) in handleMessage so an unsubscribe
 * always wins, regardless of other cues in the same message. Pure so the regex
 * coverage can be pinned in tests. Empty/whitespace → false.
 */
export function isOptOut(text: string): boolean {
  return RE_OPTOUT.test((text ?? "").trim());
}

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
  'ℹ️ זהו השירות של Switch AI (חוסך). ההודעות מטופלות בהתאם למדיניות הפרטיות שלנו: https://app.switchy-ai.com/privacy . בכל רגע אפשר להשיב "הסר" כדי להפסיק לקבל הודעות.';

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
