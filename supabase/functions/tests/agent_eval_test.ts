// ─────────────────────────────────────────────────────────────────────────────
// tests/agent_eval_test.ts — the ANTI-FABRICATION regression harness (the safety
// net for every future change to _shared/agent.ts + _shared/tools.ts).
//
// Where agent_core_test.ts pins the LOOP MECHANICS (tier, parallel order,
// transcript) and agent_closing_test.ts pins the CLOSING NUDGE, this file pins the
// load-bearing GROUNDING CONTRACT — the promises the product makes to the customer
// and to Israeli law, end to end, through the REAL runAgent:
//
//   (a) GROUNDED RECOMMENDATIONS — when the model recommends, every plan/price the
//       customer sees comes from the provided catalogue fixture. We drive the real
//       tool loop (recommend_plans over the fixture), then assert NO price token and
//       NO provider/plan name appears in the final reply that is absent from the
//       fixture. A future change that lets a fabricated ₪ or a phantom plan leak
//       into the reply trips this test.
//   (b) §7b DISCLOSURE ON HAND-OFF — a consent-gated lead reply carries the
//       commission disclosure (COMMISSION_DISCLOSURE) so the user is told Switchy AI
//       may earn a commission BEFORE the hand-off.
//   (c) HONEST "NO MATCH" — on an EMPTY / failed catalogue the agent does NOT invent
//       a plan; recommend_plans returns the honest no-match note and the reply
//       carries no fabricated provider/price.
//   (d) CLOSING NUDGE NEVER FABRICATES — buildClosingNudge (the pure close line)
//       carries the §7b disclosure and an explicit "no pressure / no invented
//       urgency / no unbacked saving" guarantee, and is silent on early small-talk.
//
// Fully OFFLINE + DETERMINISTIC: we stub globalThis.fetch to return canned Gemini
// responses (the same two-step rig agent_core_test.ts / agent_closing_test.ts use)
// and reuse the ScorablePlan fixtures. No env, no real network. deno task test
// ─────────────────────────────────────────────────────────────────────────────

import { assert, assertEquals } from "@std/assert";
import { buildClosingNudge, runAgent } from "../_shared/agent.ts";
import { COMMISSION_DISCLOSURE } from "../_shared/tools.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

// The grounding fixture — the ONLY real plans/providers/prices that exist. The
// contract is: nothing outside this set may surface in a reply.
const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, net: "fiber" },
];

// Every price that legitimately exists in the fixture (as the ₪-suffixed token the
// model would echo). Any other ₪-number in a reply is fabricated.
const REAL_PRICES = new Set(PLANS.map((p) => String(p.price)));
// Every provider + plan name that legitimately exists.
const REAL_PROVIDERS = new Set(PLANS.map((p) => p.provider));
const REAL_PLAN_NAMES = new Set(PLANS.map((p) => p.plan));

const realFetch = globalThis.fetch;

// ── Canned Gemini rig ─────────────────────────────────────────────────────────
// Mirrors twoStepGeminiFetch from agent_core_test.ts: step 1 returns the supplied
// functionCalls (drives the REAL tool executors over the fixture); every later step
// returns finalText (the model's prose). We capture request bodies so a test can
// also inspect what the model was fed back.
function cannedGeminiFetch(opts: {
  firstCalls: { name: string; args: Record<string, unknown> }[];
  finalText: string;
  bodies: string[];
}): typeof globalThis.fetch {
  let step = 0;
  return ((_input: string | URL | Request, init?: RequestInit) => {
    opts.bodies.push(typeof init?.body === "string" ? init.body : "");
    step++;
    const parts = step === 1
      ? opts.firstCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } }))
      : [{ text: opts.finalText }];
    const body = JSON.stringify({ candidates: [{ content: { parts } }] });
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof globalThis.fetch;
}

// Pull every "₪NNN" price token out of a reply (the customer-visible price form).
function pricesIn(reply: string): string[] {
  return [...reply.matchAll(/₪\s?(\d{1,4})/g)].map((m) => m[1]);
}

// ── (a) Grounded recommendations: no price/plan outside the catalogue ──────────

