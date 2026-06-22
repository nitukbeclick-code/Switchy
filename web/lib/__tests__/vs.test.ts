import { describe, it, expect } from "vitest";
import {
  getVsPairs,
  getVsPair,
  pairSlug,
  vsPairsForProvider,
  vsVerdict,
} from "@/lib/vs";

// ────────────────────────────────────────────────────────────────────────────
// lib/vs.ts — curated provider-vs-provider pairs. The load-bearing invariants are
// HONESTY + correctness ones, tested against the REAL bundled catalogue:
//   • every pair is gated (both sides have real plans in the SAME category),
//   • slugs are unique + canonical (alphabetical, category-qualified — no URL
//     collisions even when the same two providers match up in two categories),
//   • the verdict is DERIVED from the data (cheaper side / gap / more options),
//     never a fabricated winner, and ties are reported as ties.
// ────────────────────────────────────────────────────────────────────────────

describe("pairSlug — canonical, stable, category-qualified", () => {
  it("orders the two provider slugs alphabetically and appends the category", () => {
    expect(pairSlug("partner", "cellcom", "cellular")).toBe(
      "cellcom-vs-partner-cellular",
    );
    // Order-independent: same slug regardless of which side is passed first.
    expect(pairSlug("cellcom", "partner", "cellular")).toBe(
      pairSlug("partner", "cellcom", "cellular"),
    );
  });

  it("distinguishes the same provider-pair across different categories", () => {
    expect(pairSlug("cellcom", "partner", "cellular")).not.toBe(
      pairSlug("cellcom", "partner", "internet"),
    );
  });
});

describe("getVsPairs — gated, unique, same-category", () => {
  const pairs = getVsPairs();

  it("emits a non-trivial curated set", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(10);
  });

  it("every pair slug is unique (no route/sitemap collisions)", () => {
    const slugs = pairs.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("both sides are different providers with real plans in the SAME category", () => {
    for (const p of pairs) {
      expect(p.a.provider.slug).not.toBe(p.b.provider.slug);
      expect(p.a.plans.length).toBeGreaterThanOrEqual(1);
      expect(p.b.plans.length).toBeGreaterThanOrEqual(1);
      // Every listed plan is genuinely in the pair's category.
      for (const plan of [...p.a.plans, ...p.b.plans]) {
        expect(plan.cat).toBe(p.category);
      }
    }
  });

  it("sides are in canonical (alphabetical-by-slug) order, matching the slug", () => {
    for (const p of pairs) {
      expect(
        p.a.provider.slug.localeCompare(p.b.provider.slug),
      ).toBeLessThanOrEqual(0);
      expect(p.slug).toBe(
        pairSlug(p.a.provider.slug, p.b.provider.slug, p.category),
      );
    }
  });

  it("minPrice/cheapest are the real cheapest plan per side", () => {
    for (const p of pairs) {
      for (const side of [p.a, p.b]) {
        const realMin = Math.min(...side.plans.map((pl) => pl.price));
        expect(side.minPrice).toBe(realMin);
        expect(side.cheapest.price).toBe(realMin);
      }
    }
  });

  it("getVsPair resolves a built slug and rejects an unknown one", () => {
    const first = pairs[0];
    expect(getVsPair(first.slug)?.slug).toBe(first.slug);
    expect(getVsPair("nope-vs-nobody-cellular")).toBeUndefined();
  });
});

describe("vsPairsForProvider — cross-linking", () => {
  it("returns pairs involving the provider, each with the OTHER side", () => {
    const pairs = getVsPairs();
    const sampleSlug = pairs[0].a.provider.slug;
    const forProvider = vsPairsForProvider(sampleSlug);
    expect(forProvider.length).toBeGreaterThan(0);
    for (const { pair, other } of forProvider) {
      const involves =
        pair.a.provider.slug === sampleSlug ||
        pair.b.provider.slug === sampleSlug;
      expect(involves).toBe(true);
      // `other` is the side that is NOT the queried provider.
      expect(other.slug).not.toBe(sampleSlug);
    }
  });

  it("returns an empty list for a provider in no curated pair", () => {
    expect(vsPairsForProvider("walla-mobile-not-a-pair")).toEqual([]);
  });
});

describe("vsVerdict — DERIVED, never fabricated", () => {
  it("names the cheaper side with the real gap, or reports a tie", () => {
    for (const p of getVsPairs()) {
      const v = vsVerdict(p);
      expect(v.priceGap).toBe(Math.abs(p.a.minPrice - p.b.minPrice));

      if (p.a.minPrice === p.b.minPrice) {
        expect(v.cheaperSide).toBeNull();
      } else {
        const expected = p.a.minPrice < p.b.minPrice ? p.a : p.b;
        expect(v.cheaperSide?.provider.slug).toBe(expected.provider.slug);
        // The summary states the cheaper provider's name (a derived conclusion).
        expect(v.summary).toContain(expected.provider.name);
      }

      // The summary always frames the choice as need-dependent (no hard "winner").
      expect(v.summary).toContain("תלויה במה שחשוב לכם");
    }
  });

  it("identifies the more-options side from real plan counts, or a tie", () => {
    for (const p of getVsPairs()) {
      const v = vsVerdict(p);
      if (p.a.planCount === p.b.planCount) {
        expect(v.moreOptionsSide).toBeNull();
      } else {
        const expected = p.a.planCount > p.b.planCount ? p.a : p.b;
        expect(v.moreOptionsSide?.provider.slug).toBe(expected.provider.slug);
      }
    }
  });
});
