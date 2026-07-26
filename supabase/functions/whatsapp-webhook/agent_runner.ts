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
// OPTIMISTIC CONCURRENCY (cross-isolate): the loaded ChatSession carries a
// `version` token (_shared/session.ts — whatsapp: ai_state.rev inside the jsonb)
// and saveSession issues a CONDITIONAL PATCH on it. Two isolates racing on the
// same conversation therefore can't clobber each other's memory: the second
// save matches zero rows and is SILENTLY DROPPED (saveSession returns false;
// we deliberately do NOT retry — replaying a stale session over the winner's
// fresh one would recreate the lost-update). The reply is never affected.
//
// WHAT THIS DOES NOT OWN (stays in index.ts, ABOVE the agent — the guard chain):
//   HMAC signature verify · wamid dedup · §30A STOP/opt-out · §11 first-contact
//   notice · bot_enabled human-takeover (silent) · per-contact hourly rate-limit.
//   runWhatsappAgent assumes the caller has already cleared ALL of these.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiKeys, ChatTurn } from "../_shared/ai.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";
import { type ActiveLead, runAgent as defaultRunAgent, type RunAgentResult } from "../_shared/agent.ts";
import type { ToolContext } from "../_shared/tools.ts";
import { CATEGORY_HE } from "../_shared/leads.ts";
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
  // Append an agent_tool_calls row (the analytics table admin-metrics rolls up).
  // Optional so an existing caller/test compiles unchanged; absent ⇒ no row.
  logToolCall?: NonNullable<ToolContext["logToolCall"]>;
  // Consent-gated lead capture (production: _shared/leads.ts captureAiLead).
  captureLead: (input: Record<string, unknown>) => Promise<"captured" | "incomplete" | "error">;
  // Hand the conversation to a human (production: create a lead + flip status).
  // Returns whether the takeover landed. `handoff` carries what the AGENT knows
  // and the lead row otherwise wouldn't — see HandoffContext.
  escalate: (reason: string, handoff: HandoffContext) => Promise<boolean> | boolean;
};

// What the agent hands the human along with the escalation.
//
// WHY THIS EXISTS: the rep used to open the call on two exchanges of chat and
// nothing else. Meanwhile the session already held the customer's category,
// budget, the plans they explicitly REJECTED and the objections they raised in
// their own words — none of which could travel, because escalate_to_human's only
// parameter is a free-text `reason`. Worse, that paraphrase was then written into
// the lead as "הודעה אחרונה", so the line labelled "what the customer last said"
// was actually the model's summary of it.
export type HandoffContext = {
  /** The customer's ACTUAL message this turn (never the model's paraphrase). */
  lastMessage: string;
  /** Canonical Hebrew fact block from the session slots + bill hint. "" when we
   *  genuinely know nothing — truth-only, never a padded placeholder. */
  facts: string;
};

// Render the session's structured knowledge as a short Hebrew block the rep reads
// BEFORE the transcript (the Telegram card clips notes at 700 chars, so ordering
// is not cosmetic — facts must fit inside that window).
//
// PURE + exported so the contract is pinned in tests. Truth-only: every line is
// emitted only when the slot actually holds something. Rejected plan ids are
// resolved against the live catalogue into "ספק — מסלול" because a raw id tells a
// human nothing; an id with no matching row is dropped rather than printed raw.
//
// The phrasing is deliberately the one rep-brief's parseNeed() already reads back
// out of `notes` (parseAdvisorHints: a category word, a "עד ₪N" budget cue), so
// the call brief picks these facts up with no extra plumbing.
export function buildHandoffFacts(
  slots: Record<string, unknown>,
  plans: ScorablePlan[] = [],
  billHint?: { provider?: string; monthly?: number; category?: string },
): string {
  const lines: string[] = [];
  const category = typeof slots.category === "string" ? slots.category : "";
  const catHe = category ? (CATEGORY_HE[category] ?? category) : "";
  if (catHe) lines.push(`קטגוריה: ${catHe}`);
  if (typeof slots.budget === "number" && slots.budget > 0) lines.push(`תקציב: עד ₪${slots.budget}`);
  if (billHint && typeof billHint.monthly === "number" && billHint.monthly > 0) {
    lines.push(`חשבון נוכחי: ₪${billHint.monthly}${billHint.provider ? ` (${billHint.provider})` : ""}`);
  } else if (billHint?.provider) {
    lines.push(`ספק נוכחי: ${billHint.provider}`);
  }
  if (slots.abroad === true) lines.push('מעוניין/ת בחבילת חו"ל');
  const rejected = Array.isArray(slots.rejectedPlanIds) ? slots.rejectedPlanIds : [];
  if (rejected.length) {
    const named = rejected
      .map((id) => plans.find((p) => p.id === id))
      .filter((p): p is ScorablePlan => !!p)
      .map((p) => `${p.provider} — ${p.plan}`);
    if (named.length) lines.push(`כבר דחה/תה: ${named.slice(0, 3).join(" · ")}`);
  }
  const objections = Array.isArray(slots.objections) ? slots.objections : [];
  const objText = objections.map((o) => String(o ?? "").trim()).filter(Boolean).slice(0, 3);
  if (objText.length) lines.push(`התנגדויות: ${objText.join(" · ")}`);
  return lines.map((l) => `• ${l}`).join("\n");
}

