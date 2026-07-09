// Unit tests for whatsapp-webhook/agent_runner.ts — the bridge wiring the
// WhatsApp webhook to the SHARED tool-using brain (_shared/agent.ts). The runner
// is fully dependency-injected (runAgentFn / loadSessionFn / saveSessionFn), so
// these pin the WIRING without network or DB:
//   • the right input reaches runAgent (channel=whatsapp, history, plans, billHint,
//     templateFallback),
//   • the unified session round-trip (load → append user+bot turns + tool calls →
//     merge slots → save) happens,
//   • the toolContext sinks the webhook supplies actually drive the real tools
//     (consent gate refuses without consent; escalate flips a human takeover),
//   • it's FAIL-SOFT end to end (a runAgent throw → empty reply for the caller to
//     fall back on; a session I/O throw never loses the reply).
// No network, no env. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  type AgentRunnerDeps,
  buildAgentToolContext,
  runWhatsappAgent,
} from "../whatsapp-webhook/agent_runner.ts";
import type { RunAgentInput, RunAgentResult } from "../_shared/agent.ts";
import { type ChatSession, emptySession } from "../_shared/session.ts";
import { createLead, escalateToHuman, type ToolContext } from "../_shared/tools.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";
import { withFetchStub } from "./_capture_handler.ts";

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29, noCommit: true },
];

// A deps bag that records every sink call so a test can assert the wiring.
function fakeDeps(over: Partial<AgentRunnerDeps> = {}): AgentRunnerDeps & {
  crm: string[];
  sec: { event: string; detail: Record<string, unknown> }[];
  leadInputs: Record<string, unknown>[];
  escalations: string[];
} {
  const crm: string[] = [];
  const sec: { event: string; detail: Record<string, unknown> }[] = [];
  const leadInputs: Record<string, unknown>[] = [];
  const escalations: string[] = [];
  const deps: AgentRunnerDeps = {
    conversationId: "conv-1",
    contactId: "contact-1",
    logCrmEvent: (ev) => { crm.push(`${ev.event}:${ev.preview ?? ""}`); },
    logSecurityEvent: (event, detail) => { sec.push({ event, detail }); },
    captureLead: (lead) => { leadInputs.push(lead); return Promise.resolve("captured"); },
    escalate: (reason) => { escalations.push(reason); return true; },
    ...over,
  };
  return Object.assign(deps, { crm, sec, leadInputs, escalations });
}

// ── buildAgentToolContext: every sink is wired into the ToolContext ───────────

Deno.test("buildAgentToolContext carries ids + all four sinks", () => {
  const deps = fakeDeps();
  const tc = buildAgentToolContext(deps);
  assertEquals(tc.conversationId, "conv-1");
  assertEquals(tc.contactId, "contact-1");
  assert(typeof tc.logCrmEvent === "function");
  assert(typeof tc.logSecurityEvent === "function");
  assert(typeof tc.captureLead === "function");
  assert(typeof tc.escalate === "function");
});

// ── the input reaching runAgent + the session round-trip ──────────────────────

Deno.test("runWhatsappAgent passes channel/history/plans/billHint and persists the turn", async () => {
  let captured: RunAgentInput | null = null;
  const loaded: ChatSession = emptySession("whatsapp", "conv-1");
  loaded.transcript = [{ role: "user", text: "שלום" }, { role: "bot", text: "היי!" }];
  let saved: ChatSession | null = null;

  const r = await runWhatsappAgent({
    sessionKey: "conv-1",
    message: "מה זול בסלולר?",
    plans: PLANS,
    keys: { gemini: "k" },
    deps: fakeDeps(),
    billHint: { provider: "סלקום", monthly: 90, category: "cellular" },
    templateFallback: () => "fallback",
    slotPatch: { category: "cellular", budget: 50 },
    loadSessionFn: () => Promise.resolve(loaded),
    saveSessionFn: (s) => { saved = s; return Promise.resolve(true); },
    runAgentFn: (input) => {
      captured = input;
      return Promise.resolve<RunAgentResult>({
        reply: "הזול ביותר הוא פרטנר ב-29 ₪",
        via: "tools",
        toolCalls: [{ name: "recommend_plans", ok: true, preview: "cellular×2" }],
        timedOut: false,
      });
    },
  });

  // The reply flows back unchanged.
  assertEquals(r.reply, "הזול ביותר הוא פרטנר ב-29 ₪");
  assertEquals(r.via, "tools");

  // runAgent saw the whatsapp channel, the prior transcript as history, the plans,
  // and the bill hint.
  assert(captured);
  const inp = captured as RunAgentInput;
  assertEquals(inp.channel, "whatsapp");
  assertEquals(inp.history?.length, 2);
  assertEquals(inp.plans, PLANS);
  assertEquals(inp.billHint?.monthly, 90);
  assert(typeof inp.templateFallback === "function");

  // The session was persisted with this turn appended (user + bot) and the tool
  // call recorded, plus the merged slots.
  assert(saved);
  const s = saved as ChatSession;
  assertEquals(s.transcript.length, 4); // 2 prior + user + bot
  assertEquals(s.transcript[2], { role: "user", text: "מה זול בסלולר?" });
  assertEquals(s.transcript[3].role, "bot");
  assertEquals(s.toolCalls.at(-1)?.name, "recommend_plans");
  assertEquals(s.slots.category, "cellular");
  assertEquals(s.slots.budget, 50);
});

