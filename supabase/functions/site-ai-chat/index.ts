import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// site-ai-chat — Switchy AI  (now routed through the SHARED agent)
//
// Public chat endpoint behind the "Switchy AI" widget on app.html. As of the
// agent-platform work this function no longer carries its own grounding /
// generation logic — it delegates to the ONE shared brain so the site, the app
// and WhatsApp can never drift:
//
//   • _shared/agent.ts  runAgent({ channel:'site' })  — grounded, tool-using
//     Gemini loop (cited [Sn] catalogue + search/recommend/get_provider/…),
//     degrading gracefully to a no-tools text chain and finally a template
//     fallback (never hard-fails a customer message).
//   • _shared/session.ts  loadSession/saveSession  — the unified ChatSession
//     (transcript + toolCalls + slots) persisted in public.ai_sessions. This
//     REPLACES the bespoke ai_sessions transcript merge this fn used to do.
//   • _shared/tools.ts (via the agent) — consent-gated create_lead/book_callback
//     route through ctx.captureLead → _shared/leads.ts captureAiLead, so the
//     §30A/§11/§7b guarantees are enforced in ONE place.
//
// WAVE-5 HARDENING PRESERVED (this fn still owns the public-edge guards):
//   • Origin allowlist — corsHeaders(req)/preflight(req) reflect only an
//     allowlisted Origin (a public, paid-LLM endpoint; `*` would let any site
//     spend our quota).
//   • Per-IP hourly rate-limit — fail-CLOSED on a DB error (503) so a Supabase
//     outage can't turn the paid providers into an unmetered open relay.
//   • Timeout → 504 — when every provider aborts on its timeout, the client
//     gets a "try again" rather than a fake answer.
//   • Oversized-payload / length guards before any (paid) AI work.
//   • Consent-gated lead capture — a client-posted structured `lead` is captured
//     ONLY with consent===true (captureAiLead gate); no consent ⇒ no write.
//
// POST {
//   message: string,
//   history?: { role: 'user'|'bot', text: string }[],
//   sessionId?: string,                 // opaque, enables cross-reload memory
//   lead?: { name, phone, consent, consent_marketing_sms?, _email?, _whatsapp?,
//            provider?, category?, notes? }   // captured only with consent===true
// }
//   -> { reply, offerLead?, leadCaptured?, contextTruncated?, sessionId? }
//
// Deploy: supabase functions deploy site-ai-chat --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { firstEnv, resolveCfgCached } from "../_shared/config.ts";
import { fetchRows, insertRow } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { type AiKeys } from "../_shared/ai.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { type Plan, plansFromRows, plansFromSnapshot } from "../_shared/catalogue.ts";
import { type AiLeadInput, captureAiLead, detectSwitchIntent } from "../_shared/leads.ts";
import { runAgent } from "../_shared/agent.ts";
import { formatKnowledgeForPrompt, type KnowledgeEntry, loadBotKnowledge } from "../_shared/knowledge.ts";
import { lookupOpenLead } from "../_shared/leadlookup.ts";
import {
  appendTurn,
  asChatTurns,
  type ChatSession,
  loadSession,
  recordToolCall,
  safeSessionId,
  saveSession,
} from "../_shared/session.ts";
import { captureError } from "../_shared/observability.ts";
import plansSnapshot from "./plans-snapshot.json" with { type: "json" };

const MAX_MESSAGE_LEN = 500;
// Hard ceiling on the raw incoming message — a cheap abuse/cost guard that
// rejects oversized payloads BEFORE any (paid) AI call. The 500-char limit below
// still applies; this is the coarse "obviously abusive" gate.
const MAX_INPUT_LEN = 2000;
const MAX_HISTORY_TURNS = 6;
const PER_IP_HOURLY_LIMIT = 15;

// CORS is per-request now: corsHeaders(req) reflects only an allowlisted Origin
// (this is a public, paid-LLM endpoint — `*` would let any site spend our quota).
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

type ChatTurn = { role: string; text: string };

