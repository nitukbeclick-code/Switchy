// Tests for the Proactive Savings Watcher (savings-watch/lib.ts) — PURE selection
// logic, no env, no network. Covers, §30A-first:
//   • material-saving threshold (≥ ₪5 OR ≥ 10%);
//   • latest-price-per-plan reduction over a history slice;
//   • the price_drop signal (real recorded drop on the exact tracked plan);
//   • the better_plan signal (a catalogue plan that genuinely beats what they pay)
//     and its priority BEHIND a real drop;
//   • TRUTH-ONLY: no saving → no opportunity (the user is not contacted);
//   • dedupe key stability (a further drop / new plan is a fresh alert);
//   • channel eligibility = reachable AND not suppressed (the §30A opt-out gate);
//   • quiet-hours reuse (DST-aware Israel clock, shared with the deal feed);
//   • Hebrew copy quotes the REAL figures and never promises.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Plan } from "../_shared/catalogue.ts";
import {
  bestBeatingPlan,
  buildWatchAlert,
  eligibleChannels,
  inQuietHours,
  isMaterialSaving,
  latestPriceByPlan,
  type Opportunity,
  opportunityDedupeKey,
  opportunityForTracked,
  type PriceSnapshot,
  type TrackedPlan,
  type WatchContact,
} from "../savings-watch/lib.ts";

// ── helpers ───────────────────────────────────────────────────────────────────
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function snap(plan_id: string, price: number, captured_at: string): PriceSnapshot {
  return { plan_id, price, captured_at };
}
function tracked(over: Partial<TrackedPlan> = {}): TrackedPlan {
  return {
    id: "t1",
    user_id: "u1",
    plan_id: "plan-A",
    category: "cellular",
    provider: "סלקום",
    plan_name: "מסלול 100GB",
    monthly_price: 100,
    ...over,
  };
}
function plan(over: Partial<Plan> = {}): Plan {
  return { id: "x", cat: "cellular", provider: "פרטנר", plan: "Plan X", price: 50, kind: "regular", ...over };
}

// ════════════════════════════════════════════════════════════════════════════
// isMaterialSaving — the same dual floor as the deal feed
// ════════════════════════════════════════════════════════════════════════════

Deno.test("isMaterialSaving: ≥ ₪5 absolute clears even at a low %", () => {
  assert(isMaterialSaving(300, 295)); // ₪5 on ₪300 = 1.7% but absolute floor met
});

Deno.test("isMaterialSaving: ≥ 10% clears even under ₪5", () => {
  assert(isMaterialSaving(20, 16)); // ₪4 but 20%
});

Deno.test("isMaterialSaving: a sub-₪5 AND sub-10% wobble does NOT qualify", () => {
  assertFalse(isMaterialSaving(100, 96)); // ₪4 / 4%
});

Deno.test("isMaterialSaving: an increase / no-change / bad input never qualifies", () => {
  assertFalse(isMaterialSaving(50, 60));
  assertFalse(isMaterialSaving(50, 50));
  assertFalse(isMaterialSaving(0, 0));
  assertFalse(isMaterialSaving(-1, 1));
});

// ════════════════════════════════════════════════════════════════════════════
// latestPriceByPlan — newest captured_at per plan wins
// ════════════════════════════════════════════════════════════════════════════

Deno.test("latestPriceByPlan: keeps the newest snapshot per plan", () => {
  const m = latestPriceByPlan([
    snap("p1", 99, isoDaysAgo(5)),
    snap("p1", 79, isoDaysAgo(1)), // newest for p1
    snap("p2", 50, isoDaysAgo(2)),
  ]);
  assertEquals(m.get("p1")?.price, 79);
  assertEquals(m.get("p2")?.price, 50);
});

