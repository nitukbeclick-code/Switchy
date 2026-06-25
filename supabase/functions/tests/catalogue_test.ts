// Unit tests for the shared catalogue grounding (_shared/catalogue.ts) — the
// pure functions that ground the WhatsApp bot in REAL catalogue rows. Run from
// supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  annualSaving,
  buildCatalogueContext,
  buildCitedCatalogueContext,
  buildSuggestions,
  catalogueProviders,
  DEFAULT_CITED_TOP_K,
  normalizeCategory,
  normalizeProvider,
  type Plan,
  plansFromRows,
} from "../_shared/catalogue.ts";

// A small, hand-rolled catalogue spanning the categories + edge fields the
// grounding functions care about (kind!=regular, abroad, no-commit, 5G).
const PLANS: Plan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "סלקום 100GB", price: 39, is5G: true, kind: "regular", specs: { data: "100GB" } },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "פרטנר Unlimited", price: 59, noCommit: true, kind: "regular", specs: { data: "ללא הגבלה" } },
  { id: "c3", cat: "cellular", provider: "רמי לוי", plan: "כשר בלבד", price: 19, kind: "kosher", specs: { data: "5GB" } },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, kind: "regular", specs: { speed: "1000Mb" } },
  { id: "t1", cat: "tv", provider: "yes", plan: "yes TV", price: 120, kind: "regular", specs: { channels: "120 ערוצים" } },
  { id: "a1", cat: "abroad", provider: "019 מובייל", plan: "חבילת חו\"ל", price: 49, hasAbroad: true, priceUnit: "package", kind: "regular", specs: { data: "10GB" } },
];

// ── plansFromRows: maps the live public.plans table shape into Plan ──────────

Deno.test("plansFromRows maps DB columns (category→cat, title→plan) and keeps real rows", () => {
  const rows = [
    { id: "x1", category: "cellular", provider: "סלקום", title: "סלקום 5G 100GB", subtitle: "ללא התחייבות", price: 39, specs: { "נתונים": "100GB" } },
  ];
  const out = plansFromRows(rows);
  assertEquals(out.length, 1);
  const p = out[0];
  assertEquals(p.cat, "cellular");
  assertEquals(p.plan, "סלקום 5G 100GB");
  assertEquals(p.price, 39);
  assertEquals(p.kind, "regular"); // defaulted when the column is absent
  // 5G + no-commit flags are derived heuristically from the title/subtitle blob.
  assert(p.is5G);
  assert(p.noCommit);
  // The original Hebrew spec key is preserved and the normalized slot is added.
  assertEquals(p.specs?.["נתונים"], "100GB");
  assertEquals(p.specs?.data, "100GB");
});

Deno.test("plansFromRows drops rows without a category or a numeric price", () => {
  const rows = [
    { id: "ok", category: "internet", title: "סיב", price: 99 },
    { id: "no-cat", title: "מסלול ללא קטגוריה", price: 50 },
    { id: "no-price", category: "cellular", title: "ללא מחיר" },
    { id: "nan-price", category: "tv", title: "מחיר טקסט", price: "free" },
  ];
  const out = plansFromRows(rows);
  assertEquals(out.map((p) => p.id), ["ok"]);
});

Deno.test("plansFromRows derives a post-promo 'after' price from free text", () => {
  const rows = [
    { id: "promo", category: "internet", provider: "בזק", title: "סיב 1000", subtitle: "אחרי שנה ₪149", price: 99 },
    { id: "flat", category: "internet", provider: "בזק", title: "סיב יציב", subtitle: "מחיר קבוע", price: 99 },
  ];
  const out = plansFromRows(rows);
  const promo = out.find((p) => p.id === "promo")!;
  const flat = out.find((p) => p.id === "flat")!;
  assertEquals(promo.after, 149); // step-up above the promo price
  assertEquals(flat.after, null); // no after-price language → null
});

// ── catalogueProviders ───────────────────────────────────────────────────────

