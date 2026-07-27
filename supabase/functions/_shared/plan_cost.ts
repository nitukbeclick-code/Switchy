// ────────────────────────────────────────────────────────────────────────────
// _shared/plan_cost.ts — what a plan REALLY costs over its first twelve months.
//
// WHY THIS EXISTS: a saving of `(bill − headline) × 12` credits a plan with a
// discount that expires. פרטנר Fiber 1000Mb is ₪39 for two months, ₪139 to
// month 12 and ₪159 after; against a ₪140 bill that arithmetic claims ₪1,212 a
// year where the plan's own published ladder puts the real first-year saving at
// ₪212. The bot quoting that number is quoting it to a person.
//
// WHY A COPY: this mirrors site/plan-cost.js, web/lib/plan-cost.ts and
// lib/services/plan_cost.dart — the same architecture _shared/scoring.ts already
// documents for the ranking formula. A Deno module cannot be imported into the
// Next bundle or the Flutter app, and scoring.ts must stay behaviourally
// identical to web/lib/recommend.ts. The cost of that architecture is real and
// this project has already paid it once: a free-month rule landed in the site
// engine alone and the other two billed a month the plan gives away for a day.
// tests/plan_cost_test.ts locks this copy to the same fixtures the other three
// are pinned to.
//
// WHAT IS DELIBERATELY NOT PORTED: fee parsing, month-by-month segments and the
// Hebrew disclosure string. Those are presentation, the edge has no surface that
// renders them, and an unused branch is a branch that drifts unnoticed. Only the
// numbers a saving is derived from are here.
//
// Pure, dependency-free, deterministic. No network, no env, no I/O.
// ────────────────────────────────────────────────────────────────────────────

export const COST_HORIZON_MONTHS = 12;

export type CostBasis =
  | "published-schedule"
  | "published-promo"
  | "fixed-price"
  | "published-range";

export type PlanCost = {
  months: number;
  /** Cost over the horizon if the promo runs as long as it possibly could. */
  minimum: number;
  /** Cost over the horizon if it ends as soon as it possibly could. */
  maximum: number;
  basis: CostBasis;
};

/** The only fields the engine reads; everything optional and validated. */
export type CostablePlan = {
  price?: unknown;
  priceExact?: unknown;
  after?: unknown;
  afterExact?: unknown;
  fineLines?: string[];
  terms?: string[] | string;
  notes?: string;
};

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function planText(plan: CostablePlan): string {
  const values: string[] = [];
  if (Array.isArray(plan.fineLines)) values.push(...plan.fineLines);
  if (Array.isArray(plan.terms)) values.push(...plan.terms);
  else if (typeof plan.terms === "string") values.push(plan.terms);
  if (typeof plan.notes === "string") values.push(plan.notes);
  return values.join(" | ");
}

function scheduledMonths(text: string, fallback: number): number[] | null {
  const months = Array.from({ length: COST_HORIZON_MONTHS }, () => fallback);
  let found = false;
  const pattern = /ח[׳'"]?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*:\s*₪?\s*([\d,.]+)/g;
  for (const match of text.matchAll(pattern)) {
    const from = Math.max(1, Number(match[1]));
    const to = Math.min(COST_HORIZON_MONTHS, Number(match[2]));
    const amount = Number(match[3].replace(/,/g, ""));
    if (!Number.isFinite(amount) || from > to) continue;
    found = true;
    for (let month = from; month <= to; month += 1) months[month - 1] = amount;
  }
  // A tier that begins only after the first year confirms the headline covers
  // our whole horizon ("ח׳13+: ₪199", "שנה 2+: ₪149").
  if (/(?:ח[׳'"]?\s*13\+|שנה\s*2\+)\s*:/.test(text)) found = true;
  // A free opening month published in PROSE rather than as a tier — yes's
  // "חודש ראשון חינם | ח׳2-12: ₪209 | …". Applied ONLY when a ladder was already
  // found: 24 catalogue plans say "חינם"/"מתנה" and nearly all mean an ADD-ON
  // (HBO Max, a router, SIM delivery), where zeroing month 1 would invent a
  // discount and flatter the plan.
  if (found && /חודש\s*ראשון\s*חינם/.test(text)) months[0] = 0;
  return found ? months : null;
}

function promoMonths(text: string): number | null {
  const numbered = text.match(/ל[-־]?\s*(\d{1,2})\s*חודש/);
  if (numbered) return Math.max(1, Number(numbered[1]));
  if (/לחודשיים/.test(text)) return 2;
  if (/לחודש(?:\s|$|\||,)/.test(text)) return 1;
  if (/לשנה|שנה ראשונה|מחיר שנה/.test(text)) return 12;
  return null;
}

/**
 * Cost over the first {@link COST_HORIZON_MONTHS} months, honouring any promo
 * ladder the catalogue published. When a promo price is published without its
 * duration the result is an honest RANGE rather than a guess — callers deriving
 * a saving must net off `maximum`, the end least favourable to the claim.
 */
export function calculateTwelveMonthCost(plan: CostablePlan): PlanCost {
  const headline = finiteNumber(plan.priceExact) ?? finiteNumber(plan.price) ?? 0;
  const after = finiteNumber(plan.afterExact) ?? finiteNumber(plan.after);
  const text = planText(plan);

  const schedule = scheduledMonths(text, headline);
  if (schedule) {
    const total = schedule.reduce((sum, amount) => sum + amount, 0);
    return { months: COST_HORIZON_MONTHS, minimum: total, maximum: total, basis: "published-schedule" };
  }

  if (after != null && after > headline) {
    const duration = promoMonths(text);
    if (duration != null) {
      const promo = Math.min(COST_HORIZON_MONTHS, duration);
      const total = promo * headline + (COST_HORIZON_MONTHS - promo) * after;
      return { months: COST_HORIZON_MONTHS, minimum: total, maximum: total, basis: "published-promo" };
    }
    return {
      months: COST_HORIZON_MONTHS,
      minimum: headline * COST_HORIZON_MONTHS,
      maximum: headline + after * (COST_HORIZON_MONTHS - 1),
      basis: "published-range",
    };
  }

  const total = headline * COST_HORIZON_MONTHS;
  return { months: COST_HORIZON_MONTHS, minimum: total, maximum: total, basis: "fixed-price" };
}
