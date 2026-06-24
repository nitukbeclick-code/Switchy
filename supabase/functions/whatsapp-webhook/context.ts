// Multi-turn conversation context for the WhatsApp bot — pure, testable helpers
// extracted from index.ts so the "remember what we were talking about" logic can
// be unit-tested without booting Deno.serve or hitting the DB.
//
// The bot persists a small, structured memory on whatsapp_conversations.ai_state
// (the jsonb column the schema already reserves for "advisor answers gathered,
// last category…"). On each turn we:
//   1. read the stored ConvContext (last category, budget, abroad, topic),
//   2. extract any NEW slots the current message reveals,
//   3. merge — new always wins, old fills the gaps — so a terse follow-up like
//      "וכמה זה עולה?" still knows we were talking about cellular under ₪50.
//
// Everything here is side-effect-free and grounded only in what the user said;
// it never invents catalogue data (that stays in _shared/catalogue.ts).

import { normalizeCategory } from "../_shared/catalogue.ts";
import type { Topic } from "./flows.ts";
import { detectTopic } from "./flows.ts";
import { detectObjection } from "./intents.ts";

// The structured memory we keep per conversation. Persisted as JSON in
// whatsapp_conversations.ai_state; every field optional so a fresh/older row
// (empty {}) parses cleanly. Kept deliberately small + flat.
export type ConvContext = {
  category?: string; // cellular/internet/tv/triple/abroad (normalized)
  budget?: number; // rough monthly ₪ ceiling the user mentioned
  abroad?: boolean; // user signalled travel/roaming matters
  provider?: string; // current provider the user named (raw, lowercased token)
  topic?: Topic; // last telecom topic discussed (switch/roaming/compare/price…)
  turns?: number; // how many inbound turns we've handled (for light pacing)
  // ADDITIVE: the last objection the user raised ("יקר"/"התחייבות"/…), so a
  // follow-up turn still knows they pushed back and the agent can keep answering
  // the concern instead of re-pitching. Sticky-last (the most recent push-back).
  // Optional + tolerated-on-load, so older ai_state rows parse unchanged.
  objection?: boolean;
};

// Slots a single inbound message reveals, before merging with prior context.
export type Slots = {
  category?: string;
  budget?: number;
  abroad?: boolean;
  topic?: Topic;
  // ADDITIVE: true when THIS message reads like an objection/push-back. Drives
  // the agent's objection handling; never changes category/budget routing.
  objection?: boolean;
};

// Parse the stored ai_state jsonb into a ConvContext. Tolerant of anything:
// null, a non-object, or unexpected field types all collapse to {}. We only
// trust fields whose shape we recognise (so a stray key can't poison routing).
export function parseContext(raw: unknown): ConvContext {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const ctx: ConvContext = {};
  if (typeof o.category === "string" && o.category) ctx.category = o.category;
  if (typeof o.budget === "number" && Number.isFinite(o.budget) && o.budget > 0) ctx.budget = o.budget;
  if (typeof o.abroad === "boolean") ctx.abroad = o.abroad;
  if (typeof o.provider === "string" && o.provider) ctx.provider = o.provider;
  if (typeof o.topic === "string" && o.topic) ctx.topic = o.topic as Topic;
  if (typeof o.turns === "number" && Number.isFinite(o.turns) && o.turns >= 0) ctx.turns = o.turns;
  if (typeof o.objection === "boolean") ctx.objection = o.objection;
  return ctx;
}

// A rough monthly budget (₪) from free text: a 2-4 digit number near a price cue
// ("עד 60", "תקציב 50", "₪80", "100 שקל"), else the first standalone 2-3 digit
// number that reads like a monthly bill (10-500). Returns undefined when nothing
// price-like is present — we never guess a budget from an arbitrary digit.
export function extractBudget(text: string): number | undefined {
  const s = (text ?? "").toLowerCase();
  const cue = s.match(/(?:עד|תקציב|מחיר|בערך|סביב|₪|שקל[ים]?)[^0-9]{0,8}(\d{2,4})/) ??
    s.match(/(\d{2,4})\s*(?:₪|שקל|ש"ח|שח)/);
  if (cue) {
    const n = Number(cue[1]);
    if (Number.isFinite(n) && n >= 10 && n <= 5000) return n;
  }
  // Bare standalone number that looks like a monthly bill (avoid years/phones).
  const bare = s.match(/(?:^|\s)(\d{2,3})(?:$|\s)/);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n) && n >= 10 && n <= 500) return n;
  }
  return undefined;
}

