// Grounded, templated WhatsApp flows for the most common telecom questions —
// "how do I switch?", "what about roaming abroad?", "compare these plans",
// "what's the cheapest?". These are PURE functions over the REAL catalogue
// (_shared/catalogue.ts) so the answers can never fabricate a plan, provider or
// price: every figure quoted comes from a catalogue row we were handed.
//
// Why templates and not just the LLM? Three reasons:
//   1. Determinism for the highest-frequency asks — switching steps and the
//      roaming explainer never change, so a fixed Hebrew answer is faster,
//      cheaper, and immune to model drift/hallucination.
//   2. Grounding — the compare/cheapest replies are assembled directly from
//      catalogue rows, so the numbers are exactly what's in the DB.
//   3. The free-form LLM path (handleChat) stays the fallback for everything
//      these templates don't cover.
//
// detectTopic() classifies the inbound into one of these flows; the builders
// turn (topic + context + catalogue) into a ready-to-send Hebrew message. None
// of this sends anything or touches the DB — index.ts wires it in.

import {
  buildSuggestions,
  CATEGORIES,
  CATEGORY_HE,
  type Plan,
  pickCandidates,
} from "../_shared/catalogue.ts";
import {
  REPLY_ID_BILL,
  REPLY_ID_HUMAN,
  REPLY_ID_OTHER,
  REPLY_ID_SWITCHKIT,
} from "./intents.ts";

// The templated telecom topics we handle deterministically. `null` upstream
// means "no specific topic" → fall through to the general grounded LLM chat.
export type Topic = "switch" | "roaming" | "compare" | "cheapest" | "coverage" | "cancel";

// ── interactive reply structures (consumed by index.ts → _shared/whatsapp.ts) ──
// Structurally compatible with _shared/whatsapp.ts's {id,title}/ListRow/ListSection
// so index.ts can pass these straight into sendButtons / sendList without a shim.
// Declared locally (not imported) to keep flows.ts pure — whatsapp.ts reads env at
// module load, and these builders must stay side-effect-free + unit-testable.
export type QuickReplyButton = { id: string; title: string };
export type FlowListRow = { id: string; title: string; description?: string };
export type FlowListSection = { title?: string; rows: FlowListRow[] };

// Topic cue regexes. Ordered by how specific/actionable they are when scanned by
// detectTopic (switch + cancel are concrete asks and win over a vague compare).
const RE_SWITCH =
  /(לעבור|לעבר|עוברים|מעבר|להחליף ספק|לנייד|מנייד|לניוד|ניוד|להעביר את המספר|איך עוברים|תהליך המעבר|לעזוב את)/;
const RE_CANCEL =
  /(לבטל|מבטל|ביטול מסלול|לנתק|להתנתק|קנס יציאה|דמי יציאה|התחייבות)/;
const RE_ROAMING =
  /(חו"ל|חול|roaming|רומינג|esim|e-sim|נסיע|נוסע|טיול|לטוס|טס |חבילת גלישה בחו|בחו"ל|מחו"ל)/i;
const RE_COVERAGE =
  /(כיסוי|קליטה|אנטנה|coverage|רשת של מי|אזורי שירות|פריסה)/;
const RE_CHEAPEST =
  /(הכי זול|הזול ביותר|הזולה ביותר|זול ביותר|cheapest|הכי משתלם|הכי זולה|מסלול זול)/;
const RE_COMPARE =
  /(להשוות|השוואה|השווה|מול|לעומת|מה ההבדל|איזה יותר טוב|compare|הבדל בין)/;

// Classify an inbound text into a templated telecom topic, or null when none of
// the specific flows fit (the caller then uses the general grounded chat). The
// ordering encodes precedence: a concrete action (switch/cancel) beats roaming,
// which beats the generic compare/cheapest asks. Pure; empty → null.
export function detectTopic(text: string): Topic | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (RE_SWITCH.test(t)) return "switch";
  if (RE_CANCEL.test(t)) return "cancel";
  if (RE_ROAMING.test(t)) return "roaming";
  if (RE_COVERAGE.test(t)) return "coverage";
  if (RE_CHEAPEST.test(t)) return "cheapest";
  if (RE_COMPARE.test(t)) return "compare";
  return null;
}

