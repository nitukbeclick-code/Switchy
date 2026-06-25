// Unit tests for the A2 "smarter closing" upgrades to _shared/agent.ts:
//   • maxOutputTokensForTier — the per-turn output-token budget is TIER-AWARE:
//     smart turns get a roomier cap (so a rich recommend+objection+close is not
//     truncated); fast turns stay lean. Pure + deterministic, pinned directly.
//   • buildClosingNudge — a turn-budget-aware CLOSING line is appended to the
//     system prompt ONLY when the conversation is mid/late (turnCount ≥ threshold)
//     OR a real bill is in play; it's absent on early small-talk turns. The line
//     is §7b-respecting (commission disclosure), asks for ONE clear next step, and
//     never fabricates savings/urgency.
//   • runAgent end-to-end: the nudge reaches the system prompt on a late/bill turn
//     and is absent on an early turn (we stub globalThis.fetch — no network).
// No env, no real network.  deno task test

import { assert, assertEquals } from "@std/assert";
import { buildClosingNudge, maxOutputTokensForTier, runAgent } from "../_shared/agent.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
];

const realFetch = globalThis.fetch;

// ── maxOutputTokensForTier: smart gets a bigger budget than fast ───────────────

Deno.test("maxOutputTokensForTier: smart > fast (rich close not truncated)", () => {
  const fast = maxOutputTokensForTier("fast");
  const smart = maxOutputTokensForTier("smart");
  assertEquals(fast, 500, "fast tier stays lean");
  assertEquals(smart, 820, "smart tier is roomy for recommend+objection+close");
  assert(smart > fast, "smart budget must exceed fast budget");
});

// ── buildClosingNudge: gated on the turn budget ────────────────────────────────

Deno.test("buildClosingNudge: empty on an early small-talk turn (no bill, low turnCount)", () => {
  assertEquals(buildClosingNudge(), "");
  assertEquals(buildClosingNudge({ turnCount: 0 }), "");
  assertEquals(buildClosingNudge({ turnCount: 1 }), "");
  // A turnCount below the threshold and no bill ⇒ still no nudge.
  assertEquals(buildClosingNudge({ turnCount: 1 }, { monthly: 0 }), "");
});

Deno.test("buildClosingNudge: present mid/late conversation (turnCount ≥ threshold)", () => {
  const line = buildClosingNudge({ turnCount: 2 });
  assert(line.length > 0, "nudge appears once the conversation is mid/late");
  assert(buildClosingNudge({ turnCount: 5 }).length > 0, "still present deeper in the convo");
});

Deno.test("buildClosingNudge: present when a real bill is in play, even on turn 0", () => {
  const line = buildClosingNudge({ turnCount: 0 }, { monthly: 120 });
  assert(line.length > 0, "a bill on the table is a closing moment");
});

Deno.test("buildClosingNudge: honest + §7b — one ask, no fabricated savings/urgency", () => {
  const line = buildClosingNudge({ turnCount: 3 });
  // §7b commission disclosure surfaced.
  assert(line.includes("עמלה"), "commission (§7b) disclosure present");
  // Asks for the next step (callback / connect a rep).
  assert(line.includes("שיחת חזרה") || line.includes("נציג"), "asks for a clear next step");
  // No pressure / no fabricated urgency or savings.
  assert(line.includes("בלי לחץ"), "explicitly no pressure");
  assert(line.includes("דחיפות"), "explicitly no fabricated urgency");
});

// ── runAgent end-to-end: the nudge reaches the system prompt (or not) ──────────

// A Gemini stub (mirrors agent_core_test.ts): step 1 (the tool loop) returns an
// EMPTY parts array — no tool calls, no text — so runAgent falls through to the
// plain text chain, whose call (step 2) returns finalText. The system prompt we
// inspect rides in systemInstruction of the FIRST request body either way.
function textGeminiFetch(opts: { finalText: string; bodies: string[] }): typeof globalThis.fetch {
  let step = 0;
  return ((_input: string | URL | Request, init?: RequestInit) => {
    opts.bodies.push(typeof init?.body === "string" ? init.body : "");
    step++;
    const parts = step === 1 ? [] : [{ text: opts.finalText }];
    const body = JSON.stringify({ candidates: [{ content: { parts } }] });
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof globalThis.fetch;
}

Deno.test("runAgent: closing nudge appears in the system prompt on a late turn", async () => {
  const bodies: string[] = [];
  globalThis.fetch = textGeminiFetch({ finalText: "אשמח לחבר אותך לנציג.", bodies });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "אוקיי",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
      memory: { turnCount: 4 },
    });
    assertEquals(res.via, "text");
    const firstBody = bodies[0] ?? "";
    assert(firstBody.includes("סגירה (כשמתאים)"), "closing nudge present on a late turn");
    assert(firstBody.includes("עמלה"), "§7b disclosure rides along");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("runAgent: closing nudge appears when a bill is in play", async () => {
  const bodies: string[] = [];
  globalThis.fetch = textGeminiFetch({ finalText: "לפי החשבון שלך, הנה אפשרות.", bodies });
  try {
    const res = await runAgent({
      channel: "site",
      message: "צירפתי חשבון",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
      billHint: { provider: "סלקום", monthly: 130, category: "cellular" },
    });
    assertEquals(res.via, "text");
    const firstBody = bodies[0] ?? "";
    assert(firstBody.includes("סגירה (כשמתאים)"), "closing nudge present with a bill in play");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("runAgent: NO closing nudge on an early small-talk turn", async () => {
  const bodies: string[] = [];
  globalThis.fetch = textGeminiFetch({ finalText: "שלום! איך אפשר לעזור?", bodies });
  try {
    const res = await runAgent({
      channel: "whatsapp",
      message: "היי",
      keys: { gemini: "k" },
      plans: PLANS,
      toolContext: {},
    });
    assertEquals(res.via, "text");
    const firstBody = bodies[0] ?? "";
    assert(!firstBody.includes("סגירה (כשמתאים)"), "no premature close on an early turn");
  } finally {
    globalThis.fetch = realFetch;
  }
});