// Whether the message signals travel / roaming matters. Covers both the נסיע
// (noun) and נוס (verb: נוסע/נוסעת) stems plus the common travel cues.
export function mentionsAbroad(text: string): boolean {
  return /חו"ל|חול|abroad|roaming|esim|נסיע|נוסע|נוסעת|טיול|לטוס|טס |בחו|מחו/i.test(text ?? "");
}

// Extract every slot a single inbound message reveals. category/topic via the
// shared normalizers; budget + abroad via the helpers above. A field is omitted
// (not set) when the message says nothing about it — so the merge can preserve
// what we already knew.
export function extractSlots(text: string): Slots {
  const t = (text ?? "").trim();
  const slots: Slots = {};
  const category = normalizeCategory(t);
  if (category) slots.category = category;
  const budget = extractBudget(t);
  if (budget !== undefined) slots.budget = budget;
  if (mentionsAbroad(t)) slots.abroad = true;
  const topic = detectTopic(t);
  if (topic) slots.topic = topic;
  // Additive: flag a push-back so the agent can answer the concern. Only set when
  // true (an absent field means "this message wasn't an objection"), so the merge
  // doesn't clear a prior objection just because a later turn is neutral.
  if (detectObjection(t)) slots.objection = true;
  return slots;
}

// Merge freshly-extracted slots into the prior context. New always wins; old
// fills the gaps. `abroad` is sticky-true within a conversation: once a user
// said travel matters we keep it true (they rarely "un-travel" mid-chat), unless
// they pick a non-abroad category explicitly — handled by the caller's routing,
// not here. turns is incremented so we can lightly pace re-offers downstream.
export function mergeContext(prev: ConvContext, slots: Slots): ConvContext {
  const next: ConvContext = { ...prev };
  if (slots.category) next.category = slots.category;
  if (slots.budget !== undefined) next.budget = slots.budget;
  if (slots.abroad) next.abroad = true;
  if (slots.topic) next.topic = slots.topic;
  next.turns = (prev.turns ?? 0) + 1;
  return next;
}

// True when the inbound text is a terse follow-up that only makes sense against
// prior context — a bare "וכמה זה עולה?", "ומה עם חו״ל", "כן", "וזה" — i.e. it
// carries a continuation cue and almost no standalone content. Used to decide
// whether to lean on the stored category/topic when classifying.
//
// NOTE: we deliberately AVOID a trailing `\b` here. JS `\b` is a boundary between
// a [A-Za-z0-9_] char and a non-word char, and Hebrew letters are "non-word" to
// it — so `^(…היי)\b` can never match after an all-Hebrew cue (the documented
// RE_GREETING quirk). Instead each cue is anchored with a following boundary that
// works for Hebrew: end-of-string, whitespace, or punctuation.
const FOLLOWUP_RE =
  /^(אז|טוב|אוקיי|אוקי|ok|כן|לא|בטח|סבבה|נשמע טוב|ומה|וכמה|וזה|ואם|ובאמת|נו|וגם|ואיך|ואיזה)(?=\s|$|[?!,.])/i;

export function isFollowUp(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  // Short message (≤ ~6 words) that opens with a continuation cue.
  const words = t.split(/\s+/).length;
  return FOLLOWUP_RE.test(t) && words <= 6;
}

/**
 * The topic to act on for THIS turn, resolving terse continuations against the
 * thread we were on. Precedence:
 *   1. a topic the message states outright (slots.topic) — always wins;
 *   2. otherwise, when the message is a continuation of an existing thread —
 *      either a textual follow-up ("וכמה?") OR a slot-only answer ("עד 40",
 *      "סלולר") that supplies a category/budget/abroad with no topic of its own —
 *      carry the PRIOR topic forward so "compare → 'עד 40'" still compares.
 *   3. else undefined → no templated flow, fall back to general grounded chat.
 * Pure; the caller passes the freshly-extracted slots + the stored prior topic.
 */
export function effectiveTopic(
  text: string,
  slots: Slots,
  priorTopic: Topic | undefined,
): Topic | undefined {
  if (slots.topic) return slots.topic;
  if (!priorTopic) return undefined;
  // A short answer that only supplies a slot (category/budget/abroad) is a
  // continuation of the prior topic even without a "ו…/כן" opener.
  const slotOnly = (slots.category !== undefined || slots.budget !== undefined || slots.abroad !== undefined) &&
    (text ?? "").trim().split(/\s+/).length <= 6;
  return (isFollowUp(text) || slotOnly) ? priorTopic : undefined;
}
