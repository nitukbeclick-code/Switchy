import type { Plan } from "./types";

/** A plan whose headline price can truthfully be described as monthly. */
export function isMonthlyPlan(plan: Plan): boolean {
  return !plan.priceUnit || plan.priceUnit === "month";
}

/** Data SIMs are useful, but are not a like-for-like mobile-phone plan. */
export function isDataOnlyPlan(plan: Plan): boolean {
  return plan.cat === "cellular" && plan.kind?.toLowerCase() === "dataonly";
}

/**
 * A kosher line is a real product, but it is not a like-for-like phone plan
 * either — the cheapest one in the catalogue, רמי לוי "זול להיות בקשר כשר" at
 * ₪15, carries minutes and NO data. Anchoring a category headline or a savings
 * comparison on it advertises an entry price most visitors cannot actually use.
 */
export function isKosherPlan(plan: Plan): boolean {
  return plan.cat === "cellular" && plan.kind?.toLowerCase() === "kosher";
}

/**
 * Plans eligible for broad consumer-facing "starting monthly price" claims.
 *
 * Mirrors `isConsumerMonthlyPlan` in site/build.js, kosher exclusion included:
 * both kinds keep their own accurate headlines on their own collection pages,
 * they are excluded from the CATEGORY headline, not from the site.
 */
export function isConsumerHeadlinePlan(plan: Plan): boolean {
  return (
    typeof plan.price === "number" &&
    Number.isFinite(plan.price) &&
    isMonthlyPlan(plan) &&
    !isDataOnlyPlan(plan) &&
    !isKosherPlan(plan)
  );
}
