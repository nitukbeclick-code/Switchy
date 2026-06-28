import { describe, it, expect } from "vitest";
import {
  directAnswerFor,
  pageQuestions,
  llmDataFeed,
  methodologyText,
  lastDataDate,
} from "@/lib/aeo";
import type { Plan } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// lib/aeo.ts — pure AEO helpers. The load-bearing invariants are TRUTH ones:
// every "cheapest"/price/answer is computed from the real plan list, and when the
// data can't support a claim the helper OMITS it (returns "" / []), never guesses.
// Fixtures are synthetic so the assertions stay deterministic across catalogue
// churn. A frozen `now` keeps the dated "נכון ל-…" stamp stable.
// ────────────────────────────────────────────────────────────────────────────

/** Build a minimal valid Plan, overridable per-test. */
function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "cel_test_basic",
    cat: "cellular",
    provider: "סלקום",
    plan: "Test Plan",
    price: 40,
    after: null,
    is5G: false,
    noCommit: false,
    hasAbroad: false,
    ...overrides,
  };
}

const NOW = new Date("2026-06-15T00:00:00Z"); // → "יוני 2026"

describe("directAnswerFor — names the REAL cheapest plan", () => {
  it("returns a dated 2–3 sentence answer naming cheapest plan + price + provider", () => {
    const plans = [
      plan({ id: "a", price: 70, provider: "פלאפון", plan: "Big" }),
      plan({ id: "b", price: 29, provider: "גולן טלקום", plan: "Mini" }),
      plan({ id: "c", price: 49, provider: "סלקום", plan: "Mid" }),
    ];
    const ans = directAnswerFor("cellular", undefined, plans, NOW);
    expect(ans).toContain("Mini");
    expect(ans).toContain("גולן טלקום");
    expect(ans).toContain("₪29");
    expect(ans).toContain("לחודש");
    expect(ans).toContain("נכון ל-יוני 2026");
    expect(ans).toContain("השוואת 3");
  });

  it("uses the plan's own per-unit suffix (abroad → לחבילה)", () => {
    const plans = [plan({ cat: "abroad", price: 35, priceUnit: undefined })];
    const ans = directAnswerFor("abroad", undefined, plans, NOW);
    expect(ans).toContain("לחבילה");
  });

  it("adds an honest national-availability note for city pages", () => {
    const plans = [plan({ price: 29 })];
    const ans = directAnswerFor("cellular", "חיפה", plans, NOW);
    expect(ans).toContain("חיפה");
    expect(ans).toContain("ארציים");
  });

  it("returns empty string when there is no priced plan (omit, never guess)", () => {
    expect(directAnswerFor("cellular", undefined, [], NOW)).toBe("");
    expect(
      directAnswerFor("cellular", undefined, [plan({ price: 0 })], NOW),
    ).toBe("");
  });
});

describe("pageQuestions — factual, data-derived Q&A", () => {
  it("answers only the axes the data supports", () => {
    const plans = [
      plan({ id: "a", price: 60, noCommit: true, is5G: true }),
      plan({ id: "b", price: 30, noCommit: false, is5G: false }),
    ];
    const qs = pageQuestions("cellular", plans);
    // cheapest + cheapest-noCommit + cheapest-5G all exist here; no abroad plan.
    const joined = qs.map((q) => q.question).join("|");
    expect(joined).toContain("הזול ביותר?");
    expect(joined).toContain("ללא התחייבות");
    expect(joined).toContain("5G");
    expect(joined).not.toContain("חו״ל"); // no hasAbroad plan → omitted
    // The cheapest answer names the ₪30 plan.
    const cheapestQ = qs.find((q) => q.question === "מהו מסלול הסלולר הזול ביותר?");
    expect(cheapestQ?.answer).toContain("₪30");
  });

  it("omits the 5G question for internet/tv services", () => {
    const plans = [plan({ cat: "internet", price: 99, is5G: true })];
    const qs = pageQuestions("internet", plans);
    expect(qs.some((q) => q.question.includes("5G"))).toBe(false);
  });

  it("returns [] for an empty plan list", () => {
    expect(pageQuestions("cellular", [])).toEqual([]);
  });
});

describe("llmDataFeed — compact machine-readable snapshot", () => {
  it("serialises real plans, names the cheapest id, and carries ILS + meta", () => {
    const plans = [
      plan({ id: "a", price: 70, after: 90 }),
      plan({ id: "b", price: 29 }),
    ];
    const feed = llmDataFeed(plans, {
      service: "cellular",
      city: "תל אביב",
      url: "https://switchy-ai.com/compare/cellular",
      asOf: "2026-06-15",
      stale: false,
    });
    expect(feed.currency).toBe("ILS");
    expect(feed.planCount).toBe(2);
    expect(feed.cheapestPlanId).toBe("b");
    expect(feed.service).toBe("cellular");
    expect(feed.city).toBe("תל אביב");
    expect(feed.asOf).toBe("2026-06-15");
    expect(feed.stale).toBe(false);
    const a = feed.plans.find((p) => p.id === "a");
    expect(a?.priceAfterPromo).toBe(90);
    expect(feed.plans.find((p) => p.id === "b")?.priceAfterPromo).toBeNull();
  });

  it("excludes unpriced rows and is JSON-serialisable", () => {
    const feed = llmDataFeed([plan({ id: "a", price: 0 }), plan({ id: "b", price: 25 })]);
    expect(feed.planCount).toBe(1);
    expect(feed.cheapestPlanId).toBe("b");
    expect(() => JSON.stringify(feed)).not.toThrow();
  });
});

describe("methodologyText / lastDataDate — honest disclosure + freshness", () => {
  it("methodologyText discloses the basis and the no-fabrication rule", () => {
    const t = methodologyText();
    expect(t).toContain("המחיר ההתחלתי");
    expect(t).toMatch(/ממציאים|מנוש|מושמט/);
  });

  it("lastDataDate prefers the newest real updated_at, else today (UTC)", () => {
    const withTs = [
      { ...plan({ id: "a" }), updated_at: "2026-05-01T10:00:00Z" } as Plan,
      { ...plan({ id: "b" }), updated_at: "2026-06-10T10:00:00Z" } as Plan,
    ];
    expect(lastDataDate(withTs, NOW)).toBe("2026-06-10");
    // No timestamps → falls back to `now` (date-only, UTC).
    expect(lastDataDate([plan()], NOW)).toBe("2026-06-15");
  });
});
