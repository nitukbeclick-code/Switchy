import { describe, it, expect } from "vitest";
import {
  pageMetadata,
  categoryMetaDescription,
  homeMetaDescription,
} from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/schema";
import type { Plan } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// lib/seo.ts — per-page Metadata builder. Invariants: canonical mirrors the path,
// og:url is the ABSOLUTE canonical, og/twitter title is brand-normalised exactly
// once, and the page title/description pass through verbatim (honest — no claims
// are added). The image is intentionally left to Next's file-based convention.
// ────────────────────────────────────────────────────────────────────────────

describe("pageMetadata", () => {
  it("sets canonical to the relative path and og:url to the absolute URL", () => {
    const m = pageMetadata({
      title: "השוואת סלולר",
      description: "תיאור",
      path: "/compare/cellular",
    });
    expect(m.alternates?.canonical).toBe("/compare/cellular");
    expect(m.openGraph && "url" in m.openGraph ? m.openGraph.url : undefined).toBe(
      `${SITE_URL}/compare/cellular`,
    );
  });

  it("passes the bare title/description through verbatim", () => {
    const m = pageMetadata({
      title: "מילון מונחים",
      description: "מילון תקשורת",
      path: "/glossary",
    });
    expect(m.title).toBe("מילון מונחים");
    expect(m.description).toBe("מילון תקשורת");
  });

  it("brand-normalises the OG/Twitter title exactly once", () => {
    const m = pageMetadata({
      title: "השוואת סלולר",
      description: "תיאור",
      path: "/compare/cellular",
    });
    const expected = `השוואת סלולר | ${SITE_NAME}`;
    const ogTitle =
      m.openGraph && "title" in m.openGraph ? m.openGraph.title : undefined;
    const twTitle =
      m.twitter && "title" in m.twitter ? m.twitter.title : undefined;
    expect(ogTitle).toBe(expected);
    expect(twTitle).toBe(expected);
  });

  it("does NOT double-brand a title that already carries the suffix", () => {
    const titled = `מצב שוק התקשורת | ${SITE_NAME}`;
    const m = pageMetadata({
      title: titled,
      description: "תיאור",
      path: "/market-pulse",
    });
    const ogTitle =
      m.openGraph && "title" in m.openGraph ? m.openGraph.title : undefined;
    // exactly one brand suffix, not two
    expect(ogTitle).toBe(titled);
    expect(String(ogTitle).match(new RegExp(`\\| ${SITE_NAME}`, "g"))?.length).toBe(1);
  });

  it("emits a summary_large_image twitter card", () => {
    const m = pageMetadata({
      title: "כותרת",
      description: "תיאור",
      path: "/providers",
    });
    expect(m.twitter && "card" in m.twitter ? m.twitter.card : undefined).toBe(
      "summary_large_image",
    );
  });

  it("re-declares the shared OG + Twitter share image (so the shallow merge keeps it)", () => {
    const m = pageMetadata({
      title: "כותרת",
      description: "תיאור",
      path: "/providers",
    });
    // og:image points at the file-convention asset (resolved absolute via metadataBase)
    const og = m.openGraph as Record<string, unknown> | undefined;
    expect(JSON.stringify(og?.images)).toContain("/opengraph-image.png");
    const tw = m.twitter as Record<string, unknown> | undefined;
    expect(JSON.stringify(tw?.images)).toContain("/twitter-image.png");
  });

  it("sets og locale + siteName for the Hebrew RTL site", () => {
    const m = pageMetadata({ title: "כ", description: "ת", path: "/" });
    const og = m.openGraph as Record<string, unknown> | undefined;
    expect(og?.locale).toBe("he_IL");
    expect(og?.siteName).toBe(SITE_NAME);
    expect(og?.type).toBe("website");
  });

  it("forwards a robots override when provided (national city pages)", () => {
    const m = pageMetadata({
      title: "כ",
      description: "ת",
      path: "/compare/cellular/tel-aviv",
      robots: { index: false, follow: true },
    });
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("omits robots entirely when not provided", () => {
    const m = pageMetadata({ title: "כ", description: "ת", path: "/" });
    expect(m.robots).toBeUndefined();
  });

  it("accepts an already-absolute path for og:url", () => {
    const m = pageMetadata({
      title: "כ",
      description: "ת",
      path: `${SITE_URL}/vs/a-vs-b`,
    });
    expect(m.openGraph && "url" in m.openGraph ? m.openGraph.url : undefined).toBe(
      `${SITE_URL}/vs/a-vs-b`,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Fact-dense, catalogue-derived meta descriptions. The load-bearing invariant is
// TRUTH-ONLY: every figure (plan count, provider count, price floor, provider
// names) is derived from the SAME plan list the page renders — never fabricated.
// Synthetic plan lists keep the assertions deterministic across catalogue churn.
// ────────────────────────────────────────────────────────────────────────────

/** Minimal valid Plan, overridable per-test. */
function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "cel_x",
    cat: "cellular",
    provider: "סלקום",
    plan: "P",
    price: 50,
    after: null,
    is5G: false,
    noCommit: true,
    hasAbroad: false,
    ...overrides,
  };
}

describe("categoryMetaDescription", () => {
  const sample: Plan[] = [
    plan({ id: "a", provider: "סלקום", price: 39 }),
    plan({ id: "b", provider: "פרטנר", price: 25 }),
    plan({ id: "c", provider: "בזק", price: 99 }),
    plan({ id: "d", provider: "פלאפון", price: 60 }),
    plan({ id: "e", provider: "סלקום", price: 70 }), // dup provider
  ];

  it("derives the REAL plan count, provider count, sample names and price floor", () => {
    const d = categoryMetaDescription("cellular", { plans: sample })!;
    expect(d).toContain("5 מסלולי סלולר"); // 5 plans
    expect(d).toContain("מ-4 ספקים"); // 4 distinct providers
    // sample = first 3 distinct providers in list order
    expect(d).toContain("(סלקום, פרטנר, בזק…)");
    // price floor = the cheapest headline price
    expect(d).toContain("החל מ-₪25 לחודש");
  });

  it("never fabricates: no number in the output is absent from the plan list", () => {
    const d = categoryMetaDescription("cellular", { plans: sample })!;
    // The only bare integers are the real counts (5, 4) and the real floor (25).
    expect(d).toMatch(/השוואת 5 מסלולי/);
    expect(d).toMatch(/₪25 /);
    expect(d).not.toContain("₪39"); // a non-floor price must NOT leak in as the floor
  });

  it("states the REAL price unit, not a misleading /חודש, for non-monthly plans", () => {
    // a ₪1/minute roaming tariff must read "₪1 לדקה", never "₪1 לחודש"
    const d = categoryMetaDescription("abroad", {
      plans: [
        plan({ cat: "abroad", provider: "019 מובייל", price: 1, priceUnit: "minute" }),
        plan({ cat: "abroad", provider: "גולן טלקום", price: 30, priceUnit: "package" }),
      ],
    })!;
    expect(d).toContain("החל מ-₪1 לדקה");
    expect(d).not.toContain("₪1 לחודש");
  });

  it("uses the Hebrew category label and stays honest copy (חינמית / ללא התחייבות)", () => {
    const d = categoryMetaDescription("tv", {
      plans: [plan({ cat: "tv", provider: "HOT", price: 49 })],
    })!;
    expect(d).toContain("מסלולי טלוויזיה");
    expect(d).toContain("ללא התחייבות");
  });

  it("omits the price clause when no plan is priced (never invents ₪)", () => {
    const d = categoryMetaDescription("cellular", {
      plans: [plan({ price: 0 }), plan({ id: "z", price: Number.NaN })],
    })!;
    expect(d).not.toContain("₪");
    expect(d).not.toContain("החל מ-");
    expect(d).toContain("2 מסלולי סלולר");
  });

  it("returns undefined for a category with no plans (caller falls back)", () => {
    expect(categoryMetaDescription("cellular", { plans: [] })).toBeUndefined();
  });

  it("omits the ellipsis when the sample covers every provider", () => {
    const d = categoryMetaDescription("internet", {
      plans: [
        plan({ cat: "internet", provider: "בזק", price: 39 }),
        plan({ cat: "internet", provider: "HOT", price: 45 }),
      ],
    })!;
    expect(d).toContain("(בזק, HOT)"); // 2 providers, 2 shown → no "…"
    expect(d).not.toContain("…");
  });

  it("works against the REAL catalogue (default plans) with extractable figures", () => {
    const d = categoryMetaDescription("cellular")!;
    expect(d).toMatch(/השוואת \d/);
    expect(d).toContain("מסלולי סלולר");
    expect(d).toContain("ספקים");
    expect(d).toContain("₪");
  });
});

describe("homeMetaDescription", () => {
  it("aggregates the WHOLE catalogue: total plans, providers, categories, ₪ floor", () => {
    const plans: Plan[] = [
      plan({ id: "1", cat: "cellular", provider: "סלקום", price: 11 }),
      plan({ id: "2", cat: "internet", provider: "בזק", price: 39 }),
      plan({ id: "3", cat: "tv", provider: "HOT", price: 49 }),
    ];
    const d = homeMetaDescription({ plans })!;
    expect(d).toContain("3 מסלולי תקשורת");
    expect(d).toContain("מ-3 ספקים בישראל");
    // categories in canonical order, only those with plans
    expect(d).toContain("סלולר, אינטרנט, טלוויזיה");
    expect(d).toContain("₪11"); // global floor
  });

  it("returns undefined when there are no plans at all", () => {
    expect(homeMetaDescription({ plans: [] })).toBeUndefined();
  });

  it("works against the REAL catalogue with extractable figures", () => {
    const d = homeMetaDescription()!;
    expect(d).toMatch(/השוואת \d/);
    expect(d).toContain("מסלולי תקשורת");
    expect(d).toContain("ספקים בישראל");
    expect(d).toContain("₪");
  });
});
