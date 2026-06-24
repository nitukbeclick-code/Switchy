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
  buildSuggestions,
  catalogueProviders,
  CATEGORY_HE,
  normalizeCategory,
  normalizeProvider,
  type Plan as CataloguePlan,
} from "./catalogue.ts";
import { buildAiLeadRow } from "./leads.ts";
import { makeReferralCode } from "./referrals.ts";

// Reply languages the agent supports (mirrors AgentLang in agent.ts; kept as a
// local string-union so tools.ts has no import cycle with agent.ts). Tool-surfaced
// notes are localized to this so they match the language the model replies in.
export type ToolLang = "he" | "ar" | "ru" | "en";

// §7b: the commission disclosure the agent MUST state before any lead hand-off.
export const COMMISSION_DISCLOSURE =
  'שקיפות: חוסך עשוי לקבל עמלה מהספק אם תעברו דרכנו — זה לא משפיע על המחיר שלכם ולא על ההמלצה, שמבוססת רק על הנתונים.';

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
  return {
    ok: true,
    data: {
      category,
      // Only surface a saving when a real current bill backed it.
      hasBaseline: (profile.currentBill ?? 0) > 0,
      recommendations: matches.map((m) => ({
        ...planView(m.plan),
        score: m.scorePct,
        label: m.label,
        annualSaving: m.annualSaving > 0 ? m.annualSaving : undefined,
        reasons: m.reasons,
        caveats: m.caveats,
      })),
    },
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
  await audit(ctx, "analyze_bill", true, `${provider || "?"}/${spend}`);
  return {
    ok: true,
    data: {
      provider: provider || null,
      monthly: spend,
      category: category || null,
      categoryHe: category ? (CATEGORY_HE[category] ?? category) : null,
      cheaperOptions: sugg.map((s) => ({
        id: s.id,
        provider: s.provider,
        plan: s.name,
        price: s.price,
        // "up to ~₪X/year" — derived from a real cheaper row vs the read amount.
        annualSavingUpTo: s.annualSaving > 0 ? s.annualSaving : undefined,
      })),
    },
  };
}

