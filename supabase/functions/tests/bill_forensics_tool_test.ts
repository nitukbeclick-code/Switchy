// Tests for the GROUNDED bill-forensics enhancement of the analyze_bill agent tool
// (_shared/tools.ts). The forensics block must give a sharp, HONEST overpay verdict:
// the user's monthly vs the CHEAPEST REAL catalogue plan in the category, the
// monthly AND annual gap (gap*12, clamped >=0), and a real-field framing line — and
// it must NEVER fabricate a saving when nothing is genuinely cheaper.
//
// Pure-ish: a fake ToolContext injects the catalogue + audit sink, no network/env.
// Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import { analyzeBill, type ToolContext } from "../_shared/tools.ts";
import { annualSaving } from "../_shared/catalogue.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

// A small real catalogue. The cheapest cellular regular plan is c2 (₪29); c3 (₪99)
// is the dearest. a1 is abroad (per-package). c4 is a one-off/promo `kind` that the
// floor must IGNORE (regular-only), even though it's the lowest raw number.
const PLANS: (ScorablePlan & { kind?: string })[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
  { id: "c3", cat: "cellular", provider: "פלאפון", plan: "פרימיום", price: 99, is5G: true, after: 129 },
  { id: "c4", cat: "cellular", provider: "Promo", plan: "מבצע", price: 1, kind: "promo" },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99 },
  { id: "a1", cat: "abroad", provider: "Airalo eSIM", plan: "eSIM 5GB", price: 35, hasAbroad: true, priceUnit: "package" },
];

function fakeCtx(opts: Partial<ToolContext> = {}): ToolContext & { crm: string[] } {
  const crm: string[] = [];
  const ctx = {
    plans: PLANS,
    channel: "whatsapp" as const,
    conversationId: "conv-1",
    contactId: "contact-1",
    logCrmEvent: (ev: { actor: string; event: string; preview?: string }) => {
      crm.push(`${ev.event}:${ev.preview ?? ""}`);
    },
    ...opts,
    crm,
  };
  return ctx as ToolContext & { crm: string[] };
}

// ── 1. REAL overpay math: monthly + annual gap vs the cheapest real plan ───────

Deno.test("analyze_bill forensics: real overpay math vs the cheapest real catalogue plan", async () => {
  const ctx = fakeCtx();
  // Paying ₪80 in cellular; cheapest real regular plan is c2 (₪29).
  const r = await analyzeBill(ctx, { provider: "סלקום", monthly: 80, category: "cellular" });
  assert(r.ok);

  const f = r.data!.forensics as Record<string, unknown>;
  assert(f, "forensics block present when a category anchors the floor");
  assertEquals(f.overpaying, true);
  assertEquals(f.monthlyOverpay, 80 - 29); // 51/month
  assertEquals(f.annualOverpay, annualSaving(80, 29)); // (80-29)*12 = 612, via the shared helper
  assertEquals(f.annualOverpay, 612);

  // The floor must be the cheapest REAL REGULAR row — c2, NOT the ₪1 promo c4.
  const cheapest = f.cheapestPlan as Record<string, unknown>;
  assertEquals(cheapest.id, "c2");
  assertEquals(cheapest.price, 29);

  // A grounded framing line is surfaced (and echoed as the tool note) — no fabrication.
  assert(typeof f.framing === "string" && (f.framing as string).length > 0);
  assertEquals(r.note, f.framing);
  assert((f.framing as string).includes("51"), "framing states the real monthly gap");

  // Annual overpay is exactly monthly*12 (no drift between the two figures).
  assertEquals(f.annualOverpay, (f.monthlyOverpay as number) * 12);

  await audit_present(ctx);
});

// ── 2. Zero/negative overpay HONESTY: no fabricated saving ─────────────────────

