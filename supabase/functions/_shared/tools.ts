// ─────────────────────────────────────────────────────────────────────────────
// _shared/tools.ts — the AGENT TOOL REGISTRY. Every tool the grounded agent can
// call lives here as (a) a pure-ish executor that returns REAL catalogue/CRM data
// and (b) a Gemini functionDeclaration the LLM sees. The agent loop in agent.ts
// parses a functionCall, looks the tool up here, runs it, and feeds the result
// back — bounded to a few steps.
//
// HARD RULES baked into every tool (E-E-A-T + Israeli law):
//   • REAL DATA ONLY — search_plans / recommend_plans / get_provider read the
//     live catalogue passed in; they never invent providers/prices/coverage. If
//     a fact is missing they OMIT it, they don't fabricate.
//   • CONSENT-GATED LEADS — create_lead / book_callback refuse unless
//     consent === true (Spam-Law §30A + Privacy §11). They route through
//     _shared/leads.ts (buildAiLeadRow), which is the single honest-consent gate;
//     a missing/false consent returns { ok:false, reason:"consent_required" } and
//     writes NOTHING. §7b commission disclosure is surfaced in the result so the
//     agent states it BEFORE the hand-off.
//   • AUDITED — every tool run appends a crm_events row (activity feed) and, for
//     the sensitive ones (lead/callback/escalation), a security_audit_log row.
//     Best-effort; auditing never blocks the tool.
//   • VALIDATED — inputs are clipped/coerced; nothing is trusted as-is.
//
// Pure-ish: the executors take a ToolContext (catalogue + ids + a logger) so they
// can be unit-tested by passing a fake context. No module-level DB singletons.
// ─────────────────────────────────────────────────────────────────────────────

import type { GeminiFunctionDeclaration } from "./ai.ts";
import {
  annualSaving as planAnnualSaving,
  type MatchProfile,
  priorityFromId,
  rankPlans,
  type ScorablePlan,
} from "./scoring.ts";
import {
  annualSaving as catalogueAnnualSaving,
  buildSuggestions,
  catalogueProviders,
  CATEGORY_HE,
  normalizeCategory,
  normalizeProvider,
  type Plan as CataloguePlan,
} from "./catalogue.ts";
import { buildAiLeadRow } from "./leads.ts";
import { makeReferralCode } from "./referrals.ts";
import { buildSwitchKit, type SwitchProfile } from "./switch.ts";

// Reply languages the agent supports (mirrors AgentLang in agent.ts; kept as a
// local string-union so tools.ts has no import cycle with agent.ts). Tool-surfaced
// notes are localized to this so they match the language the model replies in.
export type ToolLang = "he" | "ar" | "ru" | "en";

// §7b: the commission disclosure the agent MUST state before any lead hand-off.
export const COMMISSION_DISCLOSURE =
  'שקיפות: Switchy AI עשוי לקבל עמלה מהספק אם תעברו דרכנו — זה לא משפיע על המחיר שלכם ולא על ההמלצה, שמבוססת רק על הנתונים.';

// What every tool gets: the live catalogue, the conversation/contact ids for the
// audit trail, the actor (channel), and pluggable side-effect sinks so tests can
// inject fakes. captureLead routes through _shared/leads.ts in production.
export type ToolContext = {
  plans: ScorablePlan[];
  channel: "whatsapp" | "site" | "app";
  conversationId?: string | null;
  contactId?: string | null;
  // Reply language for tool-surfaced notes (set by runAgent from the detected /
  // forced language). Defaults to Hebrew when absent (backward-compatible).
  lang?: ToolLang;
  // Best-effort audit sinks (no-op in tests). preview is PII-light + clipped.
  logCrmEvent?: (ev: { actor: string; event: string; preview?: string }) => Promise<void> | void;
  logSecurityEvent?: (event: string, detail: Record<string, unknown>) => Promise<void> | void;
  // Consent-gated lead capture. Returns "captured" | "incomplete" | "error".
  // In production this is _shared/leads.ts captureAiLead; tests inject a fake.
  captureLead?: (input: Record<string, unknown>) => Promise<"captured" | "incomplete" | "error">;
  // Optional human-escalation sink (e.g. flip whatsapp bot_enabled / create lead).
  escalate?: (reason: string) => Promise<boolean> | boolean;
  // Optional referral-code issuer. In production this is _shared/referrals.ts
  // issueReferralCode (service-role insert); returns the issued code or null on a
  // write failure. Tests inject a fake. When absent, generate_referral_code still
  // returns a real locally-minted code (not persisted) so the tool never hard-fails.
  issueReferral?: (input: { channel: string; contact?: string | null; conversationId?: string | null; name?: string | null }) => Promise<string | null> | string | null;
};

// Uniform tool result. `ok` drives whether the agent treats it as success; the
// rest is fed back to the model verbatim (it's already real, grounded data).
export type ToolResult = {
  ok: boolean;
  // Short machine reason on failure (consent_required / invalid / not_found / error).
  reason?: string;
  // The grounded payload the model gets to reason over.
  data?: Record<string, unknown>;
  // A one-line Hebrew note the agent can surface (e.g. the §7b disclosure).
  note?: string;
};

function clipStr(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function asBudget(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.round(n), 5000);
}

// Resolve the context language to a supported tool language (Hebrew default).
function ctxLang(ctx: ToolContext): ToolLang {
  const l = ctx.lang;
  return l === "ar" || l === "ru" || l === "en" ? l : "he";
}

// Pick a localized string from a per-language map (Hebrew is the guaranteed key).
function tr(lang: ToolLang, m: Record<ToolLang, string>): string {
  return m[lang] ?? m.he;
}

// A compact, grounded plan row the model can cite back. Only real fields; the
// post-promo `after` is included for kamaze-parity ("price after the year").
function planView(p: ScorablePlan): Record<string, unknown> {
  const v: Record<string, unknown> = {
    id: p.id,
    category: p.cat,
    provider: p.provider,
    plan: p.plan,
    price: p.price,
    priceUnit: p.priceUnit ?? "month",
  };
  if (typeof p.after === "number" && p.after > 0 && p.after !== p.price) v.after = p.after;
  const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.hasAbroad && 'כולל חו"ל'].filter(Boolean);
  if (flags.length) v.flags = flags;
  return v;
}

async function audit(ctx: ToolContext, tool: string, ok: boolean, preview?: string): Promise<void> {
  try {
    await ctx.logCrmEvent?.({ actor: "agent", event: `tool:${tool}`, preview: preview ?? (ok ? "ok" : "fail") });
  } catch { /* never blocks */ }
}

// ── search_plans ──────────────────────────────────────────────────────────────
// Real catalogue rows matching a category (+ optional budget ceiling / abroad).
// Cheapest-first, capped. Pure read; no scoring (that's recommend_plans).
export async function searchPlans(
  ctx: ToolContext,
  args: { category?: unknown; budget?: unknown; abroad?: unknown; limit?: unknown },
): Promise<ToolResult> {
  const category = normalizeCategory(clipStr(args.category, 40));
  const budget = asBudget(args.budget);
  const abroad = args.abroad === true || args.abroad === "true";
  const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 12);

  let rows = ctx.plans.filter((p) => typeof p.price === "number");
  if (category) rows = rows.filter((p) => p.cat === category);
  if (abroad) rows = rows.filter((p) => p.hasAbroad);
  if (budget) {
    const under = rows.filter((p) => (p.price ?? 0) <= budget);
    if (under.length >= 3) rows = under;
  }
  rows = [...rows].sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).slice(0, limit);

  await audit(ctx, "search_plans", true, `${category || "all"}×${rows.length}`);
  if (!rows.length) {
    return { ok: true, data: { plans: [], note: "לא נמצאו מסלולים תואמים בקטלוג כרגע." } };
  }
  return { ok: true, data: { category, plans: rows.map(planView) } };
}