// ── memory write-side: the harvested slotPatch is UNIONed into the session ─────

Deno.test("runWhatsappAgent persists the harvested slotPatch (rejected ids / objections), unioning with prior slots", async () => {
  const loaded = emptySession("whatsapp", "conv-1");
  loaded.slots.rejectedPlanIds = ["c1"]; // one plan already rejected earlier
  let saved: ChatSession | null = null;

  await runWhatsappAgent({
    sessionKey: "conv-1",
    message: "יש משהו זול יותר?",
    plans: PLANS,
    keys: { gemini: "k" },
    deps: fakeDeps(),
    loadSessionFn: () => Promise.resolve(loaded),
    saveSessionFn: (s) => { saved = s; return Promise.resolve(true); },
    runAgentFn: () =>
      Promise.resolve<RunAgentResult>({
        reply: "הנה אפשרות זולה יותר",
        via: "tools",
        toolCalls: [{ name: "refine_recommendation", ok: true }],
        timedOut: false,
        slotPatch: { rejectedPlanIds: ["c2"], objections: ["price"] },
      }),
  });

  assert(saved);
  const s = saved as ChatSession;
  // UNION with the pre-existing slot, deduped — the write-side that activates memory.
  assertEquals([...(s.slots.rejectedPlanIds ?? [])].sort(), ["c1", "c2"]);
  assertEquals(s.slots.objections, ["price"]);
});

// ── the toolContext sinks actually drive the REAL tools ───────────────────────

Deno.test("the wired toolContext refuses a lead without consent (consent gate)", async () => {
  const deps = fakeDeps();
  // The fake runAgent uses the toolContext the runner built to call the REAL
  // create_lead executor — proving the consent gate is honoured end to end.
  let toolResultOk = true;
  await runWhatsappAgent({
    sessionKey: "",
    message: "תחזרו אליי",
    plans: PLANS,
    keys: {},
    deps,
    loadSessionFn: () => Promise.resolve(emptySession("whatsapp", "")),
    saveSessionFn: () => Promise.resolve(true),
    runAgentFn: async (input) => {
      const tc: ToolContext = { ...input.toolContext, plans: PLANS, channel: "whatsapp" };
      const res = await createLead(tc, { name: "דנה", phone: "0501234567", consent: false });
      toolResultOk = res.ok;
      return { reply: "x", via: "tools", toolCalls: [], timedOut: false };
    },
  });
  assertFalse(toolResultOk); // no consent → refused, nothing captured
  assertEquals(deps.leadInputs.length, 0); // captureLead never called
});

Deno.test("the wired toolContext captures a lead WITH consent and surfaces §7b", async () => {
  const deps = fakeDeps();
  let note = "";
  await runWhatsappAgent({
    sessionKey: "",
    message: "אני רוצה לעבור, חזרו אליי",
    plans: PLANS,
    keys: {},
    deps,
    loadSessionFn: () => Promise.resolve(emptySession("whatsapp", "")),
    saveSessionFn: () => Promise.resolve(true),
    runAgentFn: async (input) => {
      const tc: ToolContext = { ...input.toolContext, plans: PLANS, channel: "whatsapp" };
      const res = await createLead(tc, {
        name: "דנה כהן",
        phone: "0501234567",
        consent: true,
        category: "cellular",
      });
      note = res.note ?? "";
      return { reply: "x", via: "tools", toolCalls: [], timedOut: false };
    },
  });
  assertEquals(deps.leadInputs.length, 1); // captured via the wired captureAiLead sink
  assertEquals(deps.leadInputs[0].consent, true);
  // §7b commission disclosure is surfaced for the agent to state.
  assert(note.includes("עמלה"));
});

Deno.test("the wired escalate sink raises a human takeover", async () => {
  const deps = fakeDeps();
  await runWhatsappAgent({
    sessionKey: "",
    message: "תנו לי בנאדם",
    plans: PLANS,
    keys: {},
    deps,
    loadSessionFn: () => Promise.resolve(emptySession("whatsapp", "")),
    saveSessionFn: () => Promise.resolve(true),
    runAgentFn: async (input) => {
      const tc: ToolContext = { ...input.toolContext, plans: PLANS, channel: "whatsapp" };
      await escalateToHuman(tc, { reason: "לקוח התעקש" });
      return { reply: "x", via: "tools", toolCalls: [], timedOut: false };
    },
  });
  assertEquals(deps.escalations.length, 1);
  assertEquals(deps.escalations[0], "לקוח התעקש");
});

// ── fail-soft ─────────────────────────────────────────────────────────────────

