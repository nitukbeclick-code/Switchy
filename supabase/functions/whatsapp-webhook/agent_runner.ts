// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-webhook/agent_runner.ts — the bridge between the WhatsApp webhook and
// the SHARED tool-using brain (_shared/agent.ts runAgent). Extracted as a pure,
// dependency-injected module so the wiring (toolContext sinks + session round-trip
// + turn/tool-call persistence) can be unit-tested without booting Deno.serve or
// touching the DB.
//
// WHAT THIS OWNS
//   • buildAgentToolContext() — assembles the ToolContext the agent's tools run
//     with: the REAL audit/lead/escalation sinks (crm_events, security_audit_log,
//     captureAiLead, the bot-takeover escalation). Every sink is best-effort and
//     never throws into the tool loop.
//   • runWhatsappAgent() — loads the unified ChatSession (memory), calls runAgent
//     with the channel-tagged context + the catalogue + optional bill hint,
//     appends the user/bot turns and the tool calls to the session, and saves it.
//     Returns the agent's reply + metadata. Fully fail-soft: the agent itself
//     never hard-fails (it has its own template+hard fallback), and a session
//     load/save failure just degrades to stateless.
//
// WHAT THIS DOES NOT OWN (stays in index.ts, ABOVE the agent — the guard chain):
//   HMAC signature verify · wamid dedup · §30A STOP/opt-out · §11 first-contact
//   notice · bot_enabled human-takeover (silent) · per-contact hourly rate-limit.
//   runWhatsappAgent assumes the caller has already cleared ALL of these.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiKeys, ChatTurn } from "../_shared/ai.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";
import { runAgent as defaultRunAgent, type RunAgentResult } from "../_shared/agent.ts";
import type { ToolContext } from "../_shared/tools.ts";
import {
  appendTurn,
  asChatTurns,
  type ChatSession,
  emptySession,
  loadSession as defaultLoadSession,
  mergeSlots,
  recordToolCall,
  saveSession as defaultSaveSession,
} from "../_shared/session.ts";

// Side-effect sinks the webhook supplies. Each mirrors a best-effort helper the
// webhook already has (logCrmEvent / logSecurityEvent / captureAiLead) plus the
// escalation hook that flips the conversation to a human takeover.
export type AgentRunnerDeps = {
  conversationId?: string | null;
  contactId?: string | null;
  // Append a crm_events activity-feed row (actor/event/preview). Best-effort.
  logCrmEvent: (ev: { actor: string; event: string; preview?: string }) => Promise<void> | void;
  // Append a security_audit_log row. Best-effort.
  logSecurityEvent: (event: string, detail: Record<string, unknown>) => Promise<void> | void;
  // Consent-gated lead capture (production: _shared/leads.ts captureAiLead).
  captureLead: (input: Record<string, unknown>) => Promise<"captured" | "incomplete" | "error">;
  // Hand the conversation to a human (production: create a lead + flip status).
  // Returns whether the takeover landed; the agent reassures the customer either way.
  escalate: (reason: string) => Promise<boolean> | boolean;
};

// Build the ToolContext (minus plans + channel, which runAgent injects). Pure:
// just stitches the deps into the shape the shared tools expect.
export function buildAgentToolContext(deps: AgentRunnerDeps): Omit<ToolContext, "plans" | "channel"> {
  return {
    conversationId: deps.conversationId ?? null,
    contactId: deps.contactId ?? null,
    logCrmEvent: deps.logCrmEvent,
    logSecurityEvent: deps.logSecurityEvent,
    captureLead: deps.captureLead,
    escalate: deps.escalate,
  };
}

