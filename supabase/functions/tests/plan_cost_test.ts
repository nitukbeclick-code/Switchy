// Unit tests for _shared/plan_cost.ts — the Deno copy of the twelve-month cost
// engine that also lives in site/plan-cost.js, web/lib/plan-cost.ts and
// lib/services/plan_cost.dart.
//
// THE POINT OF THIS FILE is the parity contract. The four copies exist because
// no one module can be imported into a Next bundle, a Flutter app, a browser
// IIFE and a Deno function at once — and the project has already watched them
// drift: a free-month rule landed in the site engine alone, and for a day the
// app and the web app billed a plan for a month it gives away. Every fixture
// below is one the other three are also pinned to, with the SAME expected
// number, so a change to one that is not made to the rest fails here.
//
// No network, no env. Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import { calculateTwelveMonthCost } from "../_shared/plan_cost.ts";

Deno.test("a flat price is simply multiplied", () => {
  const c = calculateTwelveMonthCost({ price: 89 });
  assertEquals(c.basis, "fixed-price");
  assertEquals(c.minimum, 89 * 12);
  assertEquals(c.maximum, 89 * 12);
});

Deno.test("the exact price wins over the rounded headline", () => {
  const c = calculateTwelveMonthCost({ price: 11, priceExact: 10.9 });
  assertEquals(c.minimum, 10.9 * 12);
});

Deno.test("a published ladder beats both the promo and the after price", () => {
  // net_partner_fiber1g — the row every surface is pinned to.
  const c = calculateTwelveMonthCost({
    price: 39,
    after: 159,
    fineLines: ["ח׳1-2: ₪39", "ח׳3-12: ₪139", "ח׳13+: ₪159"],
  });
  assertEquals(c.basis, "published-schedule");
  assertEquals(c.minimum, 39 * 2 + 139 * 10); // 1468
  assertEquals(c.maximum, c.minimum);
});

Deno.test("a promo with a published duration runs exactly that long", () => {
  const c = calculateTwelveMonthCost({
    price: 40,
    after: 60,
    fineLines: ["מחיר מבצע לחודשיים"],
  });
  assertEquals(c.basis, "published-promo");
  assertEquals(c.minimum, 40 * 2 + 60 * 10); // 680
});

Deno.test("an unpublished duration returns a RANGE rather than a guess", () => {
  const c = calculateTwelveMonthCost({ price: 39, after: 159 });
  assertEquals(c.basis, "published-range");
  assertEquals(c.minimum, 39 * 12); // promo forever — the floor
  assertEquals(c.maximum, 39 + 159 * 11); // one promo month — the ceiling
  assert(c.maximum > c.minimum);
});

Deno.test("after <= price is not a promo", () => {
  assertEquals(calculateTwelveMonthCost({ price: 89, after: 89 }).basis, "fixed-price");
});

Deno.test("a published free first month is not charged", () => {
  // tri_yes_yes-fiber-triple. The site said ₪2,299 while the app and the web app
  // said ₪2,508 — one free month, three engines, two answers.
  const c = calculateTwelveMonthCost({
    price: 209,
    after: 329,
    fineLines: ["חודש ראשון חינם", "ח׳2-12: ₪209", "ח׳13-36: ₪229", "ח׳37+: ₪329"],
  });
  assertEquals(c.minimum, 209 * 11); // 2299
  assert(c.minimum !== 209 * 12); // 2508 — the bug
});

Deno.test("a free ADD-ON is never mistaken for a free subscription month", () => {
  // 24 catalogue plans say "חינם"/"מתנה" and nearly all mean an add-on. Zeroing
  // month 1 for those would invent a discount the plan does not give.
  for (
    const line of [
      'HBO Max חינם 3 ח׳ אח"כ ₪25',
      "נתב WiFi7 שנה מתנה",
      'שיחות חו"ל + משלוח SIM חינם',
      "מקרן וידאו במתנה",
      "סינון אתרים חינם",
    ]
  ) {
    const c = calculateTwelveMonthCost({ price: 100, fineLines: ["ח׳1-12: ₪100", line] });
    assertEquals(c.minimum, 1200, line);
  }
});

Deno.test("a free first month with NO published ladder is left alone", () => {
  // cel_walla_family300. With no ladder we would be inventing a schedule from
  // prose, not refining a published one. Overstating the cost understates the
  // saving — the safe direction.
  const c = calculateTwelveMonthCost({
    price: 75,
    fineLines: ["₪75 ל-3 מנויים", "חודש ראשון חינם"],
  });
  assertEquals(c.basis, "fixed-price");
  assertEquals(c.minimum, 900);
});

Deno.test("a tier that starts after the horizon confirms the headline covers it", () => {
  const c = calculateTwelveMonthCost({ price: 99, after: 199, fineLines: ["ח׳13+: ₪199"] });
  assertEquals(c.basis, "published-schedule");
  assertEquals(c.minimum, 99 * 12);
});

Deno.test("the ladder is read from terms and notes too, not just fineLines", () => {
  // plansFromRows maps all three; the live DB carries `terms` as a single
  // string and `notes` as free text.
  assertEquals(
    calculateTwelveMonthCost({ price: 39, after: 159, terms: "ח׳1-2: ₪39 | ח׳3-12: ₪139" }).minimum,
    39 * 2 + 139 * 10,
  );
  assertEquals(
    calculateTwelveMonthCost({ price: 39, after: 159, notes: "ח׳1-2: ₪39 | ח׳3-12: ₪139" }).minimum,
    39 * 2 + 139 * 10,
  );
});

Deno.test("a row with no price at all does not produce a negative or NaN cost", () => {
  const c = calculateTwelveMonthCost({});
  assertEquals(c.minimum, 0);
  assertEquals(c.maximum, 0);
  assertEquals(c.basis, "fixed-price");
});

// ── The cross-surface parity contract ────────────────────────────────────────
// shared/plan-cost-cases.json holds ONE set of expected twelve-month costs, read
// by all four copies of this engine. See its _readme for why: the copies drifted
// once and every suite stayed green, because each pinned only its own behaviour.
type SharedCase = {
  name: string;
  plan: Record<string, unknown>;
  expect: { minimum: number; maximum: number; basis: string };
};

const sharedCases: SharedCase[] = JSON.parse(
  Deno.readTextFileSync(
    new URL("../../../shared/plan-cost-cases.json", import.meta.url),
  ),
).cases;

Deno.test("matches the shared cross-surface fixtures", () => {
  assert(sharedCases.length > 0, "the shared fixture file is empty");
  for (const c of sharedCases) {
    const cost = calculateTwelveMonthCost(c.plan);
    assertEquals(cost.basis, c.expect.basis, `${c.name}: basis`);
    assert(
      Math.abs(cost.minimum - c.expect.minimum) < 0.005,
      `${c.name}: minimum was ${cost.minimum}, expected ${c.expect.minimum}`,
    );
    assert(
      Math.abs(cost.maximum - c.expect.maximum) < 0.005,
      `${c.name}: maximum was ${cost.maximum}, expected ${c.expect.maximum}`,
    );
  }
});
