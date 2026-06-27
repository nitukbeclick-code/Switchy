import { describe, it, expect } from "vitest";
import {
  priceUnitLabel,
  priceUnitShort,
  ils,
  leadCategory,
  providerBrandColor,
  providerInitials,
  providerLogoFile,
} from "@/lib/format";
import { providerSlug } from "@/lib/data";
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

describe("providerBrandColor — the carrier's OWN brand hue (avatar)", () => {
  it("returns each known provider's real brand color (NOT the app accent)", () => {
    expect(providerBrandColor("סלקום")).toBe("#0098DA");
    expect(providerBrandColor("פרטנר")).toBe("#00B5A5");
    expect(providerBrandColor("פלאפון")).toBe("#E5202E");
    // None of them is ever the app's green/amber accent palette.
    for (const name of ["סלקום", "פרטנר", "פלאפון"]) {
      expect(providerBrandColor(name).toLowerCase()).not.toBe("#16a34a");
      expect(providerBrandColor(name).toLowerCase()).not.toBe("#f59e0b");
    }
  });

  it("trims surrounding whitespace before lookup", () => {
    expect(providerBrandColor("  סלקום  ")).toBe("#0098DA");
  });

  it("falls back to a neutral ink (never blank) for unknown providers", () => {
    expect(providerBrandColor("ספק לא ידוע")).toBe("#374151");
    expect(providerBrandColor("")).toBe("#374151");
  });
});

describe("providerInitials — avatar monogram", () => {
  it("uses the first character of a single-word Hebrew name", () => {
    expect(providerInitials("סלקום")).toBe("ס");
  });

  it("uses the first character of each of the first two words", () => {
    expect(providerInitials("גולן טלקום")).toBe("גט");
    expect(providerInitials("הוט מובייל")).toBe("המ");
  });

  it("upper-cases latin handles", () => {
    expect(providerInitials("yes")).toBe("Y");
    expect(providerInitials("STING TV")).toBe("ST");
    expect(providerInitials("NextTV")).toBe("N");
  });

  it("is resilient to empty / whitespace input", () => {
    expect(providerInitials("")).toBe("?");
    expect(providerInitials("   ")).toBe("?");
  });
});

describe("providerLogoFile", () => {
  it("maps known carrier slugs to their bundled logo file (webp/svg/png)", () => {
    expect(providerLogoFile("cellcom")).toBe("cellcom.webp");
    expect(providerLogoFile("hot")).toBe("hot.svg");
    expect(providerLogoFile("pelephone")).toBe("pelephone.svg");
    expect(providerLogoFile("019mobile")).toBe("019mobile.webp");
    expect(providerLogoFile("rami-levy")).toBe("rami-levy.webp");
    expect(providerLogoFile("ccc")).toBe("ccc.png");
  });

  it("returns undefined for a slug with no bundled logo (→ avatar fallback)", () => {
    expect(providerLogoFile("unknown-carrier")).toBeUndefined();
    expect(providerLogoFile("")).toBeUndefined();
  });

  it("resolves real provider display names → slug → logo file end-to-end", () => {
    expect(providerLogoFile(providerSlug("סלקום"))).toBe("cellcom.webp");
    expect(providerLogoFile(providerSlug("גולן טלקום"))).toBe("golan.webp");
    expect(providerLogoFile(providerSlug("הוט מובייל"))).toBe("hot-mobile.webp");
    expect(providerLogoFile(providerSlug("019 מובייל"))).toBe("019mobile.webp");
  });
});