// ── recommend_plans ─────────────────────────────────────────────────────────
// THE grounded recommendation: builds a MatchProfile and ranks via scoring.ts
// (the single source of truth). Returns up to 3 scored matches with the same
// Hebrew reasons/caveats the app shows + an honest annual saving (only against a
// real current bill). NEVER promises a figure without a bill.
export async function recommendPlans(
  ctx: ToolContext,
  args: {
    category?: unknown;
    budget?: unknown;
    currentBill?: unknown;
    priority?: unknown;
    abroad?: unknown;
    wants5G?: unknown;
    noCommit?: unknown;
    limit?: unknown;
  },
): Promise<ToolResult> {
  const category = normalizeCategory(clipStr(args.category, 40));
  const profile: MatchProfile = {
    category,
    budget: asBudget(args.budget) ?? 0,
    currentBill: asBudget(args.currentBill) ?? 0,
    priority: priorityFromId(clipStr(args.priority, 20) || "balanced"),
    wantsAbroad: args.abroad === true || args.abroad === "true" || category === "abroad",
    wants5G: args.wants5G === true || args.wants5G === "true",
    wantsNoCommit: args.noCommit === true || args.noCommit === "true",
  };
  const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 3);
  const matches = rankPlans(ctx.plans, profile, { limit });

  await audit(ctx, "recommend_plans", true, `${category || "all"}×${matches.length}`);
  if (!matches.length) {
    return { ok: true, data: { recommendations: [], note: "אין מסלולים מתאימים בקטגוריה הזו כרגע." } };
  }
  // Enriched, honest reasoning. We DON'T re-derive any score/saving (scoring.ts is
  // the single source of truth) — we just expose, in plain language, WHY the top
  // pick led and how the picks differ, grounded only in real fields. `whyTop` is a
  // one-liner the model can cite; `comparedToTop` tells the runner-up's trade-off
  // vs #1 (cheaper-but-slower / pricier-but-faster) from REAL prices/speed flags.
  const top = matches[0];
  const topReason = top.reasons[0] ??
    (top.annualSaving > 0
      ? `חוסך ₪${top.annualSaving} בשנה`
      : (top.plan.noCommit ? "ללא התחייבות — גמיש" : "ההתאמה הגבוהה ביותר לפרופיל שלך"));
  const whyTop = `הבחירה המובילה (${top.plan.provider} ${top.plan.plan}, ₪${top.plan.price}): ${topReason} — ציון התאמה ${top.scorePct}.`;

  return {
    ok: true,
    data: {
      category,
      // Only surface a saving when a real current bill backed it.
      hasBaseline: (profile.currentBill ?? 0) > 0,
      // A grounded, plain-language lead-in the model can open with (no fabrication).
      whyTop,
      recommendations: matches.map((m, i) => {
        const p = m.plan;
        // Honest, real-field trade-off vs the top pick (only for runners-up).
        let comparedToTop: string | undefined;
        if (i > 0 && typeof p.price === "number" && typeof top.plan.price === "number") {
          const dPrice = p.price - top.plan.price;
          const priceWord = dPrice < 0
            ? `זול ב-₪${Math.abs(dPrice)}`
            : dPrice > 0
            ? `יקר ב-₪${dPrice}`
            : "באותו מחיר";
          const speedWord = (p.is5G && !top.plan.is5G)
            ? ", אך מהיר יותר (5G)"
            : (!p.is5G && top.plan.is5G)
            ? ", אך פחות מהיר"
            : "";
          comparedToTop = `${priceWord} מהבחירה המובילה${speedWord}`;
        }
        return {
          ...planView(p),
          rank: i + 1,
          score: m.scorePct,
          label: m.label,
          annualSaving: m.annualSaving > 0 ? m.annualSaving : undefined,
          reasons: m.reasons,
          caveats: m.caveats,
          ...(comparedToTop ? { comparedToTop } : {}),
        };
      }),
    },
    note: whyTop,
  };
}

// ── refine_recommendation ────────────────────────────────────────────────────
// THE OBJECTION-HANDLING re-rank. When the user pushed back on a first set of
// recommendations — "too expensive", "I don't want a commitment", "I need it
// faster", "I'm happy with my provider" — this tool RE-RANKS the SAME real
// catalogue (via scoring.ts, the single source of truth) with the objection folded
// into the profile, and EXCLUDES the plans the user already dismissed (prevPlanIds).
// It returns a FRESH top-3 with the same explainable Hebrew reasons/caveats.
//
// TRUTH-ONLY: this never fabricates a cheaper price, a faster plan, or a saving —
// it only re-sorts and re-filters REAL rows. If the objection can't be honoured
// from the catalogue (e.g. "cheaper" but nothing is below the rejected floor) it
// says so honestly via `note` rather than pretending. The annual saving is still
// only surfaced against a real `currentBill` (never a promise without a baseline).
//
// The `feedback` free-text is parsed for the common Israeli-telecom objections so
// the model can pass the raw user words; explicit flags (budget/noCommit/minSpeed)
// override the parse. `prevPlanIds` are the ids already shown/rejected — they're
// excluded from the fresh set AND echoed back so the caller can persist them into
// the session's rejectedPlanIds slot.
export type RefineSignals = {
  priority: MatchProfile["priority"];
  budget?: number;
  wantsNoCommit: boolean;
  wants5G: boolean;
  wantsAbroad?: boolean;
  cheaper: boolean; // "too expensive" with no explicit budget → push the price axis
  matchedObjections: string[]; // short tags for the audit / session.objections
};

// Parse a free-text objection (any supported language, but tuned for Hebrew) into
// ranking signals. Heuristic + deterministic (no model call) so it's unit-testable
// and can't drift. Only RECOGNISES intent — it never invents data.
export function parseObjection(feedback: string): RefineSignals {
  const s = String(feedback ?? "").toLowerCase();
  const tags: string[] = [];
  // Price / "too expensive" — Hebrew + Arabic + Russian + English cues.
  const cheaper = /יקר|ביוקר|מחיר גבוה|זול יותר|פחות כסף|תקציב|cheap|expensive|غالي|أرخص|дорог|дешевл/.test(s);
  if (cheaper) tags.push("price");
  // Lock-in / commitment aversion.
  const noCommit =
    /התחייב|בלי התחייבות|ללא התחייבות|לא רוצה להתחייב|חופשי|גמיש|commit|lock|التزام|بدون التزام|обязательств|без обязательств/
      .test(s);
  if (noCommit) tags.push("nocommit");
  // Speed / "too slow" / wants faster.
  const fast = /מהיר|מהירות|איטי|לאט|גלישה מהירה|5g|fast|speed|slow|سريع|بطيء|سرعة|быстр|скорост|медленн/.test(s);
  if (fast) tags.push("speed");
  // Coverage / reception.
  const coverage = /כיסוי|קליטה|רשת חלשה|coverage|reception|تغطية|إرسال|покрыт|связь/.test(s);
  if (coverage) tags.push("coverage");
  // Service / quality / loyalty ("happy with my provider", "good service").
  const service = /שירות|תמיכה|מרוצה|נאמן|טוב לי|service|support|happy|loyal|خدمة|راض|راضي|обслуж|сервис|доволен/.test(s);
  if (service) tags.push("service");
  // Abroad.
  const abroad = /חו"ל|חול|בחו|abroad|roaming|الخارج|سفر|за границ|роуминг/.test(s);
  if (abroad) tags.push("abroad");

  // Map the dominant objection to a ranking priority (price wins ties — it's the
  // most common and the safest re-rank to lead with).
  let priority: MatchProfile["priority"] = "balanced";
  if (cheaper) priority = "price";
  else if (fast) priority = "speed";
  else if (coverage) priority = "coverage";
  else if (service) priority = "service";
  else if (noCommit) priority = "flexibility";

  return {
    priority,
    wantsNoCommit: noCommit,
    wants5G: fast,
    wantsAbroad: abroad || undefined,
    cheaper,
    matchedObjections: tags,
  };
}

