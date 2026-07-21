import { describe, expect, it } from "vitest";
import { filterAndSortPlans, type ComparisonFilters } from "@/lib/comparison-filter";
import type { Plan } from "@/lib/types";

function plan(id: string, over: Partial<Plan> = {}): Plan {
  return {
    id,
    cat: "cellular",
    provider: "סלקום",
    plan: `מסלול ${id}`,
    price: 50,
    after: null,
    is5G: false,
    noCommit: false,
    hasAbroad: false,
    ...over,
  };
}

const base: ComparisonFilters = {
  query: "",
  provider: "",
  sort: "price-asc",
  noCommit: false,
  fiveG: false,
  fixedPrice: false,
  includeDataOnly: false,
};

describe("filterAndSortPlans", () => {
  it("hides data-only SIMs by default but keeps them discoverable", () => {
    const plans = [plan("phone"), plan("data", { kind: "dataonly", price: 10 })];
    expect(filterAndSortPlans(plans, base).map((item) => item.id)).toEqual(["phone"]);
    expect(
      filterAndSortPlans(plans, { ...base, includeDataOnly: true }).map((item) => item.id),
    ).toEqual(["data", "phone"]);
  });

  it("combines provider, 5G, no-commit and fixed-price filters", () => {
    const plans = [
      plan("match", { provider: "פרטנר", is5G: true, noCommit: true }),
      plan("jump", { provider: "פרטנר", is5G: true, noCommit: true, after: 80 }),
      plan("other", { provider: "סלקום", is5G: true, noCommit: true }),
    ];
    expect(
      filterAndSortPlans(plans, {
        ...base,
        provider: "פרטנר",
        fiveG: true,
        noCommit: true,
        fixedPrice: true,
      }).map((item) => item.id),
    ).toEqual(["match"]);
  });

  it("can sort by the real post-promo price", () => {
    const plans = [
      plan("cheap-now", { price: 20, after: 90 }),
      plan("cheap-later", { price: 40, after: 45 }),
    ];
    expect(
      filterAndSortPlans(plans, { ...base, sort: "long-term-asc" }).map((item) => item.id),
    ).toEqual(["cheap-later", "cheap-now"]);
  });
});
