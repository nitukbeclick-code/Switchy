import { describe, it, expect } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// app/negotiate/lib.ts — the pure, grounded retention-script engine. These tests
// drive buildNegotiation with small, hand-built REAL-shaped catalogue rows (so
// the assertions are deterministic and independent of the bundled catalogue) and
// lock in the HONESTY contract:
//   • the market rate is the cheapest comparable plan (any provider);
//   • the same-provider option is that provider's OWN cheapest comparable plan;
//   • annual saving is computed ONLY against a real monthly bill, never promised;
//   • the framing is explicit ("not a promise — the decision is the provider's");
//   • unknown/absent category or no comparable plan ⇒ an honest unavailable
//     result, never a fabricated number.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan } from "@/lib/types";
import {
  buildNegotiation,
  isNegotiationScript,
  isNegotiateCategory,
  resolveProvider,
  catalogueProviders,
  NEGOTIATE_CATEGORIES,
  type NegotiationScript,
} from "./lib";

/** Build a minimal but real-shaped catalogue Plan. */
function plan(p: Partial<Plan> & Pick<Plan, "id" | "cat" | "provider" | "plan" | "price">): Plan {
  return {
    after: null,
    is5G: false,
    noCommit: false,
    hasAbroad: false,
    kind: "regular",
    ...p,
  } as Plan;
}

const CELLULAR: Plan[] = [
  plan({ id: "a", cat: "cellular", provider: "סלקום", plan: "S-Mid", price: 90 }),
  plan({ id: "b", cat: "cellular", provider: "פרטנר", plan: "P-Cheap", price: 40 }),
  plan({ id: "c", cat: "cellular", provider: "סלקום", plan: "S-Cheap", price: 55 }),
  plan({ id: "d", cat: "cellular", provider: "גולן", plan: "G-Mid", price: 60 }),
  // A non-regular variant that must be EXCLUDED from comparable rows.
  plan({ id: "e", cat: "cellular", provider: "פרטנר", plan: "P-Data", price: 25, kind: "dataonly" }),
];

function asScript(r: NegotiationScript | { reason: string }): NegotiationScript {
  if (!isNegotiationScript(r as NegotiationScript)) {
    throw new Error(`expected a script, got unavailable: ${(r as { reason: string }).reason}`);
  }
  return r as NegotiationScript;
}

describe("isNegotiateCategory", () => {
  it("accepts the supported categories and rejects others", () => {
    for (const c of NEGOTIATE_CATEGORIES) expect(isNegotiateCategory(c)).toBe(true);
    expect(isNegotiateCategory("electricity")).toBe(false);
    expect(isNegotiateCategory("")).toBe(false);
    expect(isNegotiateCategory(undefined)).toBe(false);
    expect(isNegotiateCategory(5)).toBe(false);
  });
});

describe("resolveProvider", () => {
  const providers = ["סלקום", "פרטנר", "הוט מובייל"];
  it("matches exactly, case/space-insensitively, and a unique substring", () => {
    expect(resolveProvider("סלקום", providers)).toBe("סלקום");
    expect(resolveProvider("  סלקום  ", providers)).toBe("סלקום");
    expect(resolveProvider("הוטמובייל", providers)).toBe("הוט מובייל");
    expect(resolveProvider("הוט", providers)).toBe("הוט מובייל");
  });
  it("returns null for empty input or an ambiguous/unknown name", () => {
    expect(resolveProvider("", providers)).toBeNull();
    expect(resolveProvider(undefined, providers)).toBeNull();
    expect(resolveProvider("ביп", providers)).toBeNull();
    // Ambiguous substring matching two providers → null (never guess).
    expect(resolveProvider("ו", ["וואלה", "הוט"])).toBeNull();
  });
});

describe("catalogueProviders", () => {
  it("returns the distinct provider names", () => {
    expect(catalogueProviders(CELLULAR).sort()).toEqual(
      ["גולן", "סלקום", "פרטנר"].sort(),
    );
  });
});

