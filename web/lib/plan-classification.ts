import type { Plan } from "./types";

/** A plan whose headline price can truthfully be described as monthly. */
export function isMonthlyPlan(plan: Plan): boolean {
  return !plan.priceUnit || plan.priceUnit === "month";
}

/** Data SIMs are useful, but are not a like-for-like mobile-phone plan. */
export function isDataOnlyPlan(plan: Plan): boolean {
  return plan.cat === "cellular" && plan.kind?.toLowerCase() === "dataonly";
}

/** Plans eligible for broad consumer-facing "starting monthly price" claims. */
export function isConsumerHeadlinePlan(plan: Plan): boolean {
  return (
    typeof plan.price === "number" &&
    Number.isFinite(plan.price) &&
    isMonthlyPlan(plan) &&
    !isDataOnlyPlan(plan)
  );
}
