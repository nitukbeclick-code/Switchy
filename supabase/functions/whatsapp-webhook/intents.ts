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

// ── refinement intent cues (objection / loyalty) ─────────────────────────────
// These do NOT change the top-level routing decision (handoff/recommend/greeting/
// qa) — they are an EXTRA, additive signal the agent uses to answer honestly
// instead of re-pitching the same plan. classifyTextIntent stays unchanged; the
// new detectObjection / classifyRefinement read these on the side.
//
// An objection: the user pushed back on a suggestion (too expensive, locked in,
// not enough data, prefers a specific provider/network, distrust). Detecting it
// lets the agent address the concern (grounded) rather than repeat the pitch.
export const RE_OBJECTION =
  /(יקר|ביוקר|מדי|לא שווה|לא משתלם|לא מתאים|לא אהבתי|לא בא לי|פחות|זול יותר|יותר זול|התחייבות|נעול|קנס|לא בטוח|לא סומך|כבר יש לי|לא רוצה את|משהו אחר|אחר|פחות מ)/;

// Loyalty / retention: the user is weighing whether to STAY with their current
// provider (or asks the provider to match a price). This routes to the honest
// retention coach — "what to ask your current provider" — NEVER a promise.
export const RE_LOYALTY =
  /(להישאר|לשמור על|הספק הנוכחי|החברה הנוכחית|שלי כבר|שנים אצל|ותק|נאמנות|לשדרג אצל|להוריד את המחיר|להתמקח|מבצע שימור|שימור לקוחות|לא רוצה לעבור)/;

// The refinement intent — an additive classification layer that runs ALONGSIDE
// classifyTextIntent. `objection` = pushed back on a suggestion; `loyalty` =
// weighing staying/retention; `none` = neither (the normal flow handles it).
export type RefineIntent = "objection" | "loyalty" | "none";

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

/**
 * Additive refinement classifier that runs ALONGSIDE classifyTextIntent. It does
 * not replace the top-level intent; it surfaces whether the turn is a price/lock
 * objection or a stay/retention (loyalty) question so the agent can pick the
 * honest response shape. Precedence: a request for a human is never a refinement
 * (none) — handoff already wins upstream; otherwise objection beats loyalty (a
 * concrete "too expensive" is more actionable than a vague "should I stay?").
 * Empty / neither → "none".
 */
export function classifyRefinement(text: string): RefineIntent {
  const t = (text ?? "").trim();
  if (!t) return "none";
  if (RE_HANDOFF.test(t)) return "none";
  if (RE_OBJECTION.test(t)) return "objection";
  if (RE_LOYALTY.test(t)) return "loyalty";
  return "none";
}

// ── interactive reply-id parsing (button taps + list selections) ─────────────
// Meta echoes a tapped quick-reply button as interactive.button_reply.{id,title}
// and a list selection as interactive.list_reply.{id,title}. The webhook routes
// on the id; we own decoding it. Two id shapes are supported, both stable:
//
//   • LEGACY FLAT ids — the original three menu buttons: "cmp" / "bill" / "human".
//     These keep working byte-for-byte (index.ts still compares against them).
//   • STRUCTURED ids  — "key:value" so a single tap can carry a slot, e.g.
//       "cat:cellular"  → category slot       "budget:50"   → budget slot
//       "topic:roaming" → topic slot          "switchkit"   → switch-kit action
//     A structured id lets a dynamic list (category picker, budget chips) drop the
//     answer straight into context with no extra free-text turn.
//
// Everything here is PURE — index.ts decides what to DO with the parse (send a
// prompt, run the agent, raise a human). We never fabricate: an unknown id maps
// to a safe { action: "menu" } so the bot re-offers the main menu instead of
// guessing. The §30A opt-out + §7b disclosure paths are untouched (a button can
// never opt a person in or capture a lead — only the consent-gated tool does).

