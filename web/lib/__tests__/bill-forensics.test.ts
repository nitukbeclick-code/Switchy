import { describe, it, expect } from "vitest";
import {
  analyzeBill,
  bestAlternative,
  isOptionalAddOn,
  ils,
  type ForensicsInput,
  type ForensicsPlan,
  type ForensicsSuggestion,
} from "@/lib/bill-forensics";

// ────────────────────────────────────────────────────────────────────────────
// lib/bill-forensics.ts — the PURE bill-forensics analyzer. These tests lock the
// E-E-A-T guarantees the wave depends on:
//   • a flag fires ONLY on a real ₪ delta vs the real catalogue (never fabricated);
//   • inferred findings (expired-promo, low-confidence reads, unused lines) are
//     marked confidence:"likely" → the UI frames them "ייתכן";
//   • the total-overpay summary never double-counts the inferred expired-promo;
//   • an unreadable / ₪0 bill yields nothing (no ₪0 forensics card);
//   • line-item flags require ACTUAL parsed lines — none → none fabricated.
// ────────────────────────────────────────────────────────────────────────────

/** A cheaper-plan suggestion, as the analyze-bill result shapes it. */
function sug(
  over: Partial<ForensicsSuggestion> = {},
): ForensicsSuggestion {
  return {
    name: "מסלול חסכוני",
    provider: "גולן טלקום",
    price: 49,
    annualSaving: 0,
    ...over,
  };
}

/** A parsed-bill input with sane defaults (readable, high confidence). */
function input(over: Partial<ForensicsInput> = {}): ForensicsInput {
  return {
    provider: "סלקום",
    currentSpend: 90,
    category: "cellular",
    suggestions: [],
    confidence: 0.9,
    ...over,
  };
}

describe("ils", () => {
  it("formats a rounded ₪ string", () => {
    expect(ils(49)).toBe("₪49");
    expect(ils(49.6)).toBe("₪50");
  });
});

describe("bestAlternative", () => {
  it("returns the largest-saving suggestion, or null when there are none", () => {
    expect(bestAlternative([])).toBeNull();
    const a = sug({ price: 60, annualSaving: 360 });
    const b = sug({ price: 49, annualSaving: 492 });
    expect(bestAlternative([a, b])).toBe(b);
  });
});

describe("isOptionalAddOn", () => {
  it("flags optional add-ons by conservative Hebrew/English cues", () => {
    expect(isOptionalAddOn("ביטוח מכשיר")).toBe(true);
    expect(isOptionalAddOn("VOD")).toBe(true);
    expect(isOptionalAddOn("מספר נוסף")).toBe(true);
    expect(isOptionalAddOn("Insurance")).toBe(true);
  });
  it("does NOT flag a core service line", () => {
    expect(isOptionalAddOn("חבילת סלולר")).toBe(false);
    expect(isOptionalAddOn("גלישה")).toBe(false);
    expect(isOptionalAddOn("")).toBe(false);
  });
});

describe("analyzeBill — overpay vs the REAL catalogue", () => {
  it("emits a CONFIRMED overpay flag grounded in the suggestion's ₪ delta", () => {
    const report = analyzeBill(
      input({
        currentSpend: 90,
        suggestions: [sug({ price: 49, annualSaving: (90 - 49) * 12 })],
      }),
    );
    expect(report.readable).toBe(true);
    const overpay = report.flags.find((f) => f.kind === "overpay");
    expect(overpay).toBeDefined();
    expect(overpay!.confidence).toBe("confirmed");
    // monthly delta = 90 − 49 = 41; annual = ×12 = 492 (same math as the analyzer).
    expect(overpay!.monthly).toBe(41);
    expect(overpay!.annual).toBe(492);
    expect(overpay!.title).toContain("₪41");
    expect(overpay!.title).not.toContain("ייתכן"); // confirmed → asserted
    expect(report.totalMonthlyOverpay).toBe(41);
    expect(report.totalAnnualOverpay).toBe(492);
  });

  it("hedges the overpay to 'ייתכן' (likely) on a LOW-confidence read", () => {
    const report = analyzeBill(
      input({
        confidence: 0.4,
        currentSpend: 90,
        suggestions: [sug({ price: 49, annualSaving: 492 })],
      }),
    );
    const overpay = report.flags.find((f) => f.kind === "overpay")!;
    expect(overpay.confidence).toBe("likely");
    expect(overpay.title).toContain("ייתכן");
    expect(report.allInferred).toBe(true);
  });

  it("NEVER fabricates an overpay when there is no cheaper plan", () => {
    const report = analyzeBill(input({ currentSpend: 40, suggestions: [] }));
    expect(report.readable).toBe(true);
    expect(report.flags.find((f) => f.kind === "overpay")).toBeUndefined();
    expect(report.totalAnnualOverpay).toBe(0);
    expect(report.bestAlternative).toBeNull();
  });

  it("ignores sub-shekel rounding noise (no flag for a ~₪0 delta)", () => {
    const report = analyzeBill(
      input({ currentSpend: 49, suggestions: [sug({ price: 49, annualSaving: 0 })] }),
    );
    expect(report.flags.find((f) => f.kind === "overpay")).toBeUndefined();
  });
});