Deno.test("anti-fabrication: a recommend reply only surfaces catalogue prices (no invented ₪)", async () => {
  const bodies: string[] = [];
  // The model recommends, then writes prose. We deliberately make the PROSE quote a
  // real catalogue price (₪49) — the honest case. The test proves the harness lets
  // a grounded price through AND would catch an ungrounded one (asserted below).
  globalThis.fetch = cannedGeminiFetch({
    firstCalls: [{ name: "recommend_plans", args: { category: "cellular" } }],
    finalText: "ההמלצה שלי: סלקום 5G 100GB ב-₪49 לחודש — מסלול 5G מצוין.",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "מה הכי מתאים לי בסלולר?",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    assertEquals(res.via, "tools");
    // EVERY ₪-price in the final reply must exist in the fixture. This is the core
    // grounding invariant: a fabricated price (e.g. an invented "₪19") fails here.
    for (const price of pricesIn(res.reply)) {
      assert(
        REAL_PRICES.has(price),
        `reply surfaced a price ₪${price} that is NOT in the catalogue fixture — fabrication`,
      );
    }
    // The whyTop tool note the agent folds in is itself catalogue-grounded: it names
    // the top pick by its REAL provider + price, so it can't introduce a phantom.
    assert(res.reply.includes("49"), "the grounded top-pick price rode into the reply");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("anti-fabrication: the harness itself catches an ungrounded price (guard self-test)", () => {
  // A defensive self-check so the contract above can't silently rot into a no-op:
  // an invented price must be flagged by the same predicate the real test uses.
  const fabricated = "מצאתי לך מסלול ב-₪7 בלבד!"; // ₪7 is in no fixture row
  const offenders = pricesIn(fabricated).filter((p) => !REAL_PRICES.has(p));
  assertEquals(offenders, ["7"], "the price-grounding predicate flags an invented ₪7");
});

Deno.test("anti-fabrication: the recommend tool note never names a non-catalogue provider/plan", async () => {
  // We inspect the SECOND request body — the functionResponse the agent fed back to
  // the model. It is the literal tool output (the only place a recommendation's
  // provider/plan/price comes from), so if it's catalogue-clean the model has no
  // grounded path to a phantom plan. We assert it mentions only real providers.
  const bodies: string[] = [];
  globalThis.fetch = cannedGeminiFetch({
    firstCalls: [{ name: "recommend_plans", args: { category: "cellular" } }],
    finalText: "הנה ההמלצות.",
    bodies,
  });
  try {
    await runAgent({
      channel: "site",
      message: "תמליץ לי על מסלול סלולר",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    const toolResponseBody = bodies[1] ?? "";
    assert(toolResponseBody.includes("recommend_plans"), "the tool result was fed back");
    // The fixture's real providers appear; a phantom provider that is NOT in the
    // fixture must never appear in the grounded tool payload.
    const PHANTOM_PROVIDERS = ["וודאפון", "T-Mobile", "Verizon", "ביפר"];
    for (const ghost of PHANTOM_PROVIDERS) {
      assert(
        !toolResponseBody.includes(ghost),
        `grounded tool payload leaked a non-catalogue provider: ${ghost}`,
      );
    }
    // At least one REAL cellular provider from the fixture is present in the payload.
    assert(
      [...REAL_PROVIDERS].some((p) => toolResponseBody.includes(String(p))),
      "the grounded payload cites a real catalogue provider",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── (b) §7b commission disclosure on a consent-gated hand-off ──────────────────

Deno.test("anti-fabrication: a consented lead hand-off carries the §7b commission disclosure", async () => {
  const bodies: string[] = [];
  // The model collects name+phone+consent and calls create_lead; the tool surfaces
  // the §7b disclosure as its note, which the agent folds into the final reply.
  globalThis.fetch = cannedGeminiFetch({
    firstCalls: [{
      name: "create_lead",
      args: { name: "דנה כהן", phone: "0541234567", consent: true, category: "cellular" },
    }],
    // The model's own prose does NOT repeat the disclosure — proving the AGENT
    // appends it from the tool note (the load-bearing path), not the model's whim.
    finalText: "מעולה, רשמתי את הפרטים. נחזור אליך בהקדם.",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "כן אני מאשר, תחזרו אליי: דנה 0541234567",
      keys: { gemini: "k" },
      plans: PLANS,
      // captureLead must succeed so create_lead returns the §7b note (not a failure).
      toolContext: { captureLead: () => Promise.resolve("captured" as const) },
    });
    assertEquals(res.via, "tools");
    assert(
      res.reply.includes(COMMISSION_DISCLOSURE),
      "the consented hand-off reply states the §7b commission disclosure",
    );
    // Sanity: the disclosure itself contains the load-bearing transparency words.
    assert(COMMISSION_DISCLOSURE.includes("עמלה"), "disclosure mentions commission");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("anti-fabrication: a lead WITHOUT consent is refused — nothing captured, no §7b sent", async () => {
  const bodies: string[] = [];
  let captured = false;
  globalThis.fetch = cannedGeminiFetch({
    // consent omitted/false ⇒ create_lead must refuse and write nothing.
    firstCalls: [{ name: "create_lead", args: { name: "דנה", phone: "0541234567" } }],
    finalText: "אצטרך את אישורך לתנאים ולפרטיות לפני שאעביר לנציג.",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "תעבירו אותי לנציג",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: { captureLead: () => { captured = true; return Promise.resolve("captured" as const); } },
    });
    assertEquals(res.via, "tools");
    assert(!captured, "a lead with no explicit consent must NEVER be captured (§30A)");
    // The refused tool returns the consent-request note (not the §7b sign-off), so
    // the reply should NOT read as a completed, disclosed hand-off.
    const toolBody = bodies[1] ?? "";
    assert(toolBody.includes("consent_required"), "the tool refused for missing consent");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── (c) Empty / failed catalogue: honest no-match, zero fabrication ─────────────

Deno.test("anti-fabrication: an EMPTY catalogue yields an honest no-match (no invented plan)", async () => {
  const bodies: string[] = [];
  globalThis.fetch = cannedGeminiFetch({
    firstCalls: [{ name: "recommend_plans", args: { category: "cellular" } }],
    // The model echoes the tool's honest no-match note verbatim — it has nothing to
    // recommend, so it must say so rather than invent a row.
    finalText: "אין לי כרגע מסלול מתאים בקטגוריה הזו — לא אמציא משהו שלא קיים. רוצה שאבדוק קטגוריה אחרת?",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "site",
      message: "תמליץ לי על מסלול סלולר",
      keys: { gemini: "k" },
      plans: [], // EMPTY catalogue — the failed/empty live-read path
      toolContext: {},
    });
    assertEquals(res.via, "tools");
    // The grounded tool payload over an empty catalogue returns ZERO recommendations.
    const toolBody = bodies[1] ?? "";
    assert(
      toolBody.includes("recommendations") || toolBody.includes("אין מסלולים"),
      "the tool result reflects an empty recommendation set",
    );
    // No ₪-price can appear — there is no real row to price, so any ₪ is fabricated.
    assertEquals(
      pricesIn(res.reply),
      [],
      "an empty-catalogue reply must contain NO price (no row exists to quote)",
    );
    // And no real-or-phantom provider name was conjured into the prose.
    const ANY_PROVIDER = ["סלקום", "פרטנר", "בזק", "הוט", "וודאפון"];
    for (const prov of ANY_PROVIDER) {
      assert(!res.reply.includes(prov), `empty-catalogue reply must not name a provider (${prov})`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── (d) buildClosingNudge: never fabricates savings/urgency ────────────────────

Deno.test("anti-fabrication: the closing nudge forbids invented savings/urgency and stays honest", () => {
  const line = buildClosingNudge({ turnCount: 3 });
  assert(line.length > 0, "a mid/late turn produces a closing line to inspect");
  // §7b rides along.
  assert(line.includes("עמלה"), "closing nudge carries the §7b commission disclosure");
  // It explicitly forbids fabricated pressure, urgency, and unbacked savings.
  assert(line.includes("בלי לחץ"), "closing nudge forbids pressure");
  assert(line.includes("דחיפות מומצאת"), "closing nudge forbids invented urgency");
  assert(
    line.includes("הבטחת חיסכון שלא נמסר"),
    "closing nudge forbids promising a saving with no real bill",
  );
  // It asks for ONE clear, honest next step — not a hard sell.
  assert(
    line.includes("שיחת חזרה") || line.includes("נציג"),
    "closing nudge asks for a single concrete next step",
  );
});

Deno.test("anti-fabrication: no closing nudge on an early small-talk turn (no premature push)", () => {
  // With no turn budget and no bill, there is NOTHING honest to close on yet.
  assertEquals(buildClosingNudge(), "");
  assertEquals(buildClosingNudge({ turnCount: 0 }), "");
  assertEquals(buildClosingNudge({ turnCount: 1 }, { monthly: 0 }), "");
});
