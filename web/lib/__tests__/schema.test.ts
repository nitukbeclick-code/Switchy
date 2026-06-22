import { describe, it, expect } from "vitest";
import {
  productSchema,
  comparisonSchema,
  aggregateRatingSchema,
  reviewSchema,
  knowledgeWebSchema,
  webPageSchema,
  SITE_URL,
} from "@/lib/schema";
import type { Plan, Provider } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// lib/schema.ts — JSON-LD builders. The load-bearing invariants here are HONESTY
// ones: never emit Review/AggregateRating without real data, derive price ranges
// only from real [price, after], and dedupe provider Organization nodes by @id.
// Synthetic plans keep these deterministic regardless of catalogue churn.
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
    noCommit: true,
    hasAbroad: false,
    ...overrides,
  };
}

describe("aggregateRatingSchema — never fabricated", () => {
  it("returns null when the source carries no real rating", () => {
    expect(aggregateRatingSchema(plan())).toBeNull();
    expect(aggregateRatingSchema(plan({ rating: 4 } as Partial<Plan>))).toBeNull(); // no count
  });

  it("emits a schema only from real rating + reviewCount", () => {
    const p = plan({ rating: 4.3, reviews: 27 } as Partial<Plan>);
    const schema = aggregateRatingSchema(p);
    expect(schema).toMatchObject({
      "@type": "AggregateRating",
      ratingValue: 4.3,
      reviewCount: 27,
      bestRating: 5,
      worstRating: 1,
    });
    // No fabricated sub-metrics when source has none.
    expect(schema?.additionalProperty).toBeUndefined();
  });

  it("attaches real reliability/speed sub-metrics only when present", () => {
    const p = plan({
      rating: 4,
      reviews: 5,
      reliability: 4.1,
      speed: 3.8,
    } as Partial<Plan>);
    const schema = aggregateRatingSchema(p);
    expect(schema?.additionalProperty).toEqual([
      { "@type": "PropertyValue", name: "אמינות", value: 4.1 },
      { "@type": "PropertyValue", name: "מהירות", value: 3.8 },
    ]);
  });
});

describe("reviewSchema — real reviews only", () => {
  it("returns null when there are no reviews", () => {
    expect(reviewSchema(plan())).toBeNull();
    expect(
      reviewSchema(plan({ provider_reviews: [] } as Partial<Plan>)),
    ).toBeNull();
  });

  it("omits reviews missing a body or a numeric rating (never invents)", () => {
    const p = plan({
      provider_reviews: [
        { body: "מצוין", rating: 5, author: "דנה" },
        { body: "אין דירוג" }, // no rating → omitted
        { rating: 4 }, // no body → omitted
      ],
    } as Partial<Plan>);
    const reviews = reviewSchema(p);
    expect(reviews).not.toBeNull();
    expect(reviews).toHaveLength(1);
    expect(reviews?.[0]).toMatchObject({
      "@type": "Review",
      reviewBody: "מצוין",
      reviewRating: { "@type": "Rating", ratingValue: 5 },
      author: { "@type": "Person", name: "דנה" },
    });
  });
});

describe("productSchema — price range from [price, after]", () => {
  it("emits a plain Offer when there is no post-promo jump", () => {
    const schema = productSchema(plan({ price: 40, after: null }));
    expect(schema.offers).toMatchObject({
      "@type": "Offer",
      price: 40,
      priceCurrency: "ILS",
    });
  });

  it("emits an AggregateOffer spanning [low, high] when after > price", () => {
    const schema = productSchema(plan({ price: 40, after: 60 }));
    expect(schema.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: 40,
      highPrice: 60,
      offerCount: 2,
      priceCurrency: "ILS",
    });
  });

  it("treats an after <= price as a single fixed Offer (no negative range)", () => {
    const schema = productSchema(plan({ price: 50, after: 50 }));
    expect((schema.offers as Record<string, unknown>)["@type"]).toBe("Offer");
  });
});