// What a tapped button / selected list row resolves to. `slots` are merged into
// ConvContext by the caller (same shape as context.ts Slots, kept loose here to
// avoid a cross-file type cycle). `action` is the coarse thing to do; `intent`
// mirrors classifyTextIntent so the caller can reuse its existing routing.
export type ReplyAction =
  | "compare" // open the compare/recommend flow
  | "bill" // prompt for / analyse a bill
  | "human" // hand off to a human (service action)
  | "switchkit" // user wants the switch-kit / how-to-move
  | "recommend" // re-run a recommendation (e.g. "show me other options")
  | "menu"; // unknown / generic → re-offer the main menu

export type ReplyParse = {
  action: ReplyAction;
  intent: Intent;
  slots: { category?: string; budget?: number; abroad?: boolean; topic?: string };
};

// The canonical flat ids the original menu uses — kept as exported consts so
// flows.ts (which builds the buttons) and index.ts (which routes them) agree on
// the literals without duplicating magic strings.
export const REPLY_ID_COMPARE = "cmp";
export const REPLY_ID_BILL = "bill";
export const REPLY_ID_HUMAN = "human";
export const REPLY_ID_SWITCHKIT = "switchkit";
export const REPLY_ID_OTHER = "other"; // "show me other options" → refine

// Map a coarse action to the Intent classifyTextIntent would have produced, so
// the caller's downstream switch (which keys off intent) keeps working.
function actionIntent(action: ReplyAction): Intent {
  switch (action) {
    case "human":
      return "human";
    case "compare":
    case "recommend":
      return "recommend";
    default:
      return "qa";
  }
}

/**
 * Decode an interactive reply id (button tap OR list selection) into the action,
 * the equivalent text-intent, and any slot it carries. Pure + total: every input
 * resolves to a defined ReplyParse, and an unrecognised id degrades to the safe
 * { action: "menu" } rather than guessing. The optional `title` (the row/button
 * label) is only used as a last-resort hint when the id itself is opaque.
 *
 * Backward compatible: the legacy flat ids "cmp"/"bill"/"human" resolve exactly
 * as index.ts handled them before, so existing menus are unaffected.
 */
export function parseReplyId(id: string, title?: string): ReplyParse {
  const raw = String(id ?? "").trim().toLowerCase();
  const slots: ReplyParse["slots"] = {};

  // Structured "key:value" id — a single tap that also fills a slot.
  if (raw.includes(":")) {
    const [k, ...rest] = raw.split(":");
    const v = rest.join(":").trim();
    if (k === "cat" || k === "category") {
      if (v) slots.category = v;
      return { action: "compare", intent: "recommend", slots };
    }
    if (k === "budget" || k === "max") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) slots.budget = Math.round(n);
      return { action: "compare", intent: "recommend", slots };
    }
    if (k === "topic") {
      if (v) slots.topic = v;
      if (v === "abroad" || v === "roaming") slots.abroad = true;
      const action: ReplyAction = v === "switch" ? "switchkit" : "compare";
      return { action, intent: actionIntent(action), slots };
    }
    // Unknown structured key → fall through to the flat matcher on the key.
  }

  // Flat ids (legacy + new single-word actions).
  switch (raw) {
    case REPLY_ID_COMPARE:
    case "compare":
      return { action: "compare", intent: "recommend", slots };
    case REPLY_ID_BILL:
      return { action: "bill", intent: "qa", slots };
    case REPLY_ID_HUMAN:
    case "agent":
    case "rep":
      return { action: "human", intent: "human", slots };
    case REPLY_ID_SWITCHKIT:
    case "switch":
    case "move":
      slots.topic = "switch";
      return { action: "switchkit", intent: "qa", slots };
    case REPLY_ID_OTHER:
    case "more":
    case "others":
      return { action: "recommend", intent: "recommend", slots };
  }

  // Last resort: if the id was opaque but the human-readable title clearly asks
  // for a human, honour that (the label is what the user actually tapped).
  if (title && RE_HANDOFF.test(title)) {
    return { action: "human", intent: "human", slots };
  }
  return { action: "menu", intent: "qa", slots };
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
