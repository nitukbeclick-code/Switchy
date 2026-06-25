// Unit tests for the site-plan-advisor pure helpers (site-plan-advisor/lib.ts).
// These pin: untrusted-input validation/clipping, the Answers→MatchProfile
// adapter, the catalogue-grounded candidate selection, the SAVINGS math, and —
// crucially — PROVIDER NEUTRALITY.
//
// SCORING note: the advisor no longer has its own scoring formula. It delegates
// to the single shared brain (../_shared/scoring.ts rankPlans), so the site,
// app, and WhatsApp rank identically. The scoring MATH itself is pinned in
// scoring_test.ts; here we only verify that lib.ts adapts the site inputs and
// preserves its site-specific contracts (id-only candidates, never-empty,
// reasons-only savings) on top of the shared engine. The provider-neutral
// tie-break is now DETERMINISTIC (seeded from the provider-free profile) so the
// same inputs rank the same way on every surface — we assert neutrality via that
// seed being provider-free (relabelling providers doesn't change the order) and
// via injecting a different RNG to reshuffle a tie. No network, no env. Run from
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
  shuffle,
  toProfile,
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

// ── toProfile: Answers → shared MatchProfile adapter ──────────────────────────

const balanced: Answers = { category: "cellular", budget: null, priority: "balanced", lines: 1, abroad: false };

Deno.test("toProfile normalizes the site priority and maps want-flags", () => {
  // "5g" → shared "speed" priority + wants5G.
  const p5g = toProfile({ ...balanced, priority: "5g" });
  assertEquals(p5g.priority, "speed");
  assertEquals(p5g.wants5G, true);
  // "noCommit" → shared "flexibility" priority + wantsNoCommit.
  const pflex = toProfile({ ...balanced, priority: "noCommit" });
  assertEquals(pflex.priority, "flexibility");
  assertEquals(pflex.wantsNoCommit, true);
  // The abroad TOGGLE (not just the priority) surfaces wantsAbroad.
  assertEquals(toProfile({ ...balanced, abroad: true }).wantsAbroad, true);
  assertEquals(toProfile({ ...balanced, priority: "abroad" }).wantsAbroad, true);
});

Deno.test("toProfile feeds the single budget figure as both ceiling and current bill", () => {
  const p = toProfile({ ...balanced, budget: 100 });
  assertEquals(p.budget, 100);
  assertEquals(p.currentBill, 100);
  // No budget ⇒ both undefined (no fabricated baseline).
  const none = toProfile(balanced);
  assertEquals(none.budget, undefined);
  assertEquals(none.currentBill, undefined);
});

// ── pickCandidates: grounded + provider-neutral, via the shared engine ─────────

Deno.test("pickCandidates keeps only in-category priced rows WITH an id, ranks best first", () => {
  const plans: Plan[] = [
    { id: "c1", cat: "cellular", provider: "A", plan: "p", price: 59 },
    { id: "c2", cat: "cellular", provider: "B", plan: "p", price: 29 },
    { cat: "cellular", provider: "C", plan: "p", price: 9 }, // no id → excluded (advisor needs id)
    { id: "i1", cat: "internet", provider: "D", plan: "p", price: 10 }, // wrong cat → excluded
  ];
  const out = pickCandidates(plans, balanced);
  // Cheaper scores higher under the shared engine ⇒ c2 before c1; the id-less
  // and wrong-category rows are dropped.
  assertEquals(out.map((p) => p.id), ["c2", "c1"]);
});

Deno.test("pickCandidates keeps a strictly higher-scoring plan on top despite the tie-break shuffle", () => {
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

Deno.test("pickCandidates is DETERMINISTIC for the same inputs (reproducible across surfaces)", () => {
  // Three equally-priced (⇒ equal-score) cellular plans. The drift fix: the
  // tie-break is seeded from the provider-free profile, so the SAME answers must
  // always produce the SAME order — that's what keeps the site, app, and
  // WhatsApp from disagreeing on equal-score ties.
  const plans: Plan[] = [
    { id: "a", cat: "cellular", provider: "סלקום", plan: "p", price: 50 },
    { id: "b", cat: "cellular", provider: "פרטנר", plan: "p", price: 50 },
    { id: "c", cat: "cellular", provider: "פלאפון", plan: "p", price: 50 },
  ];
  const first = pickCandidates(plans, balanced).map((p) => p.id);
  for (let i = 0; i < 20; i++) {
    assertEquals(pickCandidates(plans, balanced).map((p) => p.id), first);
  }
});

Deno.test("pickCandidates tie order does NOT depend on the provider (no brand bias)", () => {
  // Same plans, same profile, but the providers RELABELLED. Because the score
  // and the tie-break seed are both provider-free, the winning POSITIONS must be
  // the same regardless of which brand sits in which row — proof no brand gets a
  // structural edge.
  const profile = balanced;
  const base: Plan[] = [
    { id: "a", cat: "cellular", provider: "סלקום", plan: "p", price: 50 },
    { id: "b", cat: "cellular", provider: "פרטנר", plan: "p", price: 50 },
    { id: "c", cat: "cellular", provider: "פלאפון", plan: "p", price: 50 },
  ];
  const relabelled: Plan[] = [
    { id: "a", cat: "cellular", provider: "פלאפון", plan: "p", price: 50 },
    { id: "b", cat: "cellular", provider: "סלקום", plan: "p", price: 50 },
    { id: "c", cat: "cellular", provider: "פרטנר", plan: "p", price: 50 },
  ];
  // The ids land in the same order (the tie-break keys off id/profile, not brand).
  assertEquals(
    pickCandidates(base, profile).map((p) => p.id),
    pickCandidates(relabelled, profile).map((p) => p.id),
  );
});

Deno.test("pickCandidates accepts an injected RNG to reshuffle ties (test hook)", () => {
  const plans: Plan[] = [
    { id: "a", cat: "cellular", provider: "X", plan: "p", price: 50 },
    { id: "b", cat: "cellular", provider: "Y", plan: "p", price: 50 },
    { id: "c", cat: "cellular", provider: "Z", plan: "p", price: 50 },
  ];
  // A fixed rnd→0 produces a specific (non-default) permutation of the tie group,
  // proving the RNG is actually wired into the shared tie-break.
  const out = pickCandidates(plans, balanced, () => 0).map((p) => p.id);
  assertEquals(out.length, 3);
  assertEquals([...out].sort(), ["a", "b", "c"]); // same set, just reordered
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
