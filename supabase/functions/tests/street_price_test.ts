// Unit tests for the street-price pure helpers (street-price/lib.ts) — the
// function's security + honesty boundary. No network, no env, no Deno.serve.
//
// The contracts that matter most (and the truth-only / E-E-A-T rules behind them):
//   • parseReport      — validates/coerces/normalizes; rejects an unknown
//     provider/category (never guessed) and an out-of-range price.
//   • screenReport     — the deterministic heuristic pre-screen: a below-headline
//     retention offer (the WHOLE POINT of street price) is 'approved'; an absurd
//     price (way above headline, or implausibly cheap, or out of absolute bounds)
//     is held 'pending' for a human — never auto-rejected.
//   • clampLeadConsent — consent is honoured ONLY for a real attached contactable
//     lead AND only when mandatory consent === true (never fabricated).
//   • STREET_PRICE_MIN_REPORTS / reportsNeeded — the publish threshold copy; pinned
//     so it can't silently drift from the DB's get_street_price() v_min_reports.
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  clampLeadConsent,
  MAX_OVER_CATALOGUE_RATIO,
  MAX_REPORTED_PRICE,
  MIN_REPORTED_PRICE,
  MIN_UNDER_CATALOGUE_RATIO,
  parseReport,
  reporterFingerprintInput,
  reportsNeeded,
  screenReport,
  STREET_PRICE_MIN_REPORTS,
} from "../street-price/lib.ts";

// A small live-catalogue provider set for normalization tests (parseReport accepts
// any non-empty provider when the list is [], so these cases pin the normalized path).
const PROVIDERS = ["סלקום", "פרטנר", "פלאפון", "HOT", "בזק"];

// ── parseReport: validate / coerce / normalize ────────────────────────────────

Deno.test("parseReport accepts a clean cellular report and normalizes the provider", () => {
  const r = parseReport(
    { plan_id: "partner-cellular-50gb", provider: "partner", category: "סלולר", reported_price: 39 },
    PROVIDERS,
  );
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.report.provider, "פרטנר"); // alias "partner" → canonical
    assertEquals(r.report.category, "cellular"); // Hebrew "סלולר" → canonical key
    assertEquals(r.report.reported_price, 39);
    assertEquals(r.report.plan_id, "partner-cellular-50gb");
  }
});

Deno.test("parseReport coerces a numeric string / shekel-prefixed price", () => {
  for (const raw of ["89", "₪89", " 89.4 "]) {
    const r = parseReport({ provider: "סלקום", category: "cellular", reported_price: raw }, PROVIDERS);
    assert(r.ok, `expected ok for ${JSON.stringify(raw)}`);
    if (r.ok) assertEquals(r.report.reported_price, 89);
  }
});

Deno.test("parseReport allows a missing plan_id (provider+category only)", () => {
  const r = parseReport({ provider: "HOT", category: "tv", reported_price: 99 }, PROVIDERS);
  assert(r.ok);
  if (r.ok) assertEquals(r.report.plan_id, null);
});

Deno.test("parseReport rejects a non-numeric / missing price", () => {
  for (const bad of [{}, { reported_price: "abc" }, { reported_price: null }]) {
    const r = parseReport({ provider: "סלקום", category: "cellular", ...bad }, PROVIDERS);
    assertFalse(r.ok);
  }
});

Deno.test("parseReport rejects a price outside the sane absolute range", () => {
  for (const price of [0, MIN_REPORTED_PRICE - 1, MAX_REPORTED_PRICE + 1, -50]) {
    const r = parseReport({ provider: "סלקום", category: "cellular", reported_price: price }, PROVIDERS);
    assertFalse(r.ok, `expected reject for ${price}`);
  }
});

Deno.test("parseReport rejects an unrecognised provider (never guessed)", () => {
  const r = parseReport({ provider: "SomeFakeTelco", category: "cellular", reported_price: 50 }, PROVIDERS);
  assertFalse(r.ok); // truth-only: an unknown provider is rejected, not stored as junk
});

Deno.test("parseReport rejects a missing / unknown category", () => {
  for (const category of ["", "groceries", "   "]) {
    const r = parseReport({ provider: "סלקום", category, reported_price: 50 }, PROVIDERS);
    assertFalse(r.ok, `expected reject for category ${JSON.stringify(category)}`);
  }
});

Deno.test("parseReport with NO provider list accepts a clipped free-text provider", () => {
  // When the live catalogue couldn't be loaded ([]), we accept the bounded free
  // text rather than blocking all submissions — still validated on price/category.
  const r = parseReport({ provider: "Some New MVNO", category: "cellular", reported_price: 25 }, []);
  assert(r.ok);
  if (r.ok) assertEquals(r.report.provider, "Some New MVNO");
});

// ── screenReport: the deterministic heuristic pre-screen ──────────────────────

const report = (price: number) => ({ plan_id: "x", provider: "פרטנר", category: "cellular", reported_price: price });

Deno.test("screenReport APPROVES a below-headline retention offer (the point of street price)", () => {
  // ₪39 reported against a ₪89 catalogue headline — a normal retention deal.
  const v = screenReport(report(39), 89);
  assertEquals(v.status, "approved");
});

Deno.test("screenReport APPROVES a price equal to the catalogue headline", () => {
  assertEquals(screenReport(report(89), 89).status, "approved");
});

Deno.test("screenReport HOLDS a price well above the catalogue headline (you don't haggle UP)", () => {
  // 200 > 89 × 1.5 → implausible, held pending for a human (never auto-rejected).
  const v = screenReport(report(200), 89);
  assertEquals(v.status, "pending");
});

Deno.test("screenReport HOLDS an implausibly cheap price vs the headline (likely a typo)", () => {
  // 5 < 120 × 0.1 → implausibly cheap.
  const v = screenReport(report(5), 120);
  assertEquals(v.status, "pending");
});