Deno.test("catalogueProviders returns the distinct provider set", () => {
  const providers = catalogueProviders(PLANS);
  assertEquals(new Set(providers), new Set(["סלקום", "פרטנר", "רמי לוי", "בזק", "yes", "019 מובייל"]));
  // duplicates collapse
  assertEquals(catalogueProviders([...PLANS, PLANS[0]]).filter((p) => p === "סלקום").length, 1);
});

// ── buildCatalogueContext: the grounded, pipe-delimited rows ──────────────────

Deno.test("buildCatalogueContext lists regular plans grouped by category, cheapest first", () => {
  const ctx = buildCatalogueContext(PLANS);
  const lines = ctx.split("\n");
  // Every line is one grounded row "cat | provider | plan | ₪price unit …".
  assertStringIncludes(ctx, "cellular | סלקום | סלקום 100GB | ₪39 לחודש");
  assertStringIncludes(ctx, "internet | בזק | סיב 1000 | ₪99 לחודש");
  // Abroad rows carry the per-package unit, never the default monthly suffix.
  assertStringIncludes(ctx, 'abroad | 019 מובייל | חבילת חו"ל | ₪49 לחבילה');
  // The cheaper cellular plan (₪39) precedes the pricier (₪59) within its group.
  const cheapIdx = lines.findIndex((l) => l.includes("סלקום 100GB"));
  const dearIdx = lines.findIndex((l) => l.includes("פרטנר Unlimited"));
  assert(cheapIdx >= 0 && dearIdx >= 0 && cheapIdx < dearIdx);
});

Deno.test("buildCatalogueContext excludes non-regular (kosher/data-only) plans", () => {
  const ctx = buildCatalogueContext(PLANS);
  assertFalse(ctx.includes("כשר בלבד")); // kind: "kosher" is filtered out
});

Deno.test("buildCatalogueContext surfaces the 5G / no-commit / abroad flags", () => {
  const ctx = buildCatalogueContext(PLANS);
  const lines = ctx.split("\n");
  assertStringIncludes(lines.find((l) => l.includes("סלקום 100GB"))!, "5G");
  assertStringIncludes(lines.find((l) => l.includes("פרטנר Unlimited"))!, "ללא התחייבות");
  assertStringIncludes(lines.find((l) => l.includes("חבילת חו\"ל"))!, 'כולל חו"ל');
});

// ── annualSaving ─────────────────────────────────────────────────────────────

Deno.test("annualSaving is (spend-price)*12, clamped at 0, and guards bad input", () => {
  assertEquals(annualSaving(100, 60), 480); // (100-60)*12
  assertEquals(annualSaving(60, 100), 0); // a pricier plan never shows a negative saving
  assertEquals(annualSaving(0, 60), 0); // unknown spend → 0
  assertEquals(annualSaving(-10, 60), 0);
});

// ── buildSuggestions: cheaper same-category regular plans ─────────────────────

Deno.test("buildSuggestions returns cheaper same-category regular plans, sorted by price", () => {
  const sugg = buildSuggestions(PLANS, "cellular", 80);
  // Only the two regular cellular plans under ₪80 (kosher excluded), cheapest first.
  assertEquals(sugg.map((s) => s.provider), ["סלקום", "פרטנר"]);
  assertEquals(sugg[0].price, 39);
  assertEquals(sugg[0].annualSaving, annualSaving(80, 39));
});

Deno.test("buildSuggestions caps at max and skips plans at/above the current spend", () => {
  // current spend ₪50 → only the ₪39 plan qualifies (₪59 is above it).
  const sugg = buildSuggestions(PLANS, "cellular", 50);
  assertEquals(sugg.length, 1);
  assertEquals(sugg[0].price, 39);
  // max clamps the result length.
  assertEquals(buildSuggestions(PLANS, "cellular", 200, 1).length, 1);
});

Deno.test("buildSuggestions returns nothing without a category or a positive spend", () => {
  assertEquals(buildSuggestions(PLANS, "", 100), []);
  assertEquals(buildSuggestions(PLANS, "cellular", 0), []);
});

// ── normalizeProvider ────────────────────────────────────────────────────────

