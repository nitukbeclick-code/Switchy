import type { Plan } from "./types";

export const COST_HORIZON_MONTHS = 12;

export interface CostSegment {
  fromMonth: number;
  toMonth: number;
  monthly: number;
}

export interface ParsedFee {
  label: string;
  amount: number;
  raw: string;
}

export type CostBasis =
  | "published-schedule"
  | "published-promo"
  | "fixed-price"
  | "published-range";

export interface PlanTwelveMonthCost {
  months: 12;
  minimum: number;
  maximum: number;
  basis: CostBasis;
  segments: CostSegment[];
  recurringExtras: ParsedFee[];
  oneTimeFees: ParsedFee[];
  hasUnpricedFees: boolean;
  disclosure: string;
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function headlinePrice(plan: Plan): number {
  return finiteNumber(plan.priceExact) ?? finiteNumber(plan.price) ?? 0;
}

function afterPrice(plan: Plan): number | null {
  return finiteNumber(plan.afterExact) ?? finiteNumber(plan.after);
}

function planText(plan: Plan): string {
  const values: string[] = [];
  if (Array.isArray(plan.fineLines)) values.push(...plan.fineLines);
  if (Array.isArray(plan.terms)) values.push(...plan.terms);
  else if (typeof plan.terms === "string") values.push(plan.terms);
  if (typeof plan.notes === "string") values.push(plan.notes);
  return values.join(" | ");
}

function numericAmount(text: string): number | null {
  const currency = text.match(/₪\s*([\d,.]+)/);
  const fallback = text.match(/(?:^|\+)\s*([\d,.]+)/);
  const raw = currency?.[1] ?? fallback?.[1];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function planFees(plan: Plan): {
  recurringExtras: ParsedFee[];
  oneTimeFees: ParsedFee[];
  hasUnpricedFees: boolean;
} {
  if (!plan.fees || typeof plan.fees !== "object" || Array.isArray(plan.fees)) {
    return { recurringExtras: [], oneTimeFees: [], hasUnpricedFees: false };
  }
  const recurringExtras: ParsedFee[] = [];
  const oneTimeFees: ParsedFee[] = [];
  let hasUnpricedFees = false;
  for (const [label, value] of Object.entries(plan.fees as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const raw = value.trim();
    if (!raw || /^(אין|כלול|חינם|ללא)$/i.test(raw)) continue;
    const amount = numericAmount(raw);
    if (amount == null) {
      hasUnpricedFees = true;
      continue;
    }
    const fee = { label, amount, raw };
    if (/(?:\/\s*ח[׳'\"]?|לחודש|חודשי)/i.test(raw)) recurringExtras.push(fee);
    else oneTimeFees.push(fee);
  }
  return { recurringExtras, oneTimeFees, hasUnpricedFees };
}

function scheduledMonths(text: string, fallback: number): number[] | null {
  const months = Array.from({ length: COST_HORIZON_MONTHS }, () => fallback);
  let found = false;
  const pattern = /ח[׳'\"]?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*:\s*₪?\s*([\d,.]+)/g;
  for (const match of text.matchAll(pattern)) {
    const from = Math.max(1, Number(match[1]));
    const to = Math.min(COST_HORIZON_MONTHS, Number(match[2]));
    const amount = Number(match[3].replace(/,/g, ""));
    if (!Number.isFinite(amount) || from > to) continue;
    found = true;
    for (let month = from; month <= to; month += 1) months[month - 1] = amount;
  }
  // A published tier that begins only after the first year confirms that the
  // headline price covers our whole horizon, even though no in-horizon range is
  // present (for example "ח׳13+: ₪199" or "שנה 2+: ₪149").
  if (/(?:ח[׳'\"]?\s*13\+|שנה\s*2\+)\s*:/.test(text)) found = true;
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

function compressSchedule(months: number[]): CostSegment[] {
  if (!months.length) return [];
  const segments: CostSegment[] = [];
  let from = 1;
  let monthly = months[0];
  for (let index = 1; index <= months.length; index += 1) {
    if (index < months.length && months[index] === monthly) continue;
    segments.push({ fromMonth: from, toMonth: index, monthly });
    from = index + 1;
    monthly = months[index];
  }
  return segments;
}

/**
 * Calculate the published service price across the first 12 months. Equipment
 * and installation amounts are exposed separately because the catalogue often
 * describes them as optional; silently adding them would overstate the bill.
 * When a promo end date is missing, return an honest range instead of guessing.
 */
export function calculateTwelveMonthCost(plan: Plan): PlanTwelveMonthCost {
  const headline = headlinePrice(plan);
  const after = afterPrice(plan);
  const text = planText(plan);
  const fees = planFees(plan);
  const schedule = scheduledMonths(text, headline);

  if (schedule) {
    const total = schedule.reduce((sum, amount) => sum + amount, 0);
    return {
      months: COST_HORIZON_MONTHS,
      minimum: total,
      maximum: total,
      basis: "published-schedule",
      segments: compressSchedule(schedule),
      ...fees,
      disclosure: "לפי מדרגות המחיר שפורסמו ל-12 החודשים הראשונים; ציוד והתקנה מוצגים בנפרד.",
    };
  }

  if (after != null && after > headline) {
    const duration = promoMonths(text);
    if (duration != null) {
      const promo = Math.min(COST_HORIZON_MONTHS, duration);
      const months = Array.from(
        { length: COST_HORIZON_MONTHS },
        (_, index) => (index < promo ? headline : after),
      );
      const total = months.reduce((sum, amount) => sum + amount, 0);
      return {
        months: COST_HORIZON_MONTHS,
        minimum: total,
        maximum: total,
        basis: "published-promo",
        segments: compressSchedule(months),
        ...fees,
        disclosure: "לפי משך המבצע והמחיר שאחריו כפי שפורסמו; ציוד והתקנה מוצגים בנפרד.",
      };
    }
    const minimum = headline * COST_HORIZON_MONTHS;
    const maximum = headline + after * (COST_HORIZON_MONTHS - 1);
    return {
      months: COST_HORIZON_MONTHS,
      minimum,
      maximum,
      basis: "published-range",
      segments: [{ fromMonth: 1, toMonth: COST_HORIZON_MONTHS, monthly: headline }],
      ...fees,
      disclosure: "משך המבצע לא פורסם בקטלוג, לכן מוצג טווח ולא ניחוש; ציוד והתקנה מוצגים בנפרד.",
    };
  }

  const total = headline * COST_HORIZON_MONTHS;
  return {
    months: COST_HORIZON_MONTHS,
    minimum: total,
    maximum: total,
    basis: "fixed-price",
    segments: [{ fromMonth: 1, toMonth: COST_HORIZON_MONTHS, monthly: headline }],
    ...fees,
    disclosure: "לפי המחיר החודשי שפורסם ל-12 חודשים; ציוד והתקנה מוצגים בנפרד.",
  };
}

const COST_NUMBER = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });

export function formatAnnualCost(cost: PlanTwelveMonthCost): string {
  const format = (value: number) => COST_NUMBER.format(value);
  if (Math.abs(cost.maximum - cost.minimum) < 0.005) return `₪${format(cost.minimum)}`;
  return `₪${format(cost.minimum)}–₪${format(cost.maximum)}`;
}

export function formatMonthlyEquivalent(cost: PlanTwelveMonthCost): string {
  const min = cost.minimum / COST_HORIZON_MONTHS;
  const max = cost.maximum / COST_HORIZON_MONTHS;
  const format = (value: number) => COST_NUMBER.format(value);
  if (Math.abs(max - min) < 0.005) return `₪${format(min)}`;
  return `₪${format(min)}–₪${format(max)}`;
}