export async function refineRecommendation(
  ctx: ToolContext,
  args: {
    category?: unknown;
    feedback?: unknown;
    budget?: unknown;
    noCommit?: unknown;
    minSpeed?: unknown;
    currentBill?: unknown;
    abroad?: unknown;
    prevPlanIds?: unknown;
    limit?: unknown;
  },
): Promise<ToolResult> {
  const lang = ctxLang(ctx);
  const category = normalizeCategory(clipStr(args.category, 40));

  // Parse the free-text objection, then let EXPLICIT flags override the parse.
  const parsed = parseObjection(clipStr(args.feedback, 400));
  const explicitBudget = asBudget(args.budget);
  const explicitNoCommit = args.noCommit === true || args.noCommit === "true";
  // minSpeed: a truthy flag OR a string like "5g"/"fast" pushes the speed axis.
  const minSpeedRaw = clipStr(args.minSpeed, 20).toLowerCase();
  const explicitMinSpeed = args.minSpeed === true || args.minSpeed === "true" ||
    minSpeedRaw === "5g" || minSpeedRaw === "fast" || minSpeedRaw === "fiber" ||
    (Number.isFinite(Number(args.minSpeed)) && Number(args.minSpeed) > 0);

  const wantsNoCommit = explicitNoCommit || parsed.wantsNoCommit;
  const wants5G = explicitMinSpeed || parsed.wants5G;
  const wantsAbroad = args.abroad === true || args.abroad === "true" ||
    parsed.wantsAbroad === true || category === "abroad";

  // Choose the priority: an explicit flag's intent wins; else the parsed one.
  let priority = parsed.priority;
  if (explicitNoCommit && !parsed.cheaper) priority = "flexibility";
  if (explicitMinSpeed) priority = "speed";
  if (explicitBudget) priority = "price";

  // The ids the user already saw/rejected — excluded from the fresh set.
  const prevIds = Array.isArray(args.prevPlanIds)
    ? [...new Set(args.prevPlanIds.filter((x): x is string => typeof x === "string" && !!x).map((x) => x.slice(0, 80)))]
    : [];
  const prevSet = new Set(prevIds);

  // The price ceiling we re-rank under. If the user said "too expensive" without a
  // number, derive an HONEST ceiling: just under the cheapest plan they rejected,
  // so the fresh set is genuinely cheaper than what they dismissed (never invented —
  // it's a real row's real price). An explicit budget always wins.
  let budget = explicitBudget;
  if (!budget && parsed.cheaper && prevSet.size) {
    const rejectedPrices = ctx.plans
      .filter((p) => prevSet.has(String(p.id)) && typeof p.price === "number")
      .map((p) => p.price as number);
    if (rejectedPrices.length) {
      const floor = Math.min(...rejectedPrices);
      if (floor > 1) budget = floor - 1; // strictly cheaper than the cheapest rejected
    }
  }

  const profile: MatchProfile = {
    category,
    budget: budget ?? 0,
    currentBill: asBudget(args.currentBill) ?? 0,
    priority: priorityFromId(priority ?? "balanced"),
    wantsAbroad,
    wants5G,
    wantsNoCommit,
  };

  const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 3);
  // Rank the FULL catalogue, then drop the rejected ids, then keep the top N. We
  // over-fetch (limit + rejected count) so excluding rejects still yields up to N.
  const ranked = rankPlans(ctx.plans, profile, { limit: limit + prevSet.size + 4 });
  const fresh = ranked.filter((m) => !prevSet.has(String(m.plan.id))).slice(0, limit);

  await audit(ctx, "refine_recommendation", true, `${category || "all"}/${parsed.matchedObjections.join(",") || "generic"}×${fresh.length}`);

  if (!fresh.length) {
    // Honest: we couldn't honour the objection from the real catalogue.
    return {
      ok: true,
      data: {
        category,
        objections: parsed.matchedObjections,
        rejectedPlanIds: prevIds,
        recommendations: [],
      },
      note: tr(lang, {
        he: "אין לי כרגע מסלול אמיתי בקטלוג שעונה על מה שביקשת מעבר למה שכבר הצעתי — לא אמציא משהו שלא קיים. אפשר לנסות קריטריון אחר או לדבר עם נציג.",
        ar: "لا توجد لدي حاليًا باقة حقيقية في الكتالوج تلبي طلبك أكثر مما عرضته — لن أختلق شيئًا غير موجود. جرّب معيارًا آخر أو تحدّث مع مندوب.",
        ru: "Сейчас в каталоге нет реального тарифа, который отвечал бы вашему запросу лучше предложенного — я не придумываю несуществующее. Попробуйте другой критерий или поговорите с представителем.",
        en: "I don't have a real catalogue plan that meets your request beyond what I already offered — I won't invent one. Try a different criterion or talk to a rep.",
      }),
    };
  }

  // A short, honest note acknowledging the objection we re-ranked for.
  const objNote = parsed.cheaper || explicitBudget
    ? tr(lang, {
      he: "הנה אפשרויות זולות יותר מהקטלוג, מדורגות מחדש לפי המחיר:",
      ar: "إليك خيارات أرخص من الكتالوج، أعيد ترتيبها حسب السعر:",
      ru: "Вот более дешёвые варианты из каталога, пересортированные по цене:",
      en: "Here are cheaper catalogue options, re-ranked by price:",
    })
    : wantsNoCommit
    ? tr(lang, {
      he: "התמקדתי במסלולים גמישים יותר (ללא התחייבות) מהקטלוג:",
      ar: "ركّزت على باقات أكثر مرونة (بدون التزام) من الكتالوج:",
      ru: "Я сделал акцент на более гибких тарифах (без обязательств) из каталога:",
      en: "I focused on more flexible (no-commitment) catalogue plans:",
    })
    : wants5G
    ? tr(lang, {
      he: "דירגתי מחדש לפי מהירות מהקטלוג:",
      ar: "أعدت الترتيب حسب السرعة من الكتالوج:",
      ru: "Я пересортировал по скорости из каталога:",
      en: "I re-ranked by speed from the catalogue:",
    })
    : tr(lang, {
      he: "הנה התאמה מעודכנת מהקטלוג לפי מה שאמרת:",
      ar: "إليك توصية محدّثة من الكتالوج بناءً على ما قلته:",
      ru: "Вот обновлённая подборка из каталога с учётом сказанного:",
      en: "Here's an updated catalogue match based on what you said:",
    });

  return {
    ok: true,
    data: {
      category,
      // What objection(s) we recognised (for the session's objections slot).
      objections: parsed.matchedObjections,
      // Echo the rejected ids back so the caller can persist rejectedPlanIds.
      rejectedPlanIds: prevIds,
      // Only surface a saving when a real current bill backed it.
      hasBaseline: (profile.currentBill ?? 0) > 0,
      recommendations: fresh.map((m) => ({
        ...planView(m.plan),
        score: m.scorePct,
        label: m.label,
        annualSaving: m.annualSaving > 0 ? m.annualSaving : undefined,
        reasons: m.reasons,
        caveats: m.caveats,
      })),
    },
    note: objNote,
  };
}

// ── get_provider ──────────────────────────────────────────────────────────────
// Real facts about ONE provider from the catalogue: how many plans, the cheapest
// per category, flags actually present. No ratings/coverage are invented — if we
// don't have a real signal, we omit it.
export async function getProvider(
  ctx: ToolContext,
  args: { name?: unknown },
): Promise<ToolResult> {
  const providers = catalogueProviders(ctx.plans as CataloguePlan[]);
  const name = normalizeProvider(clipStr(args.name, 60), providers);
  if (!name) {
    await audit(ctx, "get_provider", false, "not_found");
    return { ok: false, reason: "not_found", note: "לא מצאתי ספק בשם הזה בקטלוג." };
  }
  const rows = ctx.plans.filter((p) => p.provider === name && typeof p.price === "number");
  if (!rows.length) {
    await audit(ctx, "get_provider", false, name);
    return { ok: false, reason: "not_found", data: { provider: name }, note: "אין מסלולים פעילים לספק הזה כרגע." };
  }
  // Cheapest plan per category (real rows only).
  const byCat = new Map<string, ScorablePlan>();
  for (const p of rows) {
    const cur = byCat.get(p.cat ?? "");
    if (!cur || (p.price ?? 0) < (cur.price ?? 0)) byCat.set(p.cat ?? "", p);
  }
  const cheapestPerCategory = [...byCat.entries()].map(([cat, p]) => ({
    category: cat,
    categoryHe: CATEGORY_HE[cat] ?? cat,
    ...planView(p),
  }));
  await audit(ctx, "get_provider", true, name);
  return { ok: true, data: { provider: name, planCount: rows.length, cheapestPerCategory } };
}

// ── analyze_bill ────────────────────────────────────────────────────────────
// Reuses the Gemini-Vision bill path. The agent loop is the one with the image
// bytes + the vision call (that needs the API key and lives in agent.ts /
// the webhook), so this tool consumes an ALREADY-extracted {provider, monthly,
// category} and turns it into grounded cheaper suggestions. Honest: a saving is
// only "up to ~₪X" derived from a real cheaper catalogue row vs the read amount,
// never a promise. `imageId` is accepted for the audit trail / future direct
// path but the extraction itself is done by the caller.
//
// FORENSICS (grounded overpay breakdown): on top of the cheaper-options list, we
// surface a sharp, HONEST "are you overpaying?" verdict — the user's monthly vs
// the CHEAPEST REAL catalogue plan in the category, the monthly AND annual gap
// (gap*12, clamped >=0 via the shared annualSaving helper so we never drift), and
// a one-line, real-field framing of what's DIFFERENT about the cheaper plan (what
// the extra you pay buys you / what you'd trade away). TRUTH-ONLY: every number is
// a real catalogue price vs the read amount — nothing is invented. If the cheapest
// real plan isn't actually cheaper (overpay <= 0), we say so honestly and promise
// NO saving. We don't re-derive the per-row savings (buildSuggestions owns that) —
// the forensics block just adds the explicit gap math + plain-language framing.

// Build a one-line, grounded "what's different about the cheaper plan" framing
// from REAL fields only. Used by the forensics block; never fabricates a benefit.
function billFraming(cheapest: ScorablePlan, monthlyOverpay: number, sameProvider: boolean, spend: number): string {
  // What the cheaper plan still gives you (real flags only).
  const keeps = [
    cheapest.is5G && "5G",
    cheapest.noCommit && "ללא התחייבות",
    cheapest.hasAbroad && 'כולל חו"ל',
  ].filter(Boolean) as string[];
  const keepsPart = keeps.length ? ` (${keeps.join(", ")})` : "";
  // Honest post-promo caveat: if the cheaper row steps up after a promo, flag it.
  const stepUp = typeof cheapest.after === "number" && cheapest.after > 0 && cheapest.after !== cheapest.price
    ? ` שימו לב: המחיר עולה ל-₪${cheapest.after} בתום המבצע.`
    : "";
  const who = `${cheapest.provider} ${cheapest.plan} (₪${cheapest.price})`;
  if (monthlyOverpay > 0) {
    const lead = sameProvider
      ? `אפילו אצל ${cheapest.provider} עצמם יש מסלול זול יותר — ${who}${keepsPart}.`
      : `המסלול הזול בקטגוריה הוא ${who}${keepsPart}.`;
    return `${lead} ההפרש ₪${monthlyOverpay} בחודש הוא מה שאתם משלמים מעבר למחיר הזול בשוק — שווה לבדוק מה אתם מקבלים תמורתו (התחייבות, הטבות, חבילה גדולה יותר) ואם זה מצדיק את הפער.${stepUp}`;
  }
  // No overpay: honest, no fabricated saving.
  return `המחיר שאתם משלמים (₪${spend}) כבר בקו אחד עם המסלול הזול בקטגוריה (${who}${keepsPart}) — אין כרגע חיסכון אמיתי להציע בלי לפגוע במה שיש לכם, וזה בסדר גמור.${stepUp}`;
}

