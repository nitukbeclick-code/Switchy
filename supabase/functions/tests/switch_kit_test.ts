// Tests for the Switch Autopilot — _shared/switch.ts (pure buildSwitchKit) and the
// generate_switch_kit tool in _shared/tools.ts.
//
// The focus is the TRUTH-ONLY guarantees:
//   • the target plan must resolve to a REAL catalogue row (id or provider+name),
//     else the tool REFUSES (never fabricates a plan/price);
//   • the cancellation letter uses bracketed PLACEHOLDERS for unprovided personal
//     fields — it never invents a name / account / phone;
//   • the kit invents NO phone numbers, NO provider SLAs, and carries the honest
//     "הנחיה כללית, לא ייעוץ משפטי" disclaimer;
//   • the letter is a DRAFT only — autoSent is always false (we never auto-send);
//   • the honest annual saving appears ONLY against a real current bill.
// No network, no env. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildSwitchKit,
  SWITCH_DISCLAIMER,
  type SwitchKit,
} from "../_shared/switch.ts";
import { generateSwitchKit, type ToolContext } from "../_shared/tools.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, net: "fiber" },
  { id: "a1", cat: "abroad", provider: "Airalo eSIM", plan: "eSIM 5GB", price: 35, hasAbroad: true, priceUnit: "package" },
];

// A fixed clock so the dated lines are deterministic.
const NOW = new Date("2026-06-24T09:00:00.000Z");

function fakeCtx(opts: Partial<ToolContext> = {}): ToolContext & {
  crm: string[];
  sec: { event: string; detail: Record<string, unknown> }[];
} {
  const crm: string[] = [];
  const sec: { event: string; detail: Record<string, unknown> }[] = [];
  const ctx = {
    plans: PLANS,
    channel: "whatsapp" as const,
    conversationId: "conv-1",
    contactId: "contact-1",
    logCrmEvent: (ev: { actor: string; event: string; preview?: string }) => {
      crm.push(`${ev.event}:${ev.preview ?? ""}`);
    },
    logSecurityEvent: (event: string, detail: Record<string, unknown>) => {
      sec.push({ event, detail });
    },
    ...opts,
    crm,
    sec,
  };
  return ctx as ToolContext & { crm: string[]; sec: typeof sec };
}

// ── buildSwitchKit (pure) ─────────────────────────────────────────────────────

Deno.test("buildSwitchKit: cellular kit has porting checklist + steps + disclaimer", () => {
  const cell = PLANS[0]; // סלקום 5G — cellular
  const kit: SwitchKit = buildSwitchKit("פרטנר", cell, {}, NOW);

  assertEquals(kit.fromProvider, "פרטנר");
  assertEquals(kit.toProvider, "סלקום");
  assertEquals(kit.category, "cellular");
  assertEquals(kit.categoryHe, "סלולר");

  // The 5 honest exit steps, each in a 'todo' state by default.
  assertEquals(kit.switchSteps.length, 5);
  assertEquals(kit.switchSteps.map((s) => s.key), [
    "check_terms",
    "compare_alternatives",
    "porting",
    "written_notice",
    "equipment_final_bill",
  ]);
  for (const s of kit.switchSteps) assertEquals(s.status, "todo");

  // Cellular ⇒ number-porting items present.
  const keys = kit.portabilityChecklist.map((i) => i.key);
  assert(keys.includes("keep_number"));
  assert(keys.includes("id_details"));
  // Cellular ships no loaned equipment ⇒ no return-equipment item.
  assert(!keys.includes("return_equipment"));

  // Key-dates: a real notice date + a porting window hint (no fabricated SLA date).
  const dateKeys = kit.keyDates.map((d) => d.key);
  assert(dateKeys.includes("notice_date"));
  assert(dateKeys.includes("porting_window"));

  // The standing disclaimer is attached verbatim.
  assertEquals(kit.disclaimer, SWITCH_DISCLAIMER);
  assertStringIncludes(kit.disclaimer, "לא ייעוץ משפטי");
});

Deno.test("buildSwitchKit: internet kit drops porting, adds install + equipment items", () => {
  const net = PLANS[2]; // בזק internet
  const kit = buildSwitchKit("HOT", net, {}, NOW);

  assertEquals(kit.category, "internet");
  const keys = kit.portabilityChecklist.map((i) => i.key);
  // No number porting for internet.
  assert(!keys.includes("keep_number"));
  // Install coordination + loaned-equipment return DO apply.
  assert(keys.includes("install_coordination"));
  assert(keys.includes("return_equipment"));

  const dateKeys = kit.keyDates.map((d) => d.key);
  assert(dateKeys.includes("switch_window"));
  assert(!dateKeys.includes("porting_window"));
});

