// Unit tests for the rep-brief pure logic (rep_brief.ts) — the catalogue-grounded
// Phone-Rep Call-Brief builder. No network, no env, no Deno.serve. Run from
// supabase/functions/:
//   deno test --allow-read rep-brief/rep_brief_test.ts
//
// These pin: (1) the stated-need parser (category/budget/provider/abroad from the
// lead's fields + notes), (2) that recommendations are REAL catalogue rows
// (cited names/prices, honest annual-saving only when a budget was given, never
// fabricated), (3) objection tailoring, and (4) that the §7b commission-disclosure
// and §30A consent reminders are ALWAYS present.

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { catalogueProviders, type Plan, plansFromSnapshot } from "../_shared/catalogue.ts";
import {
  bestPlans,
  type BriefLead,
  buildBrief,
  complianceReminders,
  objections,
  parseNeed,
} from "./rep_brief.ts";

import plansSnapshot from "./plans-snapshot.json" with { type: "json" };

// A small, deterministic catalogue so the assertions don't depend on the live
// snapshot's exact prices (spans the fields the brief cares about).
const PLANS: Plan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "סלקום 100GB", price: 39, is5G: true, kind: "regular", specs: { data: "100GB" } },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "פרטנר ללא הגבלה", price: 59, noCommit: true, kind: "regular", specs: { data: "ללא הגבלה" } },
  { id: "c3", cat: "cellular", provider: "רמי לוי", plan: "כשר", price: 19, kind: "kosher", specs: { data: "5GB" } },
  { id: "c4", cat: "cellular", provider: "גולן טלקום", plan: "גולן 50GB", price: 29, kind: "regular", specs: { data: "50GB" } },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, kind: "regular", specs: { speed: "1000Mb" } },
  { id: "a1", cat: "abroad", provider: "019 מובייל", plan: 'חבילת חו"ל', price: 49, hasAbroad: true, priceUnit: "package", kind: "regular", specs: { data: "10GB" } },
];

const PROVIDERS = catalogueProviders(PLANS);

// ── parseNeed ────────────────────────────────────────────────────────────────

Deno.test("parseNeed reads category, budget and provider from notes + fields", () => {
  const lead: BriefLead = {
    name: "דנה כהן",
    provider: "סלקום",
    notes: "רוצה לעבור מסלול סלולר, משלמת היום בערך 80 ש\"ח בחודש",
  };
  const need = parseNeed(lead, PROVIDERS);
  assertEquals(need.category, "cellular");
  assertEquals(need.categoryHe, "סלולר");
  assertEquals(need.budget, 80);
  assertEquals(need.provider, "סלקום");
  assertFalse(need.abroad);
});

Deno.test("parseNeed flags abroad interest and falls back to raw provider text", () => {
  const lead: BriefLead = {
    name: "Yossi",
    provider: "ספק לא מוכר",
    notes: 'נוסע לחו"ל בקרוב, צריך גלישה',
  };
  const need = parseNeed(lead, PROVIDERS);
  assertEquals(need.category, "abroad");
  assert(need.abroad);
  // Not a known catalogue brand → keep the raw text so the rep still sees it.
  assertEquals(need.provider, "ספק לא מוכר");
});

Deno.test("parseNeed returns 'not stated' category when nothing is parseable", () => {
  const need = parseNeed({ name: "אנונימי", notes: "תחזרו אליי" }, PROVIDERS);
  assertEquals(need.category, "");
  assertEquals(need.categoryHe, "לא צויין");
  assertEquals(need.budget, 0);
});

// ── bestPlans: REAL catalogue rows, honest savings ────────────────────────────

Deno.test("bestPlans with a budget returns cheaper same-category plans with annualSaving", () => {
  const need = parseNeed({ notes: "סלולר, משלם 80 בחודש" }, PROVIDERS);
  const plans = bestPlans(PLANS, need, 3);
  assert(plans.length >= 2);
  // Every recommendation is a REAL catalogue row, cheaper than the budget, with a
  // concrete (spend-price)*12 saving.
  for (const p of plans) {
    assert(p.price < 80, `expected ${p.price} < 80`);
    assert(p.annualSaving > 0, "budget given → annual saving must be computed");
    assert(PLANS.some((c) => c.plan === p.name && c.provider === p.provider && c.price === p.price));
  }
  // Cheapest first.
  assert(plans[0].price <= plans[1].price);
  // The kosher (kind!=regular) plan is never recommended.
  assertFalse(plans.some((p) => p.name === "כשר"));
});