export async function analyzeBill(
  ctx: ToolContext,
  args: { provider?: unknown; monthly?: unknown; category?: unknown; imageId?: unknown },
): Promise<ToolResult> {
  const providers = catalogueProviders(ctx.plans as CataloguePlan[]);
  const provider = normalizeProvider(clipStr(args.provider, 60), providers);
  const category = normalizeCategory(clipStr(args.category, 40));
  const monthly = Number(args.monthly);
  const spend = Number.isFinite(monthly) ? Math.round(Math.min(5000, Math.max(0, monthly))) : 0;
  if (!(spend > 0)) {
    await audit(ctx, "analyze_bill", false, "no_amount");
    return { ok: false, reason: "invalid", note: "לא הצלחתי לקרוא סכום חודשי תקין מהחשבון." };
  }
  const sugg = buildSuggestions(ctx.plans as CataloguePlan[], category, spend, 3);

  // ── Forensics: the cheapest REAL plan in the category (the market floor), used
  // for the explicit overpay math. Unlike buildSuggestions (which only keeps rows
  // STRICTLY cheaper than the bill), this looks at the whole category so we can
  // honestly say "nothing is cheaper" when the floor is >= what they pay. Regular
  // plans only (no promo/one-off kinds), real prices only — never invented.
  const floorRows = (ctx.plans as ScorablePlan[]).filter((p) =>
    p.cat === category && typeof p.price === "number" && ((p as { kind?: string }).kind ?? "regular") === "regular"
  );
  let forensics: Record<string, unknown> | undefined;
  if (category && floorRows.length) {
    const cheapest = floorRows.reduce((a, b) => ((b.price ?? Infinity) < (a.price ?? Infinity) ? b : a));
    // Monthly overpay vs the real floor, clamped >=0. Annual = monthly*12 via the
    // shared annualSaving helper (the single source of truth) so it never drifts.
    const monthlyOverpay = Math.max(0, spend - (cheapest.price as number));
    const annualOverpay = catalogueAnnualSaving(spend, cheapest.price as number); // (spend - price)*12, clamped >=0
    const sameProvider = !!provider && cheapest.provider === provider;
    forensics = {
      // The real market floor this verdict is grounded in.
      cheapestPlan: { ...planView(cheapest), sameProvider },
      monthlyOverpay,
      annualOverpay,
      // Honest verdict flag the model can branch on (true ⇒ there IS a cheaper real plan).
      overpaying: monthlyOverpay > 0,
      // One-line, real-field framing of what's different / what the extra buys.
      framing: billFraming(cheapest, monthlyOverpay, sameProvider, spend),
    };
  }

  await audit(ctx, "analyze_bill", true, `${provider || "?"}/${spend}/${forensics ? (forensics.overpaying ? "over" : "fair") : "nocat"}`);
  return {
    ok: true,
    data: {
      provider: provider || null,
      monthly: spend,
      category: category || null,
      categoryHe: category ? (CATEGORY_HE[category] ?? category) : null,
      // Grounded overpay breakdown vs the cheapest real catalogue plan (or null if
      // we have no category to anchor the floor — then it's cheaperOptions only).
      forensics: forensics ?? null,
      cheaperOptions: sugg.map((s) => ({
        id: s.id,
        provider: s.provider,
        plan: s.name,
        price: s.price,
        // "up to ~₪X/year" — derived from a real cheaper row vs the read amount.
        annualSavingUpTo: s.annualSaving > 0 ? s.annualSaving : undefined,
      })),
    },
    // A grounded one-liner the agent can open with (honest whether or not there's a gap).
    note: forensics?.framing as string | undefined,
  };
}

// ── create_lead ───────────────────────────────────────────────────────────────
// Consent-gated lead capture. Routes through _shared/leads.ts (via ctx.captureLead
// → captureAiLead), which builds the row ONLY when consent === true and a valid
// name+phone are present; otherwise nothing is written. §7b disclosure is returned
// so the agent states it before treating the hand-off as done.
//
// THIRD-PARTY-SHARING CONSENT (Privacy Law — the business SELLS leads): `consent_share`
// is a SECOND, SEPARATE, OPTIONAL yes/no — distinct from the mandatory §30A service
// consent above. It is NEVER assumed and NEVER bundled with `consent`: a lead can be
// captured (service consent given) while `consent_share` is false, in which case the
// row is captured but NOT marked sellable. Only when the user explicitly says yes to
// "האם תאשר/י להעביר את פרטיך לספקים רלוונטיים לקבלת הצעה?" do we stamp consent_share_at
// = now, which is the ONLY signal the Sheets exporter uses to mark a row "sellable".
export async function createLead(
  ctx: ToolContext,
  args: {
    name?: unknown;
    phone?: unknown;
    consent?: unknown;
    consent_share?: unknown;
    channel?: unknown;
    notes?: unknown;
    provider?: unknown;
    category?: unknown;
  },
): Promise<ToolResult> {
  const consent = args.consent === true || args.consent === "true";
  if (!consent) {
    // Refuse loudly — the agent must collect explicit consent first.
    await audit(ctx, "create_lead", false, "consent_required");
    return {
      ok: false,
      reason: "consent_required",
      note: "כדי להעביר את הפנייה לנציג צריך את אישורך לתנאי השימוש ומדיניות הפרטיות. מאשר/ת?",
    };
  }
  // SEPARATE third-party-sharing consent — default false, never inferred from the
  // §30A service consent above. Only an explicit true stamps the sellable signal.
  const consentShare = args.consent_share === true || args.consent_share === "true";
  const name = clipStr(args.name, 80);
  const phone = clipStr(args.phone, 20);
  if (name.length < 2 || !phone) {
    await audit(ctx, "create_lead", false, "incomplete");
    return { ok: false, reason: "incomplete", note: "צריך שם וטלפון תקין כדי שנחזור אליך." };
  }
  // Pre-validate the row honestly (also catches bad phone shape) before the write.
  const dryRow = buildAiLeadRow({
    name,
    phone,
    consent: true,
    consent_share: consentShare,
    provider: clipStr(args.provider, 120) || undefined,
    category: clipStr(args.category, 40) || undefined,
    notes: clipStr(args.notes, 600) || undefined,
  });
  if (!dryRow) {
    await audit(ctx, "create_lead", false, "invalid");
    return { ok: false, reason: "invalid", note: "מספר הטלפון לא נראה תקין — אפשר לבדוק שוב?" };
  }

  const capture = ctx.captureLead;
  let result: "captured" | "incomplete" | "error" = "error";
  if (capture) {
    try {
      result = await capture({
        name,
        phone,
        consent: true,
        consent_share: consentShare,
        provider: clipStr(args.provider, 120) || undefined,
        category: clipStr(args.category, 40) || undefined,
        notes: clipStr(args.notes, 600) || undefined,
      });
    } catch (e) {
      result = "error";
      await ctx.logSecurityEvent?.("agent_lead_capture_error", { channel: ctx.channel, error: String(e) });
    }
  }
  const ok = result === "captured";
  await audit(ctx, "create_lead", ok, ok ? "captured" : result);
  // Record consent provenance for the audit trail (no PII beyond phone-as-subject).
  // consent_share is logged distinctly so the third-party-sharing decision is auditable.
  await ctx.logSecurityEvent?.("agent_lead_consent", {
    channel: ctx.channel,
    consent: true,
    consent_share: consentShare,
    captured: ok,
    conversation_id: ctx.conversationId ?? null,
  });
  if (!ok) {
    return { ok: false, reason: result, note: "לא הצלחתי לשמור את הפנייה כרגע — אפשר לנסות שוב או לפנות בוואטסאפ." };
  }
  return {
    ok: true,
    data: { captured: true },
    note: `${COMMISSION_DISCLOSURE} נציג אנושי יחזור אליך בהקדם.`,
  };
}

// ── book_callback ─────────────────────────────────────────────────────────────
// Consent-gated callback request. Same honest-consent gate as create_lead; the
// requested slot is folded into the lead notes (no separate scheduling table in
// the agent core — the rep follows up). §7b disclosure surfaced.
export async function bookCallback(
  ctx: ToolContext,
  args: { slot?: unknown; name?: unknown; phone?: unknown; consent?: unknown; notes?: unknown },
): Promise<ToolResult> {
  const slot = clipStr(args.slot, 40);
  const notes = [clipStr(args.notes, 400), slot ? `מועד מועדף: ${slot}` : ""].filter(Boolean).join(" | ");
  // Delegate to the same consent-gated lead path (source/notes carry the slot).
  return await createLead(ctx, {
    name: args.name,
    phone: args.phone,
    consent: args.consent,
    notes: notes || "בקשת התקשרות",
    category: undefined,
    provider: undefined,
  });
}

