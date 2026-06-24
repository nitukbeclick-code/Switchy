// ────────────────────────────────────────────────────────────────────────────
// Negotiate / Retention — the PURE, build-time, node-free engine that turns the
// REAL bundled catalogue into a grounded retention script: "לפני שעוזבים — כך
// משיגים מהספק את המחיר".
//
// The script gives a user who wants to STAY with their current provider honest
// leverage. It is grounded in two real catalogue facts:
//   • marketRate  — the cheapest comparable plan in the same category (any
//                   provider). This is the market floor — the number the user
//                   can wave at their provider ("competitor X offers ₪Y").
//   • sameProvider — the cheapest plan the user's OWN provider runs in that
//                   category (so they can ask their provider to match its own
//                   advertised price).
//
// HONESTY (ABSOLUTE — this is a price-comparison app, truth-only):
//   • Every plan/price/provider here is a genuine catalogue row — nothing is
//     fabricated, and no plan is invented to "win" a category.
//   • The annual saving is computed ONLY against a real current bill the user
//     supplied, and ONLY for a real MONTHLY plan (an abroad per-day/per-package
//     plan can't be compared to a monthly bill) — it is an upper-bound ESTIMATE
//     vs. the market floor, never a promised figure.
//   • The framing is explicit: the market rate is a NEGOTIATION STARTING POINT,
//     NOT a promise — the decision to match it is the provider's. The script
//     copy and the returned `framing` both say so.
//
// PURE: no fs, no network, no React. The catalogue rows are passed IN (the route
// loads them from the bundled catalogue via lib/data). So this module is a unit
// under test and is safe to import from anywhere.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan } from "@/lib/types";
import { CATEGORY_HE } from "@/lib/categories";
import { annualSaving, type ScorablePlan } from "@/lib/recommend";
import { priceUnitLabel } from "@/lib/format";

/** Categories the negotiate flow accepts (mirrors the catalogue + the quiz). */
export const NEGOTIATE_CATEGORIES = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
] as const;
export type NegotiateCategory = (typeof NEGOTIATE_CATEGORIES)[number];

/** True when `v` is one of the supported negotiate categories. */
export function isNegotiateCategory(v: unknown): v is NegotiateCategory {
  return (
    typeof v === "string" &&
    (NEGOTIATE_CATEGORIES as readonly string[]).includes(v)
  );
}

/** A real catalogue option surfaced as evidence in the script. */
export interface NegotiateOption {
  /** Stable catalogue id, e.g. "cel_cellcom_5gprocare1500". */
  id: string;
  /** Provider display name (e.g. "סלקום"). */
  provider: string;
  /** Plan display name. */
  plan: string;
  /** Headline price in ₪. */
  price: number;
  /** Post-promo price in ₪ when the headline is a promo, else null. */
  after: number | null;
  /** Hebrew per-unit price suffix (לחודש / לחבילה …) — owned by lib/format. */
  priceUnit: string;
  /**
   * Upper-bound annual saving (₪/yr) vs. the supplied bill — 0 unless a real
   * monthly bill was given (and the plan is monthly). An estimate, never a promise.
   */
  annualSavingUpTo: number;
}

/** The grounded negotiation result the route returns and the UI renders. */
export interface NegotiationScript {
  /** Echoed category id. */
  category: NegotiateCategory;
  /** Hebrew category label. */
  categoryHe: string;
  /** Resolved provider display name, or null when none/unknown was given. */
  provider: string | null;
  /** Echoed current bill (₪), or null when none was given. */
  currentBill: number | null;
  /** True when a real current bill backs the saving figures. */
  hasBaseline: boolean;
  /** The market floor: cheapest comparable plan (any provider). Always present. */
  marketRate: NegotiateOption;
  /**
   * The user's OWN provider's cheapest comparable plan, when the provider was
   * given AND it runs a comparable plan; otherwise null.
   */
  sameProvider: NegotiateOption | null;
  /**
   * The ordered talking points (Hebrew) the user reads to retention — grounded
   * in the real numbers above. Each line is a concrete, truthful ask.
   */
  steps: string[];
  /**
   * The honesty framing line (Hebrew): the market rate is a starting point for
   * negotiation, not a promise — the decision is the provider's.
   */
  framing: string;
}

/** A loose error shape when there is nothing real to build a script from. */
export interface NegotiationUnavailable {
  category: NegotiateCategory | null;
  reason: "no_category" | "empty";
  note: string;
}

