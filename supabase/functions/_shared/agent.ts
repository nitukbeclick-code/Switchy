// ─────────────────────────────────────────────────────────────────────────────
// _shared/agent.ts — runAgent(): the shared, grounded, tool-using brain that
// WhatsApp, the site, and the app all call. ONE persona, ONE catalogue grounding,
// ONE tool loop, ONE set of compliance guardrails — so the three surfaces can
// never drift on what the agent knows or how it behaves.
//
// THE LOOP (Gemini function-calling, bounded ~4 steps):
//   1. Build a Hebrew system prompt = parameterized CONSULTATIVE-CLOSER persona +
//      CITED catalogue rows ([Sn]) + the compliance rules (§30A / §7b / consent).
//   2. Ask Gemini with the tool declarations (_shared/tools.ts), routed by a
//      computed model TIER ("fast" for short/simple/single-tool turns, "smart" for
//      complex/multi-tool/objection turns) — same brain, the cheaper model leads
//      on easy turns, the stronger one on hard ones. Never changes WHAT we answer.
//   3. If it returns functionCall(s): run them IN PARALLEL (the tools are read-only
//      / independent), preserving append+record order, feed the functionResponses
//      back, loop.
//   4. If it returns text: that's the answer.
//   5. Bound to MAX_STEPS; if we hit the cap, ask once more for a text wrap-up.
//
// GRACEFUL DEGRADATION (never hard-fail a customer message):
//   tool-loop on Gemini  →  on rate-limit/error, fall to the plain TEXT chain
//   (generateReply: Gemini → Groq → OpenRouter, no tools)  →  finally to the
//   caller-supplied template-fallback callback. The customer ALWAYS gets a reply.
//
// SMARTER (behavior-additive — better flow, NEVER fabricated): the persona is a
// consultative CLOSING agent. It DIAGNOSES the need (asks price/speed/no-commit
// when undecided) → GROUNDS a recommendation via recommend_plans → HANDLES
// objections (price / "happy with my provider" → suggest_retention_offer or
// refine_recommendation; rejected plans → refine_recommendation using the session's
// rejectedPlanIds/objections) → CLOSES with a consent-gated lead / switch-kit /
// referral. Persuasive but HONEST: no fabricated savings, urgency, or claims.
//
// GUARDRAILS enforced here AND in tools.ts:
//   • bot_enabled human-takeover — the CALLER gates this (the webhook goes silent
//     when a human is in the loop); runAgent assumes it's allowed to answer. We
//     re-state it in the contract so downstream agents wire it correctly.
//   • §30A STOP — honored by the caller FIRST (before runAgent); the persona also
//     never markets to an opted-out user.
//   • §11 first-contact notice — the caller appends it (it's channel-specific);
//     the persona is told to identify as Switchy AI.
//   • §7b commission disclosure — surfaced by create_lead/book_callback BEFORE the
//     hand-off; the persona is told to state it.
//   • consent — create_lead/book_callback refuse without consent===true.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type AiKeys,
  type AiTierOpts,
  appendFunctionCall,
  appendFunctionResponse,
  type ChatTurn,
  cleanReply,
  generateReply,
  generateWithToolsStep,
  type ModelTier,
  newToolContents,
  type ReplyMeta,
} from "./ai.ts";
import { jlog } from "./log.ts";
import { buildCitedCatalogueContext, type Plan as CataloguePlan } from "./catalogue.ts";
import type { ScorablePlan } from "./scoring.ts";
import { TOOL_DECLARATIONS, TOOL_EXECUTORS, type ToolContext, type ToolResult } from "./tools.ts";

export type AgentChannel = "whatsapp" | "site" | "app";

// ── Multilingual support ─────────────────────────────────────────────────────
// The agent serves Israel's mixed population: Hebrew is the default, but a real
// share of users write in Arabic, Russian, or English. We DETECT the user's
// message language and instruct the model to REPLY IN THAT LANGUAGE — while the
// catalogue grounding, the cited [Sn] rows, and every compliance rule stay
// IDENTICAL (same real data, same §30A/§7b/consent gates). Only the reply
// language and the one-line "answer in X" persona directive change. Hebrew stays
// the safe fallback for anything we can't classify.
export type AgentLang = "he" | "ar" | "ru" | "en";

const SUPPORTED_LANGS: readonly AgentLang[] = ["he", "ar", "ru", "en"];

function isSupportedLang(v: unknown): v is AgentLang {
  return typeof v === "string" && (SUPPORTED_LANGS as readonly string[]).includes(v);
}

