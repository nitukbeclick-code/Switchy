// Unit tests for the shared catalogue grounding (_shared/catalogue.ts) — the
// pure functions that ground the WhatsApp bot in REAL catalogue rows. Run from
// supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  annualSaving,
  buildCatalogueContext,
  buildSuggestions,
  catalogueProviders,
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