export type RunWhatsappAgentInput = {
  // The opaque session key — the conversation id (whatsapp sessions back onto
  // whatsapp_conversations.ai_state). Empty ⇒ memory disabled (stateless).
  sessionKey: string;
  message: string;
  plans: ScorablePlan[];
  keys: AiKeys;
  deps: AgentRunnerDeps;
  // Pre-extracted bill facts (from a Vision call the webhook already did) so the
  // agent can analyze_bill without re-reading the image.
  billHint?: { provider?: string; monthly?: number; category?: string; imageId?: string };
  // The existing deterministic template flow — runAgent's LAST resort when both
  // the tool loop and the no-tools text chain are unavailable. MUST return a safe
  // Hebrew reply. Keeps "never hard-fail a customer message" true.
  templateFallback?: (message: string) => Promise<string> | string;
  // Seed/extra slots learned this turn (category/budget/abroad/topic) to persist
  // alongside the agent transcript so a terse follow-up keeps its thread.
  slotPatch?: Record<string, unknown>;
  // Optional CURATED verified-FAQ block (built by _shared/knowledge.ts from the
  // bot_knowledge table). Loaded by the webhook and passed straight to runAgent so
  // the model can answer common questions directly + consistently. OPTIONAL +
  // back-compatible: omitted ⇒ runAgent's prompt is identical to before.
  knowledgeContext?: string;
  // Injectable for tests; default to the real shared implementations.
  runAgentFn?: typeof defaultRunAgent;
  loadSessionFn?: typeof defaultLoadSession;
  saveSessionFn?: typeof defaultSaveSession;
};

export type RunWhatsappAgentResult = {
  reply: string;
  via: RunAgentResult["via"];
  toolCalls: RunAgentResult["toolCalls"];
  timedOut: boolean;
};

// Drive one agent turn for WhatsApp: load memory → runAgent → persist turns +
// tool calls → save. Fail-soft end to end (the agent never hard-fails; a session
// I/O error degrades to stateless and still returns the reply).
export async function runWhatsappAgent(input: RunWhatsappAgentInput): Promise<RunWhatsappAgentResult> {
  const runAgentFn = input.runAgentFn ?? defaultRunAgent;
  const loadSessionFn = input.loadSessionFn ?? defaultLoadSession;
  const saveSessionFn = input.saveSessionFn ?? defaultSaveSession;

  // 1) Load the unified session (transcript + toolCalls + slots). Fail-soft.
  let session: ChatSession;
  try {
    session = input.sessionKey
      ? await loadSessionFn("whatsapp", input.sessionKey)
      : emptySession("whatsapp", "");
  } catch (_e) {
    session = emptySession("whatsapp", input.sessionKey || "");
  }
  const history: ChatTurn[] = asChatTurns(session);

  // 2) Run the shared brain. It owns its own graceful degradation + hard fallback,
  //    so this call effectively never throws — but we still guard it.
  let result: RunAgentResult;
  try {
    result = await runAgentFn({
      channel: "whatsapp",
      message: input.message,
      history,
      keys: input.keys,
      plans: input.plans,
      toolContext: buildAgentToolContext(input.deps),
      templateFallback: input.templateFallback,
      billHint: input.billHint,
      knowledgeContext: input.knowledgeContext,
    });
  } catch (_e) {
    // The shared runAgent shouldn't throw, but if it ever does we MUST still let
    // the caller fall back (templated flow). Surface an empty reply so index.ts
    // routes to its own fallback rather than sending a hard-coded line here.
    return { reply: "", via: "hard_fallback", toolCalls: [], timedOut: false };
  }

  // 3) Persist memory: append this turn + the tools that ran, merge any slots.
  //    Best-effort — a save failure never affects the reply.
  try {
    appendTurn(session, "user", input.message);
    if (result.reply) appendTurn(session, "bot", result.reply);
    for (const tc of result.toolCalls) recordToolCall(session, tc.name, tc.ok, tc.preview);
    if (input.slotPatch) mergeSlots(session, input.slotPatch);
    if (session.key) await saveSessionFn(session);
  } catch (_e) { /* memory is a bonus, never a hard dependency */ }

  return {
    reply: result.reply,
    via: result.via,
    toolCalls: result.toolCalls,
    timedOut: result.timedOut,
  };
}