// Grounding catalogue — read LIVE from public.plans (the SAME service-role read
// the WhatsApp/Telegram webhooks use) so the site agent never drifts from the
// catalogue the other channels answer from. Cached in-memory for the instance
// lifetime with a short TTL so a price change is picked up within a minute
// without hammering PostgREST on every chat turn.
//
// FALLBACK: if the live read fails (fetchRows → null) OR returns no usable rows,
// we fall back to the bundled plans-snapshot.json so an outage degrades to a
// (possibly stale) grounded answer rather than an empty catalogue / hard fail.
// The snapshot is the floor, never the default.
const PLANS_TTL_MS = 60_000;
let _plans: Plan[] | null = null;
let _plansAt = 0;
async function loadPlans(): Promise<Plan[]> {
  const now = Date.now();
  if (_plans && now - _plansAt < PLANS_TTL_MS) return _plans;
  const rows = await fetchRows<Record<string, unknown>>(
    "/rest/v1/plans?select=id,provider,category,price,price_unit,specs,subtitle,kind,title&limit=1000",
  );
  const live = rows ? plansFromRows(rows) : [];
  // Snapshot fallback on a failed read or an empty live catalogue — never serve
  // the agent an empty grounding when we have a bundled snapshot to fall back to.
  const plans = live.length ? live : plansFromSnapshot(plansSnapshot);
  if (!live.length) jlog({ at: "ai-chat.plans", live: live.length, fallback: "snapshot" });
  _plans = plans;
  _plansAt = now;
  return plans;
}

// Curated verified-FAQ knowledge (bot_knowledge), loaded once per function
// instance via the service-role read — mirrors whatsapp-webhook getBotKnowledge
// so the website chat gains the SAME knowledge base WhatsApp has. Fail-soft →
// [] (loadBotKnowledge never throws); a missing/empty table simply means the
// agent runs without the knowledge block (prompt byte-identical to today).
let _knowledge: KnowledgeEntry[] | null = null;
async function getBotKnowledge(): Promise<KnowledgeEntry[]> {
  if (_knowledge) return _knowledge;
  _knowledge = await loadBotKnowledge();
  return _knowledge;
}

function clientIp(req: Request): string {
  // Same trust order as the leads rate-limit gate: CDN-set header first, then
  // the last (infra-appended) X-Forwarded-For hop — never the spoofable first hop.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "";
}

// Tri-state: true = limited (429), false = ok, null = DB error.
// On a DB error we FAIL-CLOSED (null → 503): this endpoint hits the paid
// Gemini/Groq/OpenRouter providers, so a Supabase outage must not turn them
// into an unmetered open relay. Only the "no IP" case stays fail-open.
async function rateLimited(ip: string): Promise<boolean | null> {
  if (!ip) return false; // can't limit without an IP — fail-open
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const rows = await fetchRows<{ id: string }>(
    `/rest/v1/chat_messages?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}`,
  );
  if (rows === null) return null; // query failed — fail CLOSED (caller returns 503)
  return rows.length >= PER_IP_HOURLY_LIMIT;
}

// Sanitize the browser-replayed history into the {role,text} turns the session
// layer expects. The stored session is authoritative for older turns; this only
// fills the very-latest turns (and works when memory is disabled).
export function sanitizeTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h === "object")
    .map((h) => {
      const o = h as Record<string, unknown>;
      const role = o.role === "user" ? "user" : "bot";
      return { role, text: String(o.text ?? "").slice(0, MAX_MESSAGE_LEN) };
    })
    .filter((h) => h.text);
}

// Merge the stored transcript with the browser-replayed history: stored first
// (authoritative), then any client turns not already present. Capped to the
// window the model will actually see. Pure so it's unit-testable.
export function mergeHistory(stored: ChatTurn[], clientHistory: ChatTurn[]): {
  merged: ChatTurn[];
  history: ChatTurn[];
  contextTruncated: boolean;
} {
  const merged: ChatTurn[] = [...stored];
  for (const h of clientHistory) {
    if (!merged.some((m) => m.role === h.role && m.text === h.text)) merged.push(h);
  }
  const history = merged.slice(-MAX_HISTORY_TURNS);
  // Honesty signal: tell the client when older turns fell outside the window the
  // model actually saw, so the UI can note the assistant has limited recall.
  return { merged, history, contextTruncated: merged.length > history.length };
}

