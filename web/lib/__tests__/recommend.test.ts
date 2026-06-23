import { describe, it, expect } from "vitest";
import {
  annualSaving,
  bestMatch,
  normalizeNet,
  priorityFromId,
  rankPlans,
  scorePlan,
  type MatchProfile,
  type ScorablePlan,
} from "@/lib/recommend";
import { getPlans } from "@/lib/data";

// ────────────────────────────────────────────────────────────────────────────
// lib/recommend.ts — the web copy of the shared, provider-neutral ranking brain.
//
// These tests assert the E-E-A-T guarantees (provider neutrality, honest savings,
// honest ratings) and the cross-surface PARITY contract: the formula must score
// identically to _shared/scoring.ts + recommendation_engine.dart. We can't import
// the Deno module into vitest, so parity is locked by:
//   (a) hand-computed exact expected scores for representative fixtures, and
//   (b) invariants (determinism, neutrality, monotonicity) that the shared spec
//       guarantees — any drift in the ported math breaks at least one of them.
// ────────────────────────────────────────────────────────────────────────────

// A deterministic RNG that is the identity for the tie-break (no reordering), so
// score-equal groups keep their input order and the secondary sort keys decide.
const noShuffle = () => 0;

describe("priorityFromId", () => {
  it("normalizes every surface's priority id to one MatchPriority", () => {
    expect(priorityFromId("speed")).toBe("speed");
    expect(priorityFromId("5g")).toBe("speed");
    expect(priorityFromId("coverage")).toBe("coverage");
    expect(priorityFromId("rating")).toBe("service");
    expect(priorityFromId("service")).toBe("service");
    expect(priorityFromId("flex")).toBe("flexibility");
    expect(priorityFromId("no_commit")).toBe("flexibility");
    expect(priorityFromId("price")).toBe("price");
    expect(priorityFromId("data")).toBe("price");
    expect(priorityFromId("abroad")).toBe("balanced");
    expect(priorityFromId(undefined)).toBe("balanced");
    expect(priorityFromId("nonsense")).toBe("balanced");
  });
});

describe("normalizeNet (catalogue Hebrew/English → English vocabulary)", () => {
  it("folds Hebrew technology names into the formula's English tokens", () => {
    expect(normalizeNet("סיב אופטי")).toBe("fiber");
    expect(normalizeNet("כבלים")).toBe("cable");
    expect(normalizeNet("בינלאומי")).toBe("esim");
    expect(normalizeNet("סטרימינג")).toBe("streaming");
    expect(normalizeNet("5G")).toBe("5g");
    expect(normalizeNet("4G")).toBe("4G");
    expect(normalizeNet("eSIM")).toBe("esim");
  });
  it("passes unknown/empty values through unchanged", () => {
    expect(normalizeNet(undefined)).toBeUndefined();
    expect(normalizeNet("")).toBe("");
    expect(normalizeNet("something")).toBe("something");
  });
});

describe("annualSaving (honest savings — real bill, monthly only)", () => {
  it("is ((bill - price) * 12) clamped ≥ 0 for monthly plans", () => {
    expect(annualSaving({ price: 29, priceUnit: "month" }, 90)).toBe((90 - 29) * 12);
    expect(annualSaving({ price: 120, priceUnit: "month" }, 90)).toBe(0); // dearer → 0
  });
  it("returns 0 with no real current bill", () => {
    expect(annualSaving({ price: 29, priceUnit: "month" }, 0)).toBe(0);
    expect(annualSaving({ price: 29, priceUnit: "month" }, -5)).toBe(0);
  });
  it("returns 0 for non-monthly (per-package/day/minute) plans", () => {
    expect(annualSaving({ price: 29, priceUnit: "package" }, 90)).toBe(0);
    expect(annualSaving({ price: 5, priceUnit: "day" }, 90)).toBe(0);
  });
});

describe("scorePlan parity — exact hand-computed scores", () => {
  // A cheap, no-commit 5G cellular plan scored on the BALANCED weights with no
  // budget and no bill. Sub-scores (each 0..1):
  //   price    = clamp(1 - 29/400, .1, 1)            = 0.9275
  //   saving   = 0 (no bill)
  //   rating   = 0.6 (no reviews → neutral)
  //   speed    = 1.0 (is5G)
  //   coverage = clamp(0.95*0.7 + 0.6*0.3, 0, 1)     = 0.845   (net "5g")
  //   flex     = 1.0 (noCommit)
  // balanced weights: price .30 saving .24 rating .16 speed .12 coverage .10 flex .08
  //   base = (.30*0.9275 + .24*0 + .16*0.6 + .12*1 + .10*0.845 + .08*1) * 100
  //        = (0.278250 + 0 + 0.096 + 0.12 + 0.08450 + 0.08) * 100 = 65.875
  // No needs-met bonuses requested, no budget penalty → score 65.875.
  const plan5g: ScorablePlan = {
    id: "x",
    cat: "cellular",
    provider: "BrandA",
    plan: "P",
    price: 29,
    after: null,
    net: "5g",
    is5G: true,
    noCommit: true,
    hasAbroad: false,
  };

  it("computes the exact balanced score for a cheap no-commit 5G plan", () => {
    const profile: MatchProfile = { category: "cellular", priority: "balanced" };
    const m = scorePlan(plan5g, profile);
    expect(m.score).toBeCloseTo(65.875, 3);
    expect(m.scorePct).toBe(66);
    expect(m.label).toBe("התאמה טובה"); // 55..70 band
  });

  it("adds the wants5G + wantsNoCommit needs-met bonuses (+6, +5)", () => {
    const profile: MatchProfile = {
      category: "cellular",
      priority: "balanced",
      wants5G: true,
      wantsNoCommit: true,
    };
    const m = scorePlan(plan5g, profile);
    expect(m.score).toBeCloseTo(65.875 + 6 + 5, 3); // 76.875
    expect(m.label).toBe("התאמה מצוינת"); // 70..85 band
  });

  it("emits honest reasons (saving only with a real bill) and caveats", () => {
    // With a real bill of 90 → saving = (90-29)*12 = 732, and a promo step-up.
    const promo: ScorablePlan = { ...plan5g, after: 49 };
    const m = scorePlan(promo, {
      category: "cellular",
      priority: "balanced",
      currentBill: 90,
    });
    expect(m.annualSaving).toBe(732);
    expect(m.reasons).toContain("חוסך ₪732 בשנה");
    expect(m.reasons).toContain("5G מהיר");
    expect(m.reasons).toContain("ללא התחייבות — ביטול בכל עת");
    expect(m.caveats).toContain("מחיר מבצע — עולה ל-₪49 בהמשך");
  });

  it("applies the budget-overrun penalty + caveat when price > budget", () => {
    const dear: ScorablePlan = { ...plan5g, price: 150 };
    const profile: MatchProfile = {
      category: "cellular",
      priority: "balanced",
      budget: 100,
    };
    const m = scorePlan(dear, profile);
    expect(m.caveats).toContain("₪50 מעל התקציב");
    // over = (150-100)/100 = 0.5 → penalty = clamp(0.5*40,0,35) = 20.
    const baseline = scorePlan({ ...dear, price: 100 }, profile).score;
    expect(m.score).toBeLessThan(baseline);
  });
});