Deno.test("normalizeProvider resolves aliases and prefers the more-specific match", () => {
  const providers = catalogueProviders(PLANS);
  assertEquals(normalizeProvider("cellcom", providers), "סלקום");
  assertEquals(normalizeProvider("Partner", providers), "פרטנר");
  // "הוט מובייל" must win over the looser "הוט"/HOT alias.
  assertEquals(normalizeProvider("הוט מובייל", providers), "הוט מובייל");
  assertEquals(normalizeProvider("הוט", providers), "HOT");
  assertEquals(normalizeProvider("", providers), "");
  assertEquals(normalizeProvider("ספק לא קיים", providers), "");
});

// The consolidated alias table is the SUPERSET of both surfaces (the WhatsApp
// bot + the bill-photo flow). These 7 providers used to live only in
// site-bill-analyzer; pin that the LIVE bot now recognizes them too (B4 drift).
// Pass an empty catalogue-provider list so resolution comes purely from the
// shared alias table, not from a catalogue exact/substring match.
Deno.test("normalizeProvider recognizes the 7 consolidated providers (B4 superset)", () => {
  const none: string[] = [];
  assertEquals(normalizeProvider("Airalo", none), "Airalo eSIM");
  assertEquals(normalizeProvider("airalo esim", none), "Airalo eSIM");
  assertEquals(normalizeProvider("CCC", none), "CCC");
  assertEquals(normalizeProvider("NextTV", none), "NextTV");
  assertEquals(normalizeProvider("next tv", none), "NextTV");
  assertEquals(normalizeProvider("STING TV", none), "STING TV");
  assertEquals(normalizeProvider("WeCom", none), "WeCom");
  assertEquals(normalizeProvider("Xphone", none), "Xphone");
  assertEquals(normalizeProvider("אקספון", none), "Xphone");
  assertEquals(normalizeProvider("גילת", none), "גילת");
  assertEquals(normalizeProvider("Gilat", none), "גילת");
});

// All 11 original aliases still resolve after the merge (no regression).
Deno.test("normalizeProvider keeps the original 12 canonical providers resolving", () => {
  const none: string[] = [];
  assertEquals(normalizeProvider("cellcom", none), "סלקום");
  assertEquals(normalizeProvider("orange", none), "פרטנר");
  assertEquals(normalizeProvider("pelephone", none), "פלאפון");
  assertEquals(normalizeProvider("hot mobile", none), "הוט מובייל");
  assertEquals(normalizeProvider("hot", none), "HOT");
  assertEquals(normalizeProvider("bezeq", none), "בזק");
  assertEquals(normalizeProvider("יס", none), "yes");
  assertEquals(normalizeProvider("golan", none), "גולן טלקום");
  assertEquals(normalizeProvider("019", none), "019 מובייל");
  assertEquals(normalizeProvider("rami levy", none), "רמי לוי");
  assertEquals(normalizeProvider("walla", none), "וואלה מובייל");
});

// ── normalizeCategory ────────────────────────────────────────────────────────

Deno.test("normalizeCategory maps Hebrew + English synonyms to canonical ids", () => {
  assertEquals(normalizeCategory("cellular"), "cellular"); // already canonical
  assertEquals(normalizeCategory("סלולר"), "cellular");
  assertEquals(normalizeCategory("נייד"), "cellular");
  assertEquals(normalizeCategory("אינטרנט"), "internet");
  assertEquals(normalizeCategory("סיב"), "internet");
  assertEquals(normalizeCategory("טלוויזיה"), "tv");
  assertEquals(normalizeCategory("טריפל"), "triple");
  assertEquals(normalizeCategory('חו"ל'), "abroad");
  assertEquals(normalizeCategory("roaming"), "abroad");
  assertEquals(normalizeCategory("בלי קשר לכלום"), ""); // no match → empty
});