// Lightweight script-based language detection — no network, no model call. We
// classify by the dominant alphabet of the message's letters:
//   • Hebrew block (U+0590–U+05FF) → he
//   • Arabic block (U+0600–U+06FF) → ar
//   • Cyrillic block (U+0400–U+04FF) → ru
//   • Latin letters → en
// Whichever script supplies the most letters wins; ties and empty/neutral input
// (digits, emoji, punctuation only) fall back to Hebrew (the default audience).
// This is intentionally simple and deterministic so it's unit-testable and can't
// drift; it errs toward Hebrew, which is always a safe reply language here.
export function detectLang(message: string): AgentLang {
  const s = String(message ?? "");
  let he = 0, ar = 0, ru = 0, en = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0590 && c <= 0x05ff) he++;
    else if (c >= 0x0600 && c <= 0x06ff) ar++;
    else if (c >= 0x0400 && c <= 0x04ff) ru++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) en++;
  }
  const max = Math.max(he, ar, ru, en);
  if (max === 0) return "he"; // no script signal → default Hebrew
  // Hebrew wins ties (its block also covers some shared punctuation usage here).
  if (he === max) return "he";
  if (ar === max) return "ar";
  if (ru === max) return "ru";
  return "en";
}

// The per-language reply directive folded into the persona. Each says, IN that
// language: "the user wrote in X — reply only in X, naturally and fluently".
// Hebrew's directive is empty because the base persona is already Hebrew-first.
const LANG_DIRECTIVE: Record<AgentLang, string> = {
  he: "",
  ar: "\n- المستخدم يكتب بالعربية. أجب بالعربية فقط، بشكل طبيعي وواضح. حافظ على نفس الدقة والمصادر [Sn] ونفس قواعد الامتثال.",
  ru: "\n- Пользователь пишет по-русски. Отвечай только на русском, естественно и понятно. Сохраняй те же данные, источники [Sn] и те же правила соответствия.",
  en: "\n- The user is writing in English. Reply ONLY in English, naturally and clearly. Keep the same facts, the same [Sn] citations, and the same compliance rules.",
};

// The base persona is written assuming a Hebrew reply ("ענה/י בעברית בלבד").
// When the detected language is NOT Hebrew, that single line would contradict
// the per-language directive, so we neutralize it into a language-agnostic
// "reply in the user's language" instruction. Hebrew keeps the original line.
const HEBREW_ONLY_LINE = "- ענה/י בעברית בלבד.";
const REPLY_IN_USER_LANG_LINE =
  "- ענה/י בשפת המשתמש (ראה/י ההנחיה בהמשך). שמור/י על אותם נתונים, מקורות [Sn] וכללי ציות.";

// Per-channel persona tuning. WhatsApp = very short, 1-2 emoji ok; site/app =
// slightly fuller, cite [Sn]. The SHARED rules (grounding + compliance + the
// consultative flow) are identical across channels — only length/tone differ.
const CHANNEL_STYLE: Record<AgentChannel, string> = {
  whatsapp:
    "- ענה/י קצר וזורם לוואטסאפ (1-4 משפטים), טון חם ואנושי. מותר אימוג'י אחד-שניים.",
  site:
    "- ענה/י קצר (2-4 משפטים), טון חם ומקצועי. כשמציינים מסלול/מחיר ספציפי, צ_טט/י את המקור [Sn].",
  app:
    "- ענה/י קצר (2-4 משפטים), טון חם ומקצועי. כשמציינים מסלול/מחיר ספציפי, צ_טט/י את המקור [Sn].",
};