// ── escalate_to_human ─────────────────────────────────────────────────────────
// Hands the conversation to a human. NO consent needed (it's a service action,
// not marketing). Flips the bot-silent gate via ctx.escalate (e.g. the webhook
// creates a lead + sets status). Always reassures the customer.
export async function escalateToHuman(
  ctx: ToolContext,
  args: { reason?: unknown },
): Promise<ToolResult> {
  const reason = clipStr(args.reason, 200) || "המשתמש ביקש לדבר עם נציג";
  let ok = false;
  try {
    ok = ctx.escalate ? !!(await ctx.escalate(reason)) : true;
  } catch (e) {
    await ctx.logSecurityEvent?.("agent_escalation_error", { channel: ctx.channel, error: String(e) });
  }
  await audit(ctx, "escalate_to_human", ok, reason.slice(0, 60));
  await ctx.logSecurityEvent?.("agent_escalation", {
    channel: ctx.channel,
    reason: reason.slice(0, 120),
    conversation_id: ctx.conversationId ?? null,
  });
  return {
    ok: true, // never fail the customer — we always acknowledge
    data: { escalated: ok },
    note: "מעולה 🙌 חיברתי אותך לנציג אנושי שיחזור אליך בהקדם. בינתיים אפשר להמשיך לשאול אותי כל דבר.",
  };
}

// ── suggest_retention_offer ───────────────────────────────────────────────────
// A GROUNDED negotiation script for a user who wants to stay with their current
// provider but pay less. It quotes the REAL catalogue market rate — the cheapest
// comparable plan (any provider) AND the cheapest SAME-provider option — so the
// user can walk into a retention call with honest leverage ("competitor X offers
// ₪Y; can you match it?"). It NEVER fabricates a promise: the script is "ask for
// this, here's the market evidence", not "you will get ₪Z". Language-aware: the
// human-readable script + note are rendered in the user's reply language; the
// numbers/providers/plan names are the same real catalogue data in every language.
export async function suggestRetentionOffer(
  ctx: ToolContext,
  args: { provider?: unknown; category?: unknown; currentBill?: unknown; abroad?: unknown },
): Promise<ToolResult> {
  const lang = ctxLang(ctx);
  const providers = catalogueProviders(ctx.plans as CataloguePlan[]);
  const provider = normalizeProvider(clipStr(args.provider, 60), providers);
  const category = normalizeCategory(clipStr(args.category, 40));
  const currentBill = asBudget(args.currentBill);
  const abroad = args.abroad === true || args.abroad === "true" || category === "abroad";

  if (!category) {
    await audit(ctx, "suggest_retention_offer", false, "no_category");
    return {
      ok: false,
      reason: "invalid",
      note: tr(lang, {
        he: "כדי לבנות תסריט מיקוח אמיתי צריך לדעת איזה שירות (סלולר/אינטרנט/טלוויזיה/משולב/חו\"ל).",
        ar: "لبناء نص تفاوض حقيقي أحتاج لمعرفة الخدمة (خلوي/إنترنت/تلفزيون/حزمة/خارج البلاد).",
        ru: "Чтобы составить реальный сценарий, нужно знать услугу (мобильная/интернет/ТВ/пакет/за границей).",
        en: "To build a real negotiation script I need the service (cellular/internet/tv/triple/abroad).",
      }),
    };
  }

  // Real comparable rows in the SAME category (regular plans only), cheapest-first.
  let rows = ctx.plans.filter((p) =>
    p.cat === category && typeof p.price === "number" && ((p as { kind?: string }).kind ?? "regular") === "regular"
  );
  if (abroad) rows = rows.filter((p) => p.hasAbroad);
  rows = [...rows].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

  if (!rows.length) {
    await audit(ctx, "suggest_retention_offer", false, `${category}/empty`);
    return {
      ok: false,
      reason: "not_found",
      note: tr(lang, {
        he: "אין לי כרגע מסלולים אמיתיים בקטגוריה הזו לבסס עליהם תסריט מיקוח.",
        ar: "لا توجد لدي حاليًا باقات حقيقية في هذه الفئة لبناء نص التفاوض عليها.",
        ru: "Сейчас у меня нет реальных тарифов в этой категории для сценария.",
        en: "I don't have real plans in this category right now to base a script on.",
      }),
    };
  }

  // The cheapest comparable plan overall (the market floor) + the cheapest plan
  // from the user's OWN provider (so they can ask their provider to match it).
  const marketBest = rows[0];
  const sameProvider = provider ? rows.find((p) => p.provider === provider) ?? null : null;

  // Honest annual saving — ONLY if the user gave a real current bill, and only
  // for a real monthly plan (reuse scoring.ts annualSaving so we never drift).
  const marketSaving = currentBill ? planAnnualSaving(marketBest, currentBill) : 0;
  const sameSaving = currentBill && sameProvider ? planAnnualSaving(sameProvider, currentBill) : 0;

  // Build the localized, honest negotiation script. We tell the user exactly what
  // to say, grounded in the real numbers — never a guaranteed outcome.
  const marketLine = `${marketBest.provider} — ${marketBest.plan} (₪${marketBest.price})`;
  const sameLine = sameProvider ? `${sameProvider.provider} — ${sameProvider.plan} (₪${sameProvider.price})` : "";
  const billPart = currentBill
    ? tr(lang, {
      he: `אתם משלמים היום ₪${currentBill}. `,
      ar: `تدفعون اليوم ₪${currentBill}. `,
      ru: `Сейчас вы платите ₪${currentBill}. `,
      en: `You currently pay ₪${currentBill}. `,
    })
    : "";

  const script = tr(lang, {
    he:
      `${billPart}המחיר הזול בשוק היום בקטגוריה הזו: ${marketLine}. ` +
      (provider
        ? (sameProvider
          ? `אצל ${provider} עצמם המסלול הזול הוא ${sameLine}. תוכלו להתקשר לשימור ולומר: "ראיתי ש${marketBest.provider} מציעים ${marketBest.plan} ב-₪${marketBest.price} — אתם יכולים להשוות או להתקרב? אחרת אני שוקל/ת לעבור." `
          : `לא מצאתי מסלול פעיל של ${provider} בקטגוריה הזו, אז ה-${marketLine} הוא נקודת ההשוואה למיקוח. `)
        : `תוכלו להשתמש ב-${marketLine} כנקודת ייחוס למול הספק הנוכחי שלכם. `) +
      `זו נקודת פתיחה אמיתית למשא ומתן — לא הבטחה; ההחלטה בידי הספק.`,
    ar:
      `${billPart}أرخص سعر في السوق حاليًا في هذه الفئة: ${marketLine}. ` +
      (provider
        ? (sameProvider
          ? `لدى ${provider} نفسها أرخص باقة هي ${sameLine}. اتصلوا بقسم الاحتفاظ وقولوا: "رأيت أن ${marketBest.provider} يعرض ${marketBest.plan} بـ ₪${marketBest.price} — هل يمكنكم المطابقة أو الاقتراب؟ وإلا فأنا أفكر في الانتقال." `
          : `لم أجد باقة فعّالة لـ ${provider} في هذه الفئة، لذا ${marketLine} هي نقطة المقارنة للتفاوض. `)
        : `يمكنكم استخدام ${marketLine} كنقطة مرجعية أمام مزوّدكم الحالي. `) +
      `هذه نقطة انطلاق حقيقية للتفاوض — وليست وعدًا؛ القرار بيد المزوّد.`,
    ru:
      `${billPart}Самая низкая цена на рынке в этой категории: ${marketLine}. ` +
      (provider
        ? (sameProvider
          ? `У самого ${provider} самый дешёвый тариф — ${sameLine}. Позвоните в отдел удержания и скажите: «Я видел(а), что ${marketBest.provider} предлагает ${marketBest.plan} за ₪${marketBest.price} — можете предложить столько же или ближе? Иначе я думаю перейти». `
          : `Я не нашёл активного тарифа ${provider} в этой категории, поэтому ${marketLine} — точка сравнения для торга. `)
        : `Используйте ${marketLine} как ориентир в разговоре с вашим текущим оператором. `) +
      `Это реальная отправная точка для переговоров — не обещание; решение за оператором.`,
    en:
      `${billPart}The cheapest market price in this category today: ${marketLine}. ` +
      (provider
        ? (sameProvider
          ? `${provider}'s own cheapest plan is ${sameLine}. Call retention and say: "I saw ${marketBest.provider} offers ${marketBest.plan} for ₪${marketBest.price} — can you match or get close? Otherwise I'm considering switching." `
          : `I couldn't find an active ${provider} plan in this category, so ${marketLine} is the benchmark to negotiate against. `)
        : `Use ${marketLine} as a reference point with your current provider. `) +
      `This is a real starting point to negotiate — not a promise; the decision is the provider's.`,
  });

  await audit(ctx, "suggest_retention_offer", true, `${provider || "?"}/${category}`);
  return {
    ok: true,
    data: {
      category,
      categoryHe: CATEGORY_HE[category] ?? category,
      provider: provider || null,
      currentBill: currentBill ?? null,
      hasBaseline: !!currentBill,
      // The real market evidence the script is built on (grounded rows only).
      marketRate: { ...planView(marketBest), annualSavingUpTo: marketSaving > 0 ? marketSaving : undefined },
      sameProviderOption: sameProvider
        ? { ...planView(sameProvider), annualSavingUpTo: sameSaving > 0 ? sameSaving : undefined }
        : null,
    },
    note: script,
  };
}