/** Coerce a value to a positive finite number, or undefined. */
function posNum(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.round(n)
    : undefined;
}

/**
 * Resolve a free-text provider name to a genuine catalogue provider display
 * name (exact, case/space-insensitive, or unique substring). Returns null when
 * it can't be matched to exactly one real provider — we never invent a provider.
 */
export function resolveProvider(
  raw: string | undefined,
  providers: readonly string[],
): string | null {
  const q = (raw ?? "").trim();
  if (!q) return null;
  // Exact match wins.
  const exact = providers.find((p) => p === q);
  if (exact) return exact;
  // Case/space-insensitive equality.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const nq = norm(q);
  const ci = providers.find((p) => norm(p) === nq);
  if (ci) return ci;
  // Unique substring (either direction) — only if it resolves to ONE provider.
  const subs = providers.filter(
    (p) => norm(p).includes(nq) || nq.includes(norm(p)),
  );
  return subs.length === 1 ? subs[0] : null;
}

/** Distinct provider display names present in the supplied plans. */
export function catalogueProviders(plans: readonly Plan[]): string[] {
  return [...new Set(plans.map((p) => p.provider))];
}

/** Project a real catalogue row into the script's option shape. */
function toOption(plan: Plan, currentBill: number | undefined): NegotiateOption {
  const saving =
    currentBill && currentBill > 0
      ? annualSaving(plan as ScorablePlan, currentBill)
      : 0;
  return {
    id: String(plan.id ?? ""),
    provider: String(plan.provider ?? ""),
    plan: String(plan.plan ?? ""),
    price: typeof plan.price === "number" ? plan.price : 0,
    after: typeof plan.after === "number" ? plan.after : null,
    priceUnit: priceUnitLabel(plan),
    annualSavingUpTo: saving,
  };
}

export interface BuildNegotiationInput {
  /** REAL catalogue rows (passed in by the route from the bundled catalogue). */
  plans: readonly Plan[];
  /** The service to negotiate over (required). */
  category: unknown;
  /** The user's current provider (optional — enables the "match your own" ask). */
  provider?: string;
  /** The user's current monthly bill in ₪ (optional — enables saving figures). */
  currentBill?: unknown;
  /** Whether the user needs abroad/roaming included (filters comparable rows). */
  abroad?: boolean;
}

/**
 * Build a grounded retention/negotiation script from REAL catalogue rows.
 *
 * Returns a {@link NegotiationScript} on success, or a {@link NegotiationUnavailable}
 * when there is no category or no comparable real plan to ground the script on
 * (we NEVER fabricate a fallback number).
 */
