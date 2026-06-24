// ─────────────────────────────────────────────────────────────────────────────
// _shared/session.ts — ONE unified ChatSession the agent loads/saves regardless
// of channel, so the WhatsApp bot, the site chat, and the app all share the same
// memory model.
//
// Two physical backings, one logical shape:
//   • site / app  → public.ai_sessions  (one row per opaque session_id; the
//                    rolling transcript jsonb the site-ai-chat fn already uses).
//   • whatsapp    → public.whatsapp_conversations.ai_state  (the reserved jsonb
//                    slot the webhook already stores its slot-context in). We
//                    fold the transcript + tool-call history + slot context into
//                    that one jsonb so we don't add a column or a migration.
//
// A ChatSession carries three things:
//   1. transcript     — capped [{role:'user'|'bot', text}] turns (the chat memory)
//   2. toolCalls       — a short audit of which tools ran (name + ok), so the agent
//                        can avoid re-calling and a CRM can show what happened
//   3. slots          — the structured context gathered across turns
//                        (category/budget/abroad/topic + consent + lead state)
//
// Everything is FAIL-SOFT: a missing table, an un-migrated column, or a DB error
// yields an empty session and a best-effort no-op save — the agent still answers
// statelessly. Persistence is a bonus, never a hard dependency. Service-role
// only (these helpers run inside edge fns that already use _shared/db.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, serviceFetch } from "./db.ts";
import { jlog } from "./log.ts";

export type Channel = "whatsapp" | "site" | "app";

export type SessionTurn = { role: "user" | "bot"; text: string };

// A compact record of a tool the agent ran this/earlier turn. Never carries the
// raw tool output (that can be large / PII) — just name, ok, and a tiny preview.
export type ToolCallRecord = { name: string; ok: boolean; at: string; preview?: string };

// The structured context the agent gathers across turns. Channel-agnostic; the
// WhatsApp webhook's existing ConvContext (category/budget/abroad/topic) is a
// subset, so its ai_state stays readable. Consent + lead state live here so the
// §30A/§7b guardrails survive a reload.
export type SessionSlots = {
  category?: string;
  budget?: number;
  abroad?: boolean;
  topic?: string;
  // Lead/consent state (consent is NEVER fabricated — see _shared/leads.ts; this
  // only remembers what the user already told us so the agent doesn't re-ask).
  name?: string;
  phone?: string;
  consent?: boolean; // mandatory terms+privacy — true only if the user confirmed
  leadCaptured?: boolean;
  // Conversation-shaping memory (all OPTIONAL, additive — never fabricated; just
  // remembers what the user actually signalled so the agent can refine, not repeat):
  //   • rejectedPlanIds — plans the user explicitly dismissed, so refine_recommendation
  //     / the ranker can exclude them and not re-pitch the same thing.
  //   • objections      — short free-text objections the user raised (price/lock-in/…)
  //     so the agent answers them honestly instead of re-asking.
  //   • turnCount       — how many turns this session has run (bumped on recordToolCall);
  //     lets the agent pace itself (e.g. don't push a lead on turn 1).
  //   • lastToolName    — the most recent tool the agent ran, for cheap "what just
  //     happened" context without scanning the whole toolCalls audit.
  rejectedPlanIds?: string[];
  objections?: string[];
  turnCount?: number;
  lastToolName?: string;
  // Free-form scratch for channel-specific bits (kept small).
  [k: string]: unknown;
};

const MAX_REJECTED = 24;
const MAX_OBJECTIONS = 12;

export type ChatSession = {
  channel: Channel;
  // The opaque key: ai_sessions.session_id (site/app) OR the conversation id
  // (whatsapp). Empty ⇒ memory disabled (stateless).
  key: string;
  transcript: SessionTurn[];
  toolCalls: ToolCallRecord[];
  slots: SessionSlots;
};

export const MAX_TRANSCRIPT = 12; // 6 user+bot turns
export const MAX_TOOLCALLS = 12;
const MAX_TEXT = 500;
const MAX_SESSION_ID = 64;

function clipTurns(raw: unknown): SessionTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h === "object")
    .map((h) => {
      const o = h as Record<string, unknown>;
      const role = o.role === "user" ? "user" : "bot";
      return { role, text: String(o.text ?? "").slice(0, MAX_TEXT) } as SessionTurn;
    })
    .filter((h) => h.text)
    .slice(-MAX_TRANSCRIPT);
}

function clipToolCalls(raw: unknown): ToolCallRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t) => {
      const o = t as Record<string, unknown>;
      return {
        name: String(o.name ?? "").slice(0, 40),
        ok: o.ok === true,
        at: String(o.at ?? new Date().toISOString()),
        preview: o.preview ? String(o.preview).slice(0, 80) : undefined,
      } as ToolCallRecord;
    })
    .filter((t) => t.name)
    .slice(-MAX_TOOLCALLS);
}

