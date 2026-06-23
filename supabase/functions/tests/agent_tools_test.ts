// Smoke tests for the AI agent core — _shared/tools.ts and _shared/agent.ts.
//
// tools.ts is tested directly (pure-ish: a fake ToolContext injects the catalogue
// + audit/lead sinks, no network). The focus is the COMPLIANCE + grounding
// guarantees: consent-gated leads, §7b disclosure surfaced, real-data-only,
// audit hooks fire.
//
// agent.ts is tested via its GRACEFUL-FALLBACK contract: with no Gemini key and
// no providers, the tool loop and text chain both no-op, so it must reach the
// caller's templateFallback (never hard-fail a customer message).
// No network, no env. Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import {
  analyzeBill,
  bookCallback,
  COMMISSION_DISCLOSURE,
  createLead,
  escalateToHuman,
  getProvider,
  recommendPlans,
  searchPlans,
  type ToolContext,
} from "../_shared/tools.ts";
import { runAgent } from "../_shared/agent.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
  { id: "c3", cat: "cellular", provider: "פלאפון", plan: "פרימיום", price: 99, is5G: true, after: 129 },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, net: "fiber" },
  { id: "a1", cat: "abroad", provider: "Airalo eSIM", plan: "eSIM 5GB", price: 35, hasAbroad: true, priceUnit: "package" },
];

// A fake ToolContext that records audit + security events and lets a test decide
// what captureLead returns.
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

// ── search_plans: real catalogue rows only ────────────────────────────────────

Deno.test("search_plans returns real in-category rows, cheapest first", async () => {
  const ctx = fakeCtx();
  const r = await searchPlans(ctx, { category: "cellular" });
  assert(r.ok);
  const plans = r.data!.plans as Array<Record<string, unknown>>;
  assertEquals(plans.map((p) => p.id), ["c2", "c1", "c3"]); // 29, 49, 99
  // Every returned row is a real catalogue id (no invention).
  for (const p of plans) assert(["c1", "c2", "c3"].includes(p.id as string));
  assert(ctx.crm.some((e) => e.startsWith("tool:search_plans")));
});

Deno.test("search_plans budget filter only narrows when >=3 rows qualify under it", async () => {
  // Under-budget rule mirrors the catalogue helper: drop over-budget rows ONLY
  // when at least 3 still qualify (so we never strip the list down to 1-2). With
  // budget 60 only 2 cellular rows (29, 49) are under, so c3 (99) is KEPT.
  const ctxFew = fakeCtx();
  const few = await searchPlans(ctxFew, { category: "cellular", budget: 60 });
  const fewIds = (few.data!.plans as Array<Record<string, unknown>>).map((p) => p.id);
  assert(fewIds.includes("c3"), "2 under-budget < 3 ⇒ no narrowing, over-budget kept");

  // Now make >=3 qualify under budget: the over-budget row (99) is dropped.
  const big: ScorablePlan[] = [
    ...PLANS,
    { id: "c4", cat: "cellular", provider: "X", plan: "p", price: 39 },
    { id: "c5", cat: "cellular", provider: "Y", plan: "p", price: 55 },
  ];
  const ctxMany = fakeCtx({ plans: big });
  const many = await searchPlans(ctxMany, { category: "cellular", budget: 60 });
  const manyIds = (many.data!.plans as Array<Record<string, unknown>>).map((p) => p.id);
  assert(!manyIds.includes("c3"), "4 under-budget >=3 ⇒ narrowed, 99 dropped");
});

Deno.test("search_plans abroad filter only returns abroad-capable rows", async () => {
  const ctx = fakeCtx();
  const r = await searchPlans(ctx, { category: "abroad", abroad: true });
  const plans = r.data!.plans as Array<Record<string, unknown>>;
  assertEquals(plans.length, 1);
  assertEquals(plans[0].id, "a1");
});

// ── recommend_plans: scoring.ts grounding + honest savings ────────────────────

Deno.test("recommend_plans ranks via scoring.ts and omits savings without a bill", async () => {
  const ctx = fakeCtx();
  const r = await recommendPlans(ctx, { category: "cellular", priority: "price" });
  assert(r.ok);
  assertEquals(r.data!.hasBaseline, false);
  const recs = r.data!.recommendations as Array<Record<string, unknown>>;
  assert(recs.length > 0 && recs.length <= 3);
  // No annualSaving promised when there's no current bill.
  for (const rec of recs) assertEquals(rec.annualSaving, undefined);
  // Every rec carries a real catalogue id + an explainable score.
  for (const rec of recs) {
    assert(["c1", "c2", "c3"].includes(rec.id as string));
    assert(typeof rec.score === "number");
  }
});

Deno.test("recommend_plans surfaces an honest saving WHEN a real bill is given", async () => {
  const ctx = fakeCtx();
  const r = await recommendPlans(ctx, { category: "cellular", priority: "price", currentBill: 90 });
  assertEquals(r.data!.hasBaseline, true);
  const recs = r.data!.recommendations as Array<Record<string, unknown>>;
  // The 29₪ plan vs a 90₪ bill ⇒ (90-29)*12 = 732.
  const cheap = recs.find((x) => x.id === "c2")!;
  assertEquals(cheap.annualSaving, (90 - 29) * 12);
});

// ── get_provider: real facts, refuses unknown ─────────────────────────────────

