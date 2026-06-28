import { describe, it, expect } from "vitest";
import {
  buildCategoryRelatedGroups,
  buildPlanRelatedGroups,
  relatedNavLinks,
} from "@/lib/related-links";
import {
  getPlans,
  getProviders,
  getServices,
  CATEGORY_HE,
} from "@/lib/data";
import { getVsPairs } from "@/lib/vs";
import { getGuides } from "@/lib/guides";

// ────────────────────────────────────────────────────────────────────────────
// lib/related-links.ts — the shared, catalogue-derived hub-spoke link builders.
// The invariants that matter for GEO/AEO + E-E-A-T: every emitted href is a REAL
// on-site route (a provider/vs/guide/compare page that actually exists), no group
// links to itself, the flattened NavLinks mirror the rendered links 1:1, and every
// link carries a non-empty truthful label. Nothing is fabricated.
// ────────────────────────────────────────────────────────────────────────────

const CATEGORIES = ["cellular", "internet", "tv", "triple", "abroad"] as const;

// The universe of REAL routes the builders may legitimately point at.
const realProviderHrefs = new Set(
  getProviders().map((p) => `/providers/${p.slug}`),
);
const realVsHrefs = new Set(getVsPairs().map((p) => `/vs/${p.slug}`));
const realGuideHrefs = new Set(getGuides().map((g) => `/guides/${g.slug}`));
const realCompareHrefs = new Set(
  getServices().map((s) => `/compare/${s.slug}`),
);

/** Every href a builder may emit must resolve to a known real route. */
function assertRealHref(href: string) {
  const isCategoryCompare =
    /^\/compare\/(cellular|internet|tv|triple|abroad)$/.test(href);
  const ok =
    realProviderHrefs.has(href) ||
    realVsHrefs.has(href) ||
    realGuideHrefs.has(href) ||
    realCompareHrefs.has(href) ||
    isCategoryCompare;
  expect(ok, `href is a real on-site route: ${href}`).toBe(true);
}

describe("buildCategoryRelatedGroups", () => {
  for (const cat of CATEGORIES) {
    describe(`category=${cat}`, () => {
      const groups = buildCategoryRelatedGroups(cat);

      it("emits at least one non-empty group with real links", () => {
        const nonEmpty = groups.filter((g) => g.links.length > 0);
        expect(nonEmpty.length).toBeGreaterThan(0);
      });

      it("every link is a real on-site route with a truthful label", () => {
        for (const g of groups) {
          expect(g.title.trim().length).toBeGreaterThan(0);
          for (const l of g.links) {
            expect(l.label.trim().length).toBeGreaterThan(0);
            assertRealHref(l.href);
          }
        }
      });

      it("the sibling-compares group never links back to this category", () => {
        for (const g of groups) {
          for (const l of g.links) {
            expect(l.href).not.toBe(`/compare/${cat}`);
          }
        }
      });

      it("only surfaces providers that actually serve the category", () => {
        const catProviderSlugs = new Set(
          getProviders()
            .filter((p) => p.categories.includes(cat))
            .map((p) => p.slug),
        );
        for (const g of groups) {
          for (const l of g.links) {
            const m = l.href.match(/^\/providers\/(.+)$/);
            if (m) expect(catProviderSlugs.has(m[1])).toBe(true);
          }
        }
      });

      it("only surfaces /vs pairs that are in this category", () => {
        const catVsSlugs = new Set(
          getVsPairs()
            .filter((p) => p.category === cat)
            .map((p) => p.slug),
        );
        for (const g of groups) {
          for (const l of g.links) {
            const m = l.href.match(/^\/vs\/(.+)$/);
            if (m) expect(catVsSlugs.has(m[1])).toBe(true);
          }
        }
      });
    });
  }
});

describe("buildPlanRelatedGroups", () => {
  it("for every catalogue plan, all links are real routes with labels", () => {
    for (const plan of getPlans()) {
      const groups = buildPlanRelatedGroups(plan);
      for (const g of groups) {
        for (const l of g.links) {
          expect(l.label.trim().length).toBeGreaterThan(0);
          assertRealHref(l.href);
        }
      }
    }
  });

  it("leads with the plan's own provider page and the category compare hub", () => {
    const plan = getPlans()[0];
    const provider = getProviders().find((p) => p.name === plan.provider);
    expect(provider).toBeDefined();
    const groups = buildPlanRelatedGroups(plan);
    const hrefs = groups.flatMap((g) => g.links.map((l) => l.href));
    expect(hrefs).toContain(`/providers/${provider!.slug}`);
    expect(hrefs).toContain(`/compare/${plan.cat}`);
  });

  it("never links a plan back to its own provider in the 'other providers' group", () => {
    for (const plan of getPlans().slice(0, 25)) {
      const provider = getProviders().find((p) => p.name === plan.provider);
      const groups = buildPlanRelatedGroups(plan);
      // The "ספקי <cat>" group excludes the plan's own provider.
      const otherProvGroup = groups.find((g) => g.title.startsWith("ספקי"));
      if (otherProvGroup && provider) {
        for (const l of otherProvGroup.links) {
          expect(l.href).not.toBe(`/providers/${provider.slug}`);
        }
      }
    }
  });

  it("head-to-head links always name the plan's own provider", () => {
    for (const plan of getPlans()) {
      const groups = buildPlanRelatedGroups(plan);
      const vsGroup = groups.find((g) => g.title === "השוואות ראש בראש");
      if (!vsGroup) continue;
      for (const l of vsGroup.links) {
        expect(l.label).toContain(plan.provider);
      }
    }
  });
});

describe("relatedNavLinks", () => {
  it("mirrors the rendered links 1:1 (name/url/description)", () => {
    const groups = buildCategoryRelatedGroups("cellular");
    const flat = groups.flatMap((g) => g.links);
    const nav = relatedNavLinks(groups);
    expect(nav.length).toBe(flat.length);
    for (let i = 0; i < flat.length; i++) {
      expect(nav[i].url).toBe(flat[i].href);
      expect(nav[i].name).toBe(flat[i].label);
      expect(nav[i].description).toBe(flat[i].hint);
    }
  });
});

describe("CATEGORY_HE coverage", () => {
  it("every tested category has a Hebrew label (used in group titles)", () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_HE[cat]).toBeTruthy();
    }
  });
});
