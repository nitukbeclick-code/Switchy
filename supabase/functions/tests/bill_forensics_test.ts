// Unit tests for the pure bill-forensics auditor (_shared/bill-forensics.ts).
// Truth-only contract: every finding is grounded in the PARSED numbers + the REAL
// catalogue; no fabricated overcharges/counts/₪. `now` is injected so the
// expired_promo date logic is deterministic. No network, no env. Run from
// supabase/functions/:
//   deno task test

import { assert, assertEquals } from "@std/assert";
import {
  auditBill,
  type Finding,
  parseLooseDate,
  type ParsedBill,
} from "../_shared/bill-forensics.ts";
import { type Plan } from "../_shared/catalogue.ts";

// A tiny REAL-shaped catalogue: same-provider cheaper plan exists, so an
// over-the-floor charge is a provable overcharge.
const CATALOGUE: Plan[] = [
  { cat: "cellular", provider: "סלקום", plan: "5G 800GB", price: 40, kind: "regular" },
  { cat: "cellular", provider: "סלקום", plan: "5G Pro", price: 60, kind: "regular" },
  { cat: "cellular", provider: "פרטנר", plan: "Prince", price: 35, kind: "regular" },
  { cat: "internet", provider: "בזק", plan: "Fiber 100", price: 80, kind: "regular" },
  { cat: "tv", provider: "yes", plan: "Base", price: 90, kind: "regular" },
];

const NOW = new Date(Date.UTC(2026, 5, 24)); // 2026-06-24, deterministic clock

function bill(partial: Partial<ParsedBill>): ParsedBill {
  return { provider: "", category: "", monthly: 0, lines: [], ...partial };
}

function kinds(fs: Finding[]): string[] {
  return fs.map((f) => f.kind);
}

// ── overcharge ────────────────────────────────────────────────────────────────

Deno.test("overcharge: same-provider line above the catalogue floor → ודאי + real delta", () => {
  const b = bill({
    provider: "סלקום",
    category: "cellular",
    monthly: 89,
    lines: [{ desc: "חבילת גלישה 5G", amount: 89, isAddon: false }],
  });
  const { findings } = auditBill(b, CATALOGUE, undefined, NOW);
  const oc = findings.find((f) => f.kind === "overcharge")!;
  assert(oc, "expected an overcharge finding");
  assertEquals(oc.certainty, "ודאי"); // matched same provider+category
  assertEquals(oc.impact, 89 - 40); // charged − cheapest סלקום cellular floor (40)
  assert(oc.detail.includes("89"));
  assert(oc.detail.includes("40"));
});

Deno.test("overcharge: unknown provider falls back to category floor → ייתכן", () => {
  const b = bill({
    provider: "", // provider unreadable
    category: "cellular",
    monthly: 70,
    lines: [{ desc: "מסלול", amount: 70 }],
  });
  const oc = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "overcharge")!;
  assert(oc);
  assertEquals(oc.certainty, "ייתכן"); // only the cross-provider category floor (פרטנר 35)
  assertEquals(oc.impact, 70 - 35);
});

Deno.test("overcharge: a fair price (within margin of the floor) yields NO finding", () => {
  const b = bill({
    provider: "סלקום",
    category: "cellular",
    monthly: 42, // floor is 40, margin is 3 → 42 is within noise
    lines: [{ desc: "מסלול", amount: 42 }],
  });
  const oc = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "overcharge");
  assertEquals(oc, undefined);
});

Deno.test("overcharge: total-level audit only when there is NO itemization", () => {
  const b = bill({ provider: "סלקום", category: "cellular", monthly: 99, lines: [] });
  const oc = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "overcharge")!;
  assert(oc);
  assertEquals(oc.line, "סך החשבון החודשי");
  assertEquals(oc.impact, 99 - 40);
});

Deno.test("overcharge: empty catalogue → no fabricated finding", () => {
  const b = bill({ provider: "סלקום", category: "cellular", monthly: 200, lines: [{ desc: "x", amount: 200 }] });
  assertEquals(auditBill(b, [], undefined, NOW).findings.length, 0);
});

// ── expired_promo ───────────────────────────────────────────────────────────

Deno.test("expired_promo: a price jump vs prevAmount → ודאי + ₪ delta", () => {
  const b = bill({
    provider: "סלקום",
    category: "cellular",
    monthly: 89,
    lines: [{ desc: "גלישה", amount: 89, prevAmount: 49, isAddon: false }],
  });
  const ep = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "expired_promo")!;
  assert(ep);
  assertEquals(ep.certainty, "ודאי");
  assertEquals(ep.impact, 89 - 49);
  assert(ep.detail.includes("49"));
  assert(ep.detail.includes("89"));
});

Deno.test("expired_promo: a tiny step (under the ₪/ratio bars) is NOT flagged", () => {
  const b = bill({
    provider: "סלקום",
    category: "cellular",
    monthly: 52,
    lines: [{ desc: "גלישה", amount: 52, prevAmount: 50 }], // +2₪, +4% → noise
  });
  const ep = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "expired_promo");
  assertEquals(ep, undefined);
});

Deno.test("expired_promo: a promoEnd date in the PAST → ייתכן", () => {
  const b = bill({
    provider: "בזק",
    category: "internet",
    monthly: 79,
    // a line at the floor (79≈80) so it doesn't ALSO trigger overcharge
    lines: [{ desc: "סיב אופטי", amount: 79, promoEnd: "2026-03-01" }],
  });
  const ep = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "expired_promo")!;
  assert(ep);
  assertEquals(ep.certainty, "ייתכן");
  assert(ep.detail.includes("2026-03-01"));
});