Deno.test("analyze_bill forensics: at/below the floor, it is HONEST (no overpay, no fake saving)", async () => {
  const ctx = fakeCtx();
  // Paying ₪29 — exactly the cheapest real plan. There is no genuine saving.
  const same = await analyzeBill(ctx, { provider: "פרטנר", monthly: 29, category: "cellular" });
  assert(same.ok);
  const fSame = same.data!.forensics as Record<string, unknown>;
  assertEquals(fSame.overpaying, false);
  assertEquals(fSame.monthlyOverpay, 0);
  assertEquals(fSame.annualOverpay, 0, "no saving promised when already at the floor");
  // The honest framing acknowledges they're already in line with the market floor.
  assert((fSame.framing as string).includes("בקו אחד"));

  // Paying LESS than any catalogue plan (₪20 < ₪29): still clamped to 0, never negative.
  const below = await analyzeBill(ctx, { monthly: 20, category: "cellular" });
  assert(below.ok);
  const fBelow = below.data!.forensics as Record<string, unknown>;
  assertEquals(fBelow.overpaying, false);
  assertEquals(fBelow.monthlyOverpay, 0);
  assertEquals(fBelow.annualOverpay, 0);
  // cheaperOptions must be EMPTY here — nothing is strictly cheaper than ₪20.
  assertEquals((below.data!.cheaperOptions as unknown[]).length, 0);
});

// ── 3. No fabrication when the catalogue has nothing cheaper in the category ───

Deno.test("analyze_bill forensics: empty/cheaper-less category never invents a saving", async () => {
  // A catalogue whose ONLY cellular plan is pricier than the bill.
  const pricey: ScorablePlan[] = [
    { id: "x1", cat: "cellular", provider: "סלקום", plan: "יקר", price: 120, is5G: true },
    { id: "x2", cat: "internet", provider: "בזק", plan: "סיב", price: 99 },
  ];
  const ctx = fakeCtx({ plans: pricey });
  // Paying ₪90, but the only cellular plan is ₪120 — there's nothing cheaper.
  const r = await analyzeBill(ctx, { provider: "סלקום", monthly: 90, category: "cellular" });
  assert(r.ok);

  const f = r.data!.forensics as Record<string, unknown>;
  assertEquals(f.overpaying, false, "the cheapest real plan is dearer ⇒ no overpay");
  assertEquals(f.monthlyOverpay, 0);
  assertEquals(f.annualOverpay, 0);
  // The floor is the real (pricier) row — we surface it honestly, not a fake cheaper one.
  assertEquals((f.cheapestPlan as Record<string, unknown>).id, "x1");
  // And no cheaper options are fabricated.
  assertEquals((r.data!.cheaperOptions as unknown[]).length, 0);

  // With NO category at all, there is no floor to anchor — forensics is null (honest),
  // and the tool still succeeds with just the (empty) cheaperOptions list.
  const noCat = await analyzeBill(ctx, { monthly: 90 });
  assert(noCat.ok);
  assertEquals(noCat.data!.forensics, null);
});

// ── 4. same-provider framing + invalid amount still refuses ────────────────────

Deno.test("analyze_bill forensics: flags when even the user's OWN provider is cheaper", async () => {
  const ctx = fakeCtx();
  // User is with פרטנר paying ₪80; פרטנר's own c2 (₪29) is the floor.
  const r = await analyzeBill(ctx, { provider: "פרטנר", monthly: 80, category: "cellular" });
  assert(r.ok);
  const f = r.data!.forensics as Record<string, unknown>;
  const cheapest = f.cheapestPlan as Record<string, unknown>;
  assertEquals(cheapest.sameProvider, true, "the floor row is the user's own provider");
  assert((f.framing as string).includes("עצמם"), "framing calls out the same-provider angle");
});

Deno.test("analyze_bill still refuses a non-positive amount (forensics never runs)", async () => {
  const ctx = fakeCtx();
  const none = await analyzeBill(ctx, { provider: "סלקום", monthly: 0, category: "cellular" });
  assert(!none.ok);
  assertEquals(none.reason, "invalid");
  assertEquals(none.data, undefined);
});

// Shared assertion: the tool audited its run (best-effort CRM event fired).
function audit_present(ctx: ToolContext & { crm: string[] }): void {
  assert(ctx.crm.some((e) => e.startsWith("tool:analyze_bill")), "analyze_bill audits its run");
}