// ── generate_referral_code ────────────────────────────────────────────────────
// Issues a REAL referral code (via _shared/referrals.ts → service-role insert) so
// the user can invite a friend to Switchy AI. Attribution-only: the row records who
// shared it for later crediting. NO advertised monetary reward — the framing is
// share-the-tool ("help a friend save"), value-based, since the owner hasn't
// defined a cash reward. If the persistence sink is absent (e.g. tests), we still
// mint a real, well-formed code locally so the tool never hard-fails the user.
export async function generateReferralCode(
  ctx: ToolContext,
  args: { name?: unknown },
): Promise<ToolResult> {
  const lang = ctxLang(ctx);
  const name = clipStr(args.name, 80) || undefined;

  let code: string | null = null;
  if (ctx.issueReferral) {
    try {
      code = await ctx.issueReferral({
        channel: ctx.channel,
        contact: ctx.contactId ?? null,
        conversationId: ctx.conversationId ?? null,
        name: name ?? null,
      });
    } catch (e) {
      await ctx.logSecurityEvent?.("agent_referral_error", { channel: ctx.channel, error: String(e) });
      code = null;
    }
  }
  // Fail-soft: if no sink or the write failed, mint a real code locally (still a
  // valid, shareable token — just not persisted for attribution this turn).
  const persisted = !!code;
  if (!code) code = makeReferralCode();

  await audit(ctx, "generate_referral_code", persisted, persisted ? "issued" : "minted_unpersisted");

  const note = tr(lang, {
    he: `הקוד שלך לשיתוף: ${code} — שתפו אותו עם חבר/ה כדי שגם הוא/היא יחסכו בחשבונות התקשורת עם Switchy AI. (שיתוף הכלי, ללא תמורה כספית.)`,
    ar: `رمز المشاركة الخاص بك: ${code} — شاركه مع صديق ليوفّر هو أيضًا في فواتير الاتصالات مع Switchy AI. (مشاركة الأداة، دون مقابل مالي.)`,
    ru: `Ваш код для приглашения: ${code} — поделитесь им с другом, чтобы он тоже экономил на счетах за связь с Switchy AI. (Это приглашение в сервис, без денежного вознаграждения.)`,
    en: `Your referral code: ${code} — share it with a friend so they can save on their telecom bills with Switchy AI too. (Sharing the tool, no cash reward.)`,
  });

  return { ok: true, data: { code, persisted, reward: null }, note };
}

