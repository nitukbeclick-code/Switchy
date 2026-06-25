// Unit tests for _shared/scoring.ts — the ONE provider-neutral ranking brain
// that reconciles the site advisor (lib.ts) and the Flutter recommendation
// engine. These pin the merged formula's guarantees:
//   • PROVIDER NEUTRALITY — scorePlan ignores the provider; rankPlans breaks
//     ties without brand bias.
//   • DETERMINISM — the seeded tie-break makes the same profile rank the same
//     way across surfaces (the cross-surface anti-drift guarantee).
//   • HONEST RATINGS — placeholder ratings (reviews==0) are neutral, never a
//     fabricated edge.
//   • HONEST SAVINGS — annualSaving only against a real bill, monthly plans only.
// No network, no env. Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import {
  annualSaving,
  bestMatch,
  type MatchProfile,
  priorityFromId,
  rankPlans,
  type ScorablePlan,
  scorePlan,
} from "../_shared/scoring.ts";

const balanced: MatchProfile = { category: "cellular", priority: "balanced" };

// ── provider neutrality ───────────────────────────────────────────────────────

Deno.test("scorePlan is identical for two plans differing ONLY by provider", () => {
  const a: ScorablePlan = { id: "a", cat: "cellular", provider: "סלקום", plan: "X", price: 49 };
  const b: ScorablePlan = { id: "b", cat: "cellular", provider: "פרטנר", plan: "X", price: 49 };
  assertEquals(scorePlan(a, balanced).score, scorePlan(b, balanced).score);
});

Deno.test("rankPlans tie-break never gives a brand a structural edge (all can win)", () => {
  // Three equally-priced, identical-feature cellular plans from three providers
  // ⇒ equal score. Across MANY distinct profiles (distinct seeds), each provider
  // should be able to land first — no provider is structurally favoured.
  const plans: ScorablePlan[] = [
    { id: "a", cat: "cellular", provider: "סלקום", plan: "p", price: 50 },
    { id: "b", cat: "cellular", provider: "פרטנר", plan: "p", price: 50 },
    { id: "c", cat: "cellular", provider: "פלאפון", plan: "p", price: 50 },
  ];
  const firsts = new Set<string>();
  for (let lines = 1; lines <= 60; lines++) {
    const profile: MatchProfile = { category: "cellular", priority: "balanced", lines };
    firsts.add(rankPlans(plans, profile)[0].plan.provider!);
  }
  assertEquals(firsts.size, 3, "all three providers must be able to win a tie");
});

Deno.test("rankPlans tie-break is DETERMINISTIC for the same profile (anti-drift)", () => {
  const plans: ScorablePlan[] = [
    { id: "a", cat: "cellular", provider: "סלקום", plan: "p", price: 50 },
    { id: "b", cat: "cellular", provider: "פרטנר", plan: "p", price: 50 },
    { id: "c", cat: "cellular", provider: "פלאפון", plan: "p", price: 50 },
  ];
  const profile: MatchProfile = { category: "cellular", priority: "price", budget: 60 };
  const order1 = rankPlans(plans, profile).map((m) => m.plan.id);
  const order2 = rankPlans(plans, profile).map((m) => m.plan.id);
  // Same inputs ⇒ same order, every time and on every surface.
  assertEquals(order1, order2);
});

Deno.test("rankPlans keeps a strictly higher-scoring plan on top despite the shuffle", () => {
  const plans: ScorablePlan[] = [
    { id: "cheap", cat: "cellular", provider: "A", plan: "p", price: 19 },
    { id: "mid", cat: "cellular", provider: "B", plan: "p", price: 50 },
    { id: "dear", cat: "cellular", provider: "C", plan: "p", price: 99 },
  ];
  for (let i = 1; i <= 30; i++) {
    const profile: MatchProfile = { category: "cellular", priority: "price", lines: i };
    assertEquals(rankPlans(plans, profile)[0].plan.id, "cheap");
  }
});

// ── filtering + scope ─────────────────────────────────────────────────────────

Deno.test("rankPlans keeps only in-category priced rows", () => {
  const plans: ScorablePlan[] = [
    { id: "c1", cat: "cellular", provider: "A", plan: "p", price: 59 },
    { id: "c2", cat: "cellular", provider: "B", plan: "p", price: 29 },
    { id: "noprice", cat: "cellular", provider: "C", plan: "p" }, // no price → excluded
    { id: "i1", cat: "internet", provider: "D", plan: "p", price: 10 }, // wrong cat → excluded
  ];
  const out = rankPlans(plans, balanced).map((m) => m.plan.id);
  assertEquals(out.sort(), ["c1", "c2"]);
});

Deno.test("rankPlans respects the limit", () => {
  const plans: ScorablePlan[] = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    cat: "cellular",
    provider: "X",
    plan: "p",
    price: 20 + i,
  }));
  assertEquals(rankPlans(plans, balanced, { limit: 3 }).length, 3);
});

// ── priority tilts the score the right way ─────────────────────────────────────

Deno.test("scorePlan rewards the asked-for feature (5G under a speed priority)", () => {
  const ans: MatchProfile = { category: "cellular", priority: "speed", wants5G: true };
  const with5g: ScorablePlan = { id: "a", cat: "cellular", provider: "X", plan: "p", price: 50, is5G: true };
  const no5g: ScorablePlan = { id: "b", cat: "cellular", provider: "Y", plan: "p", price: 50, is5G: false };
  assert(scorePlan(with5g, ans).score > scorePlan(no5g, ans).score);
});

