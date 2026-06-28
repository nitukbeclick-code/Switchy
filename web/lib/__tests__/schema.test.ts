import { describe, it, expect } from "vitest";
import {
  productSchema,
  comparisonSchema,
  itemListSchema,
  aggregateRatingSchema,
  reviewSchema,
  knowledgeWebSchema,
  webPageSchema,
  relatedLinksSchema,
  articleSchema,
  howToSchema,
  pageAggregateOfferSchema,
  speakableSchema,
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

  it("stamps additionalType: TelecomunicationsService on the Product", () => {
    const schema = productSchema(plan());
    expect(schema.additionalType).toBe(
      "https://schema.org/TelecomunicationsService",
    );
  });

  it("references the provider Organization by @id for BOTH brand and seller (no inline copies)", () => {
    const schema = productSchema(plan({ provider: "סלקום" }));
    const providerId = `${SITE_URL}/providers/cellcom#org`;
    // brand is an @id reference to the provider Organization node, not a fresh Brand.
    const brand = schema.brand as Record<string, unknown>;
    expect(brand["@type"]).toBe("Organization");
    expect(brand["@id"]).toBe(providerId);
    // seller on the offer is the SAME @id reference — no second inline Organization.
    const seller = (schema.offers as Record<string, unknown>).seller as Record<
      string,
      unknown
    >;
    expect(seller["@id"]).toBe(providerId);
  });
});

describe("productSchema — priceSpecification (monthly base + one-time fee)", () => {
  it("ALWAYS emits a UnitPriceSpecification for the monthly base in ILS", () => {
    const schema = productSchema(plan({ price: 40, after: null }));
    const specs = (schema.offers as Record<string, unknown>)
      .priceSpecification as Array<Record<string, unknown>>;
    expect(Array.isArray(specs)).toBe(true);
    expect(specs[0]).toMatchObject({
      "@type": "UnitPriceSpecification",
      price: 40,
      priceCurrency: "ILS",
      valueAddedTaxIncluded: true,
    });
    expect(specs[0].referenceQuantity).toMatchObject({
      "@type": "QuantitativeValue",
      value: 1,
      unitCode: "MON",
    });
  });

  it("adds a separate one-time PriceSpecification when the plan carries a real install/connection fee", () => {
    const schema = productSchema(
      plan({ fees: { "דמי חיבור": "₪149" } } as Partial<Plan>),
    );
    const specs = (schema.offers as Record<string, unknown>)
      .priceSpecification as Array<Record<string, unknown>>;
    expect(specs).toHaveLength(2);
    expect(specs[1]).toMatchObject({
      "@type": "PriceSpecification",
      price: 149,
      priceCurrency: "ILS",
      valueAddedTaxIncluded: true,
    });
  });

  it("OMITS the one-time fee spec when absent, free, or a recurring (per-month) charge", () => {
    // No fees at all → monthly base only.
    expect(
      (
        (productSchema(plan()).offers as Record<string, unknown>)
          .priceSpecification as unknown[]
      ).length,
    ).toBe(1);
    // A recurring router rental (per-month) is NOT a one-time fee → omitted.
    const recurring = productSchema(
      plan({ fees: { "נתב": "+₪19.9/ח׳" } } as Partial<Plan>),
    );
    expect(
      (
        (recurring.offers as Record<string, unknown>)
          .priceSpecification as unknown[]
      ).length,
    ).toBe(1);
  });
});