// ── generate_switch_kit ───────────────────────────────────────────────────────
// The SWITCH AUTOPILOT tool: builds a complete, honest switch package for a user
// moving FROM their current provider TO a REAL catalogue plan. Delegates to the
// pure _shared/switch.ts buildSwitchKit (the single source of truth) so the
// cancellation letter / portability checklist / steps / key-dates are identical to
// the app/site surface and to the live AEO /switch guide's honest framing.
//
// GROUNDING (truth-only): the target plan MUST resolve to a REAL row in the live
// catalogue — by exact id, else by provider+plan-name match. If it doesn't resolve,
// we REFUSE (not_found) rather than fabricate a plan/price. We invent no phone
// numbers, no exact in-app steps, no provider SLAs (switch.ts enforces this).
//
// SAFETY: this only DRAFTS the cancellation letter — it never sends anything. The
// note explicitly tells the user THEY review + send it via the provider's official
// channels. No consent gate needed (no contactable lead is captured here; nothing
// is written to a marketing surface — it's the user's own switch material).
//
// `officialUrl` is OPTIONAL and pass-through only: the caller (webhook/site) may
// supply the provider's VERIFIED official site for the binding procedure; the tool
// never guesses a URL.
export async function generateSwitchKit(
  ctx: ToolContext,
  args: {
    fromProvider?: unknown;
    toPlanId?: unknown;
    toPlan?: unknown;
    toProvider?: unknown;
    category?: unknown;
    currentBill?: unknown;
    fullName?: unknown;
    accountNumber?: unknown;
    phone?: unknown;
    hasCommitment?: unknown;
    officialUrl?: unknown;
  },
): Promise<ToolResult> {
  const lang = ctxLang(ctx);
  const providers = catalogueProviders(ctx.plans as CataloguePlan[]);
  const fromProvider = normalizeProvider(clipStr(args.fromProvider, 60), providers);

  // Resolve the TARGET plan to a REAL catalogue row — by exact id first, else by
  // provider(+optional plan-name) match within an optional category. Never invent.
  const wantId = clipStr(args.toPlanId, 80);
  const wantProvider = normalizeProvider(clipStr(args.toProvider, 60), providers);
  const wantPlanName = clipStr(args.toPlan, 120).toLowerCase();
  const wantCategory = normalizeCategory(clipStr(args.category, 40));

  let target: ScorablePlan | undefined;
  if (wantId) {
    target = ctx.plans.find((p) => p.id === wantId);
  }
  if (!target && wantProvider) {
    let rows = ctx.plans.filter((p) =>
      p.provider === wantProvider && typeof p.price === "number"
    );
    if (wantCategory) rows = rows.filter((p) => p.cat === wantCategory);
    if (wantPlanName) {
      const named = rows.filter((p) => String(p.plan ?? "").toLowerCase().includes(wantPlanName));
      if (named.length) rows = named;
    }
    // Deterministic pick: cheapest matching real row (no brand bias, reproducible).
    rows = [...rows].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    target = rows[0];
  }

  if (!target) {
    await audit(ctx, "generate_switch_kit", false, "plan_not_found");
    return {
      ok: false,
      reason: "not_found",
      note: tr(lang, {
        he: "כדי לבנות ערכת מעבר צריך מסלול יעד אמיתי מהקטלוג — אפשר לציין ספק ומסלול (או id) שקיימים אצלי?",
        ar: "لبناء حزمة انتقال أحتاج لباقة هدف حقيقية من الكتالوج — هل يمكنك تحديد مزوّد وباقة (أو id) موجودة لدي؟",
        ru: "Чтобы собрать набор для перехода, нужен реальный целевой тариф из каталога — укажите провайдера и тариф (или id), которые у меня есть?",
        en: "To build a switch kit I need a real target plan from the catalogue — can you name a provider and plan (or id) I actually have?",
      }),
    };
  }
  if (!fromProvider) {
    await audit(ctx, "generate_switch_kit", false, "from_not_found");
    return {
      ok: false,
      reason: "invalid",
      note: tr(lang, {
        he: "מאיזה ספק אתם רוצים לעבור? צריך את שם הספק הנוכחי כדי לבנות את מכתב הניתוק וצ'ק-ליסט הניוד.",
        ar: "من أي مزوّد تريدون الانتقال؟ أحتاج اسم المزوّد الحالي لبناء خطاب الفصل وقائمة النقل.",
        ru: "От какого оператора вы хотите уйти? Нужно название текущего оператора для письма об отключении и чек-листа.",
        en: "Which provider are you switching from? I need the current provider name to build the cancellation letter and checklist.",
      }),
    };
  }

  const profile: SwitchProfile = {
    fullName: clipStr(args.fullName, 80) || null,
    accountNumber: clipStr(args.accountNumber, 40) || null,
    phone: clipStr(args.phone, 20) || null,
    currentBill: asBudget(args.currentBill) ?? null,
    hasCommitment: args.hasCommitment === true || args.hasCommitment === "true"
      ? true
      : (args.hasCommitment === false || args.hasCommitment === "false" ? false : null),
    // Pass-through only — the tool never guesses an official URL.
    officialUrl: clipStr(args.officialUrl, 300) || null,
  };

  const kit = buildSwitchKit(fromProvider, target, profile);

  await audit(ctx, "generate_switch_kit", true, `${fromProvider}→${kit.toProvider}/${kit.category}`);

  // The user reviews + sends the letter themselves — make that explicit, localized.
  const note = tr(lang, {
    he: "בניתי לך ערכת מעבר: מכתב ניתוק לעריכה, צ'ק-ליסט ניוד ושלבים. חשוב — את/ה בודק/ת ושולח/ת את המכתב בעצמך בערוצים הרשמיים של הספק; אנחנו לא שולחים אותו. זו הנחיה כללית, לא ייעוץ משפטי.",
    ar: "أعددت لك حزمة انتقال: خطاب فصل للمراجعة، قائمة نقل وخطوات. مهم — أنت تراجع وترسل الخطاب بنفسك عبر القنوات الرسمية للمزوّد؛ نحن لا نرسله. هذه إرشادات عامة وليست استشارة قانونية.",
    ru: "Я собрал набор для перехода: письмо об отключении для проверки, чек-лист переноса и шаги. Важно — вы сами проверяете и отправляете письмо через официальные каналы оператора; мы его не отправляем. Это общее руководство, а не юридическая консультация.",
    en: "I built your switch kit: a cancellation letter to review, a porting checklist and steps. Important — YOU review and send the letter yourself via the provider's official channels; we don't send it. This is general guidance, not legal advice.",
  });

  return {
    ok: true,
    data: {
      fromProvider: kit.fromProvider,
      toProvider: kit.toProvider,
      toPlan: kit.toPlan,
      toPlanId: kit.toPlanId ?? null,
      category: kit.category,
      categoryHe: kit.categoryHe,
      price: kit.price,
      priceUnit: kit.priceUnit,
      annualSavingUpTo: kit.annualSavingUpTo,
      cancellationLetterHe: kit.cancellationLetterHe,
      portabilityChecklist: kit.portabilityChecklist,
      switchSteps: kit.switchSteps,
      keyDates: kit.keyDates,
      officialUrl: kit.officialUrl,
      disclaimer: kit.disclaimer,
      // Hard flag so the model never claims it sent anything.
      autoSent: false,
    },
    note,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────
// name → executor. agent.ts looks the tool up here when it sees a functionCall.
export type ToolExecutor = (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>;

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  search_plans: (c, a) => searchPlans(c, a),
  recommend_plans: (c, a) => recommendPlans(c, a),
  refine_recommendation: (c, a) => refineRecommendation(c, a),
  get_provider: (c, a) => getProvider(c, a),
  analyze_bill: (c, a) => analyzeBill(c, a),
  suggest_retention_offer: (c, a) => suggestRetentionOffer(c, a),
  generate_referral_code: (c, a) => generateReferralCode(c, a),
  generate_switch_kit: (c, a) => generateSwitchKit(c, a),
  create_lead: (c, a) => createLead(c, a),
  book_callback: (c, a) => bookCallback(c, a),
  escalate_to_human: (c, a) => escalateToHuman(c, a),
};

// The JSON-schema declarations the LLM sees (Gemini functionDeclarations). Order
// is the order the model perceives them. Descriptions are DIAGNOSTIC: they teach
// the model to map INDIRECT user language (an objection, a loyalty signal, a
// hesitation) to the right tool, not just the obvious keyword — and they bake in
// the consent + truth-only rules so the model can't pick a tool that would break
// them.
export const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "search_plans",
    description:
      "חיפוש/דפדוף במסלולים אמיתיים מהקטלוג לפי קטגוריה (ותקציב/חו\"ל אופציונליים). מתי: כשהמשתמש רוצה לראות מה קיים בלי פרופיל — \"מה יש בסלולר?\", \"תראה לי מסלולים\", \"מה זול?\", \"מי מציע אינטרנט?\", \"מה כולל 5G?\". זהו כלי גלם (cheapest-first, ללא דירוג). אם המשתמש מתאר את הצרכים שלו ורוצה את ההמלצה הכי טובה — העדף recommend_plans. מחזיר שורות אמיתיות בלבד; אם אין התאמה — אומר זאת, לא ממציא.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["cellular", "internet", "tv", "triple", "abroad"], description: "קטגוריית השירות" },
        budget: { type: "number", description: "תקרת מחיר חודשי בש\"ח (אופציונלי)" },
        abroad: { type: "boolean", description: "לסנן רק מסלולים שכוללים חו\"ל" },
        limit: { type: "number", description: "כמה תוצאות (ברירת מחדל 6, מקסימום 12)" },
      },
      required: ["category"],
    },
  },
  {
    name: "recommend_plans",
    description:
      "המלצה ראשונה מדורגת (עד 3) מהקטלוג לפי פרופיל המשתמש, עם סיבה קצרה לכל מסלול והשוואה בין הבחירות. מתי: בפעם הראשונה שהמשתמש מבקש מה הכי מתאים/משתלם לו — \"מה הכי טוב בשבילי?\", \"מה כדאי לי?\", \"איזה מסלול שווה?\", או אחרי שסיפר על צרכיו (תקציב/מהירות/חו\"ל/בלי התחייבות). חשוב: זו ההמלצה הראשונית. אם המשתמש כבר קיבל המלצה והתנגד/דחה אותה (\"יקר לי\", \"לא רוצה להתחייב\", \"צריך יותר מהיר\") — אל תקרא שוב ל-recommend_plans; קרא ל-refine_recommendation. החיסכון השנתי מחושב רק אם נמסר חשבון נוכחי אמיתי — אחרת אל תבטיח סכום.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["cellular", "internet", "tv", "triple", "abroad"] },
        budget: { type: "number", description: "תקרת מחיר חודשי מבוקשת" },
        currentBill: { type: "number", description: "החשבון החודשי הנוכחי (לחישוב חיסכון אמיתי)" },
        priority: {
          type: "string",
          enum: ["price", "speed", "coverage", "service", "flexibility", "balanced"],
          description: "מה הכי חשוב למשתמש (מחיר/מהירות/כיסוי/שירות/גמישות/מאוזן)",
        },
        abroad: { type: "boolean" },
        wants5G: { type: "boolean" },
        noCommit: { type: "boolean", description: "מעדיף ללא התחייבות" },
      },
      required: ["category"],
    },
  },
  {
    name: "refine_recommendation",
    description:
      "דירוג-מחדש אחרי התנגדות: כשהמשתמש כבר קיבל המלצה ודחה אותה או ביקש משהו אחר. זהו הכלי לזהות שפה עקיפה של התנגדות ולפעול עליה — \"יקר לי מדי\" / \"אין לי כסף לזה\" (זול יותר), \"לא רוצה להתחייב\" / \"בלי חוזה\" (גמיש), \"צריך יותר מהיר\" / \"איטי לי\" (מהירות), \"הקליטה גרועה\" (כיסוי), \"אני מרוצה מהספק שלי\" / \"חבל לי לעזוב\" (אות נאמנות — שקול גם suggest_retention_offer). מעביר את מילות המשתמש ב-feedback (אני מזהה את ההתנגדות), ואת המסלולים שכבר הוצעו ונדחו ב-prevPlanIds כדי לא לחזור עליהם. מדרג מחדש מאותו קטלוג אמיתי דרך מנוע הניקוד — אף פעם לא ממציא מחיר זול יותר או מסלול שלא קיים; אם אי אפשר לענות על ההתנגדות מהקטלוג, אומר זאת בכנות. החיסכון מחושב רק מול חשבון נוכחי אמיתי.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["cellular", "internet", "tv", "triple", "abroad"], description: "קטגוריית השירות (כמו בהמלצה הקודמת)" },
        feedback: { type: "string", description: "מילות ההתנגדות/הבקשה של המשתמש כפי שנאמרו (למשל 'יקר לי', 'לא רוצה להתחייב', 'צריך יותר מהיר')" },
        budget: { type: "number", description: "תקרת מחיר חדשה אם המשתמש נקב בסכום (אופציונלי; גובר על הניתוח מ-feedback)" },
        noCommit: { type: "boolean", description: "המשתמש רוצה ללא התחייבות (אופציונלי; גובר)" },
        minSpeed: { type: "string", description: "דרישת מהירות מינימלית — '5g'/'fast'/'fiber' או דגל (אופציונלי; גובר)" },
        currentBill: { type: "number", description: "החשבון החודשי הנוכחי (לחישוב חיסכון אמיתי, אופציונלי)" },
        abroad: { type: "boolean", description: "לדרוש מסלולים שכוללים חו\"ל (אופציונלי)" },
        prevPlanIds: {
          type: "array",
          items: { type: "string" },
          description: "מזהי המסלולים שכבר הוצעו ונדחו — יוחרגו מהסט החדש",
        },
      },
      required: ["category", "feedback"],
    },
  },
  {
    name: "get_provider",
    description:
      "עובדות אמיתיות על ספק מסוים מהקטלוג (כמה מסלולים יש לו, המסלול הזול שלו בכל קטגוריה). מתי: כשהמשתמש שואל על ספק בשם — \"מה יש לסלקום?\", \"כמה גובים בפרטנר?\", \"אני בבזק, מה האפשרויות?\", \"שווה להישאר עם הוט?\". לא ממציא דירוג/כיסוי שאין עליו נתון אמיתי — משמיט.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "שם הספק" } },
      required: ["name"],
    },
  },
  {
    name: "analyze_bill",
    description:
      "ניתוח חשבון אחרי שחולצו ממנו ספק/סכום/קטגוריה (התמונה כבר נקראה ע\"י הקורא). מתי: כשהמשתמש שיתף חשבון/צילום או אמר כמה הוא משלם היום ורוצה לדעת אם אפשר לחסוך — \"אני משלם 120 ש\"ח, זה הרבה?\", \"תבדוק לי את החשבון\". מחזיר מסלולים זולים יותר אמיתיים; החיסכון הוא 'עד ~₪X' מול הסכום שנקרא — לא הבטחה.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string" },
        monthly: { type: "number", description: "הסכום החודשי שנקרא מהחשבון" },
        category: { type: "string", enum: ["cellular", "internet", "tv", "triple", "abroad"] },
        imageId: { type: "string", description: "מזהה התמונה (לתיעוד בלבד)" },
      },
      required: ["monthly"],
    },
  },
  {
    name: "suggest_retention_offer",
    description:
      "תסריט מיקוח אמיתי לשימור מול הספק הנוכחי. מתי: כשהמשתמש מאותת נאמנות או חוסר רצון לעבור אבל רוצה לשלם פחות — \"אני מרוצה מהספק שלי אבל יקר\", \"לא בא לי להתחיל מעבר\", \"חבל לי לעזוב, אפשר להוריד מחיר?\", \"מה אני אומר לשימור?\". מחזיר את מחיר השוק האמיתי (המסלול הזול בקטגוריה + הזול של אותו ספק) ומשפט לומר לנציג השימור. אף פעם לא הבטחה — נקודת פתיחה למשא ומתן בלבד. החיסכון מחושב רק אם נמסר חשבון נוכחי אמיתי.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string", description: "הספק הנוכחי של המשתמש" },
        category: { type: "string", enum: ["cellular", "internet", "tv", "triple", "abroad"], description: "קטגוריית השירות" },
        currentBill: { type: "number", description: "החשבון החודשי הנוכחי (לחישוב חיסכון אמיתי, אופציונלי)" },
        abroad: { type: "boolean", description: "לדרוש מסלולים שכוללים חו\"ל" },
      },
      required: ["category"],
    },
  },
  {
    name: "generate_referral_code",
    description:
      "יצירת קוד הפניה אמיתי לשיתוף עם חבר/ה. מתי: כשהמשתמש רוצה לשתף את Switchy AI — \"יש לכם קוד הזמנה?\", \"איך אני ממליץ לחבר?\", \"תן לי לינק לשתף\". הקוד אמיתי ונשמר לשיוך. אין תמורה כספית מפורסמת — המסגור הוא שיתוף הכלי (עזרה לחבר לחסוך); אל תבטיח פרס/כסף. לא דורש הסכמת שיווק (המשתמש בוחר לשתף).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "שם המשתמש שמשתף (אופציונלי, לשיוך)" },
      },
      required: [],
    },
  },
  {
    name: "generate_switch_kit",
    description:
      "בניית ערכת מעבר (Switch Autopilot): מכתב ניתוק לעריכה, צ'ק-ליסט ניוד, שלבי מעבר ותאריכי מפתח — למעבר מהספק הנוכחי למסלול יעד אמיתי מהקטלוג. מתי: כשהמשתמש כבר החליט לעבור ושואל על הביצוע — \"איך אני עוזב?\", \"איך מנתקים?\", \"איך מנייד מספר?\", \"מה צריך כדי לעבור ל...?\". (אם הוא עוד מתלבט בין מסלולים — קודם recommend_plans/refine_recommendation; אם הוא רוצה להישאר ולמקח — suggest_retention_offer.) מסלול היעד חייב להיות אמיתי מהקטלוג (id או ספק+שם מסלול). חשוב: המכתב הוא טיוטה בלבד — המשתמש בודק ושולח אותו בעצמו בערוצים הרשמיים של הספק; אנחנו לא שולחים. הנחיה כללית, לא ייעוץ משפטי. לא ממציאים מספרי טלפון/שלבים/לוחות זמנים.",
    parameters: {
      type: "object",
      properties: {
        fromProvider: { type: "string", description: "הספק הנוכחי שעוזבים (חובה)" },
        toPlanId: { type: "string", description: "מזהה מסלול היעד בקטלוג (אם ידוע)" },
        toProvider: { type: "string", description: "ספק היעד (אם אין id)" },
        toPlan: { type: "string", description: "שם מסלול היעד (אם אין id)" },
        category: { type: "string", enum: ["cellular", "internet", "tv", "triple", "abroad"], description: "קטגוריית השירות (לצמצום ההתאמה)" },
        currentBill: { type: "number", description: "החשבון החודשי הנוכחי (לחישוב חיסכון אמיתי, אופציונלי)" },
        fullName: { type: "string", description: "שם מלא למכתב (אופציונלי — אחרת נשאר מקום למילוי)" },
        accountNumber: { type: "string", description: "מספר לקוח/מנוי אצל הספק הנוכחי (אופציונלי)" },
        phone: { type: "string", description: "מספר הטלפון לניוד (סלולר, אופציונלי)" },
        hasCommitment: { type: "boolean", description: "האם המסלול הנוכחי בהתחייבות (אופציונלי)" },
        officialUrl: { type: "string", description: "כתובת האתר הרשמי של הספק הנוכחי (pass-through בלבד; לא לנחש)" },
      },
      required: ["fromProvider"],
    },
  },
  {
    name: "create_lead",
    description:
      "יצירת פנייה לנציג אנושי שייצור קשר. מתי: כשהמשתמש מאותת שהוא רוצה להתקדם עם אדם — \"תחזרו אליי\", \"אני רוצה להירשם\", \"חבר אותי לנציג\", \"בואו נתקדם\", \"איך נסגור?\". חובה לפני הקריאה: לקבל אישור מפורש (consent=true) לתנאי השימוש ומדיניות הפרטיות, ולציין למשתמש את גילוי העמלה (§7b). בלי consent=true — הפנייה לא נשמרת והכלי מסרב; אסוף קודם שם+טלפון+אישור. אל תזמין consent=true אם המשתמש לא אישר במפורש. בנוסף, ואך ורק בסיום, שאל/י שאלת כן/לא נפרדת וכנה: \"האם תאשר/י להעביר את פרטיך לספקים רלוונטיים לקבלת הצעה?\" — אם וכאשר המשתמש אומר כן במפורש, העבר/י consent_share=true. זו הסכמה נפרדת לחלוטין מההסכמה לתנאים (§30A): לעולם לא להניח אותה, לעולם לא לאגד אותה עם consent, ולעולם לא להעביר consent_share=true בלי אישור מפורש. אם המשתמש לא אישר או לא נשאל — השאר/י consent_share=false (ברירת המחדל), והפנייה עדיין נקלטת אך לא תסומן כניתנת-למכירה.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "שם המשתמש" },
        phone: { type: "string", description: "טלפון ישראלי" },
        consent: { type: "boolean", description: "אישור מפורש לתנאים+פרטיות — חובה true; רק אם המשתמש אישר בפועל" },
        consent_share: { type: "boolean", description: "הסכמה נפרדת ואופציונלית להעברת הפרטים לספקים צד-שלישי (\"האם תאשר/י להעביר את פרטיך לספקים רלוונטיים לקבלת הצעה?\"). ברירת מחדל false. true רק אם המשתמש ענה כן במפורש — לעולם לא להניח ולא לאגד עם consent." },
        provider: { type: "string", description: "ספק נוכחי/מבוקש (אם נמסר)" },
        category: { type: "string", description: "השירות המבוקש" },
        notes: { type: "string", description: "הקשר קצר" },
      },
      required: ["name", "phone", "consent"],
    },
  },
  {
    name: "book_callback",
    description:
      "בקשת שיחה חוזרת במועד מועדף. מתי: כשהמשתמש רוצה שיחזרו אליו בזמן מסוים — \"תתקשרו בערב\", \"תחזרו אליי מחר\", \"מתי נוח לכם להתקשר?\". אותו כלל הסכמה כמו create_lead — חובה consent=true (אישור מפורש לתנאים+פרטיות) וגילוי עמלה §7b. המועד נשמר בהערות והנציג חוזר.",
    parameters: {
      type: "object",
      properties: {
        slot: { type: "string", description: "מועד מועדף (עכשיו/בצהריים/בערב/מחר)" },
        name: { type: "string" },
        phone: { type: "string" },
        consent: { type: "boolean", description: "אישור מפורש — חובה true; רק אם המשתמש אישר בפועל" },
        notes: { type: "string" },
      },
      required: ["name", "phone", "consent"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "העברת השיחה לנציג אנושי באופן מיידי (פעולת שירות, לא שיווק — לא דורש הסכמה). מתי: כשהמשתמש מתעקש לדבר עם בנאדם (\"תן לי לדבר עם נציג\", \"אני לא רוצה בוט\"), כשהוא מתוסכל/כועס, כשהשאלה מורכבת מדי או רגישה, או כשנתקעת ואין לך תשובה אמיתית מהקטלוג. בניגוד ל-create_lead זו לא לכידת ליד שיווקי — זו חבירה לאדם; אין צורך באישור.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "סיבה קצרה להעברה" } },
      required: [],
    },
  },
];