Deno.test("screenReport at the exact over/under ratio boundaries", () => {
  const ref = 100;
  // Exactly at headline × MAX_OVER_CATALOGUE_RATIO → not strictly greater → approved.
  assertEquals(screenReport(report(ref * MAX_OVER_CATALOGUE_RATIO), ref).status, "approved");
  // Exactly at headline × MIN_UNDER_CATALOGUE_RATIO → not strictly less → approved.
  assertEquals(screenReport(report(ref * MIN_UNDER_CATALOGUE_RATIO), ref).status, "approved");
});

Deno.test("screenReport with NO catalogue reference falls back to absolute bounds only", () => {
  // Plausible absolute price, no ref → approved.
  assertEquals(screenReport(report(45), null).status, "approved");
  assertEquals(screenReport(report(45), undefined).status, "approved");
  // Out of absolute bounds even with no ref → held.
  assertEquals(screenReport(report(MIN_REPORTED_PRICE - 1), null).status, "pending");
  assertEquals(screenReport(report(MAX_REPORTED_PRICE + 1), null).status, "pending");
});

Deno.test("screenReport records the catalogue reference it screened against", () => {
  assertEquals(screenReport(report(39), 89).catalogueRef, 89);
  assertEquals(screenReport(report(39), null).catalogueRef, null);
});

// ── reporterFingerprintInput: stable, PII-light, deduping ─────────────────────

Deno.test("reporterFingerprintInput is stable across casing/spacing of provider+category", () => {
  const a = reporterFingerprintInput("1.2.3.4", "פרטנר", "cellular");
  const b = reporterFingerprintInput("1.2.3.4", " פרטנר ", "CELLULAR");
  assertEquals(a, b); // same person + same plan → same fingerprint input → dedupes
  assert(a.includes("1.2.3.4"));
});

Deno.test("reporterFingerprintInput differs by plan so a different report is a distinct reporter", () => {
  const cell = reporterFingerprintInput("1.2.3.4", "פרטנר", "cellular");
  const tv = reporterFingerprintInput("1.2.3.4", "פרטנר", "tv");
  assert(cell !== tv);
});

Deno.test("reporterFingerprintInput returns '' with no trustworthy IP (caller declines to dedupe)", () => {
  assertEquals(reporterFingerprintInput("", "פרטנר", "cellular"), "");
  assertEquals(reporterFingerprintInput("   ", "פרטנר", "cellular"), "");
});

// ── clampLeadConsent: consent honoured ONLY for an attached contactable lead ──

Deno.test("clampLeadConsent returns null when no lead is attached", () => {
  assertEquals(clampLeadConsent(undefined), null);
  assertEquals(clampLeadConsent({}), null);
});

Deno.test("clampLeadConsent returns null when name/phone is incomplete", () => {
  assertEquals(clampLeadConsent({ name: "א", phone: "0501234567", consent: true }), null); // name too short
  assertEquals(clampLeadConsent({ name: "ישראל", phone: "", consent: true }), null); // no phone
});

Deno.test("clampLeadConsent NEVER fabricates consent — a lead without consent===true yields null", () => {
  // §30A: name+phone present but mandatory consent missing/false → no capture.
  assertEquals(clampLeadConsent({ name: "ישראל ישראלי", phone: "0501234567" }), null);
  assertEquals(clampLeadConsent({ name: "ישראל ישראלי", phone: "0501234567", consent: false }), null);
  assertEquals(clampLeadConsent({ name: "ישראל ישראלי", phone: "0501234567", consent: "true" }), null);
});

Deno.test("clampLeadConsent captures a contactable lead with mandatory consent + defaults marketing OFF", () => {
  const out = clampLeadConsent({ name: "ישראל ישראלי", phone: "0501234567", consent: true });
  assert(out !== null);
  if (out) {
    assertEquals(out.consent, true);
    assertEquals(out.consent_marketing_sms, false);
    assertEquals(out.consent_marketing_email, false);
    assertEquals(out.consent_marketing_whatsapp, false);
  }
});

Deno.test("clampLeadConsent passes explicit marketing opt-ins through (only when true)", () => {
  const out = clampLeadConsent({
    name: "ישראל ישראלי",
    phone: "0501234567",
    consent: true,
    consent_marketing_sms: true,
    consent_marketing_whatsapp: "yes", // not boolean true → stays false
  });
  assert(out !== null);
  if (out) {
    assertEquals(out.consent_marketing_sms, true);
    assertEquals(out.consent_marketing_whatsapp, false);
  }
});

// ── threshold copy: reportsNeeded + the pinned constant ───────────────────────

Deno.test("STREET_PRICE_MIN_REPORTS matches the DB get_street_price() v_min_reports", () => {
  // ⚠️ If you change this, change v_min_reports in supabase/street-prices-2026-06.sql
  // §3 too — the DB gate is the source of truth for what the aggregate returns; this
  // constant only drives the "X more reports needed" copy. They MUST stay equal.
  assertEquals(STREET_PRICE_MIN_REPORTS, 5);
});

Deno.test("reportsNeeded counts down to zero and never goes negative", () => {
  assertEquals(reportsNeeded(0), STREET_PRICE_MIN_REPORTS);
  assertEquals(reportsNeeded(STREET_PRICE_MIN_REPORTS - 1), 1);
  assertEquals(reportsNeeded(STREET_PRICE_MIN_REPORTS), 0);
  assertEquals(reportsNeeded(STREET_PRICE_MIN_REPORTS + 10), 0); // clamps at 0
  assertEquals(reportsNeeded(-3 as number), STREET_PRICE_MIN_REPORTS); // junk → full threshold
});
