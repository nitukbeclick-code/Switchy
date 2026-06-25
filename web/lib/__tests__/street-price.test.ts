import { describe, it, expect } from "vitest";
import {
  STREET_PRICE_CATEGORIES,
  STREET_PRICE_MIN_REPORTS,
  STREET_PRICE_DISCLAIMER,
  isStreetPriceCategory,
  normalizeAggregate,
  validateSubmission,
  parsePrice,
  normalizeProvider,
  reportsNeeded,
  belowThresholdNote,
  ils,
} from "@/lib/street-price";

// ────────────────────────────────────────────────────────────────────────────
// web/lib/street-price.ts — the WEB-side street-price helpers. These pin the
// honesty rules: the publish threshold matches the DB/Edge constant; an aggregate
// row below threshold (or with null prices) normalises to published:false with
// zeroed figures; the submit guard rejects junk + never fabricates a
// provider/category; and the provenance label is the exact mandated copy.
// ────────────────────────────────────────────────────────────────────────────

describe("constants + guards", () => {
  it("the publish threshold matches the DB/Edge STREET_PRICE_MIN_REPORTS (5)", () => {
    // Pinned: keep == get_street_price() v_min_reports + the Edge fn constant.
    expect(STREET_PRICE_MIN_REPORTS).toBe(5);
  });

  it("the provenance disclaimer is the exact mandated copy", () => {
    expect(STREET_PRICE_DISCLAIMER).toBe("מבוסס דיווחי משתמשים, לא מחירון רשמי");
  });

  it("isStreetPriceCategory accepts catalogue categories, rejects others", () => {
    for (const c of STREET_PRICE_CATEGORIES) {
      expect(isStreetPriceCategory(c)).toBe(true);
    }
    expect(isStreetPriceCategory("electricity")).toBe(false);
    expect(isStreetPriceCategory("")).toBe(false);
    expect(isStreetPriceCategory(7)).toBe(false);
    expect(isStreetPriceCategory(null)).toBe(false);
  });
});

describe("parsePrice + normalizeProvider", () => {
  it("parses numbers and numeric strings (stripping ₪/spaces)", () => {
    expect(parsePrice(89)).toBe(89);
    expect(parsePrice("89")).toBe(89);
    expect(parsePrice("₪89")).toBe(89);
    expect(parsePrice("89.6")).toBe(90);
    expect(parsePrice(" 120 ")).toBe(120);
  });
  it("rejects non-positive / non-numeric", () => {
    expect(parsePrice(0)).toBeUndefined();
    expect(parsePrice(-5)).toBeUndefined();
    expect(parsePrice("abc")).toBeUndefined();
    expect(parsePrice("")).toBeUndefined();
    expect(parsePrice(null)).toBeUndefined();
  });
  it("normalizeProvider trims + collapses inner whitespace + clips", () => {
    expect(normalizeProvider("  סלקום  ")).toBe("סלקום");
    expect(normalizeProvider("גולן   טלקום")).toBe("גולן טלקום");
    expect(normalizeProvider(123)).toBe("");
    expect(normalizeProvider("x".repeat(200)).length).toBe(120);
  });
});