// ── create_lead ───────────────────────────────────────────────────────────────
// Consent-gated lead capture. Routes through _shared/leads.ts (via ctx.captureLead
// → captureAiLead), which builds the row ONLY when consent === true and a valid
// name+phone are present; otherwise nothing is written. §7b disclosure is returned
// so the agent states it before treating the hand-off as done.
export async function createLead(
  ctx: ToolContext,
  args: {
    name?: unknown;
    phone?: unknown;
    consent?: unknown;
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
  await ctx.logSecurityEvent?.("agent_lead_consent", {
    channel: ctx.channel,
    consent: true,
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
// the user can invite a friend to חוסך. Attribution-only: the row records who
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
    he: `הקוד שלך לשיתוף: ${code} — שתפו אותו עם חבר/ה כדי שגם הוא/היא יחסכו בחשבונות התקשורת עם חוסך. (שיתוף הכלי, ללא תמורה כספית.)`,
    ar: `رمز المشاركة الخاص بك: ${code} — شاركه مع صديق ليوفّر هو أيضًا في فواتير الاتصالات مع חוסך. (مشاركة الأداة، دون مقابل مالي.)`,
    ru: `Ваш код для приглашения: ${code} — поделитесь им с другом, чтобы он тоже экономил на счетах за связь с חוסך. (Это приглашение в сервис, без денежного вознаграждения.)`,
    en: `Your referral code: ${code} — share it with a friend so they can save on their telecom bills with חוסך too. (Sharing the tool, no cash reward.)`,
  });

  return { ok: true, data: { code, persisted, reward: null }, note };
}

// ── Registry ──────────────────────────────────────────────────────────────────
// name → executor. agent.ts looks the tool up here when it sees a functionCall.
export type ToolExecutor = (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>;

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  search_plans: (c, a) => searchPlans(c, a),
  recommend_plans: (c, a) => recommendPlans(c, a),
  get_provider: (c, a) => getProvider(c, a),
  analyze_bill: (c, a) => analyzeBill(c, a),
  suggest_retention_offer: (c, a) => suggestRetentionOffer(c, a),
  generate_referral_code: (c, a) => generateReferralCode(c, a),
  create_lead: (c, a) => createLead(c, a),
  book_callback: (c, a) => bookCallback(c, a),
  escalate_to_human: (c, a) => escalateToHuman(c, a),
};

// The JSON-schema declarations the LLM sees (Gemini functionDeclarations). Order
// is the order the model perceives them. Descriptions are prescriptive about
// WHEN to call (improves should-call precision) and bake in the consent rule.
export const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "search_plans",
    description:
      "חיפוש מסלולים אמיתיים מהקטלוג לפי קטגוריה (ותקציב/חו\"ל אופציונליים). השתמש כשהמשתמש שואל מה יש / מה זול / מה כולל תכונה. מחזיר שורות אמיתיות בלבד.",
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
      "המלצה מדורגת (עד 3) מהקטלוג לפי פרופיל המשתמש. השתמש כשהמשתמש מבקש המלצה / 'מה הכי משתלם לי'. החיסכון השנתי מחושב רק אם נמסר חשבון נוכחי אמיתי — אחרת אל תבטיח סכום.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["cellular", "internet", "tv", "triple", "abroad"] },
        budget: { type: "number", description: "תקרת מחיר חודשי מבוקשת" },
        currentBill: { type: "number", description: "החשבון החודשי הנוכחי (לחישוב חיסכון אמיתי)" },
        priority: {
          type: "string",
          enum: ["price", "speed", "coverage", "service", "flexibility", "balanced"],
          description: "מה הכי חשוב למשתמש",
        },
        abroad: { type: "boolean" },
        wants5G: { type: "boolean" },
        noCommit: { type: "boolean", description: "מעדיף ללא התחייבות" },
      },
      required: ["category"],
    },
  },
  {
    name: "get_provider",
    description: "עובדות אמיתיות על ספק מסוים מהקטלוג (כמה מסלולים, המסלול הזול בכל קטגוריה). השתמש כששואלים על ספק ספציפי.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "שם הספק" } },
      required: ["name"],
    },
  },
  {
    name: "analyze_bill",
    description:
      "ניתוח חשבון: קבל ספק/סכום/קטגוריה (שכבר חולצו מתמונת החשבון) והחזר מסלולים זולים יותר. החיסכון הוא 'עד ~₪X' מתוך שורה אמיתית מול הסכום שנקרא — לא הבטחה.",
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
      "תסריט מיקוח אמיתי לשימור: כשהמשתמש רוצה להישאר אצל הספק הנוכחי אבל לשלם פחות. מחזיר את מחיר השוק האמיתי (המסלול הזול בקטגוריה + המסלול הזול של אותו ספק) ומשפט לומר לנציג השימור. אף פעם לא הבטחה — נקודת פתיחה למשא ומתן בלבד. החיסכון מחושב רק אם נמסר חשבון נוכחי אמיתי.",
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
      "יצירת קוד הפניה אמיתי לשיתוף עם חבר/ה. השתמש כשהמשתמש מבקש קוד/לינק להזמין חבר. הקוד אמיתי ונשמר לשיוך. אין תמורה כספית מפורסמת — המסגור הוא שיתוף הכלי (עזרה לחבר לחסוך). לא דורש הסכמת שיווק (המשתמש בוחר לשתף).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "שם המשתמש שמשתף (אופציונלי, לשיוך)" },
      },
      required: [],
    },
  },
  {
    name: "create_lead",
    description:
      "יצירת פנייה לנציג. חובה לקבל אישור מפורש (consent=true) לתנאי השימוש ומדיניות הפרטיות לפני הקריאה — בלי אישור הפנייה לא נשמרת. יש לציין גילוי עמלה (§7b) למשתמש לפני ההעברה.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "שם המשתמש" },
        phone: { type: "string", description: "טלפון ישראלי" },
        consent: { type: "boolean", description: "אישור מפורש לתנאים+פרטיות — חובה true" },
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
      "בקשת שיחה חוזרת במועד מועדף. אותו כלל הסכמה כמו create_lead — חובה consent=true. המועד נשמר בהערות והנציג חוזר.",
    parameters: {
      type: "object",
      properties: {
        slot: { type: "string", description: "מועד מועדף (עכשיו/בצהריים/בערב/מחר)" },
        name: { type: "string" },
        phone: { type: "string" },
        consent: { type: "boolean", description: "אישור מפורש — חובה true" },
        notes: { type: "string" },
      },
      required: ["name", "phone", "consent"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "העברת השיחה לנציג אנושי (פעולת שירות, לא שיווק — לא דורש הסכמה). השתמש כשהמשתמש מתעקש לדבר עם בנאדם או כשנתקעת.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "סיבה קצרה להעברה" } },
      required: [],
    },
  },
];