const FRIENDLY_BUSY = "שירות עמוס כרגע, נסו שוב בעוד רגע";
const FALLBACK_REPLY =
  "מצטער/ת, לא הצלחתי לנסח תשובה כרגע — נסו לשאול אחרת או דברו איתנו בוואטסאפ.";

// The real request logic. Wrapped by the Deno.serve handler below so any
// UNEXPECTED throw is passed to captureError (fire-and-forget, dark until a DSN
// exists) and STILL returns the existing fail-soft response — the status/shape
// the front-end depends on is never changed by the wrapper.
async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const geminiKey = (await resolveCfgCached()).gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  const groqKey = firstEnv(["GROQ_API_KEY"]);
  const cerebrasKey = firstEnv(["CEREBRAS_API_KEY"]);
  const openrouterKey = firstEnv(["OPENROUTER_API_KEY"]);
  // Configured if ANY provider in the fallback chain has a key.
  if (!geminiKey && !groqKey && !cerebrasKey && !openrouterKey) {
    return json(req, { error: "ai chat is not configured" }, 503);
  }

  let body: {
    message?: string;
    history?: unknown;
    sessionId?: unknown;
    lead?: AiLeadInput;
  };
  try {
    body = await req.json();
  } catch (_) {
    return json(req, { error: "invalid json" }, 400);
  }
  // Cheap abuse/cost guard: reject an oversized raw payload before any AI work.
  if (String(body.message ?? "").length > MAX_INPUT_LEN) {
    return json(req, { error: "message too long" }, 400);
  }
  const message = String(body.message ?? "").trim();
  if (!message) return json(req, { error: "message is required" }, 400);
  if (message.length > MAX_MESSAGE_LEN) return json(req, { error: "message too long" }, 400);

  const sessionId = safeSessionId(body.sessionId);
  const clientHistory = sanitizeTurns(body.history).slice(-MAX_HISTORY_TURNS);

  const ip = clientIp(req);
  const limited = await rateLimited(ip);
  if (limited === null) return json(req, { error: FRIENDLY_BUSY }, 503);
  if (limited) return json(req, { error: "rate limit exceeded" }, 429);

  // ── Lead capture (only with explicit consent) ──────────────────────────────
  // If the client posted a structured lead (collected after we offered), capture
  // it. captureAiLead gates on a valid name+phone AND consent===true, so a
  // missing/false consent yields "incomplete" and NO lead is written.
  let leadCaptured = false;
  if (body.lead && typeof body.lead === "object") {
    const result = await captureAiLead(body.lead);
    leadCaptured = result === "captured";
    jlog({ at: "ai-chat.lead", result });
  }

  // ── Memory: unified session ⊕ browser-replayed history ─────────────────────
  // Load the stored ChatSession (transcript + toolCalls + slots) from
  // public.ai_sessions via the shared session layer (fail-soft → empty session).
  const session: ChatSession = await loadSession("site", sessionId);
  const { history, contextTruncated } = mergeHistory(asChatTurns(session), clientHistory);

  // ── Tool-context sinks (real, audited, consent-gated) ──────────────────────
  // The agent's tools route their side-effects through these. captureLead is the
  // single honest-consent gate (captureAiLead); the audit sinks append best-effort
  // crm_events / security_audit_log rows (service role bypasses RLS).
  const logCrmEvent = (ev: { actor: string; event: string; preview?: string }) => {
    const preview = (ev.preview ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
    insertRow("crm_events", {
      conversation_id: null,
      contact_id: null,
      actor: ev.actor,
      event: ev.event,
      preview,
    }).catch(() => {});
  };
  const logSecurityEvent = (event: string, detail: Record<string, unknown>) => {
    insertRow("security_audit_log", { event, detail }).catch(() => {});
  };

  // ── Generate via the shared agent (grounded, tool-using, graceful) ─────────
  const keys: AiKeys = { gemini: geminiKey, groq: groqKey, cerebras: cerebrasKey, openrouter: openrouterKey };
  let agentReply = "";
  let via = "hard_fallback";
  let timedOut = false;
  const toolCalls: { name: string; ok: boolean; preview?: string }[] = [];
  // ── Parity with WhatsApp: feed the shared brain the same context ───────────
  // Until now the site agent was structurally dumber than WhatsApp despite
  // sharing runAgent — it passed none of these. Each is fail-soft and truth-only,
  // so an empty knowledge table / no open lead / a fresh session leaves the
  // prompt byte-identical to today. Prices/numbers are never touched.
  const knowledgeContext = formatKnowledgeForPrompt(await getBotKnowledge()) || undefined;
  // Open-lead awareness: only when a lead was captured earlier THIS session
  // (slots.phone). No phone ⇒ no lookup ⇒ no section (identical to WhatsApp's
  // null contract). null → undefined so it satisfies the optional param type.
  const activeLead = session.slots.phone
    ? ((await lookupOpenLead(session.slots.phone)) ?? undefined)
    : undefined;
  try {
    const res = await runAgent({
      channel: "site",
      message,
      history,
      keys,
      plans: await loadPlans(),
      toolContext: {
        conversationId: sessionId || null,
        contactId: null,
        logCrmEvent,
        logSecurityEvent,
        // Consent-gated capture — the same honest gate the client path uses.
        captureLead: (input) => captureAiLead(input as AiLeadInput),
      },
      knowledgeContext,
      activeLead,
      // Conversation-shaping memory from the loaded session slots — turnCount is
      // live (paces the close); rejectedPlanIds/objections activate once tools
      // record them.
      memory: {
        rejectedPlanIds: session.slots.rejectedPlanIds,
        objections: session.slots.objections,
        turnCount: session.slots.turnCount,
      },
    });
    agentReply = res.reply;
    via = res.via;
    timedOut = res.timedOut;
    toolCalls.push(...res.toolCalls);
  } catch (e) {
    jlog({ at: "ai-chat", ok: false, error: String(e) });
    return json(req, { error: "ai request failed" }, 502);
  }

  // Every provider failed AND at least one aborted on its timeout → 504 so the
  // client can show "try again" rather than a generic error or a fake answer.
  // (runAgent never hard-fails, so we only honor the timeout when it fell through
  // to a generic fallback — i.e. it has no real grounded answer.)
  if (timedOut && (via === "template" || via === "hard_fallback")) {
    jlog({ at: "ai-chat", ok: false, timedOut: true, via });
    return json(req, { error: FRIENDLY_BUSY }, 504);
  }
  const finalReply = agentReply || FALLBACK_REPLY;

  // Detect a genuine switch/contact intent so the front-end can offer to collect
  // name+phone+consent. We only OFFER here — capture still requires consent.
  // Suppress the offer if a lead was just captured (client path or via a tool).
  const leadCapturedByTool = toolCalls.some((t) => t.name === "create_lead" && t.ok);
  const offerLead = !leadCaptured && !leadCapturedByTool && detectSwitchIntent(message);

  // ── Persist memory: append the new turns + tool calls, save the session ────
  if (sessionId) {
    appendTurn(session, "user", message);
    appendTurn(session, "bot", finalReply);
    for (const tc of toolCalls) recordToolCall(session, tc.name, tc.ok, tc.preview);
    if (leadCaptured || leadCapturedByTool) session.slots.leadCaptured = true;
    saveSession(session, ip).catch(() => {});
  }
  // Best-effort rate-limit audit row, never blocks the reply.
  insertRow("chat_messages", { ip: ip || null }).catch(() => {});

  const out: Record<string, unknown> = { reply: finalReply };
  if (offerLead) out.offerLead = true;
  if (leadCaptured || leadCapturedByTool) out.leadCaptured = true;
  if (contextTruncated) out.contextTruncated = true;
  if (sessionId) out.sessionId = sessionId;
  return json(req, out);
}

// Observability wrapper (fire-and-forget; dark until a Sentry DSN is configured).
// An UNEXPECTED throw — one not already handled by an inner fail-soft branch — is
// captured and then degraded to the SAME friendly 503 the function already returns
// for a transient outage, so the client contract is unchanged. captureError never
// throws or blocks (see _shared/observability.ts).
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "site-ai-chat", method: req.method });
    jlog({ at: "ai-chat", ok: false, error: String(e) });
    // Mirror corsHeaders so even the failure response stays origin-correct.
    return json(req, { error: FRIENDLY_BUSY }, 503);
  }
});
