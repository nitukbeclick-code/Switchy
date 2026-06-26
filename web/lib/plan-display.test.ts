import { describe, it, expect } from "vitest";
import type { Plan } from "./types";
import {
  afterPriceLabel,
  fee,
  spec,
  perks,
  fineLines,
  priceText,
  planFieldsForCategory,
  planRows,
  planDisplay,
} from "./plan-display";

// ────────────────────────────────────────────────────────────────────────────
// lib/plan-display — the category-aware display layer behind the comparison
// views. These tests pin the same semantics as the static site's
// `comparisonTable` helpers (afterCell / fee / spec / info) and the truth-only
// contract: a field is shown ONLY when it really exists on the plan.
// ────────────────────────────────────────────────────────────────────────────

/** Minimal Plan factory — only the load-bearing fields, overridable. */
function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "test_plan",
    cat: "cellular",
    provider: "סלקום",
    plan: "Test Plan",
    price: 70,
    after: null,
    is5G: false,
    noCommit: false,
    hasAbroad: false,
    ...overrides,
  } as Plan;
}

describe("priceText", () => {
  it("prefers the exact advertised price when it isn't whole", () => {
    expect(priceText(makePlan({ price: 70, priceExact: 69.9 }))).toBe("69.90");
  });
  it("renders a whole exact price without decimals", () => {
    expect(priceText(makePlan({ price: 70, priceExact: 70 }))).toBe("70");
  });
  it("falls back to the rounded int when no exact price", () => {
    expect(priceText(makePlan({ price: 89, priceExact: null }))).toBe("89");
  });
});

describe("afterPriceLabel", () => {
  it("marks a real post-promo JUMP with the after price + unit", () => {
    const p = makePlan({ cat: "internet", price: 109, after: 196 });
    const label = afterPriceLabel(p);
    expect(label.kind).toBe("jump");
    expect(label.amount).toBe(196);
    expect(label.text).toBe("₪196/ח׳"); // internet → monthly suffix
  });

  it("prefers afterExact over after for the jump amount", () => {
    const p = makePlan({ cat: "internet", price: 100, after: 160, afterExact: 160.5 });
    const label = afterPriceLabel(p);
    expect(label.kind).toBe("jump");
    expect(label.amount).toBe(160.5);
    expect(label.text).toBe("₪160.50/ח׳");
  });

  it('marks "מחיר קבוע" when there is NO after price', () => {
    const label = afterPriceLabel(makePlan({ price: 70, after: null }));
    expect(label.kind).toBe("fixed");
    expect(label.amount).toBeNull();
    expect(label.text).toBe("מחיר קבוע");
  });

  it('marks "מחיר קבוע" when after does NOT exceed the price (no jump)', () => {
    // after <= price → not a jump → honest "fixed", never a bare dash.
    const label = afterPriceLabel(makePlan({ price: 70, after: 70 }));
    expect(label.kind).toBe("fixed");
    expect(label.text).toBe("מחיר קבוע");
  });

  it("uses the per-package suffix for abroad jumps", () => {
    const p = makePlan({ cat: "abroad", price: 30, after: 50, priceUnit: "package" });
    expect(afterPriceLabel(p).text).toBe("₪50/חבילה");
  });
});

describe("fee / spec null-safety", () => {
  it("fee returns the value for the primary key", () => {
    const p = makePlan({ fees: { נתב: "+₪19.9/ח׳" } });
    expect(fee(p, "נתב")).toBe("+₪19.9/ח׳");
  });
  it("fee falls back to an alt key", () => {
    const p = makePlan({ fees: { ראוטר: "₪10" } });
    expect(fee(p, "נתב", "ראוטר")).toBe("₪10");
  });
  it("fee returns null when the key is absent", () => {
    expect(fee(makePlan({ fees: {} }), "נתב")).toBeNull();
  });
  it("fee returns null when fees is missing entirely", () => {
    expect(fee(makePlan(), "נתב")).toBeNull();
  });
  it("spec returns the value for the primary key", () => {
    const p = makePlan({ specs: { נתונים: "1500GB" } });
    expect(spec(p, "נתונים", "נפח")).toBe("1500GB");
  });
  it("spec returns null when specs is missing", () => {
    expect(spec(makePlan(), "מהירות")).toBeNull();
  });
  it("ignores empty-string values (truth-only)", () => {
    const p = makePlan({ fees: { נתב: "   " }, specs: { נתונים: "" } });
    expect(fee(p, "נתב")).toBeNull();
    expect(spec(p, "נתונים")).toBeNull();
  });
});

describe("perks filtering", () => {
  it("drops raw GB/min/SMS/5G spec tokens, keeps real perks", () => {
    const p = makePlan({
      feats: ["5G", "1500GB גלישה", "נתיב מהיר", "גלישה חופשית באפליקציות", "500 דק׳"],
    });
    expect(perks(p)).toEqual(["נתיב מהיר", "גלישה חופשית באפליקציות"]);
  });

  it("drops speed-token feats (Mb / מגה)", () => {
    const p = makePlan({
      cat: "internet",
      feats: ["סיב אופטי", "עד 300/100Mb", "נתב כלול לחודשיים"],
    });
    expect(perks(p)).toEqual(["סיב אופטי", "נתב כלול לחודשיים"]);
  });

  it("falls back to fineLines when no feats survive filtering", () => {
    const p = makePlan({
      feats: ["5G", "1500GB"],
      fineLines: ["חריגה 49 אג׳/דק׳"],
    });
    expect(perks(p)).toEqual(["חריגה 49 אג׳/דק׳"]);
  });

  it("falls back to notes when neither feats nor fineLines exist", () => {
    const p = makePlan({ notes: "הערה חשובה" });
    expect(perks(p)).toEqual(["הערה חשובה"]);
  });

  it("returns an empty array when nothing qualitative exists", () => {
    expect(perks(makePlan())).toEqual([]);
  });

  it("de-duplicates repeated perks", () => {
    const p = makePlan({ feats: ["נתיב מהיר", "נתיב מהיר", "HBO Max"] });
    expect(perks(p)).toEqual(["נתיב מהיר", "HBO Max"]);
  });
});