Deno.test("bestPlans without a budget returns candidates with NO fabricated saving", () => {
  const need = parseNeed({ notes: "מעוניין במסלול סלולר" }, PROVIDERS);
  const plans = bestPlans(PLANS, need, 3);
  assert(plans.length >= 1);
  for (const p of plans) {
    assertEquals(p.annualSaving, 0); // no current spend → we don't guess a saving
    assert(p.price > 0);
  }
});

Deno.test("bestPlans returns nothing when the category is unknown", () => {
  const need = parseNeed({ notes: "תחזרו אליי בבקשה" }, PROVIDERS);
  assertEquals(bestPlans(PLANS, need, 3), []);
});

Deno.test("bestPlans honours abroad intent (only abroad-capable rows)", () => {
  const need = parseNeed({ notes: 'חבילת גלישה לחו"ל' }, PROVIDERS);
  const plans = bestPlans(PLANS, need, 3);
  assert(plans.length >= 1);
  assert(plans.every((p) => p.abroad), "all abroad recs must be abroad-capable");
});

// ── objections + compliance ───────────────────────────────────────────────────

Deno.test("objections always include the honest 'price after promo' answer", () => {
  const need = parseNeed({ notes: "סלולר 80" }, PROVIDERS);
  const objs = objections(need, true);
  assert(objs.length >= 3);
  assert(objs.some((o) => o.answer.includes("אחרי המבצע")));
});

Deno.test("objections add an abroad-specific objection when relevant", () => {
  const need = parseNeed({ notes: 'נוסע לחו"ל' }, PROVIDERS);
  const objs = objections(need, true);
  assert(objs.some((o) => o.objection.includes('חו"ל')));
});

Deno.test("complianceReminders ALWAYS include §7b commission + §30A consent", () => {
  const reminders = complianceReminders({ name: "דנה" });
  assertEquals(reminders.length, 2);
  assert(reminders.some((r) => r.law.includes("7ב") && r.mustSay.includes("עמלת תיווך")));
  const spam = reminders.find((r) => r.law.includes("30א"));
  assert(spam);
  // No marketing consent on the lead → the rep must NOT pitch marketing.
  assertStringIncludes(spam!.mustSay, "לא אישר דיוור");
});

Deno.test("complianceReminders reflects existing marketing consent channels", () => {
  const reminders = complianceReminders({
    name: "דנה",
    consent_marketing_whatsapp: true,
  });
  const spam = reminders.find((r) => r.law.includes("30א"))!;
  assertStringIncludes(spam.mustSay, "וואטסאפ");
  assertStringIncludes(spam.mustSay, "אישר דיוור");
});

// ── buildBrief: the full structured payload + deterministic text ──────────────

Deno.test("buildBrief produces a complete, grounded, compliant brief", () => {
  const lead: BriefLead = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "דנה כהן",
    phone: "0501234567",
    provider: "סלקום",
    source: "advisor",
    callback_time: "evening",
    notes: "רוצה לעבור מסלול סלולר, משלמת היום בערך 80 בחודש",
  };
  const brief = buildBrief(lead, PLANS, PROVIDERS);
  // Structured fields populated.
  assertEquals(brief.lead.name, "דנה כהן");
  assertEquals(brief.need.category, "cellular");
  assert(brief.plans.length >= 1);
  assert(brief.talkingPoints.length >= 3);
  assertEquals(brief.compliance.length, 2);
  // The deterministic text carries the need, a real cited price, and BOTH
  // compliance reminders.
  assertStringIncludes(brief.text, "הצורך של הלקוח");
  assertStringIncludes(brief.text, "₪"); // a real price was cited
  assertStringIncludes(brief.text, "7ב"); // §7b commission disclosure
  assertStringIncludes(brief.text, "30א"); // §30A consent
  // Source + callback localized to Hebrew.
  assertEquals(brief.lead.sourceHe, "יועץ AI");
  assertEquals(brief.lead.callbackHe, "בערב");
});

// ── grounding against the REAL bundled snapshot (no network) ──────────────────

Deno.test("buildBrief grounds on the real bundled catalogue snapshot", () => {
  const plans = plansFromSnapshot(plansSnapshot);
  assert(plans.length > 0, "snapshot must load real plans");
  const providers = catalogueProviders(plans);
  const brief = buildBrief(
    { name: "בדיקה", notes: "סלולר, משלם 70 בחודש" },
    plans,
    providers,
  );
  assert(brief.plans.length >= 1, "should recommend at least one real cellular plan");
  for (const p of brief.plans) {
    // Each recommended row exists verbatim in the real snapshot.
    assert(
      plans.some((c) => c.plan === p.name && c.provider === p.provider && c.price === p.price),
      `recommended plan "${p.provider} ${p.name}" must be a real snapshot row`,
    );
    assert(p.price < 70, "recommended plan must be cheaper than the stated spend");
  }
});
