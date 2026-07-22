import { describe, expect, it } from "vitest";
import { calculateTwelveMonthCost, formatAnnualCost } from "@/lib/plan-cost";
import type { Plan } from "@/lib/types";
import catalogue from "@/data/catalogue.json";

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "p1",
    cat: "internet",
    provider: "ספק",
    plan: "מסלול",
    price: 40,
    after: null,
    is5G: false,
    noCommit: true,
    hasAbroad: false,
    ...overrides,
  };
}

describe("calculateTwelveMonthCost", () => {
  it("uses published month tiers instead of the distant post-promo price", () => {
    const cost = calculateTwelveMonthCost(plan({
      price: 39,
      after: 159,
      fineLines: ["מדרגות מחיר: ח׳1-2: ₪39 / ח׳3-12: ₪139 / ח׳13+: ₪159"],
    }));

    expect(cost.basis).toBe("published-schedule");
    expect(cost.minimum).toBe(1468);
    expect(cost.maximum).toBe(1468);
    expect(cost.segments).toEqual([
      { fromMonth: 1, toMonth: 2, monthly: 39 },
      { fromMonth: 3, toMonth: 12, monthly: 139 },
    ]);
  });

  it("calculates a published three-month promotion", () => {
    const cost = calculateTwelveMonthCost(plan({
      price: 40,
      after: 50,
      fineLines: ["מחיר מבצע ל-3 חודשים, לאחר מכן ₪50"],
    }));
    expect(cost.basis).toBe("published-promo");
    expect(cost.minimum).toBe(570);
  });

  it("recognises a tier that starts only after the first year", () => {
    const cost = calculateTwelveMonthCost(plan({
      price: 179,
      after: 199,
      fineLines: ["ח׳13+: ₪199"],
    }));
    expect(cost.basis).toBe("published-schedule");
    expect(cost.minimum).toBe(2148);
  });

  it("returns a range when the promotion duration is unknown", () => {
    const cost = calculateTwelveMonthCost(plan({ price: 40, after: 60 }));
    expect(cost.basis).toBe("published-range");
    expect(cost.minimum).toBe(480);
    expect(cost.maximum).toBe(700);
    expect(formatAnnualCost(cost)).toBe("₪480–₪700");
  });

  it("keeps optional recurring and one-time fees outside the service total", () => {
    const cost = calculateTwelveMonthCost(plan({
      price: 100,
      fees: { נתב: "+₪19.9/ח׳", התקנה: "₪149", חיבור: "אין", מבצע: "לפי זכאות" },
    }));
    expect(cost.minimum).toBe(1200);
    expect(cost.recurringExtras).toEqual([
      { label: "נתב", amount: 19.9, raw: "+₪19.9/ח׳" },
    ]);
    expect(cost.oneTimeFees).toEqual([
      { label: "התקנה", amount: 149, raw: "₪149" },
    ]);
    expect(cost.hasUnpricedFees).toBe(true);
  });

  it("uses exact decimal prices", () => {
    const cost = calculateTwelveMonthCost(plan({ price: 40, priceExact: 39.9 }));
    expect(cost.minimum).toBeCloseTo(478.8);
  });

  it("produces a finite, ordered result for every live catalogue plan", () => {
    for (const item of catalogue.plans as Plan[]) {
      const cost = calculateTwelveMonthCost(item);
      expect(Number.isFinite(cost.minimum), item.id).toBe(true);
      expect(Number.isFinite(cost.maximum), item.id).toBe(true);
      expect(cost.minimum, item.id).toBeGreaterThanOrEqual(0);
      expect(cost.maximum, item.id).toBeGreaterThanOrEqual(cost.minimum);
      expect(cost.segments[0]?.fromMonth, item.id).toBe(1);
      expect(cost.segments.at(-1)?.toMonth, item.id).toBe(12);
    }
  });
});