describe("itemListSchema — references Products by @id (no duplicate full Products)", () => {
  it("emits lean ListItems pointing at the canonical Product @id, never inlining a Product", () => {
    const plans = [
      plan({ id: "cel_a", cat: "cellular" }),
      plan({ id: "cel_b", cat: "cellular" }),
    ];
    const schema = itemListSchema(plans);
    expect(schema).toMatchObject({
      "@type": "ItemList",
      numberOfItems: 2,
    });
    const els = schema.itemListElement as Array<Record<string, unknown>>;
    expect(els).toHaveLength(2);
    const idA = `${SITE_URL}/compare/cellular#plan-cel_a`;
    expect(els[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      url: idA,
      item: { "@id": idA },
    });
    // The list item REFERENCES the product (only @id) — it does NOT re-serialize it.
    const item = els[0].item as Record<string, unknown>;
    expect(item["@type"]).toBeUndefined();
    expect(item.name).toBeUndefined();
    expect(item.offers).toBeUndefined();
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

describe("relatedLinksSchema — internal nav ItemList, real urls only", () => {
  it("returns null when there are no links", () => {
    expect(relatedLinksSchema({ name: "x", links: [] })).toBeNull();
  });

  it("emits an ItemList of positioned SiteNavigationElements with absolute urls", () => {
    const schema = relatedLinksSchema({
      name: "עמודים קשורים",
      links: [
        { name: "השוואת סלולר", url: "/compare/cellular", description: "הכל" },
        { name: "סלקום", url: `${SITE_URL}/providers/cellcom` },
      ],
    });
    expect(schema).toMatchObject({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "עמודים קשורים",
      numberOfItems: 2,
    });
    const els = schema!.itemListElement as Array<Record<string, unknown>>;
    expect(els).toHaveLength(2);
    expect(els[0]).toMatchObject({
      "@type": "SiteNavigationElement",
      position: 1,
      name: "השוואת סלולר",
      url: `${SITE_URL}/compare/cellular`,
      description: "הכל",
    });
    // Already-absolute urls are passed through untouched; no description when absent.
    expect(els[1].url).toBe(`${SITE_URL}/providers/cellcom`);
    expect(els[1].description).toBeUndefined();
  });

  it("collapses duplicate urls so the list mirrors the rendered (deduped) block", () => {
    const schema = relatedLinksSchema({
      name: "x",
      links: [
        { name: "א", url: "/compare/cellular" },
        { name: "ב", url: "/compare/cellular" }, // duplicate url → dropped
        { name: "ג", url: "/compare/internet" },
      ],
    });
    const els = schema!.itemListElement as Array<Record<string, unknown>>;
    expect(els).toHaveLength(2);
    expect(schema!.numberOfItems).toBe(2);
    // Positions are re-sequenced after the de-dupe (1,2 — no gap).
    expect(els.map((e) => e.position)).toEqual([1, 2]);
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

  it("is the single source of Product nodes: one per plan, @id matches the ItemList refs, with TelecomService + PriceSpecification", () => {
    const plans = [
      plan({ id: "cel_a", cat: "cellular", provider: "סלקום", price: 40 }),
      plan({ id: "cel_b", cat: "cellular", provider: "פרטנר", price: 55 }),
    ];
    const graph = knowledgeWebSchema({ plans })["@graph"] as Array<
      Record<string, unknown>
    >;
    const products = graph.filter((n) => n["@type"] === "Product");
    // Exactly ONE Product per plan, keyed on the SAME @id the ItemList references.
    expect(products).toHaveLength(2);
    const productIds = products.map((p) => p["@id"]);
    expect(productIds).toContain(`${SITE_URL}/compare/cellular#plan-cel_a`);
    const listEls = itemListSchema(plans).itemListElement as Array<
      Record<string, unknown>
    >;
    for (const el of listEls) {
      const refId = (el.item as Record<string, unknown>)["@id"];
      expect(productIds).toContain(refId);
    }
    // Each Product is a telecom service and its offer carries a monthly PriceSpecification.
    for (const prod of products) {
      expect(prod.additionalType).toBe(
        "https://schema.org/TelecomunicationsService",
      );
      const specs = (prod.offers as Record<string, unknown>)
        .priceSpecification as Array<Record<string, unknown>>;
      expect(specs[0]["@type"]).toBe("UnitPriceSpecification");
      expect(specs[0].priceCurrency).toBe("ILS");
    }
  });
});

describe("articleSchema — guide Article, real dates + brand authorship", () => {
  it("builds an Article with self-canonical mainEntityOfPage + brand author", () => {
    const schema = articleSchema({
      headline: "המדריך המלא למעבר ספק תקשורת",
      description: "כל מה שצריך לדעת לפני שמחליפים ספק.",
      url: "/guides/guide-switching",
      datePublished: "2026-06-01",
      section: "מדריך כללי",
    });
    expect(schema).toMatchObject({
      "@type": "Article",
      headline: "המדריך המלא למעבר ספק תקשורת",
      inLanguage: "he-IL",
      datePublished: "2026-06-01",
      articleSection: "מדריך כללי",
    });
    // mainEntityOfPage is the absolute canonical url of the article.
    expect(schema.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${SITE_URL}/guides/guide-switching`,
    });
    // author === publisher === the brand Organization (no third party credited).
    const author = schema.author as Record<string, unknown>;
    const publisher = schema.publisher as Record<string, unknown>;
    expect(author["@type"]).toBe("Organization");
    expect(author).toEqual(publisher);
    expect(author.url).toBe(SITE_URL);
  });

  it("defaults dateModified to datePublished (honest freshness, never future)", () => {
    const schema = articleSchema({
      headline: "x",
      description: "y",
      url: "/guides/x",
      datePublished: "2026-06-03",
    });
    expect(schema.dateModified).toBe("2026-06-03");
  });

  it("forwards an explicit dateModified when given", () => {
    const schema = articleSchema({
      headline: "x",
      description: "y",
      url: "/guides/x",
      datePublished: "2026-06-03",
      dateModified: "2026-06-20",
    });
    expect(schema.dateModified).toBe("2026-06-20");
  });

  it("omits articleSection when no section is supplied", () => {
    const schema = articleSchema({
      headline: "x",
      description: "y",
      url: "/guides/x",
      datePublished: "2026-06-03",
    });
    expect(schema.articleSection).toBeUndefined();
  });
});

describe("howToSchema — emitted only for real step-by-step guides", () => {
  it("returns null when there are no steps (non-procedural guide)", () => {
    expect(howToSchema({ name: "x", steps: [] })).toBeNull();
  });

  it("builds a positioned HowTo from real ordered steps", () => {
    const schema = howToSchema({
      name: "איך מתקינים eSIM",
      description: "מדריך התקנה.",
      url: "/guides/guide-esim",
      steps: [
        { name: "בחרו חבילה", text: "בחרו חבילת eSIM לפי היעד." },
        { name: "התקינו מראש", text: "סרקו את הקוד עוד בבית." },
      ],
    });
    expect(schema).not.toBeNull();
    expect(schema!["@type"]).toBe("HowTo");
    expect(schema!.url).toBe(`${SITE_URL}/guides/guide-esim`);
    const steps = schema!.step as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      "@type": "HowToStep",
      position: 1,
      name: "בחרו חבילה",
    });
    expect(steps[1].position).toBe(2);
  });

  it("drops malformed steps and returns null when none remain", () => {
    const schema = howToSchema({
      name: "x",
      // @ts-expect-error — deliberately malformed step to prove it is filtered.
      steps: [{ name: "only name, no text" }],
    });
    expect(schema).toBeNull();
  });
});

describe("pageAggregateOfferSchema — one offer across the page's real plans", () => {
  it("sets lowPrice/highPrice/offerCount from real prices in ILS", () => {
    const plans = [
      plan({ id: "a", price: 70 }),
      plan({ id: "b", price: 29 }),
      plan({ id: "c", price: 49 }),
    ];
    const schema = pageAggregateOfferSchema(plans);
    expect(schema).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "ILS",
      lowPrice: 29,
      highPrice: 70,
      offerCount: 3,
    });
  });

  it("skips unpriced rows and returns null when none are priced", () => {
    const schema = pageAggregateOfferSchema([
      plan({ id: "a", price: 0 }),
      plan({ id: "b", price: 25 }),
    ]);
    expect(schema).toMatchObject({ lowPrice: 25, highPrice: 25, offerCount: 1 });
    expect(pageAggregateOfferSchema([])).toBeNull();
    expect(pageAggregateOfferSchema([plan({ price: 0 })])).toBeNull();
  });
});

describe("speakableSchema — voice (pillar 7)", () => {
  it("builds a SpeakableSpecification from non-empty selectors", () => {
    const schema = speakableSchema(["#aeo-answer [data-direct-answer]", "h1"]);
    expect(schema).toMatchObject({
      "@type": "WebPage",
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: ["#aeo-answer [data-direct-answer]", "h1"],
      },
    });
  });

  it("filters blanks and returns null when no usable selector remains", () => {
    expect(speakableSchema([])).toBeNull();
    expect(speakableSchema(["", "   "])).toBeNull();
  });
});