// Unit suffix for a plan price, mirroring the catalogue convention.
function unit(u?: string): string {
  return u === "package" ? "לחבילה" : u === "day" ? "ליום" : u === "minute" ? "לדקה" : "לחודש";
}

// A compact one-line plan summary used across the flows: "ספק — מסלול: ₪NN לחודש".
function planLine(p: Plan): string {
  const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.hasAbroad && 'כולל חו"ל']
    .filter(Boolean).join(", ");
  const spec = p.specs?.data ?? p.specs?.speed ?? p.specs?.channels ?? p.specs?.["נתונים"] ?? "";
  const detail = spec ? ` · ${spec}` : "";
  return `• ${p.provider} — ${p.plan}: ₪${p.price} ${unit(p.priceUnit)}${detail}${flags ? ` (${flags})` : ""}`;
}

// ── switching steps (deterministic, no catalogue numbers) ─────────────────────
// Israel's "ניוד" (number portability) process is fixed by regulation: the user
// keeps their number, the NEW provider runs the move, and the old line is closed
// automatically. We state the real, regulated steps — no invented timelines.
export function buildSwitchSteps(category?: string): string {
  const what = category && CATEGORY_HE[category] ? ` ${CATEGORY_HE[category]}` : "";
  return [
    `מעבר ספק${what} בישראל הוא פשוט וחינמי, ושומר על אותו מספר 📲`,
    "1) בוחרים מסלול חדש שמתאים לך (אני יכול להמליץ).",
    "2) הספק החדש מבצע את הניוד — לא צריך להתקשר לספק הנוכחי.",
    "3) המספר עובר בדרך כלל תוך יום-יומיים, והקו הישן נסגר אוטומטית.",
    'שווה לבדוק מראש אם נשארה התחייבות/קנס יציאה אצל הספק הנוכחי. רוצה שאמצא לך מסלול זול יותר או אחבר נציג שיסדר הכול?',
  ].join("\n");
}

// ── cancel / commitment explainer (deterministic) ─────────────────────────────
export function buildCancelSteps(): string {
  return [
    "ביטול/מעבר תלוי בעיקר בשאלה אם יש לך עדיין התחייבות:",
    "• ללא התחייבות — אפשר לעבור מתי שרוצים, בלי קנס.",
    "• עם התחייבות — לרוב יש דמי יציאה יחסיים על התקופה שנותרה; כדאי לבדוק בחשבון או מול הספק.",
    "טיפ: בניוד, הספק החדש סוגר את הקו הישן — אין צורך להתקשר ולבטל ידנית. רוצה שאבדוק מסלולים ללא התחייבות?",
  ].join("\n");
}

// ── coverage explainer (deterministic, honest about what we don't have) ───────
// We do NOT hold per-region coverage data, so we never claim one. We explain the
// real landscape (network sharing in Israel) and offer the next honest step.
export function buildCoverageInfo(): string {
  return [
    "לגבי כיסוי 📶 — רוב הספקים בישראל גולשים על אחת מהרשתות הארציות, כך שהקליטה דומה ברוב האזורים.",
    'אין לי נתוני כיסוי לפי כתובת ספציפית, אז לבית/אזור מסוים שווה לבדוק מפת כיסוי של הספק או לשאול שכן/ה באותו אזור.',
    "מבחינת מחיר ותנאים אני בהחלט יכול לעזור להשוות. רוצה שאמליץ על מסלול?",
  ].join("\n");
}

// ── roaming / abroad (grounded in real abroad-capable catalogue rows) ─────────
// Quotes up to 3 REAL abroad plans (cheapest first). Falls back to a grounded
// "no rows" message rather than inventing anything.
export function buildRoamingInfo(plans: Plan[]): string {
  const rows = pickCandidates(plans, { category: "abroad" }, 3);
  const head = 'לחו"ל יש שתי דרכים עיקריות ✈️ — חבילת גלישה מהספק הנוכחי, או eSIM ייעודי למדינת היעד (לרוב זול יותר לגלישה).';
  if (!rows.length) {
    return `${head}\nספר/י לי לאן את/ה טס/ה ולכמה זמן, ואחפש לך את החבילה המשתלמת ביותר. רוצה שאחבר נציג?`;
  }
  const lines = rows.map(planLine);
  return `${head}\nכמה אפשרויות חו"ל מהקטלוג שלנו:\n${lines.join("\n")}\n\nלאן את/ה נוסע/ת ולכמה ימים? כך אדייק את ההמלצה.`;
}