function clipSlots(raw: unknown): SessionSlots {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: SessionSlots = {};
  if (typeof o.category === "string") out.category = o.category;
  if (Number.isFinite(Number(o.budget))) out.budget = Number(o.budget);
  if (typeof o.abroad === "boolean") out.abroad = o.abroad;
  if (typeof o.topic === "string") out.topic = o.topic;
  if (typeof o.name === "string") out.name = o.name.slice(0, 80);
  if (typeof o.phone === "string") out.phone = o.phone.slice(0, 20);
  if (typeof o.consent === "boolean") out.consent = o.consent;
  if (typeof o.leadCaptured === "boolean") out.leadCaptured = o.leadCaptured;
  // New conversation-shaping slots (all optional, defensively clipped). String
  // arrays are de-duped, item-length-bounded, and capped so a poisoned jsonb
  // can't grow unbounded.
  if (Array.isArray(o.rejectedPlanIds)) {
    const ids = o.rejectedPlanIds
      .filter((x) => typeof x === "string")
      .map((x) => (x as string).slice(0, 64))
      .filter((x) => x);
    if (ids.length) out.rejectedPlanIds = [...new Set(ids)].slice(-MAX_REJECTED);
  }
  if (Array.isArray(o.objections)) {
    const objs = o.objections
      .filter((x) => typeof x === "string")
      .map((x) => (x as string).slice(0, 120))
      .filter((x) => x);
    if (objs.length) out.objections = [...new Set(objs)].slice(-MAX_OBJECTIONS);
  }
  if (Number.isFinite(Number(o.turnCount))) {
    out.turnCount = Math.max(0, Math.floor(Number(o.turnCount)));
  }
  if (typeof o.lastToolName === "string" && o.lastToolName) {
    out.lastToolName = o.lastToolName.slice(0, 40);
  }
  return out;
}

// An empty (stateless) session for a channel + key.
export function emptySession(channel: Channel, key: string): ChatSession {
  return { channel, key, transcript: [], toolCalls: [], slots: {} };
}

// A sane, length-bounded site/app session id: clip + reject anything that isn't
// a safe id char so it can't smuggle a PostgREST filter. Empty ⇒ memory off.
export function safeSessionId(raw: unknown): string {
  const s = String(raw ?? "").trim().slice(0, MAX_SESSION_ID);
  return /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : "";
}

// ── LOAD ─────────────────────────────────────────────────────────────────────
// Site/app: read public.ai_sessions by session_id; we store the unified envelope
// ({transcript,toolCalls,slots}) in the `messages` jsonb. For backward compat we
// also accept a legacy bare-array `messages` (the pre-agent transcript shape).
async function loadAiSession(key: string): Promise<ChatSession> {
  const base = emptySession("site", key);
  if (!key) return base;
  const rows = await fetchRows<{ messages?: unknown }>(
    `/rest/v1/ai_sessions?select=messages&session_id=eq.${encodeURIComponent(key)}&limit=1`,
  );
  if (!rows || rows.length === 0) return base;
  const m = rows[0].messages;
  if (Array.isArray(m)) {
    // Legacy shape: a bare transcript array.
    base.transcript = clipTurns(m);
    return base;
  }
  if (m && typeof m === "object") {
    const o = m as Record<string, unknown>;
    base.transcript = clipTurns(o.transcript);
    base.toolCalls = clipToolCalls(o.toolCalls);
    base.slots = clipSlots(o.slots);
  }
  return base;
}

// WhatsApp: the conversation row already carries ai_state (the webhook's slot
// context). We fold the unified envelope into ai_state.agent so the webhook's
// own top-level slots (category/budget/abroad/topic) stay where they are and
// remain readable by the existing parseContext. Loading reads both.
async function loadWhatsappSession(conversationId: string): Promise<ChatSession> {
  const base = emptySession("whatsapp", conversationId);
  if (!conversationId) return base;
  const rows = await fetchRows<{ ai_state?: unknown }>(
    `/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(conversationId)}&select=ai_state&limit=1`,
  );
  if (!rows || rows.length === 0) return base;
  const st = rows[0].ai_state;
  if (!st || typeof st !== "object") return base;
  const o = st as Record<string, unknown>;
  // Top-level slots written by the webhook's mergeContext.
  base.slots = clipSlots(o);
  const agent = o.agent;
  if (agent && typeof agent === "object") {
    const a = agent as Record<string, unknown>;
    base.transcript = clipTurns(a.transcript);
    base.toolCalls = clipToolCalls(a.toolCalls);
    // agent.slots wins over top-level for the lead/consent bits.
    base.slots = { ...base.slots, ...clipSlots(a.slots) };
  }
  return base;
}

