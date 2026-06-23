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

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  type AgentRunnerDeps,
  buildAgentToolContext,
  runWhatsappAgent,
} from "../whatsapp-webhook/agent_runner.ts";
import type { RunAgentInput, RunAgentResult } from "../_shared/agent.ts";
import { type ChatSession, emptySession } from "../_shared/session.ts";
import { createLead, escalateToHuman, type ToolContext } from "../_shared/tools.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

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