describe("fineLines", () => {
  it("returns all fine-lines, de-duplicated", () => {
    const p = makePlan({ fineLines: ["a", "b", "a"] });
    expect(fineLines(p)).toEqual(["a", "b"]);
  });
  it("returns empty when none", () => {
    expect(fineLines(makePlan())).toEqual([]);
  });
});

describe("planFieldsForCategory", () => {
  it("cellular: דמי חיבור, נפח, דקות/SMS, חו״ל — only present fields", () => {
    const p = makePlan({
      cat: "cellular",
      hasAbroad: true,
      fees: { "דמי חיבור": "אין" },
      specs: { נתונים: "1500GB", דקות: "500 דק׳", SMS: "5,000", "חו״ל": "50GB" },
    });
    expect(planFieldsForCategory(p)).toEqual([
      { label: "דמי חיבור", value: "אין" },
      { label: "נפח", value: "1500GB" },
      { label: "דקות/SMS", value: "500 דק׳ · 5,000 SMS" },
      { label: "חו״ל", value: "50GB" },
    ]);
  });

  it("cellular: omits חו״ל when hasAbroad is false", () => {
    const p = makePlan({ cat: "cellular", hasAbroad: false, specs: { נתונים: "100GB" } });
    const labels = planFieldsForCategory(p).map((f) => f.label);
    expect(labels).toEqual(["נפח"]);
  });

  it("cellular: shows a ✓ for abroad when bundled but no explicit spec", () => {
    const p = makePlan({ cat: "cellular", hasAbroad: true });
    expect(planFieldsForCategory(p)).toEqual([{ label: "חו״ל", value: "✓" }]);
  });

  it("internet: מהירות, נתב, מגדיל טווח, התקנה", () => {
    const p = makePlan({
      cat: "internet",
      specs: { מהירות: "עד 300/100" },
      fees: { נתב: "+₪19.9/ח׳", התקנה: "חינם", "מגדיל טווח": "₪99" },
    });
    expect(planFieldsForCategory(p)).toEqual([
      { label: "מהירות", value: "עד 300/100" },
      { label: "נתב", value: "+₪19.9/ח׳" },
      { label: "מגדיל טווח", value: "₪99" },
      { label: "התקנה", value: "חינם" },
    ]);
  });

  it("tv: ממיר, נתב, התקנה — omits absent fields", () => {
    const p = makePlan({ cat: "tv", fees: {} });
    expect(planFieldsForCategory(p)).toEqual([]);
  });

  it("triple: ממיר, נתב, התקנה", () => {
    const p = makePlan({
      cat: "triple",
      fees: { התקנה: "חינם בדירה / בית פרטי ₪499", נתב: "נתב+מגדיל WiFi7 כלול" },
    });
    expect(planFieldsForCategory(p)).toEqual([
      { label: "נתב", value: "נתב+מגדיל WiFi7 כלול" },
      { label: "התקנה", value: "חינם בדירה / בית פרטי ₪499" },
    ]);
  });

  it("abroad: נפח, תוקף", () => {
    const p = makePlan({
      cat: "abroad",
      specs: { נתונים: "10GB", תוקף: "30 ימים" },
    });
    expect(planFieldsForCategory(p)).toEqual([
      { label: "נפח", value: "10GB" },
      { label: "תוקף", value: "30 ימים" },
    ]);
  });

  it("planRows is an alias of planFieldsForCategory", () => {
    const p = makePlan({ specs: { נתונים: "100GB" } });
    expect(planRows(p)).toEqual(planFieldsForCategory(p));
  });
});

describe("planDisplay", () => {
  it("assembles the full bundle from a rich cellular plan", () => {
    const p = makePlan({
      cat: "cellular",
      price: 70,
      priceExact: 69.9,
      after: null,
      feats: ["5G", "1500GB גלישה", "נתיב מהיר"],
      specs: { נתונים: "1500GB", דקות: "500 דק׳", SMS: "5,000" },
      fees: { "דמי חיבור": "אין" },
      fineLines: ["מחיר רשמי: ₪69.9", "נתיב מהיר", "חריגה 49 אג׳/דק׳"],
    });
    const d = planDisplay(p);
    expect(d.price).toBe("69.90");
    expect(d.priceUnit).toBe("/ח׳");
    expect(d.after).toEqual({ kind: "fixed", text: "מחיר קבוע", amount: null });
    expect(d.perks).toEqual(["נתיב מהיר"]);
    expect(d.fields.map((f) => f.label)).toEqual(["דמי חיבור", "נפח", "דקות/SMS"]);
    expect(d.fineLines).toContain("חריגה 49 אג׳/דק׳");
  });
});