// Load the unified session for a channel + key. Fail-soft: errors → empty.
export async function loadSession(channel: Channel, key: string): Promise<ChatSession> {
  try {
    if (channel === "whatsapp") return await loadWhatsappSession(key);
    return await loadAiSession(key); // site + app share ai_sessions
  } catch (e) {
    jlog({ at: "session.load", channel, ok: false, error: String(e) });
    return emptySession(channel, key);
  }
}

// ── SAVE ─────────────────────────────────────────────────────────────────────
function cap(session: ChatSession): ChatSession {
  return {
    ...session,
    transcript: session.transcript.slice(-MAX_TRANSCRIPT),
    toolCalls: session.toolCalls.slice(-MAX_TOOLCALLS),
  };
}

async function saveAiSession(s: ChatSession, ip?: string): Promise<boolean> {
  const messages = { transcript: s.transcript, toolCalls: s.toolCalls, slots: s.slots };
  const r = await serviceFetch(`/rest/v1/ai_sessions?on_conflict=session_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      session_id: s.key,
      messages,
      ip: ip || null,
      updated_at: new Date().toISOString(),
    }),
  });
  return !!r && r.ok;
}

async function saveWhatsappSession(s: ChatSession): Promise<boolean> {
  // Preserve the webhook's top-level slots AND nest the agent envelope under
  // ai_state.agent. PATCH the whole ai_state jsonb (the webhook does the same).
  const aiState: Record<string, unknown> = {
    ...s.slots,
    agent: { transcript: s.transcript, toolCalls: s.toolCalls, slots: s.slots },
  };
  const r = await serviceFetch(
    `/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(s.key)}`,
    { method: "PATCH", body: JSON.stringify({ ai_state: aiState }) },
  );
  return !!r && r.ok;
}

// Persist the capped session. Best-effort: never throws; returns whether the
// write landed (callers ignore it). `ip` only used for the ai_sessions abuse row.
export async function saveSession(session: ChatSession, ip?: string): Promise<boolean> {
  if (!session.key) return false;
  const s = cap(session);
  try {
    const ok = session.channel === "whatsapp" ? await saveWhatsappSession(s) : await saveAiSession(s, ip);
    if (!ok) jlog({ at: "session.save", channel: session.channel, ok: false });
    return ok;
  } catch (e) {
    jlog({ at: "session.save", channel: session.channel, ok: false, error: String(e) });
    return false;
  }
}

// ── Mutators the agent uses between turns ────────────────────────────────────
export function appendTurn(session: ChatSession, role: "user" | "bot", text: string): void {
  const t = String(text ?? "").trim().slice(0, MAX_TEXT);
  if (!t) return;
  session.transcript.push({ role, text: t });
  if (session.transcript.length > MAX_TRANSCRIPT) {
    session.transcript = session.transcript.slice(-MAX_TRANSCRIPT);
  }
}

export function recordToolCall(session: ChatSession, name: string, ok: boolean, preview?: string): void {
  const clean = String(name).slice(0, 40);
  session.toolCalls.push({
    name: clean,
    ok,
    at: new Date().toISOString(),
    preview: preview ? String(preview).slice(0, 80) : undefined,
  });
  if (session.toolCalls.length > MAX_TOOLCALLS) {
    session.toolCalls = session.toolCalls.slice(-MAX_TOOLCALLS);
  }
  // Keep the cheap "what just happened" slots in sync with the audit. turnCount
  // counts recorded tool calls across the session's lifetime (bounded by the DB
  // jsonb, not by MAX_TOOLCALLS which only caps the audit tail).
  if (clean) {
    session.slots.lastToolName = clean;
    session.slots.turnCount = (typeof session.slots.turnCount === "number" ? session.slots.turnCount : 0) + 1;
  }
}

// Merge newly-learned slots; new non-empty values win, old ones fill gaps.
// The two string-array slots (rejectedPlanIds/objections) UNION rather than
// overwrite, so the agent can append the one plan/objection it just learned
// without first re-reading and re-sending the whole list. De-duped + capped.
export function mergeSlots(session: ChatSession, patch: Partial<SessionSlots>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") continue;
    if ((k === "rejectedPlanIds" || k === "objections") && Array.isArray(v)) {
      const incoming = v.filter((x): x is string => typeof x === "string" && !!x);
      if (!incoming.length) continue;
      const prev = Array.isArray(session.slots[k]) ? (session.slots[k] as string[]) : [];
      const cap = k === "rejectedPlanIds" ? MAX_REJECTED : MAX_OBJECTIONS;
      session.slots[k] = [...new Set([...prev, ...incoming])].slice(-cap);
      continue;
    }
    session.slots[k] = v;
  }
}

// The recent transcript as the {role,text} turns the AI layer expects (ChatTurn).
export function asChatTurns(session: ChatSession): SessionTurn[] {
  return session.transcript.slice(-MAX_TRANSCRIPT);
}