Deno.test("scorePlan rewards no-commit under a flexibility priority", () => {
  const ans: MatchProfile = { category: "cellular", priority: "flexibility", wantsNoCommit: true };
  const flex: ScorablePlan = { id: "a", cat: "cellular", provider: "X", plan: "p", price: 50, noCommit: true };
  const fixed: ScorablePlan = { id: "b", cat: "cellular", provider: "Y", plan: "p", price: 50, noCommit: false };
  assert(scorePlan(flex, ans).score > scorePlan(fixed, ans).score);
});

Deno.test("budget overrun is penalised", () => {
  const profile: MatchProfile = { category: "cellular", priority: "balanced", budget: 50 };
  const under: ScorablePlan = { id: "u", cat: "cellular", provider: "X", plan: "p", price: 40 };
  const over: ScorablePlan = { id: "o", cat: "cellular", provider: "Y", plan: "p", price: 90 };
  const u = scorePlan(under, profile);
  const o = scorePlan(over, profile);
  assert(u.score > o.score);
  assert(o.caveats.some((c) => c.includes("מעל התקציב")));
  assert(u.reasons.some((r) => r.includes("בתוך התקציב")));
});

// ── honest ratings ──────────────────────────────────────────────────────────

Deno.test("a placeholder rating (reviews==0) gives no edge over an unrated plan", () => {
  // Same price/features; one has rating:5 but reviews:0 (placeholder) — must NOT
  // outscore an equivalent plan, and must never produce a 'מדורג' reason.
  const placeholder: ScorablePlan = { id: "a", cat: "cellular", provider: "X", plan: "p", price: 50, rating: 5, reviews: 0 };
  const plain: ScorablePlan = { id: "b", cat: "cellular", provider: "Y", plan: "p", price: 50 };
  const a = scorePlan(placeholder, balanced);
  assertEquals(a.score, scorePlan(plain, balanced).score);
  assert(!a.reasons.some((r) => r.includes("מדורג")), "no fabricated social proof");
});

Deno.test("a REAL rating (reviews>0) does move the score under a service priority", () => {
  const ans: MatchProfile = { category: "cellular", priority: "service" };
  const highRated: ScorablePlan = { id: "a", cat: "cellular", provider: "X", plan: "p", price: 50, rating: 4.8, reviews: 120 };
  const lowRated: ScorablePlan = { id: "b", cat: "cellular", provider: "Y", plan: "p", price: 50, rating: 2.0, reviews: 120 };
  assert(scorePlan(highRated, ans).score > scorePlan(lowRated, ans).score);
});

// ── honest savings ──────────────────────────────────────────────────────────

Deno.test("annualSaving = (bill - price) * 12 for a cheaper monthly plan", () => {
  const p: ScorablePlan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 40 };
  assertEquals(annualSaving(p, 90), (90 - 40) * 12); // 600
});

Deno.test("annualSaving is 0 without a current bill (no baseline ⇒ no number)", () => {
  const p: ScorablePlan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 40 };
  assertEquals(annualSaving(p, 0), 0);
});

Deno.test("annualSaving is 0 when the plan isn't cheaper than the bill", () => {
  const p: ScorablePlan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 120 };
  assertEquals(annualSaving(p, 90), 0);
});

Deno.test("annualSaving is 0 for a non-monthly plan (can't compare to a monthly bill)", () => {
  const p: ScorablePlan = { id: "a", cat: "abroad", provider: "A", plan: "p", price: 30, priceUnit: "day" };
  assertEquals(annualSaving(p, 90), 0);
});

Deno.test("scorePlan only surfaces a saving reason when a real bill backed it", () => {
  const p: ScorablePlan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 40 };
  const withBill = scorePlan(p, { category: "cellular", currentBill: 90 });
  assert(withBill.reasons.some((r) => r.includes("חוסך ₪600")));
  const noBill = scorePlan(p, { category: "cellular" });
  assert(!noBill.reasons.some((r) => r.includes("חוסך")), "no saving claim without a baseline");
});

// ── promo step-up caveat (kamaze-parity "price after the year") ───────────────

Deno.test("a post-promo step-up surfaces a caveat", () => {
  const p: ScorablePlan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 29, after: 89 };
  const m = scorePlan(p, balanced);
  assert(m.caveats.some((c) => c.includes("עולה ל-₪89")));
});

// ── score bounds + label ───────────────────────────────────────────────────────

Deno.test("score is always clamped to 0..100 and scorePct matches", () => {
  const p: ScorablePlan = { id: "a", cat: "cellular", provider: "A", plan: "p", price: 5, is5G: true, noCommit: true };
  const m = scorePlan(p, { category: "cellular", wants5G: true, wantsNoCommit: true, currentBill: 200, budget: 100 });
  assert(m.score >= 0 && m.score <= 100);
  assertEquals(m.scorePct, Math.round(m.score));
  assert(m.label.length > 0);
});

// ── bestMatch + priorityFromId ─────────────────────────────────────────────────

Deno.test("bestMatch returns the top-ranked plan, or null for an empty category", () => {
  const plans: ScorablePlan[] = [
    { id: "cheap", cat: "cellular", provider: "A", plan: "p", price: 19 },
    { id: "dear", cat: "cellular", provider: "B", plan: "p", price: 99 },
  ];
  assertEquals(bestMatch(plans, { category: "cellular", priority: "price" })!.plan.id, "cheap");
  assertEquals(bestMatch(plans, { category: "tv" }), null);
});

Deno.test("priorityFromId folds every surface's id into one MatchPriority", () => {
  assertEquals(priorityFromId("5g"), "speed");
  assertEquals(priorityFromId("nocommit"), "flexibility");
  assertEquals(priorityFromId("rating"), "service");
  assertEquals(priorityFromId("data"), "price");
  assertEquals(priorityFromId("abroad"), "balanced");
  assertEquals(priorityFromId(undefined), "balanced");
});