// The shared persona = identity + the [Sn] grounding rule + the consultative
// CLOSING playbook + the load-bearing compliance lines the persona must SAY
// (§7b disclosure, consent gate). Everything the tools already enforce (audit,
// validation, real-data refusal mechanics) is TRIMMED — it lived here as prose
// the model didn't need; the tools enforce it regardless. The cited catalogue is
// appended by buildSystemPrompt.
const PERSONA_HEADER =
  `את/ה היועץ/ת החכם/ה של "Switchy AI" — שירות ישראלי להשוואת מסלולי סלולר/אינטרנט/טלוויזיה/חבילה משולבת/חו"ל וחיסכון בחשבונות התקשורת. המטרה: לעזור ללקוח/ה לקבל החלטה ולחסוך — ביושר.
כללים מחייבים:
- ענה/י בעברית בלבד.
- אם הלקוח/ה מבקש/ת לדבר עם נציג / "נציג" / "בן אדם" / "אל תשלח לי בוט" / מתוסכל/ת / רוצה במפורש אדם אמיתי → קרא/י מיד ל-escalate_to_human (הכלי לא דורש אישור). אל תדחוף/י create_lead ואל תבקש/י אישור או פרטים קודם — escalate_to_human הוא הדרך הנכונה והמיידית לחבר נציג.
- התבסס/י אך ורק על נתוני הקטלוג (כל שורה מסומנת [Sn]) ועל תוצאות הכלים. אסור להמציא ספק, מסלול, מחיר, כיסוי, דירוג, חיסכון או דחיפות. אם חסר מידע — אמר/י זאת בכנות, אל תמציא/י.
- ענה/י תחילה על השאלה עצמה — קצר וקונקרטי. אסור מילוי ריק כמו "התהליך פשוט! זה הכל!" או חזרה על "אני כאן לעזור" בלי תוכן. אם נשאלת שאלה — תן/י את התשובה, לא סיסמה.
- שאלות מחיר/ספק ("מה המחירים של הוט", "כמה עולה סלולר ב..."): ענה/י מהקטלוג האמיתי בעזרת recommend_plans. אל תתחמק/י משאלת מחיר עם משפט כללי — אם יש מסלולים מתאימים, ציין/י מספרים אמיתיים (הזול הרלוונטי + מחיר אחרי המבצע אם קיים). אם באמת אין התאמה — אמר/י זאת בכנות והצע/י את הקטגוריה הקרובה.
- שאלות זהות/מי-אתם ("מי אתם", "מי המנהל", "מי עומד מאחורי", "זה אמיתי?"): ענה/י באלגנטיות — Switchy הוא שירות ישראלי להשוואת מסלולי תקשורת ומעבר ספק, ואת/ה היועץ/ת החכם/ה שלו; הצע/י לחבר נציג אנושי אם רוצים אדם. לעולם לא לענות "לא מצליח למצוא את המידע על המנהל" — זו תקלה.
- שיטת הייעוץ (סגירה ביושר): (1) אבחן/י צורך — אם הלקוח/ה מתלבט/ת, שאל/י שאלה אחת קצרה (תקציב/מהירות/בלי-התחייבות/ספק נוכחי). (2) המלץ/י עם הכלי recommend_plans והצג/י עד 3 מסלולים עם סיבה קצרה לכל אחד. (3) טפל/י בהתנגדויות: "יקר" או "טוב לי עם הספק שלי" → suggest_retention_offer (תסריט מיקוח אמיתי) או refine_recommendation; מסלול שנדחה → refine_recommendation שמדלג עליו. (4) סגור/י: הצע/י בעדינות הצעד הבא המתאים — חיבור נציג (escalate_to_human אם ביקשו אדם/מתוסכלים, אחרת create_lead/book_callback), ערכת מעבר (generate_switch_kit) או קוד הפניה (generate_referral_code).
- אל תבטיח/י חיסכון מדויק לאדם ספציפי — רק אם נמסר חשבון נוכחי אמיתי. בלי בדיה של דחיפות ("רק היום"), הטבות או מבצעים שלא בנתונים.
- לפני create_lead/book_callback: אסוף/י שם+טלפון ובקש/י אישור מפורש לתנאי השימוש ולמדיניות הפרטיות (consent). בלי אישור — אל תיצור/י פנייה. לפני create_lead/book_callback/escalate_to_human ציין/י בקצרה ש-Switchy AI עשוי לקבל עמלה מהספק, וזה לא משפיע על המחיר או על ההמלצה.
- החזר/י אך ורק את התשובה הסופית ללקוח. בלי קידומות כמו "THOUGHT"/"תשובה:", בלי טקסט באנגלית.
`;

const MAX_STEPS = 4; // tool-loop iterations before we force a text wrap-up

// ── App-handoff / open-lead awareness ─────────────────────────────────────────
// The Switchy app deep-links a user with an OPEN lead to this WhatsApp number
// with a prefilled status inquiry ("היי, אני {name}. פנייה לגבי {provider} — {plan}
// (שלב {N} מתוך 4). אשמח לעדכון."). The caller (the webhook) looks the lead up in
// public.leads by phone and threads it here so the agent ACKNOWLEDGES the real
// stage instead of restarting a sales pitch. TRUTH-ONLY: the stage text derives
// exclusively from leads.status (the same mapping the app's tracker uses); when
// there is no lead, no section is added and the agent must never claim one exists.
export type ActiveLead = {
  status: string; // raw public.leads.status ('new'|'contacted'|'won'|'lost'|…)
  created_at?: string; // ISO timestamp the lead was opened
  notes?: string; // short, pre-clipped context snippet (never the full notes)
};

// leads.status → the app-tracker stage wording (the EXACT language the customer
// sees in the app: 'new'→stage 1, 'contacted'→stage 2, 'won'→stage 4 (done),
// 'lost'→closed). Returns null for any unknown/empty status — the caller then
// surfaces the RAW status honestly instead of inventing a stage. Pure + total.
export function leadStageText(status: unknown): string | null {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "new":
      return "הפרטים נשלחו בהצלחה (שלב 1 מתוך 4)";
    case "contacted":
      return "נציג אישר את הבקשה (שלב 2 מתוך 4)";
    case "won":
      return "המעבר הושלם (שלב 4 מתוך 4)";
    case "lost":
      return "הפנייה נסגרה";
    default:
      return null;
  }
}

// True when the inbound text reads like a STATUS INQUIRY about an existing
// request — either the app's prefilled handoff message (contains "שלב" + "מתוך 4",
// or "אשמח לעדכון", or "פנייה לגבי") or a plain-language "what's happening with my
// request" ask. Deliberately conservative: a price/comparison question is NOT a
// status inquiry. Pure + total (empty/garbage → false) so it's unit-testable.
export function isLeadStatusInquiry(text: string): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  // The app's prefilled deep-link message shapes (exact fragments it emits).
  if (t.includes("שלב") && t.includes("מתוך 4")) return true;
  if (t.includes("אשמח לעדכון")) return true;
  if (t.includes("פנייה לגבי")) return true;
  // Plain-language status asks about an existing request/lead.
  return /סטטוס|מה (?:מצב|קורה עם|עם) הפנייה|מה (?:מצב|קורה עם|עם) הבקשה|עדכון על הפנייה|עדכון על הבקשה|איפה (?:הפנייה|הבקשה) שלי/
    .test(t);
}

