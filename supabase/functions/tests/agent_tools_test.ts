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
  generateReferralCode,
  getProvider,
  recommendPlans,
  searchPlans,
  suggestRetentionOffer,
  type ToolContext,
} from "../_shared/tools.ts";
import { detectLang, runAgent } from "../_shared/agent.ts";
import { buildReferralRow, makeReferralCode, normalizeReferralCode } from "../_shared/referrals.ts";
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

// ── detectLang: script-based language detection (multilingual support) ─────────

Deno.test("detectLang classifies by dominant script, defaults to Hebrew", () => {
  assertEquals(detectLang("מה הכי זול בסלולר?"), "he");
  assertEquals(detectLang("ما هي أرخص باقة خلوية؟"), "ar");
  assertEquals(detectLang("Какой самый дешёвый тариф?"), "ru");
  assertEquals(detectLang("What is the cheapest cellular plan?"), "en");
  // Neutral input (digits / emoji / punctuation only) → Hebrew default.
  assertEquals(detectLang("123 ₪ 😀 ?!"), "he");
  assertEquals(detectLang(""), "he");
  // Dominant script wins over a few stray Latin chars (provider name "5G").
  assertEquals(detectLang("אני רוצה מסלול 5G זול"), "he");
  assertEquals(detectLang("I pay too much for סלקום"), "en");
});

Deno.test("runAgent honours an explicit lang override and stays backward-compatible", async () => {
  // Explicit lang + no providers → still degrades to the template (the override
  // only changes the reply language of the AI paths, never the fallback contract).
  const res = await runAgent({
    channel: "site",
    message: "hello",
    lang: "en",
    keys: {},
    plans: PLANS,
    toolContext: {},
    templateFallback: () => "fallback",
  });
  assertEquals(res.via, "template");
  assertEquals(res.reply, "fallback");
});

// ── suggest_retention_offer: grounded market-rate negotiation script ──────────

Deno.test("suggest_retention_offer quotes the REAL cheapest comparable + same-provider rows", async () => {
  const ctx = fakeCtx();
  const r = await suggestRetentionOffer(ctx, { provider: "פלאפון", category: "cellular" });
  assert(r.ok);
  // Market floor in cellular is the 29₪ row (c2 / פרטנר), grounded — not invented.
  const market = r.data!.marketRate as Record<string, unknown>;
  assertEquals(market.id, "c2");
  assertEquals(market.price, 29);
  // Same-provider option is פלאפון's own cheapest cellular row (c3 / 99₪).
  const same = r.data!.sameProviderOption as Record<string, unknown>;
  assertEquals(same.id, "c3");
  // The script is a real note and references the market provider.
  assert(typeof r.note === "string" && r.note!.includes("פרטנר"));
  assert(ctx.crm.some((e) => e.startsWith("tool:suggest_retention_offer")));
});

Deno.test("suggest_retention_offer omits a saving without a bill, computes it WITH one", async () => {
  const noBill = await suggestRetentionOffer(fakeCtx(), { provider: "פלאפון", category: "cellular" });
  assertEquals(noBill.data!.hasBaseline, false);
  assertEquals((noBill.data!.marketRate as Record<string, unknown>).annualSavingUpTo, undefined);

  const withBill = await suggestRetentionOffer(fakeCtx(), { provider: "פלאפון", category: "cellular", currentBill: 90 });
  assertEquals(withBill.data!.hasBaseline, true);
  // 29₪ market floor vs a 90₪ bill ⇒ (90-29)*12 = 732 (reuses scoring.ts annualSaving).
  assertEquals((withBill.data!.marketRate as Record<string, unknown>).annualSavingUpTo, (90 - 29) * 12);
});

Deno.test("suggest_retention_offer never promises — the script frames it as negotiation only", async () => {
  const r = await suggestRetentionOffer(fakeCtx(), { provider: "פלאפון", category: "cellular", currentBill: 90 });
  // Honest framing: a starting point, the decision is the provider's.
  assert(r.note!.includes("לא הבטחה") || r.note!.includes("נקודת פתיחה"));
});

Deno.test("suggest_retention_offer replies in the user's language (Russian here)", async () => {
  const ctx = fakeCtx({ lang: "ru" });
  const r = await suggestRetentionOffer(ctx, { provider: "פלאפון", category: "cellular", currentBill: 90 });
  assert(r.ok);
  // The note is Russian; the grounded numbers/providers are the SAME real data.
  assert(/[Ѐ-ӿ]/.test(r.note!), "script rendered in Russian");
  assertEquals((r.data!.marketRate as Record<string, unknown>).id, "c2");
});

Deno.test("suggest_retention_offer refuses without a category (can't ground a script)", async () => {
  const r = await suggestRetentionOffer(fakeCtx(), { provider: "פלאפון" });
  assert(!r.ok);
  assertEquals(r.reason, "invalid");
});

// ── generate_referral_code: a REAL code, attribution, no cash reward ──────────

Deno.test("makeReferralCode mints a well-formed, unambiguous token", () => {
  const code = makeReferralCode(() => new Uint8Array([0, 1, 2, 3, 4, 5]));
  assert(/^SW-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code), code);
  // Deterministic given the rng seam.
  assertEquals(makeReferralCode(() => new Uint8Array([0, 0, 0, 0, 0, 0])), "SW-AAAAAA");
  // No ambiguous characters (0/O/1/I/L) ever appear in the alphabet.
  for (const c of "01OIL") assert(!"ABCDEFGHJKMNPQRSTUVWXYZ23456789".includes(c));
});

Deno.test("normalizeReferralCode + buildReferralRow are honest and attribution-only", () => {
  assertEquals(normalizeReferralCode(" sw-7kq4m9 "), "SW-7KQ4M9");
  const row = buildReferralRow({ channel: "whatsapp", contact: "0501234567", conversationId: "conv-1", name: "דנה" }, "sw-abc234");
  assertEquals(row.code, "SW-ABC234");
  assertEquals(row.channel, "whatsapp");
  assertEquals(row.referrer_contact, "0501234567");
  assertEquals(row.source, "agent");
  // No reward field is ever set by the builder (no cash promise).
  assert(!("reward" in row));
});

Deno.test("generate_referral_code persists via the sink and returns that code", async () => {
  let captured: Record<string, unknown> | null = null;
  const ctx = fakeCtx({
    issueReferral: (i) => { captured = i; return "SW-ISSUED"; },
  });
  const r = await generateReferralCode(ctx, { name: "דנה" });
  assert(r.ok);
  assertEquals(r.data!.code, "SW-ISSUED");
  assertEquals(r.data!.persisted, true);
  assertEquals(r.data!.reward, null, "no monetary reward advertised");
  assert(captured !== null && (captured as { channel?: string }).channel === "whatsapp");
  assert(r.note!.includes("SW-ISSUED"));
});

Deno.test("generate_referral_code fail-soft: still returns a real code when no sink", async () => {
  const ctx = fakeCtx(); // no issueReferral sink
  const r = await generateReferralCode(ctx, {});
  assert(r.ok);
  assert(/^SW-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(r.data!.code as string));
  assertEquals(r.data!.persisted, false);
});

Deno.test("generate_referral_code localizes the share note (English here)", async () => {
  const ctx = fakeCtx({ lang: "en", issueReferral: () => "SW-ENXY23" });
  const r = await generateReferralCode(ctx, {});
  assert(r.note!.includes("Your referral code"));
  assert(r.note!.includes("no cash reward"));
});
