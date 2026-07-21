import { isDataOnlyPlan } from "./plan-classification";
import type { Plan } from "./types";

export type ComparisonSort = "price-asc" | "long-term-asc" | "provider";

export interface ComparisonFilters {
  query: string;
  provider: string;
  sort: ComparisonSort;
  noCommit: boolean;
  fiveG: boolean;
  fixedPrice: boolean;
  includeDataOnly: boolean;
}

function shownPrice(plan: Plan): number {
  return typeof plan.priceExact === "number" ? plan.priceExact : plan.price;
}

function longTermPrice(plan: Plan): number {
  if (typeof plan.afterExact === "number") return plan.afterExact;
  if (typeof plan.after === "number") return plan.after;
  return shownPrice(plan);
}

export function filterAndSortPlans(
  plans: Plan[],
  filters: ComparisonFilters,
): Plan[] {
  const needle = filters.query.trim().toLocaleLowerCase("he");
  const visible = plans.filter((plan) => {
    if (!filters.includeDataOnly && isDataOnlyPlan(plan)) return false;
    if (filters.provider && plan.provider !== filters.provider) return false;
    if (filters.noCommit && !plan.noCommit) return false;
    if (filters.fiveG && !plan.is5G) return false;
    if (
      filters.fixedPrice &&
      typeof plan.after === "number" &&
      plan.after > plan.price
    ) {
      return false;
    }
    if (needle) {
      const haystack = `${plan.provider} ${plan.plan}`.toLocaleLowerCase("he");
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return visible.sort((a, b) => {
    if (filters.sort === "provider") {
      return (
        a.provider.localeCompare(b.provider, "he") || shownPrice(a) - shownPrice(b)
      );
    }
    if (filters.sort === "long-term-asc") {
      return longTermPrice(a) - longTermPrice(b) || shownPrice(a) - shownPrice(b);
    }
    return shownPrice(a) - shownPrice(b);
  });
}
