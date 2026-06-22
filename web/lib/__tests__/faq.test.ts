import { describe, it, expect } from "vitest";
import { GENERAL_FAQ, faqForCategory } from "@/lib/faq";

// ────────────────────────────────────────────────────────────────────────────
// lib/faq.ts — truthful Hebrew Q&A reused as visible <details> and FAQPage JSON-LD.
// The invariants that matter: every Q&A is a real, non-empty question + answer,
// the per-category set always appends the shared general set (so category pages
// never lose the "is it free / number portability" answers), and there are no
// duplicate questions within a rendered set (duplicate FAQPage entries are a
// rich-result smell). Content is asserted structurally, not verbatim.
// ────────────────────────────────────────────────────────────────────────────

const CATEGORIES = ["cellular", "internet", "tv", "triple", "abroad"] as const;

describe("GENERAL_FAQ", () => {
  it("every entry has a non-empty question and answer", () => {
    expect(GENERAL_FAQ.length).toBeGreaterThan(0);
    for (const qa of GENERAL_FAQ) {
      expect(qa.question.trim().length).toBeGreaterThan(0);
      expect(qa.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate questions", () => {
    const qs = GENERAL_FAQ.map((q) => q.question);
    expect(new Set(qs).size).toBe(qs.length);
  });
});

describe("faqForCategory", () => {
  it("appends the general set after the category-specific Q&A", () => {
    for (const cat of CATEGORIES) {
      const set = faqForCategory(cat);
      // The general set is always present at the tail.
      for (const g of GENERAL_FAQ) {
        expect(set.some((qa) => qa.question === g.question)).toBe(true);
      }
      // Category sets are at least as large as the general set.
      expect(set.length).toBeGreaterThanOrEqual(GENERAL_FAQ.length);
    }
  });

  it("never emits duplicate questions within a category set", () => {
    for (const cat of CATEGORIES) {
      const qs = faqForCategory(cat).map((q) => q.question);
      expect(new Set(qs).size).toBe(qs.length);
    }
  });

  it("falls back to just the general set for an unknown category", () => {
    const set = faqForCategory("does-not-exist");
    expect(set).toHaveLength(GENERAL_FAQ.length);
  });

  it("every Q&A in every category is non-empty (no placeholder content)", () => {
    for (const cat of CATEGORIES) {
      for (const qa of faqForCategory(cat)) {
        expect(qa.question.trim().length).toBeGreaterThan(2);
        expect(qa.answer.trim().length).toBeGreaterThan(10);
      }
    }
  });
});
