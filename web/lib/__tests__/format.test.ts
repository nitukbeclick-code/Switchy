import { describe, it, expect } from "vitest";
import {
  priceUnitLabel,
  priceUnitShort,
  ils,
  leadCategory,
} from "@/lib/format";
import type { Plan } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// lib/format.ts — presentation helpers. The contract: the Hebrew per-unit suffix
// is driven by Plan.priceUnit, and an abroad plan defaults to per-package when
// priceUnit is unset (resolveUnit is private, exercised via the public labels).
// ────────────────────────────────────────────────────────────────────────────

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "x",
    cat: "cellular",
    provider: "סלקום",
    plan: "P",
    price: 50,
    after: null,
    is5G: false,
    noCommit: false,
    hasAbroad: false,
    ...overrides,
  };
}

describe("priceUnitLabel / priceUnitShort — explicit priceUnit wins", () => {
  const cases: Array<[Plan["priceUnit"], string, string]> = [
    ["month", "לחודש", "/ח׳"],
    ["package", "לחבילה", "/חבילה"],
    ["day", "ליום", "/יום"],
    ["minute", "לדקה", "/דק׳"],
  ];
  for (const [unit, long, short] of cases) {
    it(`${unit} → "${long}" / "${short}"`, () => {
      const p = plan({ priceUnit: unit });
      expect(priceUnitLabel(p)).toBe(long);
      expect(priceUnitShort(p)).toBe(short);
    });
  }
});

describe("resolveUnit (via labels) — defaults when priceUnit is unset", () => {
  it("non-abroad plan defaults to monthly", () => {
    const p = plan({ cat: "cellular", priceUnit: undefined });
    expect(priceUnitLabel(p)).toBe("לחודש");
    expect(priceUnitShort(p)).toBe("/ח׳");
  });

  it("abroad plan defaults to per-package", () => {
    const p = plan({ cat: "abroad", priceUnit: undefined });
    expect(priceUnitLabel(p)).toBe("לחבילה");
    expect(priceUnitShort(p)).toBe("/חבילה");
  });

  it("explicit priceUnit overrides the abroad per-package default", () => {
    const p = plan({ cat: "abroad", priceUnit: "day" });
    expect(priceUnitLabel(p)).toBe("ליום");
    expect(priceUnitShort(p)).toBe("/יום");
  });
});

describe("ils", () => {
  it("formats and rounds to a whole-shekel ₪ string", () => {
    expect(ils(69)).toBe("₪69");
    expect(ils(69.9)).toBe("₪70");
    expect(ils(0)).toBe("₪0");
  });
});

describe("leadCategory", () => {
  it("narrows the five supported categories", () => {
    for (const c of ["cellular", "internet", "tv", "triple", "abroad"]) {
      expect(leadCategory(c)).toBe(c);
    }
  });

  it("returns undefined for unsupported categories / undefined input", () => {
    expect(leadCategory("electricity")).toBeUndefined();
    expect(leadCategory("gibberish")).toBeUndefined();
    expect(leadCategory(undefined)).toBeUndefined();
  });
});
