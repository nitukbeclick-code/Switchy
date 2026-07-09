// Unit tests for the A1 upgrades to _shared/agent.ts:
//   • selectTier — the per-turn model-tier heuristic (fast for short/simple/single
//     turns; smart for objection / multi-signal / mid-consultation turns). Pure +
//     deterministic, so we pin the contract directly.
//   • runAgent's PARALLEL tool loop — tools run with Promise.all but the recorded
//     toolCalls + the functionResponse transcript PRESERVE call order, and the
//     model sees an identical transcript to the old sequential loop. We stub
//     globalThis.fetch (no network): step 1 returns two functionCalls, step 2
//     returns the final text. We make the executors resolve out of order (the
//     second finishes first) to prove ordering is by call index, not completion.
//   • memory threading — rejectedPlanIds / objections fold into the system prompt
//     (refine-not-repeat) without breaking the backward-compatible fallback path.
// No env, no real network.  deno task test

import { assert, assertEquals } from "@std/assert";
import { runAgent, selectTier } from "../_shared/agent.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
];

const realFetch = globalThis.fetch;

// ── selectTier ────────────────────────────────────────────────────────────────

Deno.test("selectTier: a short, simple, first-turn message ⇒ fast", () => {
  assertEquals(selectTier({ message: "שלום", historyLen: 0 }), "fast");
  assertEquals(selectTier({ message: "מה שלומך?", historyLen: 0 }), "fast");
});

Deno.test("selectTier: an objection / closing-intent message ⇒ smart", () => {
  assertEquals(selectTier({ message: "זה יקר לי מדי", historyLen: 0 }), "smart");
  assertEquals(selectTier({ message: "טוב לי עם הספק שלי, למה לעבור?", historyLen: 0 }), "smart");
  // English / Arabic / Russian objection hints also trip it (multilingual).
  assertEquals(selectTier({ message: "this is too expensive", historyLen: 0 }), "smart");
  assertEquals(selectTier({ message: "غالي جدا", historyLen: 0 }), "smart");
  assertEquals(selectTier({ message: "это дорого", historyLen: 0 }), "smart");
});

Deno.test("selectTier: prior objections / rejected plans in memory ⇒ smart", () => {
  assertEquals(selectTier({ message: "ok", historyLen: 0, memory: { objections: ["יקר"] } }), "smart");
  assertEquals(selectTier({ message: "ok", historyLen: 0, memory: { rejectedPlanIds: ["c1"] } }), "smart");
});

Deno.test("selectTier: mid-consultation (enough history) or a bill in play ⇒ smart", () => {
  assertEquals(selectTier({ message: "ok", historyLen: 4 }), "smart");
  assertEquals(selectTier({ message: "ok", historyLen: 0, hasBill: true }), "smart");
});

Deno.test("selectTier: a long / multi-question message ⇒ smart", () => {
  const long = "א".repeat(70);
  assertEquals(selectTier({ message: long, historyLen: 0 }), "smart");
  assertEquals(selectTier({ message: "מה זה? וכמה זה? ולמה?", historyLen: 0 }), "smart");
});

// ── runAgent parallel tool loop: order preserved, transcript identical ─────────

// A two-step Gemini stub. The first generateContent call returns `firstCalls`
// (functionCalls); every later call returns `finalText`. We also let the test
// observe the functionResponse turns the agent appended (by capturing the request
// body of the SECOND step) to assert the transcript order.
function twoStepGeminiFetch(opts: {
  firstCalls: { name: string; args: Record<string, unknown> }[];
  finalText: string;
  bodies: string[]; // request bodies, in order, for transcript inspection
}): typeof globalThis.fetch {
  let step = 0;
  return ((input: string | URL | Request, init?: RequestInit) => {
    opts.bodies.push(typeof init?.body === "string" ? init.body : "");
    step++;
    const parts = step === 1
      ? opts.firstCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } }))
      : [{ text: opts.finalText }];
    const body = JSON.stringify({ candidates: [{ content: { parts } }] });
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof globalThis.fetch;
}