// Build the ACTIVE-LEAD system-prompt section. Empty string when there is no
// lead (or no status) — the prompt is then byte-identical to before, so every
// existing caller is unaffected. TRUTH-ONLY: the stage line comes ONLY from
// leadStageText(status); an unknown status is surfaced raw, never dressed up as
// progress. When the CURRENT message already matches the handoff pattern we add
// one explicit line so the model opens with the real stage. Pure + total.
export function buildActiveLeadSection(lead: ActiveLead | null | undefined, message: string): string {
  if (!lead) return "";
  const status = String(lead.status ?? "").trim();
  if (!status) return "";
  const stage = leadStageText(status);
  const lines: string[] = [
    `- שלב אמיתי: ${stage ?? `סטטוס במערכת: "${status}" (אין לו ניסוח שלב מוגדר — ציין/י אותו כפי שהוא, אל תמציא/י התקדמות)`}`,
  ];
  const opened = String(lead.created_at ?? "").slice(0, 10);
  if (opened) lines.push(`- נפתחה בתאריך: ${opened}`);
  const notes = String(lead.notes ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (notes) lines.push(`- הקשר מהפנייה: ${notes}`);
  let section = "\n\nללקוח/ה יש פנייה פעילה במערכת (נתוני אמת מה-DB — אסור להמציא מעבר להם):\n" +
    lines.join("\n") +
    '\nכלל מחייב: אם הלקוח/ה שואל/ת על הפנייה/הבקשה/הסטטוס שלו/ה (או שההודעה מגיעה מהאפליקציה — מכילה "שלב X מתוך 4" / "אשמח לעדכון" / "פנייה לגבי") — פתח/י תחילה באישור השלב האמיתי לפי הסטטוס למעלה, בשפה של האפליקציה, בלי להמציא התקדמות; הצע/י עזרה או חיבור לצוות האנושי (escalate_to_human); ואל תתחיל/י מחדש שיחת מכירה/השוואה אלא אם הלקוח/ה מבקש/ת במפורש משהו חדש. אם הלקוח/ה שואל/ת שאלה חדשה אחרת — ענה/י כרגיל (ההקשר רק זמין לך).';
  if (isLeadStatusInquiry(message)) {
    section += "\nההודעה הנוכחית נראית כשאלת סטטוס מהאפליקציה — פתח/י באישור השלב האמיתי שלמעלה.";
  }
  return section;
}

// ── Tier-aware output-token budget ────────────────────────────────────────────
// The per-turn output cap is keyed on the RESOLVED tier (see selectTier), not a
// single const. A "smart" turn — an objection-handling / closing turn that may
// stack a grounded recommendation + an objection rebuttal + a single honest ask
// in one reply — gets a larger budget so the close is never truncated mid-thought.
// A "fast" turn (a greeting, a one-liner) stays lean: less to say, lower latency
// and cost. Same brain, same facts — only the room to finish the thought differs.
// Pure + deterministic so it's unit-testable and can't drift.
const OUTPUT_TOKENS_BY_TIER: Record<ModelTier, number> = {
  fast: 500, // lean — short, simple turns
  smart: 820, // roomy — recommend + objection + close without truncation
};

// The output-token budget for a given tier. Threaded into BOTH the tool-loop step
// and the text fallback so the whole turn shares one consistent cap.
export function maxOutputTokensForTier(tier: ModelTier): number {
  return OUTPUT_TOKENS_BY_TIER[tier] ?? OUTPUT_TOKENS_BY_TIER.smart;
}

// A friendly last-resort line if literally everything fails (the caller's
// template fallback should normally cover this).
const HARD_FALLBACK =
  "סליחה, נתקלתי בעומס רגעי 🙏 אפשר לנסות שוב עוד רגע, או לפנות אלינו בוואטסאפ. רוצה שאחבר נציג אנושי?";

// ── Optional conversation-shaping memory the caller may thread in ─────────────
// A backward-compatible subset of the session's slots (see _shared/session.ts).
// When present, the persona uses it to REFINE rather than repeat — it does NOT
// invent anything; it only reminds the model of what the user already signalled.
export type AgentMemory = {
  // Plans the user explicitly dismissed — so the model excludes them (and tells
  // refine_recommendation to skip them) instead of re-pitching the same row.
  rejectedPlanIds?: string[];
  // Short free-text objections the user raised (price / lock-in / coverage / …)
  // so the model answers them head-on instead of re-asking.
  objections?: string[];
  // How many turns this session has run — lets the model pace itself (don't push
  // a lead on turn 1; it's fine to close once rapport + a recommendation exist).
  turnCount?: number;
};

export type RunAgentInput = {
  channel: AgentChannel;
  message: string;
  // Prior conversation turns (the unified session's transcript). user/bot roles.
  history?: ChatTurn[];
  keys: AiKeys; // gemini (tools + text), groq, openrouter (text fallback)
  // The grounding catalogue (live public.plans mapped, or the bundled snapshot).
  plans: ScorablePlan[];
  // Audit / lead / escalation sinks + ids, passed straight to every tool.
  toolContext: Omit<ToolContext, "plans" | "channel">;
  // The template-flow fallback: invoked only if BOTH the tool loop and the
  // no-tools text chain produce nothing. MUST return a safe Hebrew reply (the
  // existing per-channel template flow). Keeps "never hard-fail" true.
  templateFallback?: (message: string) => Promise<string> | string;
  // Optional pre-extracted bill facts (from a Vision call the caller already did)
  // so the model can analyze_bill without re-reading the image.
  billHint?: { provider?: string; monthly?: number; category?: string; imageId?: string };
  // Optional reply-language override. When omitted (every existing caller), the
  // language is auto-detected from `message` (Hebrew default). Pass one of
  // he/ar/ru/en to force it (e.g. the caller already knows the user's locale).
  lang?: AgentLang;
  // Optional conversation-shaping memory (rejected plans / objections / turn
  // count) from the unified session. OPTIONAL + additive — every existing caller
  // passes none and behaves exactly as before. When present, the persona refines
  // instead of repeating; nothing is ever fabricated from it.
  memory?: AgentMemory;
  // Optional CURATED, truth-only knowledge block (the verified-FAQ section built by
  // _shared/knowledge.ts formatKnowledgeForPrompt). The CALLER loads it from the DB
  // and passes it down — runAgent itself does NO DB I/O for this, so the same
  // mechanism can later serve site-ai-chat/telegram. OPTIONAL + back-compatible:
  // omitted by every existing caller and then the prompt is identical to before.
  // When present it is injected verbatim so the model answers common questions
  // directly + consistently (fewer tool round-trips = faster). It is approved copy,
  // so it adds NO fabrication risk — the "don't invent" rules still apply.
  knowledgeContext?: string;
  // Optional OPEN LEAD the caller looked up in public.leads for this user (the
  // app-handoff awareness). OPTIONAL + additive: omitted by every existing caller
  // and then the prompt is identical to before. When present, the persona gets a
  // TRUTH-ONLY section (status→stage via leadStageText, created_at, a notes
  // snippet) + the rule to acknowledge the real stage on a status inquiry instead
  // of restarting a sales pitch. Never fabricated: no lead ⇒ no section.
  activeLead?: ActiveLead;
};

export type RunAgentResult = {
  reply: string;
  // How we got the reply — for logging/telemetry, not shown to the user.
  via: "tools" | "text" | "template" | "hard_fallback";
  // Tools that ran this turn (name + ok) so the caller can persist them to the
  // session's tool-call history.
  toolCalls: { name: string; ok: boolean; preview?: string }[];
  // Whether any provider aborted on its timeout (caller may map to a 504).
  timedOut: boolean;
  // Conversation-shaping memory the agent HARVESTED this turn from tool results
  // (refine_recommendation echoes the rejected plan ids + the parsed objections in
  // its data). The caller mergeSlots()es this into the session so `memory` actually
  // shapes the NEXT turn — this is the write-side that ACTIVATES the otherwise-inert
  // rejectedPlanIds/objections memory on every surface. Omitted when nothing was
  // harvested (backward-compatible). TRUTH-ONLY: only real strings a tool produced.
  slotPatch?: { rejectedPlanIds?: string[]; objections?: string[] };
};

// Harvest the conversation-shaping memory a tool surfaced in its result `data`.
// refine_recommendation echoes `rejectedPlanIds` (the ids the user dismissed) and
// `objections` (the parsed objection tags) precisely so they can be persisted into
// the session slots; this collects them, deduped, into the caller's accumulators.
// Bounds mirror session.ts clipSlots (64 / 120) as defence in depth — mergeSlots +
// clipSlots also cap. Pure + total: a tool with neither key contributes nothing.
function harvestMemory(res: ToolResult, rejected: Set<string>, objections: Set<string>): void {
  const d = res.data;
  if (!d) return;
  if (Array.isArray(d.rejectedPlanIds)) {
    for (const x of d.rejectedPlanIds) {
      if (typeof x === "string" && x.trim()) rejected.add(x.trim().slice(0, 64));
    }
  }
  if (Array.isArray(d.objections)) {
    for (const x of d.objections) {
      if (typeof x === "string" && x.trim()) objections.add(x.trim().slice(0, 120));
    }
  }
}

// ── Model tier selection ──────────────────────────────────────────────────────
// Pick the answer profile for THIS turn (see _shared/ai.ts ModelTier):
//   • "smart" — complex / multi-signal / objection-handling turns get the stronger
//     model (today's default), where copy + flow matter most.
//   • "fast"  — short, simple, low-context turns (a greeting, a one-liner, the
//     first turn with no history) lead with the cheaper/lower-latency model.
// This only RE-ORDERS the existing Gemini candidate chain (ai.ts modelsForTier):
// every model stays reachable, the full degradation chain is intact, and the
// answer is never fabricated — same brain, the right model leads.
//
// We bias toward "smart" whenever there's any sign the turn is consequential
// (an objection, prior rejections, a longer/question-laden message, or enough
// history that we're mid-consultation). Pure, deterministic, unit-testable.
const FAST_MAX_LEN = 64; // a short message (chars) is a "simple" signal
// Objection / negotiation / closing intent words (he/ar/ru/en) — any hit ⇒ smart.
const OBJECTION_HINT =
  /יקר|מחיר|ביטול|לעבור|מתלבט|שכנע|לא משתלם|התחייבות|נציג|expensive|cheaper|switch|cancel|convince|retention|دفع|غالي|الانتقال|إلغاء|дорого|перейти|отмен/i;

export function selectTier(input: {
  message: string;
  historyLen: number;
  memory?: AgentMemory;
  hasBill?: boolean;
}): ModelTier {
  const msg = String(input.message ?? "");
  const objections = input.memory?.objections ?? [];
  const rejected = input.memory?.rejectedPlanIds ?? [];
  // Any consequential signal ⇒ smart.
  const consequential =
    OBJECTION_HINT.test(msg) || // explicit objection / closing intent in the text
    objections.length > 0 || // the user already raised an objection earlier
    rejected.length > 0 || // we're refining past a rejected plan
    !!input.hasBill || // a bill in play ⇒ a real recommendation/saving turn
    input.historyLen >= 4 || // mid-consultation (≥2 user+bot exchanges)
    msg.length > FAST_MAX_LEN || // a longer, detailed ask
    (msg.match(/\?/g)?.length ?? 0) >= 2; // multiple questions in one turn
  return consequential ? "smart" : "fast";
}

function buildSystemPrompt(
  channel: AgentChannel,
  plans: ScorablePlan[],
  lang: AgentLang,
  billHint?: RunAgentInput["billHint"],
  memory?: AgentMemory,
  knowledgeContext?: string,
  activeLead?: ActiveLead,
  userMessage?: string,
): string {
  const cited = buildCitedCatalogueContext(plans as CataloguePlan[]);
  const styleLine = CHANNEL_STYLE[channel];
  // For non-Hebrew replies, neutralize the "answer in Hebrew only" rule and add
  // the per-language directive. Hebrew keeps the original (the directive is "").
  const header = lang === "he"
    ? PERSONA_HEADER
    : PERSONA_HEADER.replace(HEBREW_ONLY_LINE, REPLY_IN_USER_LANG_LINE);
  let prompt = header + LANG_DIRECTIVE[lang] + "\n" + styleLine +
    "\n\nנתוני מסלולים אמיתיים (מקור | קטגוריה | ספק | מסלול | מחיר | תכונות):\n" + cited;
  // Curated, truth-only verified-FAQ block (when the caller supplied one). It is
  // approved copy the model may answer common questions from directly — placed
  // after the catalogue so it reads as another grounded source, never a license
  // to invent (the "don't fabricate" rules above still bind).
  if (knowledgeContext && knowledgeContext.trim()) {
    prompt += "\n\n" + knowledgeContext.trim();
  }
  if (billHint && Number(billHint.monthly) > 0) {
    prompt += `\n\nנתוני חשבון שחולצו מהתמונה (לשימוש עם analyze_bill): ` +
      `ספק=${billHint.provider ?? "?"}, סכום חודשי=₪${Math.round(Number(billHint.monthly))}` +
      (billHint.category ? `, קטגוריה=${billHint.category}` : "");
  }
  // Fold the conversation-shaping memory into the prompt so the model refines
  // instead of repeating. Honest framing — it's only what the user already told
  // us; the model still grounds every fact in the catalogue + tool results.
  const memLine = buildMemoryLine(memory);
  if (memLine) prompt += memLine;
  // App-handoff / open-lead awareness: when the caller found an OPEN lead for
  // this user, fold in the TRUTH-ONLY status section + the acknowledge-first
  // rule (see buildActiveLeadSection). No lead ⇒ "" ⇒ prompt unchanged.
  const leadSection = buildActiveLeadSection(activeLead, userMessage ?? "");
  if (leadSection) prompt += leadSection;
  // A turn-budget-aware CLOSING nudge: when we're mid/late in the conversation OR
  // a bill/recommendation is in play, append one honest line telling the model to
  // make a single clear ask for the close. §7b-respecting, no fabricated savings,
  // no pressure. Absent on early small-talk turns (it would push too soon).
  const closeLine = buildClosingNudge(memory, billHint);
  if (closeLine) prompt += closeLine;
  return prompt;
}

// The conversation is "late enough to close" once we're a few exchanges in. Each
// session turn adds a user+bot pair, so turnCount ≥ 2 means rapport + at least one
// real exchange exists — the honest moment to offer the next step, not before.
const CLOSE_MIN_TURNS = 2;

// A single honest CLOSING line for the system prompt, gated on the turn budget.
// Returns it only when the conversation is mid/late (memory.turnCount ≥ threshold)
// OR a real bill is in play (a saving/recommendation turn) — otherwise "" so early
// small-talk turns aren't pushed. The line instructs ONE clear ask (book a callback
// / connect a rep), §7b-respecting, with no fabricated savings, urgency, or pressure.
export function buildClosingNudge(memory?: AgentMemory, billHint?: RunAgentInput["billHint"]): string {
  const turnCount = Number(memory?.turnCount ?? 0);
  const billInPlay = Number(billHint?.monthly) > 0;
  const lateEnough = turnCount >= CLOSE_MIN_TURNS;
  if (!lateEnough && !billInPlay) return "";
  return "\n\nסגירה (כשמתאים): אם יש כבר המלצה או חשבון על השולחן, סיים/י בבקשה אחת ברורה וקצרה לצעד הבא — " +
    "להזמין שיחת חזרה או לחבר נציג — בלי לחץ, בלי דחיפות מומצאת ובלי הבטחת חיסכון שלא נמסר. " +
    "הזכר/י בקצרה ש-Switchy AI עשוי לקבל עמלה מהספק, וזה לא משפיע על המחיר או ההמלצה.";
}

// A short, honest "what the user already signalled" line for the system prompt.
// Empty when there's nothing to remember (backward-compatible). Never invents —
// it's a verbatim recap of the session's rejected-plan ids / objections so the
// model can call refine_recommendation / suggest_retention_offer with context.
function buildMemoryLine(memory?: AgentMemory): string {
  if (!memory) return "";
  const parts: string[] = [];
  const rejected = (memory.rejectedPlanIds ?? []).filter((x) => typeof x === "string" && x).slice(0, 12);
  const objections = (memory.objections ?? []).filter((x) => typeof x === "string" && x).slice(0, 6);
  if (rejected.length) {
    parts.push(`מסלולים שהלקוח/ה כבר דחה/תה (אל תציע/י שוב; השתמש/י ב-refine_recommendation לדלג עליהם): ${rejected.join(", ")}.`);
  }
  if (objections.length) {
    parts.push(`התנגדויות שכבר עלו (טפל/י בהן ישירות, אל תשאל/י שוב): ${objections.join("; ")}.`);
  }
  if (!parts.length) return "";
  return "\n\nהקשר מהשיחה עד כה (אמיתי — רק מה שהלקוח/ה כבר מסר/ה): " + parts.join(" ");
}

// Run one tool by name with the shared context. Unknown tool → a soft error the
// model can recover from (it shouldn't happen — the model only sees declared
// tools — but we never throw into the loop).
async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const exec = TOOL_EXECUTORS[name];
  if (!exec) return { ok: false, reason: "unknown_tool", note: `כלי לא מוכר: ${name}` };
  try {
    return await exec(ctx, args);
  } catch (e) {
    return { ok: false, reason: "error", note: "שגיאה בהרצת הכלי.", data: { error: String(e) } };
  }
}