Deno.test("latestPriceByPlan: skips null price / bad date / empty id", () => {
  const m = latestPriceByPlan([
    { plan_id: "p1", price: null, captured_at: isoDaysAgo(1) },
    { plan_id: "", price: 10, captured_at: isoDaysAgo(1) },
    { plan_id: "p1", price: 70, captured_at: "nope" },
    snap("p1", 88, isoDaysAgo(2)),
  ]);
  assertEquals(m.get("p1")?.price, 88);
  assertEquals(m.size, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// opportunityForTracked — price_drop signal (the strongest, most personal)
// ════════════════════════════════════════════════════════════════════════════

Deno.test("opportunity: a real drop on the exact tracked plan fires a price_drop", () => {
  const latest = latestPriceByPlan([snap("plan-A", 80, isoDaysAgo(1))]);
  const op = opportunityForTracked(tracked({ monthly_price: 100, plan_id: "plan-A" }), latest, []);
  assert(op);
  assertEquals(op!.source, "price_drop");
  assertEquals(op!.paid, 100);
  assertEquals(op!.newPrice, 80);
  assertEquals(op!.monthlySaving, 20);
  assertEquals(op!.annualSaving, 240);
  assertEquals(op!.provider, "סלקום"); // the tracked provider
});

Deno.test("opportunity: an immaterial drop on the tracked plan is NOT an opportunity", () => {
  const latest = latestPriceByPlan([snap("plan-A", 97, isoDaysAgo(1))]); // ₪3 / 3%
  const op = opportunityForTracked(tracked({ monthly_price: 100 }), latest, []);
  assertEquals(op, null); // and no better catalogue plan supplied → nothing
});

// ════════════════════════════════════════════════════════════════════════════
// opportunityForTracked — better_plan signal + priority
// ════════════════════════════════════════════════════════════════════════════

Deno.test("opportunity: with no drop, a cheaper catalogue plan fires a better_plan", () => {
  const op = opportunityForTracked(
    tracked({ monthly_price: 100, plan_id: null }),
    new Map(),
    [plan({ id: "c1", price: 70 }), plan({ id: "c2", price: 90 })],
  );
  assert(op);
  assertEquals(op!.source, "better_plan");
  assertEquals(op!.newPrice, 70); // cheapest beating plan
  assertEquals(op!.betterPlanId, "c1");
  assertEquals(op!.provider, "פרטנר");
});

Deno.test("opportunity: a REAL drop wins over a cheaper catalogue plan", () => {
  // Drop to 85 (₪15 save) AND a catalogue plan at 70 (bigger save). The personal,
  // recorded drop is the stronger signal and must win.
  const latest = latestPriceByPlan([snap("plan-A", 85, isoDaysAgo(1))]);
  const op = opportunityForTracked(
    tracked({ monthly_price: 100, plan_id: "plan-A" }),
    latest,
    [plan({ id: "c1", price: 70 })],
  );
  assertEquals(op!.source, "price_drop");
  assertEquals(op!.newPrice, 85);
});

Deno.test("opportunity: TRUTH-ONLY — no drop and no cheaper plan → not contacted", () => {
  const op = opportunityForTracked(
    tracked({ monthly_price: 40, plan_id: "plan-A" }),
    new Map(),
    [plan({ id: "c1", price: 45 }), plan({ id: "c2", price: 60 })], // all dearer
  );
  assertEquals(op, null);
});

Deno.test("bestBeatingPlan: only same-category, regular, materially-cheaper, not self", () => {
  const plans = [
    plan({ id: "self", price: 60 }),
    plan({ id: "promo", price: 30, kind: "promo" }), // non-regular excluded
    plan({ id: "tv", price: 20, cat: "tv" }), // wrong category excluded
    plan({ id: "win", price: 55 }), // ₪5 cheaper than 60 → material
  ];
  const best = bestBeatingPlan(plans, "cellular", 60, "self");
  assertEquals(best?.id, "win");
});

Deno.test("bestBeatingPlan: excludes the tracked plan itself by id", () => {
  const best = bestBeatingPlan([plan({ id: "self", price: 40 })], "cellular", 100, "self");
  assertEquals(best, null);
});

// ════════════════════════════════════════════════════════════════════════════
// dedupe key — stable; a further drop / new plan is a fresh alert
// ════════════════════════════════════════════════════════════════════════════

Deno.test("opportunityDedupeKey: price_drop key changes when the price drops further", () => {
  const base: Opportunity = {
    trackedId: "t1", userId: "u1", source: "price_drop", category: "cellular",
    provider: "סלקום", planName: "x", paid: 100, newPrice: 80, monthlySaving: 20,
    annualSaving: 240, signalAt: "2026-06-20T00:00:00Z",
  };
  const k1 = opportunityDedupeKey(base);
  const k2 = opportunityDedupeKey({ ...base, newPrice: 70, signalAt: "2026-06-22T00:00:00Z" });
  assert(k1 !== k2);
  // Same opportunity → same key (idempotent dedupe).
  assertEquals(k1, opportunityDedupeKey({ ...base }));
});

Deno.test("opportunityDedupeKey: better_plan key folds in the catalogue plan id", () => {
  const base: Opportunity = {
    trackedId: "t1", userId: "u1", source: "better_plan", category: "cellular",
    provider: "פרטנר", planName: "x", paid: 100, newPrice: 70, monthlySaving: 30,
    annualSaving: 360, signalAt: "", betterPlanId: "c1",
  };
  assertStringIncludes(opportunityDedupeKey(base), "c1");
  assert(opportunityDedupeKey(base) !== opportunityDedupeKey({ ...base, betterPlanId: "c2", newPrice: 70 }));
});

// ════════════════════════════════════════════════════════════════════════════
// channel eligibility — §30A: reachable AND not suppressed
// ════════════════════════════════════════════════════════════════════════════

Deno.test("eligibleChannels: a non-suppressed phone + push is eligible on both", () => {
  const c: WatchContact = {
    userId: "u1", phone: "+972500000000",
    push: { endpoint: "https://x", p256dh: "a", auth: "b" },
  };
  assertEquals(eligibleChannels(c), { whatsapp: true, push: true });
});

Deno.test("eligibleChannels: a WhatsApp opt-out (suppression) blocks ONLY WhatsApp", () => {
  const c: WatchContact = {
    userId: "u1", phone: "+972500000000", suppressedWhatsapp: true,
    push: { endpoint: "https://x", p256dh: "a", auth: "b" },
  };
  assertEquals(eligibleChannels(c), { whatsapp: false, push: true });
});

Deno.test("eligibleChannels: a muted push blocks ONLY push; no phone blocks WhatsApp", () => {
  assertEquals(
    eligibleChannels({ userId: "u1", phone: "+972500000000", suppressedPush: true, push: { endpoint: "https://x", p256dh: "a", auth: "b" } }),
    { whatsapp: true, push: false },
  );
  assertEquals(
    eligibleChannels({ userId: "u1", phone: null, push: { endpoint: "https://x", p256dh: "a", auth: "b" } }),
    { whatsapp: false, push: true },
  );
});

Deno.test("eligibleChannels: an unreachable, unsubscribed contact is eligible on neither", () => {
  assertEquals(eligibleChannels({ userId: "u1", phone: null, push: null }), { whatsapp: false, push: false });
});

// ════════════════════════════════════════════════════════════════════════════
// quiet hours — DST-aware Israel clock, shared with the deal feed
// ════════════════════════════════════════════════════════════════════════════

Deno.test("inQuietHours: 02:00 Israel is quiet, 12:00 Israel is not (winter)", () => {
  assert(inQuietHours(Date.parse("2026-01-15T00:00:00Z"))); // 02:00 IST
  assertFalse(inQuietHours(Date.parse("2026-01-15T10:00:00Z"))); // 12:00 IST
});

// ════════════════════════════════════════════════════════════════════════════
// copy — quotes the REAL figures, never a promise
// ════════════════════════════════════════════════════════════════════════════

Deno.test("buildWatchAlert: a price_drop alert states the real old→new price + saving", () => {
  const op: Opportunity = {
    trackedId: "t1", userId: "u1", source: "price_drop", category: "cellular",
    provider: "סלקום", planName: "מסלול 100GB", paid: 100, newPrice: 80,
    monthlySaving: 20, annualSaving: 240, signalAt: "2026-06-20T00:00:00Z",
  };
  const a = buildWatchAlert(op);
  assertStringIncludes(a.body, "₪100");
  assertStringIncludes(a.body, "₪80");
  assertStringIncludes(a.body, "₪20");
  assertStringIncludes(a.body, "₪240");
  assertStringIncludes(a.url, "/renewal?tracked=t1");
});

Deno.test("buildWatchAlert: a better_plan alert says 'market rate, not a promise'", () => {
  const op: Opportunity = {
    trackedId: "t1", userId: "u1", source: "better_plan", category: "internet",
    provider: "פרטנר", planName: "סיב 1000", paid: 120, newPrice: 90,
    monthlySaving: 30, annualSaving: 360, signalAt: "", betterPlanId: "c1",
  };
  const a = buildWatchAlert(op);
  assertStringIncludes(a.body, "מחיר שוק קיים, לא הבטחה"); // truth-only framing
  assertStringIncludes(a.body, "₪90");
  assertStringIncludes(a.url, "/compare?category=internet");
});
