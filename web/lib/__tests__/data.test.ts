import { describe, it, expect } from "vitest";
import {
  providerSlug,
  getAggregateRating,
  buildProviderRankings,
  priceStats,
  getProviders,
  getCategories,
  plansByCategory,
} from "@/lib/data";

// ────────────────────────────────────────────────────────────────────────────
// lib/data.ts — pure catalogue accessors. providerSlug is fully deterministic
// from its argument; the ranking/stats fns are tested as invariants over the
// REAL bundled catalogue (no fabricated fixtures), plus boundary cases for
// getAggregateRating (the honesty gate).
// ────────────────────────────────────────────────────────────────────────────

describe("providerSlug", () => {
  it("lowercases + hyphenates ASCII names, trimming/collapsing separators", () => {
    expect(providerSlug("HOT")).toBe("hot");
    expect(providerSlug("Rami Levy")).toBe("rami-levy");
    expect(providerSlug("  We4G  ")).toBe("we4g");
    expect(providerSlug("019 Mobile!!")).toBe("019-mobile");
  });

  it("uses the explicit override for Hebrew brand names", () => {
    expect(providerSlug("סלקום")).toBe("cellcom");
    expect(providerSlug("פרטנר")).toBe("partner");
    expect(providerSlug("גולן טלקום")).toBe("golan");
    expect(providerSlug("019 מובייל")).toBe("019mobile");
  });

  it("falls back to a deterministic p-<hash> for un-overridden non-ASCII names", () => {
    // No ASCII alphanumerics anywhere → the ASCII path collapses to "" and the
    // char-code hash fallback kicks in.
    const a = providerSlug("ספק עברי ללא הגדרה");
    const b = providerSlug("ספק עברי ללא הגדרה");
    expect(a).toMatch(/^p-[0-9a-z]+$/);
    expect(a).toBe(b); // stable across calls
    // Different Hebrew names → different tokens (no accidental collapse).
    expect(providerSlug("ספק אחר לגמרי")).not.toBe(a);
  });

  it("an ASCII substring in an otherwise-Hebrew name still slugifies (no hash)", () => {
    // The ASCII path runs on the whole string first, so any latin run survives.
    expect(providerSlug("חברת ABC")).toBe("abc");
  });

  it("is null/undefined-safe", () => {
    // @ts-expect-error — exercising the runtime guard for bad input.
    expect(providerSlug(undefined)).toMatch(/^(|p-[0-9a-z]+)$/);
  });
});

describe("buildProviderRankings — slug uniqueness via collision suffix", () => {
  it("never emits a duplicate slug across derived providers", () => {
    const slugs = getProviders().map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("any collision-suffixed slug matches the `<base>-<n>` shape", () => {
    for (const p of getProviders()) {
      expect(p.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe("getAggregateRating — honesty boundaries", () => {
  it("returns null with no rating/reviews (never fabricate)", () => {
    expect(getAggregateRating(null)).toBeNull();
    expect(getAggregateRating(undefined)).toBeNull();
    expect(getAggregateRating({})).toBeNull();
    expect(getAggregateRating({ rating: 4.5 })).toBeNull(); // no count
    expect(getAggregateRating({ reviews: 10 })).toBeNull(); // no value
  });

  it("returns null for rating 0, >5, and reviewCount < 1", () => {
    expect(getAggregateRating({ rating: 0, reviews: 10 })).toBeNull();
    expect(getAggregateRating({ rating: 5.1, reviews: 10 })).toBeNull();
    expect(getAggregateRating({ rating: 6, reviews: 10 })).toBeNull();
    expect(getAggregateRating({ rating: 4, reviews: 0 })).toBeNull();
    expect(getAggregateRating({ rating: 4, reviews: 0.5 })).toBeNull();
  });

  it("accepts a valid rating at the upper boundary (5) and rounds the count", () => {
    expect(getAggregateRating({ rating: 5, reviews: 1 })).toEqual({
      ratingValue: 5,
      reviewCount: 1,
      worstRating: 1,
      bestRating: 5,
    });
    expect(getAggregateRating({ rating: 4.2, reviews: 12.6 })).toEqual({
      ratingValue: 4.2,
      reviewCount: 13, // Math.round
      worstRating: 1,
      bestRating: 5,
    });
  });

  it("coerces numeric strings and reads alternate field names", () => {
    expect(getAggregateRating({ ratingValue: "4.5", reviewCount: "8" })).toEqual({
      ratingValue: 4.5,
      reviewCount: 8,
      worstRating: 1,
      bestRating: 5,
    });
  });
});

describe("buildProviderRankings — ordering (transparent best value)", () => {
  it("orders by minPrice asc, then planCount desc, then name", () => {
    const ranked = buildProviderRankings();
    for (let i = 1; i < ranked.length; i++) {
      const prev = ranked[i - 1];
      const cur = ranked[i];
      // Non-decreasing minPrice.
      expect(prev.minPrice).toBeLessThanOrEqual(cur.minPrice);
      if (prev.minPrice === cur.minPrice) {
        // Tie → planCount non-increasing.
        expect(prev.planCount).toBeGreaterThanOrEqual(cur.planCount);
      }
    }
  });

  it("category-scoped ranking only includes providers with a plan in that cat", () => {
    const cat = getCategories()[0];
    const scoped = buildProviderRankings(cat);
    const namesWithCat = new Set(
      plansByCategory(cat).map((p) => p.provider),
    );
    for (const p of scoped) {
      expect(namesWithCat.has(p.name)).toBe(true);
      // minPrice/planCount are recomputed scoped to the category.
      expect(p.planCount).toBeGreaterThan(0);
    }
    // Same ascending-minPrice invariant holds for the scoped ranking.
    for (let i = 1; i < scoped.length; i++) {
      expect(scoped[i - 1].minPrice).toBeLessThanOrEqual(scoped[i].minPrice);
    }
  });
});

describe("priceStats", () => {
  const stats = priceStats();

  it("omits categories with no priced plans, includes those that have them", () => {
    for (const cat of getCategories()) {
      const priced = plansByCategory(cat).filter(
        (p) => typeof p.price === "number" && Number.isFinite(p.price),
      );
      if (priced.length === 0) {
        expect(stats[cat]).toBeUndefined();
      } else {
        expect(stats[cat]).toBeDefined();
      }
    }
  });

  it("cheapest plan equals the category min and avg is rounded to 1 dp", () => {
    for (const [cat, s] of Object.entries(stats)) {
      const priced = plansByCategory(cat).filter(
        (p) => typeof p.price === "number",
      );
      const min = Math.min(...priced.map((p) => p.price));
      const max = Math.max(...priced.map((p) => p.price));
      const sum = priced.reduce((acc, p) => acc + p.price, 0);

      expect(s.min).toBe(min);
      expect(s.max).toBe(max);
      expect(s.count).toBe(priced.length);
      expect(s.cheapest.price).toBe(min);

      // avg rounded to exactly 1 decimal place.
      expect(s.avg).toBe(Math.round((sum / priced.length) * 10) / 10);
      expect(Number.isInteger(s.avg * 10)).toBe(true);
    }
  });
});