describe("analyzeBill — expired-promo (INFERRED, always 'ייתכן')", () => {
  const promoPlans: ForensicsPlan[] = [
    // A real promo→after step-up: ₪30 promo, ₪60 after.
    { cat: "cellular", provider: "פרטנר", plan: "מסלול מבצע", price: 30, after: 60, kind: "regular" },
  ];

  it("flags a likely expired promo when the spend matches the post-promo price", () => {
    const report = analyzeBill(
      input({ currentSpend: 60, suggestions: [], confidence: 0.9 }),
      promoPlans,
    );
    const promo = report.flags.find((f) => f.kind === "expired-promo");
    expect(promo).toBeDefined();
    expect(promo!.confidence).toBe("likely"); // always inferred
    expect(promo!.title).toContain("ייתכן");
    expect(promo!.detail).toContain("₪30"); // grounded in the real promo price
  });

  it("does NOT double-count the inferred promo in the total overpay", () => {
    const report = analyzeBill(
      input({
        currentSpend: 60,
        // a real cheaper plan → a confirmed overpay of 60−49 = 11/mo
        suggestions: [sug({ price: 49, annualSaving: (60 - 49) * 12 })],
        confidence: 0.9,
      }),
      promoPlans,
    );
    expect(report.flags.some((f) => f.kind === "expired-promo")).toBe(true);
    expect(report.flags.some((f) => f.kind === "overpay")).toBe(true);
    // The total reflects ONLY the additive overpay (11/mo) — the promo flag is
    // context over the SAME spend and must not inflate it.
    expect(report.totalMonthlyOverpay).toBe(11);
    expect(report.totalAnnualOverpay).toBe(132);
  });

  it("emits no promo flag when no plan has a real step-up near the spend", () => {
    const report = analyzeBill(input({ currentSpend: 200 }), promoPlans);
    expect(report.flags.find((f) => f.kind === "expired-promo")).toBeUndefined();
  });
});

describe("analyzeBill — line items (only when actually parsed)", () => {
  it("fabricates NO line flags when the input carries no line items", () => {
    const report = analyzeBill(
      input({ suggestions: [sug({ price: 49, annualSaving: 492 })] }),
    );
    expect(report.flags.some((f) => f.kind === "unused-line")).toBe(false);
    expect(report.flags.some((f) => f.kind === "duplicate-line")).toBe(false);
  });

  it("flags a duplicate line as a likely double-charge", () => {
    const report = analyzeBill(
      input({
        currentSpend: 120,
        lineItems: [
          { label: "ביטוח מכשיר", amount: 15 },
          { label: "ביטוח מכשיר", amount: 15 },
        ],
      }),
    );
    const dup = report.flags.find((f) => f.kind === "duplicate-line");
    expect(dup).toBeDefined();
    expect(dup!.confidence).toBe("likely");
    expect(dup!.monthly).toBe(15); // the extra (duplicate) charge only
    expect(dup!.annual).toBe(180);
  });

  it("flags an optional add-on as a likely unused service ('ייתכן')", () => {
    const report = analyzeBill(
      input({
        currentSpend: 120,
        lineItems: [{ label: "ביטוח מכשיר", amount: 19 }],
      }),
    );
    const unused = report.flags.find((f) => f.kind === "unused-line");
    expect(unused).toBeDefined();
    expect(unused!.confidence).toBe("likely");
    expect(unused!.title).toContain("ייתכן");
    expect(unused!.monthly).toBe(19);
    // The real ₪ line is summed into the additive total.
    expect(report.totalMonthlyOverpay).toBeGreaterThanOrEqual(19);
  });

  it("does NOT flag a core service line as unused", () => {
    const report = analyzeBill(
      input({ currentSpend: 90, lineItems: [{ label: "חבילת סלולר", amount: 90 }] }),
    );
    expect(report.flags.some((f) => f.kind === "unused-line")).toBe(false);
  });
});

describe("analyzeBill — readability + ordering", () => {
  it("returns an unreadable, empty report on a ₪0 / unreadable bill", () => {
    const report = analyzeBill(input({ currentSpend: 0, suggestions: [] }));
    expect(report.readable).toBe(false);
    expect(report.flags).toHaveLength(0);
    expect(report.totalAnnualOverpay).toBe(0);
  });

  it("orders confirmed flags before inferred ones", () => {
    const promoPlans: ForensicsPlan[] = [
      { cat: "cellular", provider: "פרטנר", plan: "מבצע", price: 30, after: 90, kind: "regular" },
    ];
    const report = analyzeBill(
      input({
        currentSpend: 90,
        suggestions: [sug({ price: 49, annualSaving: (90 - 49) * 12 })],
        confidence: 0.95,
      }),
      promoPlans,
    );
    // First flag is the confirmed overpay; the inferred promo comes after.
    expect(report.flags[0].kind).toBe("overpay");
    expect(report.flags[0].confidence).toBe("confirmed");
    const promoIdx = report.flags.findIndex((f) => f.kind === "expired-promo");
    expect(promoIdx).toBeGreaterThan(0);
  });

  it("surfaces the best alternative for the cheaper-plan hand-off", () => {
    const report = analyzeBill(
      input({
        currentSpend: 90,
        suggestions: [
          sug({ price: 60, annualSaving: 360 }),
          sug({ price: 49, annualSaving: 492, name: "הזול ביותר" }),
        ],
      }),
    );
    expect(report.bestAlternative?.name).toBe("הזול ביותר");
  });
});