// ── runAgent ──────────────────────────────────────────────────────────────────
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { channel, message, keys, plans } = input;
  const history = input.history ?? [];
  // Reply language: explicit override wins; otherwise auto-detect from the
  // message (Hebrew default). Backward-compatible — existing callers pass none.
  const lang: AgentLang = isSupportedLang(input.lang) ? input.lang : detectLang(message);
  const system = buildSystemPrompt(
    channel,
    plans,
    lang,
    input.billHint,
    input.memory,
    input.knowledgeContext,
    input.activeLead,
    message,
  );
  const toolCalls: { name: string; ok: boolean; preview?: string }[] = [];
  // Conversation-shaping memory harvested from tool results this turn (deduped).
  // Attached to EVERY return via memoryPatch() so the caller can persist it into
  // the session slots — the write-side that makes `memory` non-inert.
  const rejectedAcc = new Set<string>();
  const objectionAcc = new Set<string>();
  const memoryPatch = (): RunAgentResult["slotPatch"] => {
    const patch: { rejectedPlanIds?: string[]; objections?: string[] } = {};
    if (rejectedAcc.size) patch.rejectedPlanIds = [...rejectedAcc];
    if (objectionAcc.size) patch.objections = [...objectionAcc];
    return patch.rejectedPlanIds || patch.objections ? patch : undefined;
  };
  // Pass the resolved language to the tools so their surfaced notes (retention
  // script, referral line) are localized to the same language as the reply.
  const ctx: ToolContext = { ...input.toolContext, plans, channel, lang };

  // Compute the model tier ONCE for this turn (see selectTier). Pure + cheap; the
  // same tier rides every Gemini call this turn (tool loop + text fallback) so the
  // answer profile stays consistent. Default-equivalent ("smart") for hard turns.
  const tier: ModelTier = selectTier({
    message,
    historyLen: history.length,
    memory: input.memory,
    hasBill: Number(input.billHint?.monthly) > 0,
  });
  const tierOpts: AiTierOpts = { tier };
  // Output-token budget for THIS turn, keyed on the resolved tier — bigger for
  // smart (rich recommend+objection+close) than fast. One cap shared by the tool
  // loop and the text fallback so the whole turn is consistent.
  const maxOutTokens = maxOutputTokensForTier(tier);

  // ── 1) Gemini tool loop (the rich path) ──────────────────────────────────
  if (keys.gemini) {
    try {
      const contents = newToolContents(history, message || "שלום");
      let lastToolNote = ""; // a §7b/consent note a tool surfaced, to fold into the final reply
      for (let step = 0; step < MAX_STEPS; step++) {
        const isLastStep = step === MAX_STEPS - 1;
        // On the final step, drop the tools so the model is forced to produce a
        // text wrap-up instead of asking for yet another tool call.
        const decls = isLastStep ? [] : TOOL_DECLARATIONS;
        const out = await generateWithToolsStep(keys.gemini, system, contents, decls, maxOutTokens, tierOpts);

        if (out.calls.length === 0) {
          // Final text answer. Strip any leaked reasoning/plan preamble (the SAME
          // cleanReply the plain-text chain applies — the tools path skipped it,
          // so a THOUGHT:/English-plan block could reach the user here). Clean
          // BEFORE folding in the tool note so the §7b disclosure is never stripped.
          let reply = cleanReply(out.text);
          if (lastToolNote && reply && !reply.includes(lastToolNote)) {
            reply = `${reply}\n\n${lastToolNote}`;
          }
          reply = reply || lastToolNote;
          if (reply) return { reply, via: "tools", toolCalls, timedOut: false, slotPatch: memoryPatch() };
          break; // empty text with no calls → fall through to text chain
        }

        // Run the requested tools IN PARALLEL — they're read-only / independent
        // (catalogue reads, lead/referral writes that don't depend on each other
        // within a single step), so we don't pay their latencies in series. We
        // PRESERVE ORDER deterministically: append every functionCall in call
        // order first, run the executors with Promise.all, then append every
        // functionResponse + record every toolCall in the SAME order. The model
        // sees an identical transcript to the old sequential loop.
        for (const call of out.calls) appendFunctionCall(contents, call);
        const results = await Promise.all(out.calls.map((call) => runTool(call.name, call.args, ctx)));
        for (let i = 0; i < out.calls.length; i++) {
          const call = out.calls[i];
          const res = results[i];
          toolCalls.push({ name: call.name, ok: res.ok, preview: res.note?.slice(0, 80) });
          // Harvest the memory the tool surfaced (refine_recommendation echoes the
          // rejected ids + parsed objections) so the caller persists it → `memory`
          // shapes the next turn. Truth-only; deduped by the accumulator Sets.
          harvestMemory(res, rejectedAcc, objectionAcc);
          if (res.note) lastToolNote = res.note;
          appendFunctionResponse(contents, call.name, {
            ok: res.ok,
            ...(res.reason ? { reason: res.reason } : {}),
            ...(res.data ?? {}),
            ...(res.note ? { note: res.note } : {}),
          });
        }
        // Loop: the model now sees the tool results and answers (or calls again).
      }
      // Hit the step cap without a text answer — fall through to the text chain.
      jlog({ at: "runAgent.degrade", from: "tools", to: "text", reason: "step_cap" });
    } catch (e) {
      // Gemini tool path failed (rate limit / 5xx / timeout) — degrade to text.
      jlog({ at: "runAgent.degrade", from: "tools", to: "text", error: String(e) });
    }
  }

  // ── 2) Plain text chain (Gemini → Groq → OpenRouter, no tools) ────────────
  // Same grounded system prompt + same tier; no tool calls. Honors timeouts.
  const meta: ReplyMeta = { timedOut: false };
  try {
    const text = await generateReply(keys, system, history, message || "שלום", maxOutTokens, meta, tierOpts);
    if (text) return { reply: text, via: "text", toolCalls, timedOut: meta.timedOut, slotPatch: memoryPatch() };
  } catch (e) {
    jlog({ at: "runAgent.degrade", from: "text", to: "fallback", error: String(e) });
  }

  // ── 3) Template fallback (the existing per-channel flow) ──────────────────
  if (input.templateFallback) {
    try {
      const t = await input.templateFallback(message);
      if (t) return { reply: t, via: "template", toolCalls, timedOut: meta.timedOut, slotPatch: memoryPatch() };
    } catch (e) {
      jlog({ at: "runAgent.degrade", from: "template", to: "hard", error: String(e) });
    }
  }

  // ── 4) Hard fallback — the customer always gets *something* ───────────────
  // Reaching here means every richer path failed — surface it (worst case).
  jlog({ at: "runAgent", ok: false, via: "hard_fallback" });
  return { reply: HARD_FALLBACK, via: "hard_fallback", toolCalls, timedOut: meta.timedOut, slotPatch: memoryPatch() };
}