describe("normalizeAggregate — threshold gate + null handling", () => {
  it("publishes a real row that clears the threshold", () => {
    const agg = normalizeAggregate("cellular", {
      category: "cellular",
      report_count: 12,
      median_price: 49,
      avg_price: 53,
      min_price: 30,
      max_price: 99,
    });
    expect(agg.published).toBe(true);
    expect(agg.count).toBe(12);
    expect(agg.median).toBe(49);
    expect(agg.avg).toBe(53);
    expect(agg.min).toBe(30);
    expect(agg.max).toBe(99);
    expect(agg.categoryHe).toBe("סלולר");
    expect(agg.threshold).toBe(STREET_PRICE_MIN_REPORTS);
  });

  it("does NOT publish when count is below the threshold", () => {
    const agg = normalizeAggregate("internet", {
      category: "internet",
      report_count: 3,
      // RPC nulls prices below threshold → median normalises to 0.
      median_price: null,
      avg_price: null,
      min_price: null,
      max_price: null,
    });
    expect(agg.published).toBe(false);
    expect(agg.count).toBe(3);
    expect(agg.median).toBe(0);
    expect(agg.min).toBe(0);
    expect(agg.max).toBe(0);
  });

  it("does NOT publish when count clears the gate but the RPC gave no median", () => {
    // Defensive: a count over threshold but null prices must still NOT publish a
    // misleading zero band.
    const agg = normalizeAggregate("tv", {
      category: "tv",
      report_count: 9,
      median_price: null,
    });
    expect(agg.published).toBe(false);
    expect(agg.count).toBe(9);
  });

  it("normalises null/garbage rows to an unpublished empty aggregate", () => {
    for (const row of [null, undefined, 5, "x", {}]) {
      const agg = normalizeAggregate("abroad", row);
      expect(agg.published).toBe(false);
      expect(agg.count).toBe(0);
      expect(agg.median).toBe(0);
    }
  });

  it("accepts the camelCase shape (for hand-built test rows)", () => {
    const agg = normalizeAggregate("triple", {
      count: 6,
      median: 180,
      avg: 190,
      min: 120,
      max: 260,
    });
    expect(agg.published).toBe(true);
    expect(agg.median).toBe(180);
  });
});

describe("validateSubmission — client-side guard", () => {
  it("accepts a clean report", () => {
    const v = validateSubmission({
      category: "cellular",
      provider: "  סלקום ",
      reported_price: "₪49",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.submission.category).toBe("cellular");
      expect(v.submission.provider).toBe("סלקום");
      expect(v.submission.reported_price).toBe(49);
    }
  });

  it("rejects an unknown category (never guesses)", () => {
    const v = validateSubmission({
      category: "electricity",
      provider: "סלקום",
      reported_price: 49,
    });
    expect(v.ok).toBe(false);
  });

  it("rejects a missing provider", () => {
    const v = validateSubmission({
      category: "cellular",
      provider: "   ",
      reported_price: 49,
    });
    expect(v.ok).toBe(false);
  });

  it("rejects a missing / out-of-band price", () => {
    expect(
      validateSubmission({ category: "cellular", provider: "סלקום", reported_price: "x" }).ok,
    ).toBe(false);
    expect(
      validateSubmission({ category: "cellular", provider: "סלקום", reported_price: 0 }).ok,
    ).toBe(false);
    expect(
      validateSubmission({
        category: "cellular",
        provider: "סלקום",
        reported_price: 999999,
      }).ok,
    ).toBe(false);
  });

  it("carries an optional plan_id when given, omits it otherwise", () => {
    const withPlan = validateSubmission({
      category: "cellular",
      provider: "סלקום",
      reported_price: 49,
      plan_id: "cel_cellcom_x",
    });
    expect(withPlan.ok && withPlan.submission.plan_id).toBe("cel_cellcom_x");
    const without = validateSubmission({
      category: "cellular",
      provider: "סלקום",
      reported_price: 49,
    });
    expect(without.ok && "plan_id" in without.submission).toBe(false);
  });
});

describe("copy helpers", () => {
  it("reportsNeeded counts down to zero, never negative", () => {
    expect(reportsNeeded(0)).toBe(STREET_PRICE_MIN_REPORTS);
    expect(reportsNeeded(2)).toBe(STREET_PRICE_MIN_REPORTS - 2);
    expect(reportsNeeded(STREET_PRICE_MIN_REPORTS)).toBe(0);
    expect(reportsNeeded(999)).toBe(0);
    expect(reportsNeeded(Number.NaN)).toBe(STREET_PRICE_MIN_REPORTS);
  });

  it("belowThresholdNote reflects the real count + need", () => {
    const none = normalizeAggregate("cellular", { category: "cellular", report_count: 0 });
    expect(belowThresholdNote(none)).toContain("היו הראשונים");
    const some = normalizeAggregate("cellular", { category: "cellular", report_count: 2 });
    const note = belowThresholdNote(some);
    expect(note).toContain("2");
    expect(note).toContain("עוד");
  });

  it("ils formats a grouped shekel string", () => {
    expect(ils(89)).toBe("₪89");
    expect(ils(1234)).toContain("₪");
  });
});