// ── cheapest in a category (grounded) ─────────────────────────────────────────
// The single cheapest regular plan in the (known or asked) category, plus one or
// two runners-up. Asks for the category when it isn't known yet.
export function buildCheapest(plans: Plan[], category?: string): string {
  if (!category) {
    return 'באיזה תחום למצוא לך את הזול ביותר — סלולר, אינטרנט, טלוויזיה או חבילת חו"ל? 🙂';
  }
  const rows = pickCandidates(plans, { category }, 3);
  if (!rows.length) {
    return `עוד אין לי מסלולים בקטגוריה הזו לצערי. רוצה שאבדוק תחום אחר או אחבר נציג?`;
  }
  const heCat = CATEGORY_HE[category] ?? category;
  const lines = rows.map(planLine);
  return `הזולים ביותר ב${heCat} כרגע 👇\n${lines.join("\n")}\n\nרוצה שאתאים לך לפי תקציב או נפח גלישה מסוים?`;
}

// ── compare within a category / under budget (grounded) ───────────────────────
// A short ranked comparison of the cheapest few real plans, optionally filtered
// by the budget we've gathered. Used for "compare X and Y" / "מה ההבדל".
export function buildCompare(plans: Plan[], category?: string, budget?: number): string {
  if (!category) {
    return 'בכיף נשווה! מה נשווה — סלולר, אינטרנט, טלוויזיה או חבילת חו"ל? ואם יש תקציב חודשי, ספר/י לי ואדייק 🙂';
  }
  // Budget-aware candidates when we have a ceiling; else the cheapest few.
  const rows = pickCandidates(plans, { category, budget }, 4);
  if (!rows.length) {
    return `אין לי כרגע מסלולים להשוות בקטגוריה הזו. רוצה לבדוק תחום אחר?`;
  }
  const heCat = CATEGORY_HE[category] ?? category;
  // Only claim "עד ₪N" when EVERY listed row is actually within budget —
  // pickCandidates widens past the ceiling when too few rows qualify, and a
  // header promising "עד ₪40" above a ₪59 row would mislead.
  const withinBudget = !!budget && budget > 0 && rows.every((p) => (p.price ?? 0) <= budget);
  const cap = withinBudget ? ` עד ₪${budget}` : "";
  const lines = rows.map(planLine);
  const tail = rows.length > 1
    ? "ההפרש העיקרי הוא מחיר מול נפח/מהירות והתחייבות. רוצה שאמליץ על אחד מהם לפי הצרכים שלך?"
    : "רוצה שאמליץ לפי תקציב או נפח מסוים?";
  return `השוואת מסלולי ${heCat}${cap} 👇\n${lines.join("\n")}\n\n${tail}`;
}

// Build a grounded saving-aware suggestion block when we know both a category
// and the user's current monthly spend (budget used as the spend baseline). Used
// to enrich the compare/cheapest flows when a budget is present. Returns "" when
// there's nothing cheaper, so the caller can skip it cleanly.
export function buildSavingHint(plans: Plan[], category?: string, spend?: number): string {
  if (!category || !spend || spend <= 0) return "";
  const sugg = buildSuggestions(plans, category, spend, 3).filter((s) => s.annualSaving > 0);
  if (!sugg.length) return "";
  const lines = sugg.map(
    (s) => `• ${s.provider} — ${s.name}: ₪${s.price} (חיסכון עד ~₪${s.annualSaving} בשנה)`,
  );
  return `אם היום את/ה משלם/ת בערך ₪${spend}, אפשר לחסוך:\n${lines.join("\n")}`;
}

// Top-level dispatcher: turn a detected topic + gathered context + catalogue
// into a ready Hebrew reply. Returns null when the topic has no template (the
// caller falls back to the general grounded chat). Centralises the wiring so
// index.ts just asks "is there a templated answer for this?".
export function buildTopicReply(
  topic: Topic,
  plans: Plan[],
  ctx: { category?: string; budget?: number },
): string | null {
  switch (topic) {
    case "switch":
      return buildSwitchSteps(ctx.category);
    case "cancel":
      return buildCancelSteps();
    case "roaming":
      return buildRoamingInfo(plans);
    case "coverage":
      return buildCoverageInfo();
    case "cheapest":
      return buildCheapest(plans, ctx.category);
    case "compare":
      return buildCompare(plans, ctx.category, ctx.budget);
    default:
      return null;
  }
}