// Build the ToolContext (minus plans + channel, which runAgent injects). Pure:
// just stitches the deps into the shape the shared tools expect. `handoff` is what
// the escalate sink receives alongside the model's reason; it defaults to empty so
// a caller that has no session (or a test) behaves exactly as before.
export function buildAgentToolContext(
  deps: AgentRunnerDeps,
  handoff: HandoffContext = { lastMessage: "", facts: "" },
): Omit<ToolContext, "plans" | "channel"> {
  return {
    conversationId: deps.conversationId ?? null,
    contactId: deps.contactId ?? null,
    logCrmEvent: deps.logCrmEvent,
    logSecurityEvent: deps.logSecurityEvent,
    logToolCall: deps.logToolCall,
    captureLead: deps.captureLead,
    escalate: (reason: string) => deps.escalate(reason, handoff),
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
  // Optional OPEN LEAD the webhook looked up in public.leads for this phone (the
  // app-handoff awareness — see index.ts lookupOpenLead). OPTIONAL + additive:
  // omitted ⇒ runAgent's prompt is identical to before. TRUTH-ONLY: comes straight
  // from the DB row; a failed/empty lookup passes nothing (never fabricated).
  activeLead?: ActiveLead;
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
      // Built HERE (not at the caller) because only this point holds the loaded
      // session — the slots are what make the escalation worth anything to a rep.
      toolContext: buildAgentToolContext(input.deps, {
        lastMessage: input.message,
        facts: buildHandoffFacts(session.slots, input.plans, input.billHint),
      }),
      templateFallback: input.templateFallback,
      billHint: input.billHint,
      knowledgeContext: input.knowledgeContext,
      activeLead: input.activeLead,
      // Conversation-shaping memory from the loaded session slots — turnCount is
      // live (bumped per turn); rejectedPlanIds/objections activate once tools
      // record them. Fail-soft: empty slots ⇒ empty memory ⇒ prompt unchanged.
      memory: {
        rejectedPlanIds: session.slots.rejectedPlanIds,
        objections: session.slots.objections,
        turnCount: session.slots.turnCount,
      },
    });
  } catch (_e) {
    // The shared runAgent shouldn't throw, but if it ever does we MUST still let
    // the caller fall back (templated flow). Surface an empty reply so index.ts
    // routes to its own fallback rather than sending a hard-coded line here.
    return { reply: "", via: "hard_fallback", toolCalls: [], timedOut: false };
  }

  // 3) Persist memory: append this turn + the tools that ran, merge any slots.
  //    Best-effort — a save failure never affects the reply. A save that LOSES
  //    a cross-isolate race (session.version no longer matches) is dropped
  //    silently by saveSession — see the optimistic-concurrency note above.
  try {
    appendTurn(session, "user", input.message);
    if (result.reply) appendTurn(session, "bot", result.reply);
    for (const tc of result.toolCalls) recordToolCall(session, tc.name, tc.ok, tc.preview);
    if (input.slotPatch) mergeSlots(session, input.slotPatch);
    // Persist the memory the agent harvested this turn (rejected plan ids /
    // objections from refine_recommendation) so it shapes the NEXT turn. UNION +
    // capped by mergeSlots; empty ⇒ no-op. This is what activates `memory`.
    if (result.slotPatch) mergeSlots(session, result.slotPatch);
    if (session.key) await saveSessionFn(session);
  } catch (_e) { /* memory is a bonus, never a hard dependency */ }

  return {
    reply: result.reply,
    via: result.via,
    toolCalls: result.toolCalls,
    timedOut: result.timedOut,
  };
}