Deno.test("expired_promo: a promoEnd date in the FUTURE is NOT flagged", () => {
  const b = bill({
    provider: "בזק",
    category: "internet",
    monthly: 79,
    lines: [{ desc: "סיב", amount: 79, promoEnd: "2026-12-01" }],
  });
  const ep = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "expired_promo");
  assertEquals(ep, undefined);
});

// ── zombie_line ─────────────────────────────────────────────────────────────

Deno.test("zombie_line: the same add-on billed twice → ודאי, impact = the duplicate", () => {
  const b = bill({
    provider: "yes",
    category: "tv",
    monthly: 150,
    lines: [
      { desc: "בסיס", amount: 90, isAddon: false },
      { desc: "ביטוח מכשיר", amount: 19, isAddon: true },
      { desc: "ביטוח מכשיר", amount: 19, isAddon: true },
    ],
  });
  const zl = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "zombie_line")!;
  assert(zl);
  assertEquals(zl.certainty, "ודאי");
  assertEquals(zl.impact, 19); // one extra copy
  assert(zl.detail.includes("ביטוח מכשיר"));
});

Deno.test("zombie_line: a lone paid add-on → ייתכן (worth reviewing, not 'unused')", () => {
  const b = bill({
    provider: "yes",
    category: "tv",
    monthly: 120,
    lines: [
      { desc: "בסיס", amount: 90, isAddon: false },
      { desc: "ערוץ פרימיום", amount: 25, isAddon: true },
    ],
  });
  const zl = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "zombie_line")!;
  assert(zl);
  assertEquals(zl.certainty, "ייתכן");
  assertEquals(zl.impact, 25);
  // honest framing — never claims it is unused
  assert(zl.detail.includes("אם אינכם משתמשים"));
});

Deno.test("zombie_line: no duplicate and no add-on hint → no finding", () => {
  const b = bill({
    provider: "yes",
    category: "tv",
    monthly: 90,
    lines: [{ desc: "בסיס", amount: 90, isAddon: false }],
  });
  const zl = auditBill(b, CATALOGUE, undefined, NOW).findings.find((f) => f.kind === "zombie_line");
  assertEquals(zl, undefined);
});

// ── aggregation + ordering + de-dup ──────────────────────────────────────────

Deno.test("auditBill orders findings by ₪ impact (highest first)", () => {
  const b = bill({
    provider: "yes",
    category: "tv",
    monthly: 200,
    lines: [
      { desc: "בסיס", amount: 130, isAddon: false }, // overcharge vs floor 90 → 40
      { desc: "ביטוח", amount: 12, isAddon: true },
      { desc: "ביטוח", amount: 12, isAddon: true }, // zombie → 12
    ],
  });
  const fs = auditBill(b, CATALOGUE, undefined, NOW).findings;
  assert(fs.length >= 2);
  // highest impact first
  for (let i = 1; i < fs.length; i++) assert(fs[i - 1].impact >= fs[i].impact);
  assertEquals(fs[0].kind, "overcharge");
});

Deno.test("totalMonthlyImpact does NOT double-count overcharge+promo on the SAME line", () => {
  // A single line that is both above the floor AND jumped vs prev: both findings
  // describe the same line, so the total keeps the larger, not the sum.
  const b = bill({
    provider: "סלקום",
    category: "cellular",
    monthly: 89,
    lines: [{ desc: "גלישה", amount: 89, prevAmount: 49, isAddon: false }],
  });
  const { findings, totalMonthlyImpact } = auditBill(b, CATALOGUE, undefined, NOW);
  const oc = findings.find((f) => f.kind === "overcharge")!.impact; // 49
  const ep = findings.find((f) => f.kind === "expired_promo")!.impact; // 40
  assert(oc !== ep, "the two findings should differ in impact for this assertion to be meaningful");
  assertEquals(totalMonthlyImpact, Math.max(oc, ep)); // larger of the two, not oc+ep
});

Deno.test("auditBill on an empty/garbage bill returns no findings, zero impact", () => {
  assertEquals(auditBill(bill({}), CATALOGUE, undefined, NOW), { findings: [], totalMonthlyImpact: 0 });
  // tolerant of a malformed shape (truth-only: nothing in → nothing out)
  // deno-lint-ignore no-explicit-any
  const junk = { lines: "nope" } as any;
  assertEquals(auditBill(junk, CATALOGUE, undefined, NOW).findings.length, 0);
});

Deno.test("auditBill never fabricates: a non-finite amount line is ignored", () => {
  const b = bill({
    provider: "סלקום",
    category: "cellular",
    monthly: 0,
    // deno-lint-ignore no-explicit-any
    lines: [{ desc: "x", amount: Number.NaN } as any],
  });
  assertEquals(auditBill(b, CATALOGUE, undefined, NOW).findings.length, 0);
});

// ── parseLooseDate ───────────────────────────────────────────────────────────

Deno.test("parseLooseDate reads ISO YYYY-MM-DD", () => {
  assertEquals(parseLooseDate("2026-03-01")?.toISOString().slice(0, 10), "2026-03-01");
});

Deno.test("parseLooseDate reads Israeli DD/MM/YYYY and DD.MM.YY", () => {
  assertEquals(parseLooseDate("01/03/2026")?.toISOString().slice(0, 10), "2026-03-01");
  assertEquals(parseLooseDate("1.3.26")?.toISOString().slice(0, 10), "2026-03-01");
});

Deno.test("parseLooseDate rejects garbage and impossible dates", () => {
  assertEquals(parseLooseDate(""), null);
  assertEquals(parseLooseDate("not a date"), null);
  assertEquals(parseLooseDate(null), null);
  assertEquals(parseLooseDate("2026-13-40"), null); // month 13 / day 40
  assertEquals(parseLooseDate("31/02/2026"), null); // Feb 31 overflow
});