Deno.test("get_provider returns real per-category cheapest, refuses unknown brand", async () => {
  const ctx = fakeCtx();
  const ok = await getProvider(ctx, { name: "סלקום" });
  assert(ok.ok);
  assertEquals(ok.data!.provider, "סלקום");
  assertEquals(ok.data!.planCount, 1);

  const bad = await getProvider(ctx, { name: "ספק שלא קיים" });
  assert(!bad.ok);
  assertEquals(bad.reason, "not_found");
});

// ── analyze_bill: honest 'up to' saving, refuses no amount ─────────────────────

Deno.test("analyze_bill needs a real amount and returns cheaper real options", async () => {
  const ctx = fakeCtx();
  const none = await analyzeBill(ctx, { provider: "סלקום", monthly: 0, category: "cellular" });
  assert(!none.ok);
  assertEquals(none.reason, "invalid");

  const r = await analyzeBill(ctx, { provider: "סלקום", monthly: 80, category: "cellular" });
  assert(r.ok);
  assertEquals(r.data!.monthly, 80);
  const opts = r.data!.cheaperOptions as Array<Record<string, unknown>>;
  // Real cheaper rows only (29, 49 < 80), each with an "up to" saving.
  for (const o of opts) assert((o.price as number) < 80);
});

// ── create_lead: the consent gate (§30A / §11) ────────────────────────────────

Deno.test("create_lead REFUSES without consent and writes nothing", async () => {
  let captureCalled = false;
  const ctx = fakeCtx({ captureLead: () => { captureCalled = true; return Promise.resolve("captured"); } });
  const r = await createLead(ctx, { name: "דנה", phone: "0501234567", consent: false });
  assert(!r.ok);
  assertEquals(r.reason, "consent_required");
  assertEquals(captureCalled, false, "no capture attempt without consent");
});

Deno.test("create_lead refuses an incomplete name/phone even WITH consent", async () => {
  let captureCalled = false;
  const ctx = fakeCtx({ captureLead: () => { captureCalled = true; return Promise.resolve("captured"); } });
  const r = await createLead(ctx, { name: "ד", phone: "", consent: true });
  assert(!r.ok);
  assertEquals(r.reason, "incomplete");
  assertEquals(captureCalled, false);
});

Deno.test("create_lead with consent + valid details captures and surfaces §7b disclosure", async () => {
  const ctx = fakeCtx({ captureLead: () => Promise.resolve("captured") });
  const r = await createLead(ctx, { name: "דנה כהן", phone: "0501234567", consent: true, category: "cellular" });
  assert(r.ok);
  assertEquals(r.data!.captured, true);
  assert(r.note!.includes(COMMISSION_DISCLOSURE.slice(0, 20)), "§7b commission disclosure surfaced");
  // Consent provenance is audited.
  assert(ctx.sec.some((e) => e.event === "agent_lead_consent" && e.detail.consent === true));
});

Deno.test("create_lead reports an error when the capture sink fails (fail-soft)", async () => {
  const ctx = fakeCtx({ captureLead: () => Promise.resolve("error") });
  const r = await createLead(ctx, { name: "דנה כהן", phone: "0501234567", consent: true });
  assert(!r.ok);
  assertEquals(r.reason, "error");
});

// ── book_callback: same consent gate ──────────────────────────────────────────

Deno.test("book_callback inherits the consent gate", async () => {
  const ctx = fakeCtx({ captureLead: () => Promise.resolve("captured") });
  const refused = await bookCallback(ctx, { slot: "בערב", name: "דנה", phone: "0501234567", consent: false });
  assert(!refused.ok);
  assertEquals(refused.reason, "consent_required");

  const ok = await bookCallback(ctx, { slot: "בערב", name: "דנה כהן", phone: "0501234567", consent: true });
  assert(ok.ok);
});

// ── escalate_to_human: no consent needed; always reassures ────────────────────

Deno.test("escalate_to_human never fails the customer and flips the gate", async () => {
  let escalated = false;
  const ctx = fakeCtx({ escalate: (reason: string) => { escalated = !!reason; return true; } });
  const r = await escalateToHuman(ctx, { reason: "המשתמש מתעקש" });
  assert(r.ok);
  assertEquals(escalated, true);
  assert(ctx.sec.some((e) => e.event === "agent_escalation"));
});

// ── runAgent: graceful degradation to the template fallback ───────────────────

Deno.test("runAgent reaches templateFallback when no AI providers are configured", async () => {
  const res = await runAgent({
    channel: "whatsapp",
    message: "מה הכי זול בסלולר?",
    keys: {}, // no gemini/groq/openrouter → tool loop + text chain both no-op
    plans: PLANS,
    toolContext: { conversationId: "c", contactId: "p" },
    templateFallback: () => "תשובת תבנית גיבוי",
  });
  assertEquals(res.via, "template");
  assertEquals(res.reply, "תשובת תבנית גיבוי");
});

Deno.test("runAgent never hard-fails: hard fallback when even the template throws", async () => {
  const res = await runAgent({
    channel: "site",
    message: "שלום",
    keys: {},
    plans: PLANS,
    toolContext: {},
    templateFallback: () => { throw new Error("template down"); },
  });
  assertEquals(res.via, "hard_fallback");
  assert(res.reply.length > 0, "customer always gets a reply");
});