Deno.test("buildSwitchKit: letter uses placeholders for unprovided personal fields (never invents)", () => {
  const kit = buildSwitchKit("פרטנר", PLANS[0], {}, NOW);
  const letter = kit.cancellationLetterHe;
  // No name/account/phone given ⇒ bracketed placeholders, not fabricated values.
  assertStringIncludes(letter, "[שם מלא]");
  assertStringIncludes(letter, "[מס׳ לקוח/מנוי]");
  // Dated with the real notice day; addressed to the real from-provider.
  assertStringIncludes(letter, "2026-06-24");
  assertStringIncludes(letter, "פרטנר");
});

Deno.test("buildSwitchKit: provided profile fills the letter; commitment clause is honest", () => {
  const kit = buildSwitchKit("פרטנר", PLANS[0], {
    fullName: "ישראל ישראלי",
    accountNumber: "12345",
    phone: "050-1234567",
    hasCommitment: true,
  }, NOW);
  const letter = kit.cancellationLetterHe;
  assertStringIncludes(letter, "ישראל ישראלי");
  assertStringIncludes(letter, "12345");
  assertStringIncludes(letter, "050-1234567");
  // The commitment clause limits charges to the REMAINING commitment (no fabricated penalty).
  assertStringIncludes(letter, "יתרת תקופת ההתחייבות בלבד");
  // No placeholder leaked through.
  assert(!letter.includes("[שם מלא]"));
});

Deno.test("buildSwitchKit: honest annual saving ONLY against a real monthly bill", () => {
  // Monthly target (cellular ₪49) vs a ₪90 bill ⇒ (90-49)*12 = 492.
  const withBill = buildSwitchKit("פרטנר", PLANS[0], { currentBill: 90 }, NOW);
  assertEquals(withBill.annualSavingUpTo, (90 - 49) * 12);

  // No bill ⇒ no figure promised.
  const noBill = buildSwitchKit("פרטנר", PLANS[0], {}, NOW);
  assertEquals(noBill.annualSavingUpTo, undefined);

  // Abroad per-package plan is NOT monthly ⇒ no annual saving even with a bill.
  const abroad = buildSwitchKit("פרטנר", PLANS[3], { currentBill: 200 }, NOW);
  assertEquals(abroad.annualSavingUpTo, undefined);
});

Deno.test("buildSwitchKit: officialUrl is pass-through only (null when not provided)", () => {
  const none = buildSwitchKit("פרטנר", PLANS[0], {}, NOW);
  assertEquals(none.officialUrl, null);
  const given = buildSwitchKit("פרטנר", PLANS[0], { officialUrl: "https://example.co.il" }, NOW);
  assertEquals(given.officialUrl, "https://example.co.il");
});

// ── generate_switch_kit (tool) ────────────────────────────────────────────────

Deno.test("generate_switch_kit: resolves target by REAL id, never auto-sends", async () => {
  const ctx = fakeCtx();
  const r = await generateSwitchKit(ctx, { fromProvider: "פרטנר", toPlanId: "c1" });
  assert(r.ok);
  assertEquals(r.data!.toProvider, "סלקום");
  assertEquals(r.data!.toPlanId, "c1");
  // Letter present + the hard no-auto-send flag.
  assert(typeof r.data!.cancellationLetterHe === "string");
  assertEquals(r.data!.autoSent, false);
  // The note tells the USER they review + send it themselves.
  assertStringIncludes(r.note ?? "", "בעצמ");
  // Audited.
  assert(ctx.crm.some((e) => e.startsWith("tool:generate_switch_kit")));
});

Deno.test("generate_switch_kit: resolves target by provider+name (cheapest match)", async () => {
  const ctx = fakeCtx();
  const r = await generateSwitchKit(ctx, {
    fromProvider: "סלקום",
    toProvider: "פרטנר",
    category: "cellular",
  });
  assert(r.ok);
  assertEquals(r.data!.toPlanId, "c2"); // פרטנר's only cellular row
  assertEquals(r.data!.fromProvider, "סלקום");
});

Deno.test("generate_switch_kit: REFUSES when target plan can't resolve to a real row", async () => {
  const ctx = fakeCtx();
  const r = await generateSwitchKit(ctx, {
    fromProvider: "פרטנר",
    toProvider: "ספק שלא קיים",
  });
  assert(!r.ok);
  assertEquals(r.reason, "not_found");
  // Nothing fabricated.
  assertEquals(r.data, undefined);
});

Deno.test("generate_switch_kit: REFUSES without a current provider", async () => {
  const ctx = fakeCtx();
  const r = await generateSwitchKit(ctx, { toPlanId: "c1" });
  assert(!r.ok);
  assertEquals(r.reason, "invalid");
});

Deno.test("generate_switch_kit: honest saving surfaces with a real bill", async () => {
  const ctx = fakeCtx();
  const r = await generateSwitchKit(ctx, {
    fromProvider: "פרטנר",
    toPlanId: "c1",
    currentBill: 90,
  });
  assert(r.ok);
  assertEquals(r.data!.annualSavingUpTo, (90 - 49) * 12);
});
