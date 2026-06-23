import { describe, it, expect } from "vitest";
import {
  getGuides,
  getGuide,
  guideCategories,
  guidesInCategory,
  relatedGuides,
  guideCompareSlug,
  guideInternalLinks,
} from "@/lib/guides";

// ─────────────────────────────────────────────────────────────────────────────
// lib/guides.ts — the /guides content layer. The load-bearing invariants are:
//   • the embedded data is REAL & well-formed (every guide has slug/h1/desc/tldr/
//     sections/faq; slugs unique; dates ISO),
//   • accessors are pure & total (getGuide unknown → undefined; related never
//     includes self; internal links are real on-site routes),
//   • category → compare-slug mapping only emits the five real compare pages.
// These guard against catalogue/regen churn silently breaking the hub.
// ─────────────────────────────────────────────────────────────────────────────

describe("getGuides — real, well-formed corpus", () => {
  const guides = getGuides();

  it("returns a non-empty corpus", () => {
    expect(guides.length).toBeGreaterThan(0);
  });

  it("every guide carries the required fields", () => {
    for (const g of guides) {
      expect(typeof g.slug).toBe("string");
      expect(g.slug.length).toBeGreaterThan(0);
      expect(g.h1.length).toBeGreaterThan(0);
      expect(g.desc.length).toBeGreaterThan(0);
      expect(g.tldr.length).toBeGreaterThan(0);
      expect(Array.isArray(g.sections)).toBe(true);
      expect(g.sections.length).toBeGreaterThan(0);
      expect(Array.isArray(g.faq)).toBe(true);
      // ISO yyyy-mm-dd publish date (real — never fabricated/future-formatted).
      expect(g.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof g.read).toBe("number");
      expect(g.read).toBeGreaterThan(0);
    }
  });

  it("slugs are unique", () => {
    const slugs = guides.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every section has a heading and at least one of p/ul", () => {
    for (const g of guides) {
      for (const s of g.sections) {
        expect(s.h2.length).toBeGreaterThan(0);
        const hasBody =
          (Array.isArray(s.p) && s.p.length > 0) ||
          (Array.isArray(s.ul) && s.ul.length > 0);
        expect(hasBody).toBe(true);
      }
    }
  });

  it("returns a copy (mutating the result doesn't corrupt the source)", () => {
    const a = getGuides();
    a.pop();
    expect(getGuides().length).toBe(guides.length);
  });
});

describe("getGuide — lookup by slug", () => {
  it("finds a known guide", () => {
    const first = getGuides()[0];
    expect(getGuide(first.slug)?.slug).toBe(first.slug);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getGuide("guide-does-not-exist-xyz")).toBeUndefined();
  });
});

describe("guideCategories — grouped counts in canonical order", () => {
  it("counts sum to the corpus size and each count is positive", () => {
    const cats = guideCategories();
    const total = cats.reduce((n, c) => n + c.count, 0);
    expect(total).toBe(getGuides().length);
    for (const c of cats) expect(c.count).toBeGreaterThan(0);
  });

  it("each category's count matches guidesInCategory", () => {
    for (const c of guideCategories()) {
      expect(guidesInCategory(c.cat).length).toBe(c.count);
    }
  });
});

describe("relatedGuides — never self, prefers same category", () => {
  it("excludes the guide itself and respects the limit", () => {
    const g = getGuides()[0];
    const rel = relatedGuides(g, 3);
    expect(rel.length).toBeLessThanOrEqual(3);
    expect(rel.some((r) => r.slug === g.slug)).toBe(false);
  });

  it("returns [] for a non-positive limit", () => {
    expect(relatedGuides(getGuides()[0], 0)).toEqual([]);
  });

  it("fills same-category siblings first when available", () => {
    // Pick a guide whose category has >=4 members so same-cat can fill the quota.
    const cats = guideCategories();
    const bigCat = cats.find((c) => c.count >= 4);
    if (!bigCat) return; // corpus too small for this assertion — skip safely
    const g = guidesInCategory(bigCat.cat)[0];
    const rel = relatedGuides(g, 3);
    expect(rel.length).toBe(3);
    expect(rel.every((r) => r.cat === g.cat)).toBe(true);
  });
});

describe("guideCompareSlug — only the five real compare categories", () => {
  it("maps the catalogue categories to their compare slug", () => {
    expect(guideCompareSlug("סלולר")).toBe("cellular");
    expect(guideCompareSlug("אינטרנט")).toBe("internet");
    expect(guideCompareSlug("טלוויזיה")).toBe("tv");
    expect(guideCompareSlug("חבילה משולבת")).toBe("triple");
    expect(guideCompareSlug("חבילות חו״ל")).toBe("abroad");
    expect(guideCompareSlug("חו״ל")).toBe("abroad");
  });

  it("returns null for the editorial general bucket", () => {
    expect(guideCompareSlug("מדריך כללי")).toBeNull();
  });
});

describe("guideInternalLinks — real on-site routes only", () => {
  it("a category guide links to its own compare page + providers", () => {
    const cellular = getGuides().find((g) => g.cat === "סלולר");
    expect(cellular).toBeDefined();
    const links = guideInternalLinks(cellular!);
    expect(links[0].href).toBe("/compare/cellular");
    expect(links.some((l) => l.href === "/providers")).toBe(true);
  });

  it("a general guide links to the broad hubs + providers", () => {
    const general = getGuides().find((g) => g.cat === "מדריך כללי");
    expect(general).toBeDefined();
    const hrefs = guideInternalLinks(general!).map((l) => l.href);
    expect(hrefs).toContain("/compare/cellular");
    expect(hrefs).toContain("/providers");
  });

  it("every internal link is an internal absolute path", () => {
    for (const g of getGuides()) {
      for (const l of guideInternalLinks(g)) {
        expect(l.href.startsWith("/")).toBe(true);
        expect(l.label.length).toBeGreaterThan(0);
      }
    }
  });
});
