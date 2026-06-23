// Unit tests for the site-plan-advisor pure ranking helpers
// (site-plan-advisor/lib.ts). These pin: input validation/clipping, the
// catalogue-grounded candidate selection, the SAVINGS math, and — crucially —
// PROVIDER NEUTRALITY (no brand gets a structural edge; score ties are broken at
// random, not by snapshot order). No network, no env. Run from
// supabase/functions/:
//   deno task test

import { assert, assertEquals } from "@std/assert";
import {
  annualSaving,
  type Answers,
  buildCatalogueContext,
  parseAnswers,
  pickCandidates,
  type Plan,
  scorePlan,
  shuffle,
} from "../site-plan-advisor/lib.ts";

// ── parseAnswers: validate/clip untrusted client input ────────────────────────

Deno.test("parseAnswers clips an out-of-range category/priority to safe defaults", () => {
  const a = parseAnswers({ category: "電気", priority: "freebies", budget: -5, lines: 999 });
  assertEquals(a.category, ""); // unknown category → ''
  assertEquals(a.priority, "balanced"); // unknown priority → balanced
  assertEquals(a.budget, null); // non-positive → null
  assertEquals(a.lines, 20); // clamped to the 1..20 range
});

Deno.test("parseAnswers accepts a valid payload and coerces abroad", () => {
  const a = parseAnswers({ category: "cellular", priority: "price", budget: "120", lines: 2, abroad: "true" });
  assertEquals(a.category, "cellular");
  assertEquals(a.priority, "price");
  assertEquals(a.budget, 120);
  assertEquals(a.lines, 2);
  assertEquals(a.abroad, true);
});

Deno.test("parseAnswers caps an absurd budget and tolerates junk", () => {
  assertEquals(parseAnswers({ budget: 999999 }).budget, 5000);
  assertEquals(parseAnswers("not an object").category, "");
  assertEquals(parseAnswers(null).lines, 1);
});

// ── scorePlan: provider-independent scoring ───────────────────────────────────

const balanced: Answers = { category: "cellular", budget: null, priority: "balanced", lines: 1, abroad: false };

Deno.test("scorePlan is identical for two plans differing ONLY by provider", () => {
  const a: Plan = { id: "a", cat: "cellular", provider: "סלקום", plan: "X", price: 49 };
  const b: Plan = { id: "b", cat: "cellular", provider: "פרטנר", plan: "X", price: 49 };
  assertEquals(scorePlan(a, balanced), scorePlan(b, balanced));
});

Deno.test("scorePlan rewards the asked-for feature (5G priority)", () => {
  const ans: Answers = { ...balanced, priority: "5g" };
  const with5g: Plan = { id: "a", cat: "cellular", provider: "X", plan: "p", price: 50, is5G: true };
  const no5g: Plan = { id: "b", cat: "cellular", provider: "Y", plan: "p", price: 50, is5G: false };
  assert(scorePlan(with5g, ans) > scorePlan(no5g, ans));
});

// ── pickCandidates: grounded + provider-neutral tie-break ──────────────────────

Deno.test("pickCandidates keeps only in-category priced rows and ranks cheapest first", () => {
  const plans: Plan[] = [
    { id: "c1", cat: "cellular", provider: "A", plan: "p", price: 59 },
    { id: "c2", cat: "cellular", provider: "B", plan: "p", price: 29 },
    { cat: "cellular", provider: "C", plan: "p", price: 9 }, // no id → excluded
    { id: "i1", cat: "internet", provider: "D", plan: "p", price: 10 }, // wrong cat → excluded
  ];
  const out = pickCandidates(plans, balanced);
  assertEquals(out.map((p) => p.id), ["c2", "c1"]);
});

Deno.test("pickCandidates breaks score TIES without provider bias (not snapshot order)", () => {
  // Three equally-priced (⇒ equal-score) cellular plans from three providers.
  const plans: Plan[] = [
    { id: "a", cat: "cellular", provider: "סלקום", plan: "p", price: 50 },
    { id: "b", cat: "cellular", provider: "פרטנר", plan: "p", price: 50 },
    { id: "c", cat: "cellular", provider: "פלאפון", plan: "p", price: 50 },
  ];
  // With a real RNG, the top pick across many runs should NOT always be the
  // snapshot-first provider — every provider should land first sometimes.
  const firsts = new Set<string>();
  for (let i = 0; i < 200; i++) {
    firsts.add(pickCandidates(plans, balanced)[0].provider!);
  }
  assertEquals(firsts.size, 3, "all three providers must be able to win a tie");
});

Deno.test("pickCandidates keeps a strictly higher-scoring plan on top despite shuffle", () => {
  const plans: Plan[] = [
    { id: "cheap", cat: "cellular", provider: "A", plan: "p", price: 19 },
    { id: "mid", cat: "cellular", provider: "B", plan: "p", price: 50 },
    { id: "dear", cat: "cellular", provider: "C", plan: "p", price: 99 },
  ];
  // Run repeatedly: the cheapest (highest score) must ALWAYS be first.
  for (let i = 0; i < 50; i++) {
    assertEquals(pickCandidates(plans, { ...balanced, priority: "price" })[0].id, "cheap");
  }
});

Deno.test("shuffle with an injected RNG is deterministic (testability hook)", () => {
  const arr = [1, 2, 3, 4, 5];
  const out = shuffle([...arr], () => 0); // rnd→0 ⇒ each j=0
  // Pinning the exact permutation guards against accidental algorithm changes.
  assertEquals(out, [2, 3, 4, 5, 1]);
});

// ── annualSaving: snapshot-derived, never fabricated ──────────────────────────

Deno.test("annualSaving is null without a budget (no baseline ⇒ no number)", () => {
  const p: Plan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 40 };
  assertEquals(annualSaving(p, balanced), null);
});

Deno.test("annualSaving = (budget - price) * 12 when the plan is cheaper", () => {
  const p: Plan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 40 };
  const ans: Answers = { ...balanced, budget: 90 };
  assertEquals(annualSaving(p, ans), (90 - 40) * 12); // 600
});

Deno.test("annualSaving is null when the plan isn't cheaper than the budget", () => {
  const p: Plan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 120 };
  assertEquals(annualSaving(p, { ...balanced, budget: 90 }), null);
});

Deno.test("annualSaving is null for a non-monthly plan (can't compare to a monthly bill)", () => {
  const p: Plan = { id: "a", cat: "abroad", provider: "A", plan: "p", price: 30, priceUnit: "day" };
  assertEquals(annualSaving(p, { ...balanced, budget: 90 }), null);
});

// ── buildCatalogueContext: real rows only, with stable ids ────────────────────

Deno.test("buildCatalogueContext emits one grounded row per plan with its id + flags", () => {
  const plans: Plan[] = [
    { id: "x1", cat: "cellular", provider: "סלקום", plan: "5G", price: 49, is5G: true },
  ];
  const ctx = buildCatalogueContext(plans);
  assert(ctx.includes("x1"));
  assert(ctx.includes("סלקום"));
  assert(ctx.includes("₪49"));
  assert(ctx.includes("5G"));
});