Deno.test("runWhatsappAgent returns an empty reply when runAgent throws (caller falls back)", async () => {
  const r = await runWhatsappAgent({
    sessionKey: "conv-1",
    message: "hi",
    plans: PLANS,
    keys: {},
    deps: fakeDeps(),
    loadSessionFn: () => Promise.resolve(emptySession("whatsapp", "conv-1")),
    saveSessionFn: () => Promise.resolve(true),
    runAgentFn: () => { throw new Error("boom"); },
  });
  assertEquals(r.reply, ""); // empty → index.ts uses its own fallback
  assertEquals(r.via, "hard_fallback");
});

Deno.test("runWhatsappAgent still returns the reply when the session load AND save throw", async () => {
  const r = await runWhatsappAgent({
    sessionKey: "conv-1",
    message: "מה יש?",
    plans: PLANS,
    keys: {},
    deps: fakeDeps(),
    loadSessionFn: () => { throw new Error("db down"); },
    saveSessionFn: () => { throw new Error("db down"); },
    runAgentFn: () =>
      Promise.resolve<RunAgentResult>({ reply: "תשובה", via: "text", toolCalls: [], timedOut: false }),
  });
  // Memory is a bonus, never a hard dependency — the customer still gets the reply.
  assertEquals(r.reply, "תשובה");
});

// ── (c) NEVER SILENT: a configured AI provider that FAILS still yields a reply ──
// The production symptom was total silence. The agent's job is to NEVER hard-fail a
// customer message: when the LLM is configured (a Gemini key IS present) but EVERY
// provider call errors (rate limit / 5xx / network), runAgent must degrade through
// its chain and still return a non-empty reply — here the deterministic template
// fallback. We drive the REAL runAgent (default runAgentFn, NO stub) and fail every
// AI provider endpoint, proving a normal question is answered even when AI is down.

Deno.test("(c) a normal question still gets a reply when EVERY AI provider fails (template fallback)", async () => {
  const aiEndpoints = [
    "generativelanguage.googleapis.com", // Gemini (tool loop + text)
    "api.groq.com", // Groq text fallback
    "api.cerebras.ai", // Cerebras text fallback
    "openrouter.ai", // OpenRouter text fallback
  ];
  const FALLBACK = "המסלול הזול ביותר בסלולר הוא פרטנר ב-29 ₪ לחודש 🙂";
  let r: Awaited<ReturnType<typeof runWhatsappAgent>> | null = null;
  await withFetchStub(
    [{
      // Fail EVERY AI provider call (500) — simulates the LLM being down.
      match: (u: string) => aiEndpoints.some((e) => u.includes(e)),
      respond: () => new Response("provider error", { status: 500 }),
    }],
    async () => {
      r = await runWhatsappAgent({
        sessionKey: "", // stateless — no DB
        message: "מה המסלול הזול ביותר בסלולר?",
        plans: PLANS,
        keys: { gemini: "configured-but-failing-key" }, // AI IS configured…
        deps: fakeDeps(),
        templateFallback: () => FALLBACK, // …yet the customer still gets a real answer
        // default runAgentFn → exercise the REAL degradation chain
      });
    },
  );
  assert(r, "runWhatsappAgent returned");
  const res = r as Awaited<ReturnType<typeof runWhatsappAgent>>;
  // NEVER silent: a non-empty reply came back…
  assert(res.reply.length > 0, "a failing AI provider must STILL yield a reply, never silence");
  // …and it's the grounded template fallback (the LLM paths all errored out).
  assertEquals(res.reply, FALLBACK);
  assertEquals(res.via, "template");
});

Deno.test("(c) with NO template fallback either, the agent STILL replies (hard fallback, never empty)", async () => {
  // Even the last-resort path is covered: no key AND no template → the hard fallback
  // line. The customer is never met with silence.
  const r = await runWhatsappAgent({
    sessionKey: "",
    message: "מחירים",
    plans: PLANS,
    keys: {}, // no AI provider at all
    deps: fakeDeps(),
    // no templateFallback supplied
  });
  assert(r.reply.length > 0, "the hard fallback guarantees a non-empty reply");
  assertEquals(r.via, "hard_fallback");
});

Deno.test("an empty sessionKey runs stateless (no load/save) but still replies", async () => {
  let loadCalled = false;
  let saveCalled = false;
  const r = await runWhatsappAgent({
    sessionKey: "",
    message: "שלום",
    plans: PLANS,
    keys: {},
    deps: fakeDeps(),
    loadSessionFn: () => { loadCalled = true; return Promise.resolve(emptySession("whatsapp", "")); },
    saveSessionFn: () => { saveCalled = true; return Promise.resolve(true); },
    runAgentFn: () =>
      Promise.resolve<RunAgentResult>({ reply: "היי", via: "text", toolCalls: [], timedOut: false }),
  });
  assertEquals(r.reply, "היי");
  assertFalse(loadCalled); // empty key → no load
  assertFalse(saveCalled); // empty key → no save (session.key is "")
});