// B8: abroad is tested BEFORE internet so a phrase carrying BOTH cues — the bare
// internet word גלישה ("browsing") and the abroad word חו"ל — classifies as the
// more specific abroad intent, not internet. A bare גלישה with no abroad cue
// still falls through to internet.
Deno.test("normalizeCategory: 'גלישה בחו\"ל' is abroad, not internet (B8 ordering)", () => {
  assertEquals(normalizeCategory('גלישה בחו"ל'), "abroad");
  assertEquals(normalizeCategory("גלישה בחול"), "abroad");
  assertEquals(normalizeCategory("חבילת גלישה לחו\"ל"), "abroad");
  assertEquals(normalizeCategory("esim לגלישה בטיול"), "abroad");
  // bare browsing, no abroad cue → still internet
  assertEquals(normalizeCategory("גלישה"), "internet");
  assertEquals(normalizeCategory("גלישה מהירה בבית"), "internet");
});

// ── buildCitedCatalogueContext: top-K cap + memoization (A3) ──────────────────
// A larger catalogue than PLANS so the global topK cap actually bites: cellular
// alone has more rows than several small topK values, letting us assert both the
// size bound AND that the cheapest/most-relevant rows survive.

// Build N priced regular plans in a category, priced p, p+1, … (cheapest first).
function makeCat(cat: string, provider: string, n: number, base: number): Plan[] {
  const out: Plan[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${cat}-${i}`,
      cat,
      provider,
      plan: `${provider} ${cat} ${i}`,
      price: base + i,
      kind: "regular",
    });
  }
  return out;
}

// 20 cellular + 10 internet + 4 tv = 34 regular rows across 3 categories.
const BIG: Plan[] = [
  ...makeCat("cellular", "סלקום", 20, 30),
  ...makeCat("internet", "בזק", 10, 80),
  ...makeCat("tv", "yes", 4, 110),
];

// Count of [Sn] markers in a built context (one per emitted row).
function markerCount(ctx: string): number {
  return ctx ? ctx.split("\n").filter((l) => /^\[S\d+\] /.test(l)).length : 0;
}

Deno.test("buildCitedCatalogueContext caps the total row count at topK", () => {
  const ctx = buildCitedCatalogueContext(BIG, { topK: 12, perCat: 14 });
  assertEquals(markerCount(ctx), 12);
});

Deno.test("buildCitedCatalogueContext defaults to DEFAULT_CITED_TOP_K and never exceeds it", () => {
  assertEquals(DEFAULT_CITED_TOP_K, 50);
  // With the default perCat (14), 2 cats → 28 candidate rows, comfortably under
  // the 50 cap, so all 28 emit.
  const moderate: Plan[] = [
    ...makeCat("cellular", "סלקום", 40, 30),
    ...makeCat("internet", "בזק", 40, 80),
  ];
  assertEquals(markerCount(buildCitedCatalogueContext(moderate)), 28);
  // Now make the candidate set exceed 50 (raise perCat so each big category
  // contributes >25): the default topK=50 must clamp the total to exactly 50.
  const huge = buildCitedCatalogueContext(moderate, { perCat: 100 });
  assert(markerCount(huge) <= DEFAULT_CITED_TOP_K);
  assertEquals(markerCount(huge), 50);
});

Deno.test("buildCitedCatalogueContext [Sn] markers are contiguous 1..N over survivors only", () => {
  // The grounding invariant: numbering is assigned AFTER the cap, so the model
  // can only ever cite a row that is actually present — no [Sn] beyond N.
  const ctx = buildCitedCatalogueContext(BIG, { topK: 9 });
  const nums = ctx.split("\n").map((l) => {
    const m = l.match(/^\[S(\d+)\] /);
    return m ? Number(m[1]) : null;
  }).filter((x): x is number => x !== null);
  assertEquals(nums, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // No marker is referenced past the last emitted row.
  assertFalse(ctx.includes("[S10]"));
});

Deno.test("buildCitedCatalogueContext cap keeps the cheapest rows and every category", () => {
  // topK 6 across 3 categories: round-robin keeps the cheapest of each category
  // before deepening any single one, so all 3 categories survive and the very
  // cheapest plan of each is present.
  const ctx = buildCitedCatalogueContext(BIG, { topK: 6 });
  assertStringIncludes(ctx, "₪30"); // cheapest cellular
  assertStringIncludes(ctx, "₪80"); // cheapest internet
  assertStringIncludes(ctx, "₪110"); // cheapest tv (category not starved)
  // The priciest cellular tail (₪49) is dropped by the cap.
  assertFalse(ctx.includes("₪49"));
});

Deno.test("buildCitedCatalogueContext under the cap is grouped by category, cheapest-first", () => {
  // When topK is large enough to keep everything, the output is the legacy
  // category-grouped, price-sorted block (round-robin + re-sort restores it).
  // Raise perCat too so the per-category bound doesn't trim cellular (20 rows):
  // 20 + 10 + 4 = 34 rows survive both caps.
  const ctx = buildCitedCatalogueContext(BIG, { topK: 1000, perCat: 100 });
  assertEquals(markerCount(ctx), 34);
  const lines = ctx.split("\n");
  // All cellular rows precede all internet rows precede all tv rows.
  const firstInternet = lines.findIndex((l) => l.includes("internet") || l.includes("אינטרנט"));
  const firstTv = lines.findIndex((l) => l.includes(" tv ") || l.includes("טלוויזיה"));
  const lastCellular = lines.map((l) => l.includes("סלקום")).lastIndexOf(true);
  assert(lastCellular < firstInternet);
  assert(firstInternet < firstTv);
  // S1 is the cheapest cellular row (₪30).
  assertStringIncludes(lines[0], "[S1]");
  assertStringIncludes(lines[0], "₪30");
});

Deno.test("buildCitedCatalogueContext legacy call shape is unchanged (positional perCat)", () => {
  // The pre-A3 signature buildCitedCatalogueContext(plans, perCat:number) still
  // works and, under the default cap, yields the legacy grouped block.
  const small: Plan[] = [
    { cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 39, is5G: true, kind: "regular" },
    { cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, kind: "regular", specs: { speed: "1000Mb" } },
  ];
  const positional = buildCitedCatalogueContext(small, 14);
  const optionsForm = buildCitedCatalogueContext(small, { perCat: 14 });
  assertEquals(positional, optionsForm);
  assertStringIncludes(positional, "[S1]");
  assertStringIncludes(positional, "₪39");
  assertStringIncludes(positional, "1000Mb");
});

Deno.test("buildCitedCatalogueContext memoizes by (locale, plan-count) + array identity", () => {
  // Same array reference + same params → the exact cached string instance.
  const a = buildCitedCatalogueContext(BIG, { topK: 8 });
  const b = buildCitedCatalogueContext(BIG, { topK: 8 });
  assertEquals(a, b);
  // A different topK is a distinct memo key → recomputed, different row count.
  const c = buildCitedCatalogueContext(BIG, { topK: 5 });
  assertEquals(markerCount(c), 5);
  assertEquals(markerCount(a), 8);
  // A different locale tag is a distinct memo key but the same Hebrew copy today.
  const heCtx = buildCitedCatalogueContext(BIG, { topK: 8, locale: "he" });
  const enCtx = buildCitedCatalogueContext(BIG, { topK: 8, locale: "en" });
  assertEquals(heCtx, enCtx);
});

Deno.test("buildCitedCatalogueContext recomputes for a different catalogue array", () => {
  // A new array with a different plan-count must not serve a stale cache entry.
  const first = buildCitedCatalogueContext(BIG, { topK: 1000 });
  const fewer = BIG.slice(0, 5); // distinct length AND distinct reference
  const second = buildCitedCatalogueContext(fewer, { topK: 1000 });
  assert(markerCount(second) <= 5);
  assert(markerCount(first) > markerCount(second));
  // A same-length but DIFFERENT array reference also recomputes (identity gate),
  // not a stale hit keyed only on the count.
  const sameLenDifferent = makeCat("internet", "פרטנר", BIG.length, 200);
  const third = buildCitedCatalogueContext(sameLenDifferent, { topK: 1000 });
  assertStringIncludes(third, "פרטנר");
  assertFalse(third.includes("סלקום"));
});

Deno.test("buildCitedCatalogueContext is empty for an empty catalogue (cap path)", () => {
  assertEquals(buildCitedCatalogueContext([], { topK: 50 }), "");
  assertEquals(markerCount(buildCitedCatalogueContext([])), 0);
});