// ── dynamic, context-aware quick-reply templates ──────────────────────────────
// These return STRUCTURES (button/list rows), not sent messages — index.ts wires
// them into _shared/whatsapp.ts (sendButtons/sendList). Every label is Hebrew and
// ≤ 20 chars (Meta's button cap; sendButtons/sendList also clip defensively). The
// ids are the structured ids parseReplyId (intents.ts) decodes, so one tap can
// carry a slot. Nothing here sends, persists, or fabricates a plan/price.

// Hebrew labels for the categories we let a user pick by tapping. Drawn from the
// shared CATEGORY_HE so a picker row can never name a category that isn't real.
const PICKER_CATEGORIES: readonly string[] = CATEGORIES;

// The canonical 3-button main menu (compare / human / bill). Mirrors index.ts's
// MENU_BUTTONS but lives here as the single source so the welcome + any re-offer
// share one definition. Returned as data so the caller sends it however it likes.
export function buildMainMenuButtons(): QuickReplyButton[] {
  return [
    { id: "cmp", title: "השוואת מסלול" },
    { id: REPLY_ID_HUMAN, title: "דבר עם נציג" },
    { id: REPLY_ID_BILL, title: "ניתוח חשבון" },
  ];
}

/**
 * Up to 3 context-aware quick replies to offer RIGHT AFTER a recommendation, so
 * the user can act with one tap instead of typing. Always honest + non-pushy:
 *   • "אפשרויות נוספות" (other options) — re-rank, never a fake "better deal";
 *   • "מעבר ספק" (switch-kit) — only when there's a category to switch within;
 *   • "דבר עם נציג" (human) — the §-safe service handoff, always offered last.
 * Buttons cap at 3 (Meta), so we prioritise other→switch→human and trim. Pure.
 */
export function buildPostRecommendButtons(ctx: { category?: string } = {}): QuickReplyButton[] {
  const btns: QuickReplyButton[] = [{ id: REPLY_ID_OTHER, title: "אפשרויות נוספות" }];
  if (ctx.category) {
    // Carry the category on the switch-kit tap so the kit is scoped correctly.
    btns.push({ id: `topic:switch`, title: "איך עוברים?" });
  } else {
    btns.push({ id: REPLY_ID_SWITCHKIT, title: "איך עוברים?" });
  }
  btns.push({ id: REPLY_ID_HUMAN, title: "דבר עם נציג" });
  return btns.slice(0, 3);
}

/**
 * An interactive LIST of the catalogue categories, each row carrying a structured
 * "cat:<category>" id so a tap drops the category straight into context (no extra
 * free-text turn). Used when the bot needs to know "which service?" and a list is
 * friendlier than asking in prose. Grounded: rows come only from CATEGORIES, so a
 * picker can never offer a category we don't actually cover. Pure.
 */
export function buildCategoryPicker(): FlowListSection[] {
  const rows: FlowListRow[] = PICKER_CATEGORIES.map((c) => ({
    id: `cat:${c}`,
    title: CATEGORY_HE[c] ?? c,
  }));
  return [{ title: "תחומים", rows }];
}

/**
 * Up to 3 budget "chip" buttons for a category, each carrying a "budget:<n>" id so
 * a tap fills the budget slot. The ceilings are sensible monthly anchors per
 * category (cellular is cheap, internet/tv/triple pricier) — they are PROMPTS, not
 * claims about what exists; the grounded compare/cheapest flow then quotes only
 * real rows at-or-under the chosen ceiling. Pure; never fabricates a plan.
 */
export function buildBudgetButtons(category?: string): QuickReplyButton[] {
  const ladders: Record<string, number[]> = {
    cellular: [30, 50, 70],
    internet: [60, 90, 120],
    tv: [50, 90, 130],
    triple: [120, 160, 200],
    abroad: [30, 60, 100],
  };
  const ceilings = (category && ladders[category]) || [50, 80, 120];
  return ceilings.slice(0, 3).map((n) => ({ id: `budget:${n}`, title: `עד ₪${n}` }));
}