describe("comparisonSchema — descriptive ItemList, no winner", () => {
  it("emits an ordered ItemList of the two plans (each a Product), absolute url", () => {
    const plans = [
      plan({ id: "a", provider: "פרטנר", price: 39 }),
      plan({ id: "b", provider: "סלקום", price: 99 }),
    ];
    const schema = comparisonSchema({
      name: "פרטנר מול סלקום",
      url: "/vs/cellcom-vs-partner-internet",
      plans,
    });
    expect(schema).toMatchObject({
      "@type": "ItemList",
      name: "פרטנר מול סלקום",
      numberOfItems: 2,
      url: `${SITE_URL}/vs/cellcom-vs-partner-internet`,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
    });
    const els = schema.itemListElement as Array<Record<string, unknown>>;
    expect(els).toHaveLength(2);
    expect(els[0].position).toBe(1);
    // Each element wraps a Product (not a bare "winner" assertion).
    expect((els[0].item as Record<string, unknown>)["@type"]).toBe("Product");
    expect((els[1].item as Record<string, unknown>)["@type"]).toBe("Product");
  });
});

describe("webPageSchema — compliance/info pages", () => {
  it("resolves a relative url to absolute and links the WebSite", () => {
    const schema = webPageSchema({
      name: "מדיניות פרטיות",
      description: "תיאור",
      url: "/privacy",
    });
    expect(schema).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "מדיניות פרטיות",
      url: `${SITE_URL}/privacy`,
      inLanguage: "he-IL",
    });
    expect((schema.isPartOf as Record<string, unknown>)["@type"]).toBe(
      "WebSite",
    );
  });

  it("emits lastReviewed + dateModified only when a date is given", () => {
    const without = webPageSchema({ name: "x", description: "y", url: "/terms" });
    expect(without.lastReviewed).toBeUndefined();
    expect(without.dateModified).toBeUndefined();

    const withDate = webPageSchema({
      name: "x",
      description: "y",
      url: "/terms",
      lastReviewed: "2026-06-22",
      about: "תנאי שימוש",
    });
    expect(withDate.lastReviewed).toBe("2026-06-22");
    expect(withDate.dateModified).toBe("2026-06-22");
    expect((withDate.about as Record<string, unknown>).name).toBe("תנאי שימוש");
  });
});

describe("knowledgeWebSchema — provider-node @id dedupe", () => {
  it("collapses multiple plans of the same provider onto one Organization @id", () => {
    const plans = [
      plan({ id: "a", provider: "סלקום" }),
      plan({ id: "b", provider: "סלקום" }),
      plan({ id: "c", provider: "פרטנר" }),
    ];
    const graph = knowledgeWebSchema({ plans })["@graph"] as Array<
      Record<string, unknown>
    >;

    const orgs = graph.filter((n) => n["@type"] === "Organization");
    const orgIds = orgs.map((n) => n["@id"]);
    // Exactly one Organization per distinct provider, no duplicate @id.
    expect(new Set(orgIds).size).toBe(orgIds.length);
    expect(orgIds).toContain(`${SITE_URL}/providers/cellcom#org`);
    expect(orgIds).toContain(`${SITE_URL}/providers/partner#org`);
    expect(orgs).toHaveLength(2);

    // Every Product references a provider via @id (not an inline duplicate org).
    const products = graph.filter((n) => n["@type"] === "Product");
    expect(products).toHaveLength(3);
    for (const prod of products) {
      expect((prod.brand as Record<string, unknown>)["@id"]).toMatch(
        /\/providers\/.+#org$/,
      );
    }
  });

  it("emits a provider passed in `providers` even with no plans on the page", () => {
    const extraProvider: Provider = {
      slug: "cellcom",
      name: "סלקום",
      categories: ["cellular"],
      planCount: 3,
      minPrice: 40,
      summary: "",
    };
    const graph = knowledgeWebSchema({
      plans: [],
      providers: [extraProvider],
    })["@graph"] as Array<Record<string, unknown>>;
    const orgIds = graph
      .filter((n) => n["@type"] === "Organization")
      .map((n) => n["@id"]);
    expect(orgIds).toEqual([`${SITE_URL}/providers/cellcom#org`]);
  });

  it("accepts a single Plan (the knowledgeWebSchema(plan) contract)", () => {
    const graph = knowledgeWebSchema(plan({ provider: "סלקום" }))[
      "@graph"
    ] as Array<Record<string, unknown>>;
    expect(graph.some((n) => n["@type"] === "Product")).toBe(true);
    expect(
      graph.some(
        (n) =>
          n["@type"] === "Organization" &&
          n["@id"] === `${SITE_URL}/providers/cellcom#org`,
      ),
    ).toBe(true);
  });
});