describe("rankPlans — provider neutrality + determinism", () => {
  // Two IDENTICAL plans differing ONLY by provider must score identically and
  // their relative order must NOT depend on the provider (neutrality).
  const a: ScorablePlan = { id: "a", cat: "cellular", provider: "Zeta", price: 49, net: "5g", is5G: true, noCommit: true };
  const b: ScorablePlan = { id: "b", cat: "cellular", provider: "Alpha", price: 49, net: "5g", is5G: true, noCommit: true };
  const profile: MatchProfile = { category: "cellular", priority: "balanced" };

  it("scores provider-identical plans identically (never reads provider)", () => {
    expect(scorePlan(a, profile).score).toBe(scorePlan(b, profile).score);
  });

  it("is deterministic across repeated calls for the same profile", () => {
    const r1 = rankPlans([a, b], profile);
    const r2 = rankPlans([a, b], profile);
    expect(r1.map((m) => m.plan.id)).toEqual(r2.map((m) => m.plan.id));
  });

  it("does not change ranking when only provider names swap", () => {
    const ids1 = rankPlans([a, b], profile).map((m) => m.plan.id);
    // Swap the providers between otherwise-identical plans → same id order.
    const a2 = { ...a, provider: "Alpha" };
    const b2 = { ...b, provider: "Zeta" };
    const ids2 = rankPlans([a2, b2], profile).map((m) => m.plan.id);
    expect(ids2).toEqual(ids1);
  });

  it("ranks a clearly-better plan first regardless of input order", () => {
    const cheapBest: ScorablePlan = { id: "best", cat: "cellular", provider: "X", price: 19, net: "5g", is5G: true, noCommit: true };
    const dear: ScorablePlan = { id: "dear", cat: "cellular", provider: "Y", price: 199, net: "4G", is5G: false, noCommit: false };
    const top = bestMatch([dear, cheapBest], profile, { rnd: noShuffle });
    expect(top?.plan.id).toBe("best");
  });

  it("filters to the profile category and to priced rows", () => {
    const mixed: ScorablePlan[] = [
      { id: "c1", cat: "cellular", provider: "X", price: 49 },
      { id: "i1", cat: "internet", provider: "Y", price: 99 },
      { id: "noprice", cat: "cellular", provider: "Z" }, // no price → dropped
    ];
    const ids = rankPlans(mixed, profile).map((m) => m.plan.id);
    expect(ids).toEqual(["c1"]);
  });

  it("honours the limit option", () => {
    const many: ScorablePlan[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      cat: "cellular",
      provider: `P${i}`,
      price: 30 + i,
      net: "5g",
      is5G: true,
    }));
    expect(rankPlans(many, profile, { limit: 3 })).toHaveLength(3);
  });
});

describe("rankPlans over the REAL bundled catalogue", () => {
  const plans = getPlans() as ScorablePlan[];

  it("returns only in-category plans, best (highest score) first", () => {
    const profile: MatchProfile = { category: "cellular", priority: "price", budget: 60 };
    const ranked = rankPlans(plans, profile, { limit: 5 });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.length).toBeLessThanOrEqual(5);
    for (const m of ranked) expect(m.plan.cat).toBe("cellular");
    // Non-increasing scores.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].score).toBeLessThanOrEqual(ranked[i - 1].score);
    }
  });

  it("never fabricates a saving without a real bill (all annualSaving === 0)", () => {
    const profile: MatchProfile = { category: "internet", priority: "balanced" };
    const ranked = rankPlans(plans, profile, { limit: 10 });
    for (const m of ranked) expect(m.annualSaving).toBe(0);
  });

  it("computes real savings vs a supplied bill for monthly plans", () => {
    const profile: MatchProfile = { category: "cellular", priority: "price", currentBill: 120 };
    const ranked = rankPlans(plans, profile, { limit: 10 });
    // At least one cheaper-than-120 monthly cellular plan should show a saving.
    expect(ranked.some((m) => m.annualSaving > 0)).toBe(true);
  });
});