describe("buildNegotiation — grounding", () => {
  it("picks the cheapest comparable plan as the market rate (regular only)", () => {
    const s = asScript(buildNegotiation({ plans: CELLULAR, category: "cellular" }));
    // The cheapest REGULAR plan is פרטנר P-Cheap @ 40 (the 25₪ dataonly is excluded).
    expect(s.marketRate.provider).toBe("פרטנר");
    expect(s.marketRate.plan).toBe("P-Cheap");
    expect(s.marketRate.price).toBe(40);
    expect(s.category).toBe("cellular");
    expect(s.categoryHe).toBe("סלולר");
  });

  it("surfaces the user's OWN provider's cheapest comparable plan", () => {
    const s = asScript(
      buildNegotiation({ plans: CELLULAR, category: "cellular", provider: "סלקום" }),
    );
    expect(s.provider).toBe("סלקום");
    // Cellcom's own cheapest is S-Cheap @ 55 (not the 90 mid plan).
    expect(s.sameProvider).not.toBeNull();
    expect(s.sameProvider?.plan).toBe("S-Cheap");
    expect(s.sameProvider?.price).toBe(55);
    // The "match your own price" step references it.
    expect(s.steps.some((t) => t.includes("S-Cheap") && t.includes("55"))).toBe(true);
  });

  it("has no same-provider option when the provider runs no comparable plan", () => {
    const s = asScript(
      buildNegotiation({ plans: CELLULAR, category: "cellular", provider: "בזק" }),
    );
    // "בזק" is unknown in this catalogue → resolveProvider returns null.
    expect(s.provider).toBeNull();
    expect(s.sameProvider).toBeNull();
  });
});

describe("buildNegotiation — honest saving (only vs a real monthly bill)", () => {
  it("computes an upper-bound annual saving against the supplied bill", () => {
    const s = asScript(
      buildNegotiation({ plans: CELLULAR, category: "cellular", currentBill: 120 }),
    );
    expect(s.hasBaseline).toBe(true);
    expect(s.currentBill).toBe(120);
    // (120 - 40) * 12 = 960.
    expect(s.marketRate.annualSavingUpTo).toBe(960);
    // A step spells out the (estimated, not promised) yearly figure.
    expect(s.steps.some((t) => t.includes("960") && t.includes("הערכה"))).toBe(true);
  });

  it("reports zero saving (and no baseline) when no bill is supplied", () => {
    const s = asScript(buildNegotiation({ plans: CELLULAR, category: "cellular" }));
    expect(s.hasBaseline).toBe(false);
    expect(s.currentBill).toBeNull();
    expect(s.marketRate.annualSavingUpTo).toBe(0);
  });

  it("never shows a saving when the cheapest plan is below an absurd bill but the bill is invalid", () => {
    const s = asScript(
      buildNegotiation({ plans: CELLULAR, category: "cellular", currentBill: -10 }),
    );
    expect(s.hasBaseline).toBe(false);
    expect(s.marketRate.annualSavingUpTo).toBe(0);
  });
});

describe("buildNegotiation — abroad filtering", () => {
  const ABROAD: Plan[] = [
    plan({ id: "x", cat: "abroad", provider: "Airalo", plan: "eSIM-EU", price: 30, hasAbroad: true, priceUnit: "package" }),
    plan({ id: "y", cat: "abroad", provider: "019", plan: "Local-only", price: 10, hasAbroad: false }),
  ];
  it("keeps only plans that actually bundle abroad use", () => {
    const s = asScript(buildNegotiation({ plans: ABROAD, category: "abroad", abroad: true }));
    // The 10₪ local-only plan must be excluded; the eSIM is the market rate.
    expect(s.marketRate.provider).toBe("Airalo");
    expect(s.marketRate.price).toBe(30);
    // A per-package abroad plan has no monthly saving even with a bill.
    const s2 = asScript(
      buildNegotiation({ plans: ABROAD, category: "abroad", abroad: true, currentBill: 100 }),
    );
    expect(s2.marketRate.annualSavingUpTo).toBe(0);
  });
});

describe("buildNegotiation — framing + unavailable cases", () => {
  it("always carries the explicit not-a-promise framing", () => {
    const s = asScript(buildNegotiation({ plans: CELLULAR, category: "cellular" }));
    expect(s.framing).toContain("לא הבטחה");
    expect(s.framing).toContain("ההחלטה");
    expect(s.steps.length).toBeGreaterThanOrEqual(4);
  });

  it("returns an unavailable result for a missing/invalid category (no fabrication)", () => {
    const r = buildNegotiation({ plans: CELLULAR, category: "electricity" });
    expect(isNegotiationScript(r)).toBe(false);
    expect((r as { reason: string }).reason).toBe("no_category");
  });

  it("returns an unavailable result when no comparable real plan exists", () => {
    const r = buildNegotiation({ plans: [], category: "cellular" });
    expect(isNegotiationScript(r)).toBe(false);
    expect((r as { reason: string }).reason).toBe("empty");
  });
});