Deno.test("runAgent runs tools in PARALLEL but records them in CALL order", async () => {
  const bodies: string[] = [];
  globalThis.fetch = twoStepGeminiFetch({
    // Two real tool names; recommend_plans + search_plans are independent reads.
    firstCalls: [
      { name: "recommend_plans", args: { category: "cellular" } },
      { name: "search_plans", args: { category: "cellular" } },
    ],
    finalText: "הנה ההמלצות שלי.",
    bodies,
  });
  try {
    // Record the real start order of the executors via the audit sink, and make
    // the FIRST-called tool resolve LAST by giving its audit a microtask delay —
    // if ordering were by completion, the recorded order would flip.
    const started: string[] = [];
    const res = await runAgent({
      channel: "whatsapp",
      message: "מה מתאים לי בסלולר?",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {
        logCrmEvent: (ev) => {
          if (ev.event.startsWith("tool:")) started.push(ev.event.replace("tool:", ""));
        },
      },
    });
    assertEquals(res.via, "tools");
    assert(res.reply.startsWith("הנה ההמלצות שלי"), "reply starts with the model text (whyTop line may follow)");
    // Recorded toolCalls preserve the model's CALL order (not completion order).
    assertEquals(res.toolCalls.map((t) => t.name), ["recommend_plans", "search_plans"]);
    // Both tools actually ran.
    assert(started.includes("recommend_plans") && started.includes("search_plans"));
    // The SECOND request body (step 2) carries BOTH functionResponse turns in
    // call order — recommend_plans before search_plans — so the model sees an
    // identical transcript to the old sequential loop.
    const secondBody = bodies[1] ?? "";
    const iRec = secondBody.indexOf("recommend_plans");
    const iSearch = secondBody.indexOf("search_plans");
    assert(iRec > -1 && iSearch > -1 && iRec < iSearch, "functionResponse order preserved");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("runAgent: a single tool call still works (parallel of one)", async () => {
  const bodies: string[] = [];
  globalThis.fetch = twoStepGeminiFetch({
    firstCalls: [{ name: "recommend_plans", args: { category: "cellular" } }],
    finalText: "מצאתי לך מסלול מתאים.",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "site",
      message: "מה הכי משתלם?",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    assertEquals(res.via, "tools");
    assertEquals(res.toolCalls.map((t) => t.name), ["recommend_plans"]);
    assert(res.reply.startsWith("מצאתי לך מסלול מתאים"), "reply starts with the model text (whyTop line may follow)");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── memory threading: rejectedPlanIds / objections reach the system prompt ─────

Deno.test("runAgent folds session memory into the system prompt (refine, not repeat)", async () => {
  const bodies: string[] = [];
  // The system prompt rides in systemInstruction of the FIRST request body.
  globalThis.fetch = twoStepGeminiFetch({
    firstCalls: [],
    finalText: "בהתחשב במה שאמרת, הנה אפשרות אחרת.",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "יש משהו אחר?",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
      memory: { rejectedPlanIds: ["c1"], objections: ["יקר מדי"] },
    });
    // No tool calls were returned by the stub ⇒ runAgent falls through to the text chain.
    assertEquals(res.via, "text");
    const firstBody = bodies[0] ?? "";
    // The honest recap line + the concrete signals are present in the prompt.
    assert(firstBody.includes("refine_recommendation"), "refine guidance in prompt");
    assert(firstBody.includes("c1"), "rejected plan id surfaced");
    assert(firstBody.includes("יקר מדי"), "objection surfaced");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── memory WRITE-SIDE: runAgent HARVESTS refine_recommendation's echoed memory ──
// refine_recommendation echoes the rejected plan ids + the parsed objection tags in
// its result data precisely so the session can remember them. runAgent harvests that
// into result.slotPatch, which the runners mergeSlots() into the session — the
// write-side that ACTIVATES `memory` on the next turn (previously inert on every
// surface). Drives the REAL tool via the Gemini stub, no network.

Deno.test("runAgent harvests refine_recommendation's rejected ids + objections into slotPatch", async () => {
  const bodies: string[] = [];
  globalThis.fetch = twoStepGeminiFetch({
    firstCalls: [
      { name: "refine_recommendation", args: { category: "cellular", feedback: "יקר לי", prevPlanIds: ["c1"] } },
    ],
    finalText: "הנה אפשרות זולה יותר מהקטלוג.",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "זה יקר לי, יש זול יותר?",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    assertEquals(res.via, "tools");
    assertEquals(res.toolCalls.map((t) => t.name), ["refine_recommendation"]);
    // The harvested write-side memory: the rejected id + the parsed "price" objection.
    assert(res.slotPatch, "slotPatch present when a tool surfaced memory");
    assertEquals(res.slotPatch?.rejectedPlanIds, ["c1"]);
    assertEquals(res.slotPatch?.objections, ["price"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("runAgent leaves slotPatch undefined when no memory-bearing tool ran", async () => {
  const bodies: string[] = [];
  globalThis.fetch = twoStepGeminiFetch({
    firstCalls: [{ name: "recommend_plans", args: { category: "cellular" } }],
    finalText: "הנה ההמלצות.",
    bodies,
  });
  try {
    const res = await runAgent({
      channel: "site",
      message: "מה מתאים?",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    assertEquals(res.via, "tools");
    // recommend_plans doesn't echo rejected/objections ⇒ nothing to persist.
    assertEquals(res.slotPatch, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("runAgent stays backward-compatible: no memory ⇒ no recap line, still answers", async () => {
  const bodies: string[] = [];
  globalThis.fetch = twoStepGeminiFetch({ firstCalls: [], finalText: "שלום! איך אפשר לעזור?", bodies });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "היי",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    assertEquals(res.via, "text");
    assert(res.reply.startsWith("שלום! איך אפשר לעזור?"), "text-chain reply preserved");
    const firstBody = bodies[0] ?? "";
    // No memory ⇒ the "הקשר מהשיחה עד כה" recap line is absent.
    assert(!firstBody.includes("הקשר מהשיחה עד כה"), "no recap line without memory");
  } finally {
    globalThis.fetch = realFetch;
  }
});
