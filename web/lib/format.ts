// ────────────────────────────────────────────────────────────────────────────
// Presentation helpers — price formatting + per-unit Hebrew suffixes. Pure, no
// state. Mirrors the app's priceUnitLabel contract: the suffix is driven by
// Plan.priceUnit (month/package/day/minute); abroad plans default to per-package
// when unset. Never hardcode the suffix in a page — go through here.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan, PriceUnit } from "./types";

/** Hebrew per-unit suffix, full form (e.g. "לחודש"). */
export function priceUnitLabel(plan: Plan): string {
  const unit = resolveUnit(plan);
  switch (unit) {
    case "package":
      return "לחבילה";
    case "day":
      return "ליום";
    case "minute":
      return "לדקה";
    case "month":
    default:
      return "לחודש";
  }
}

/** Hebrew per-unit suffix, short form (e.g. "/ח׳"). */
export function priceUnitShort(plan: Plan): string {
  const unit = resolveUnit(plan);
  switch (unit) {
    case "package":
      return "/חבילה";
    case "day":
      return "/יום";
    case "minute":
      return "/דק׳";
    case "month":
    default:
      return "/ח׳";
  }
}

/** Resolve the effective price unit: abroad defaults to per-package when unset. */
function resolveUnit(plan: Plan): PriceUnit {
  if (plan.priceUnit) return plan.priceUnit;
  return plan.cat === "abroad" ? "package" : "month";
}

/** Format a number as an ILS price string, e.g. 69 → "₪69". */
export function ils(n: number): string {
  return `₪${Math.round(n)}`;
}

/**
 * Categories the LeadForm accepts as a default (it has no "electricity" option).
 * Narrows an arbitrary category string to that set, or undefined if unsupported —
 * so pages can pass `leadCategory(cat)` straight into <LeadForm defaultCategory>.
 */
export type LeadCategory = "cellular" | "internet" | "tv" | "triple" | "abroad";

const LEAD_CATEGORIES: readonly LeadCategory[] = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
];

export function leadCategory(cat: string | undefined): LeadCategory | undefined {
  return LEAD_CATEGORIES.includes(cat as LeadCategory)
    ? (cat as LeadCategory)
    : undefined;
}