export function buildNegotiation(
  input: BuildNegotiationInput,
): NegotiationScript | NegotiationUnavailable {
  if (!isNegotiateCategory(input.category)) {
    return {
      category: null,
      reason: "no_category",
      note:
        "כדי לבנות תסריט מיקוח אמיתי צריך לבחור שירות: סלולר, אינטרנט, טלוויזיה, " +
        "חבילה משולבת או חו״ל.",
    };
  }
  const category = input.category;
  const categoryHe = CATEGORY_HE[category] ?? category;
  const currentBill = posNum(input.currentBill);
  const abroad = input.abroad === true || category === "abroad";

  const providers = catalogueProviders(input.plans);
  const provider = resolveProvider(input.provider, providers);

  // Real comparable rows: same category, regular plans only, with a real price,
  // cheapest-first. (kind defaults to "regular" so unlabeled rows are included.)
  let rows = input.plans.filter(
    (p) =>
      p.cat === category &&
      typeof p.price === "number" &&
      (((p as { kind?: string }).kind ?? "regular") === "regular"),
  );
  if (abroad) rows = rows.filter((p) => p.hasAbroad === true);
  rows = [...rows].sort(
    (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  );

  if (!rows.length) {
    return {
      category,
      reason: "empty",
      note:
        `אין כרגע מסלולים אמיתיים בקטגוריית ${categoryHe} בקטלוג שלנו לבסס עליהם ` +
        `תסריט מיקוח. נסו קטגוריה אחרת או עברו להשוואה המלאה.`,
    };
  }

  // The market floor + the user's own provider's cheapest comparable plan.
  const marketBest = rows[0];
  const sameProviderPlan = provider
    ? rows.find((p) => p.provider === provider) ?? null
    : null;

  const marketRate = toOption(marketBest, currentBill);
  const sameProvider = sameProviderPlan
    ? toOption(sameProviderPlan, currentBill)
    : null;

  const steps = buildSteps({
    categoryHe,
    provider,
    currentBill,
    marketRate,
    sameProvider,
  });

  const framing =
    "זו נקודת פתיחה אמיתית למשא ומתן — לא הבטחה. ההחלטה אם להתאים את המחיר היא של " +
    "הספק. אם הוא מסרב, יש לכם כבר מסלול חלופי אמיתי וזול יותר בקטלוג שלנו.";

  return {
    category,
    categoryHe,
    provider,
    currentBill: currentBill ?? null,
    hasBaseline: !!currentBill,
    marketRate,
    sameProvider,
    steps,
    framing,
  };
}

/**
 * Build the ordered Hebrew talking points. Each line is a concrete, truthful ask
 * grounded in the real numbers — never a guaranteed outcome.
 */
function buildSteps(args: {
  categoryHe: string;
  provider: string | null;
  currentBill: number | undefined;
  marketRate: NegotiateOption;
  sameProvider: NegotiateOption | null;
}): string[] {
  const { categoryHe, provider, currentBill, marketRate, sameProvider } = args;
  const marketLine = `${marketRate.provider} — ${marketRate.plan} (₪${marketRate.price} ${marketRate.priceUnit})`;
  const steps: string[] = [];

  // 1) Open by stating your intent + your leverage.
  steps.push(
    provider
      ? `התקשרו למחלקת השימור של ${provider} ואמרו בפירוש: "אני שוקל/ת לעזוב — לפני זה אני רוצה לראות מה אתם יכולים להציע לי."`
      : `התקשרו למחלקת השימור של הספק הנוכחי ואמרו בפירוש: "אני שוקל/ת לעזוב — לפני זה אני רוצה לראות מה אתם יכולים להציע לי."`,
  );

  // 2) Anchor on the real market floor.
  if (currentBill) {
    steps.push(
      `ציינו שאתם משלמים היום ₪${currentBill} בחודש, ושהמחיר הזול בשוק בקטגוריית ${categoryHe} הוא ${marketLine}.`,
    );
  } else {
    steps.push(
      `הציגו את נקודת הייחוס מהשוק: המחיר הזול בקטגוריית ${categoryHe} הוא ${marketLine}.`,
    );
  }

  // 3) The concrete ask — match the market, or your provider's own price.
  if (sameProvider && provider) {
    steps.push(
      `בקשו שיתאימו או יתקרבו: "ראיתי ש${marketRate.provider} מציעים ${marketRate.plan} ב-₪${marketRate.price} — אתם יכולים להשוות? וגם אצלכם עצמכם יש את ${sameProvider.plan} ב-₪${sameProvider.price}; אפשר לקבל את המחיר הזה?"`,
    );
  } else if (provider) {
    steps.push(
      `בקשו שיתאימו או יתקרבו: "ראיתי ש${marketRate.provider} מציעים ${marketRate.plan} ב-₪${marketRate.price} — אתם יכולים להשוות או להתקרב? אחרת אני עובר/ת."` +
        ` (לא מצאנו מסלול פעיל של ${provider} בקטגוריה הזו, אז המחיר בשוק הוא נקודת ההשוואה.)`,
    );
  } else {
    steps.push(
      `בקשו שיתאימו או יתקרבו ל-${marketLine} — "אחרת אני שוקל/ת לעבור לספק אחר."`,
    );
  }

  // 4) If a real saving exists vs the bill, make the stake explicit (honest, capped).
  if (currentBill && marketRate.annualSavingUpTo > 0) {
    steps.push(
      `הזכירו את הסכום שמונח על השולחן: מעבר למחיר השוק יכול לחסוך לכם עד כ-₪${marketRate.annualSavingUpTo} בשנה — זו הערכה לפי החשבון שהזנתם, לא הבטחה.`,
    );
  }

  // 5) Close — be ready to follow through; that is the leverage.
  steps.push(
    `אם הם לא משתפרים, אל תתביישו לסיים: "תודה, אני אבדוק את החלופות." היכולת לעזוב היא מקור הכוח שלכם — ויש לכם כבר חלופה אמיתית מוכנה.`,
  );

  return steps;
}

/** Type guard: did {@link buildNegotiation} succeed (vs. return unavailable)? */
export function isNegotiationScript(
  r: NegotiationScript | NegotiationUnavailable,
): r is NegotiationScript {
  return (r as NegotiationScript).steps !== undefined;
}