// ── objection / loyalty honest replies (grounded, never a promise) ────────────
// These answer a push-back or a "should I stay?" without re-pitching the same
// plan. detectObjection / classifyRefinement (intents.ts) decide WHEN to use them.

/**
 * Honest response to an OBJECTION ("too expensive", "I'm locked in", "not enough
 * data"). When we know the category we surface the genuinely cheapest real rows
 * (optionally tighter than the prior budget) so "too expensive" is met with a
 * cheaper REAL option, not a sales line. When we don't know the category yet we
 * ask which service — never invent one. Optional `tighterBudget` lets the caller
 * pass a lowered ceiling the user implied ("something under 40"). Pure + grounded.
 */
export function buildObjectionReply(
  plans: Plan[],
  category?: string,
  tighterBudget?: number,
): string {
  if (!category) {
    return "הבנתי, בוא נדייק 🙂 באיזה תחום מדובר — סלולר, אינטרנט, טלוויזיה או חבילת חו\"ל? ומה התקציב החודשי שמרגיש לך נוח? כך אביא רק אפשרויות שבאמת מתאימות.";
  }
  const rows = pickCandidates(plans, { category, budget: tighterBudget }, 3);
  const heCat = CATEGORY_HE[category] ?? category;
  if (!rows.length) {
    return `הבנתי 🙏 כרגע אין לי מסלול ${heCat} שמתאים לדרישה הזו. רוצה שאבדוק תחום אחר, או שאחבר נציג שיבדוק מולך אפשרויות נוספות?`;
  }
  const cheaper = rows.map(planLine);
  const capLine = tighterBudget && tighterBudget > 0 ? ` עד ₪${tighterBudget}` : "";
  return `הוגן לגמרי — בוא נמצא משהו שמרגיש שווה יותר 👇\nהזולים ב${heCat}${capLine} מהקטלוג:\n${cheaper.join("\n")}\n\nאם יש משהו ספציפי שחשוב לך (נפח, מהירות, ללא התחייבות) — תגיד/י ואצמצם בהתאם.`;
}

/**
 * Honest LOYALTY / retention coaching for a user weighing whether to STAY with
 * their current provider. We never promise the provider will match a price; we
 * give them the real leverage (the genuine market alternatives, as grounded rows)
 * so they can negotiate from facts. §-safe: this is advice, not a guarantee, and
 * it carries NO lead capture. `spend` (current monthly ₪), when known, lets us
 * show the concrete saving a real alternative would give. Pure + grounded.
 */
export function buildLoyaltyReply(
  plans: Plan[],
  category?: string,
  spend?: number,
): string {
  const head =
    "אם בא לך להישאר — לגיטימי לגמרי 🙂 הדרך החכמה היא להתקשר למחלקת השימור של הספק הנוכחי ולבקש להתאים את המחיר. הקלף הכי חזק שלך הוא לדעת מה באמת קיים בשוק:";
  if (!category) {
    return `${head}\nספר/י לי איזה שירות זה (סלולר/אינטרנט/טלוויזיה) וכמה את/ה משלם/ת היום, ואביא לך כמה מחירי שוק אמיתיים שתוכל/י לשים על השולחן.`;
  }
  const hint = buildSavingHint(plans, category, spend);
  const heCat = CATEGORY_HE[category] ?? category;
  if (hint) {
    return `${head}\n${hint}\n\nאלה מחירי שוק אמיתיים — שווה לבקש מהספק הנוכחי להתיישר אליהם. אם לא — אני כאן כדי לעזור לעבור בלי כאב ראש.`;
  }
  const rows = pickCandidates(plans, { category }, 3);
  if (!rows.length) {
    return `${head}\nכרגע אין לי מספיק נתוני ${heCat} להראות לך מחיר שוק. רוצה שאבדוק תחום אחר, או אחבר נציג?`;
  }
  const lines = rows.map(planLine);
  return `${head}\nמחירי שוק אמיתיים ב${heCat} כרגע:\n${lines.join("\n")}\n\nשווה לבקש מהספק להתיישר אליהם. אם תרצה/י — אעזור לעבור.`;
}
