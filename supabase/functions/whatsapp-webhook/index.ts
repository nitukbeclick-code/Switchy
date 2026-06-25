// Switchy WhatsApp Cloud API webhook — an advanced, grounded AI agent + CRM.
//
// GET  = Meta webhook verification (echoes hub.challenge when the verify token matches).
// POST = incoming messages; authenticated via X-Hub-Signature-256 (HMAC-SHA256 of
//        the RAW body with the Meta App Secret). For each message the agent:
//          1. de-dupes by Meta wamid (idempotent — Meta retries),
//          2. persists contact + conversation + message (the CRM data layer),
//          3. routes by intent: catalogue Q&A / recommendation (grounded Gemini),
//             bill PHOTO (Gemini Vision), or human handoff (creates a lead → the
//             existing notify-lead trigger pings the Telegram rep workflow),
//          4. replies via the Graph API and stores the outbound message.
//
// Deploy with verify_jwt=false (Meta cannot send a Supabase JWT) — the signature
// check below is the auth.  supabase functions deploy whatsapp-webhook --no-verify-jwt
// Env: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_TOKEN, optional
// WHATSAPP_PHONE_ID/GRAPH_API_VERSION; Gemini via vault gemini_api_key (or
// GEMINI_API_KEY/GOOGLE_AI_KEY), optional GROQ_API_KEY/OPENROUTER_API_KEY;
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for persistence.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { fetchRows, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import {
  buildRecommendBlock,
  buildSuggestions,
  catalogueProviders,
  CATEGORY_HE,
  normalizeCategory,
  normalizeProvider,
  type Plan,
  plansFromRows,
} from "../_shared/catalogue.ts";
import {
  type AiKeys,
  callGeminiVision,
  type ChatTurn,
  extractJson,
  transcribeAudio,
  VISION_PROMPT,
} from "../_shared/ai.ts";
// Shared Cloud API toolkit (fail-soft): markRead/markTyping make the bot feel
// responsive, sendList drives the >3-option category picker. sendText keeps its
// signature but now retries once on a 5xx internally — see _shared/whatsapp.ts.
import {
  type ListSection,
  markRead as waMarkRead,
  markTyping as waMarkTyping,
  sendList as waSendList,
  sendText as waSendText,
} from "../_shared/whatsapp.ts";
import {
  classifyTextIntent,
  isOptedOut,
  messageText,
  OPTOUT_CONFIRM_REPLY,
  withFirstContactNotice,
} from "./intents.ts";
// §30A opt-out + Amendment-13 (access/erasure) are unified in _shared/compliance.ts
// so every channel shares ONE detector. isOptOut here is the BROAD contains-match
// (he/en/ar/ru + multi-word + slash) that supersedes the old narrow intents.ts
// RE_OPTOUT; the access/erasure helpers are deterministic + cheap and run right
// after the opt-out check, before any agent fan-out.
import {
  isDataAccessRequest,
  isErasureRequest,
  isOptOut,
  recordErasureRequest,
  summarizeDataFor,
} from "../_shared/compliance.ts";
import {
  type ConvContext,
  effectiveTopic,
  extractSlots,
  mergeContext,
  parseContext,
} from "./context.ts";
import { buildSavingHint, buildTopicReply } from "./flows.ts";
import { captureAiLead } from "../_shared/leads.ts";
// §7b: the SAME commission disclosure create_lead surfaces (single source of
// truth). Prepended to the deterministic human-handoff replies so a customer who
// reaches a commission-bearing rep is told Switchy may earn a commission — exactly
// as the agent's create_lead tool does.
import { COMMISSION_DISCLOSURE } from "../_shared/tools.ts";
import { type AgentRunnerDeps, runWhatsappAgent } from "./agent_runner.ts";
// Live-relay (human takeover): when a rep has the conversation, forward the
// customer's inbound text to the rep's Telegram chat so they see the live
// conversation. Reuses the shared telegram sender + config resolver — we do NOT
// reinvent sending.
import { esc as tgEsc, sendTelegram } from "../_shared/telegram.ts";
import { resolveCfgCached } from "../_shared/config.ts";
import { captureError } from "../_shared/observability.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1202423646285095";
const GRAPH_VER = Deno.env.get("GRAPH_API_VERSION") ?? "v21.0";

const enc = new TextEncoder();

// Abuse guard: at most this many inbound messages per contact per hour will fan
// out to a (paid) AI call; beyond it the bot sends a soft "one moment" reply.
const PER_CONTACT_HOURLY = 30;
const MAX_MEDIA_BYTES = 6_000_000;
// Hard cap on the inbound text/caption/transcript fed to the (paid) agent — a
// cheap runaway-token guard. A WhatsApp text body is already bounded by Meta, but
// a malicious/garbled payload (or a very long voice-note transcript) shouldn't be
// allowed to balloon the prompt. We TRUNCATE rather than reject so the customer
// still gets a grounded answer to (the start of) what they sent. The DB row is
// separately clipped to 4000; this bounds what the model actually sees.
const MAX_INBOUND_TEXT = 2000;

// Truncate an inbound text/caption/transcript to the agent-input cap. Total +
// fail-soft: a non-string collapses to "" and never throws. Exported so the cap
// can be pinned in tests without booting the server.
export function capInbound(s: string): string {
  const t = (s ?? "");
  return t.length > MAX_INBOUND_TEXT ? t.slice(0, MAX_INBOUND_TEXT) : t;
}

// Cheap in-memory per-sender burst shed (process-local; the shared fixed-window
// limiter). This is a SECOND layer in FRONT of the per-contact hourly DB cap
// (overLimit): it sheds a tight loop — a leaked-secret flood or a retry storm of
// distinct wamids from one number — BEFORE any DB/AI work, without a round-trip.
// Deliberately generous so only abuse trips it; the HMAC signature gate remains
// the real auth and overLimit remains the durable per-hour quota. Fail-soft: any
// throw here is swallowed and treated as "allowed" so the limiter can never drop
// a legitimate message.
const SENDER_BURST_LIMIT = 20;
const SENDER_BURST_WINDOW_MS = 60_000;

// Exported so the fail-soft burst-shed contract can be pinned in tests. `now` is
// passed through to the (injectable-clock) shared limiter so a test needs no timers.
export function senderBurstOk(from: string, now?: number): boolean {
  try {
    return rateLimit(`wa:${from}`, SENDER_BURST_LIMIT, SENDER_BURST_WINDOW_MS, now).allowed;
  } catch (_) {
    return true; // never let the limiter itself drop a message
  }
}

// WhatsApp renders very long bubbles awkwardly (and Graph hard-caps a text body
// at 4096). A grounded recommend block + reasons can run long, so we split any
// reply past this soft budget into ordered bubbles on natural boundaries. Kept
// well under Meta's hard limit so a single chunk is always sendable.
const CHUNK_SOFT_LIMIT = 1000;
// Small pause between ordered chunks so they arrive (and render) in order rather
// than racing — WhatsApp orders by receipt, and back-to-back posts can invert.
const CHUNK_GAP_MS = 350;

// Catalogue is loaded once per function instance from the live public.plans
// table (service-role read) — always fresh, no bundled snapshot to redeploy.
let _plans: Plan[] | null = null;
async function getPlans(): Promise<Plan[]> {
  if (_plans) return _plans;
  const rows = await fetchRows<Record<string, unknown>>(
    "/rest/v1/plans?select=id,provider,category,price,price_unit,specs,subtitle,kind,title&limit=1000",
  );
  _plans = rows ? plansFromRows(rows) : [];
  return _plans;
}

// Gemini API key: Vault first (gemini_api_key, via the shared config RPC the
// site-* functions also use), then env. Cached for the instance lifetime.
let _geminiKey: string | null = null;
async function geminiKey(): Promise<string> {
  if (_geminiKey !== null) return _geminiKey;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (url && key) {
      const r = await fetch(`${url}/rest/v1/rpc/get_lead_notify_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: "{}",
      });
      if (r.ok) {
        const j = await r.json();
        const v = String(j?.gemini_api_key ?? "").trim();
        if (v) { _geminiKey = v; return v; }
      }
    }
  } catch (_) { /* fall through to env */ }
  _geminiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_KEY") ?? "";
  return _geminiKey;
}

// ── auth ─────────────────────────────────────────────────────────────────────

// Constant-time compare of our computed HMAC against Meta's X-Hub-Signature-256.
async function validSignature(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET || !header) return false;
  const expected = header.startsWith("sha256=") ? header.slice(7) : header;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ── outbound (Graph API) ─────────────────────────────────────────────────────

// Sends a text reply; returns Meta's wamid (for idempotent outbound storage) or
// null. Delegates to the shared _shared/whatsapp.ts sendText so EVERY outbound
// path (here + the CRM) sends identically AND gets the retry-once-on-5xx that
// helper now does internally. The signature + fail-soft contract are unchanged:
// a missing token / bad request / network throw still returns null, exactly as
// the old inline implementation did. (PHONE_ID/GRAPH_VER are read by the shared
// module from the same env with the same Switchy defaults.)
async function sendText(to: string, body: string): Promise<string | null> {
  return await waSendText(to, body);
}

// Quick-reply button ids (echoed back by Meta in interactive.button_reply.id)
// and their Hebrew labels. Kept ≤ 3 (Meta's hard cap) and ≤ 20 chars each.
const BTN_COMPARE = "cmp";
const BTN_BILL = "bill";
const BTN_HUMAN = "human";
const MENU_BUTTONS: { id: string; title: string }[] = [
  { id: BTN_COMPARE, title: "השוואת מסלול" },
  { id: BTN_HUMAN, title: "דבר עם נציג" },
  { id: BTN_BILL, title: "ניתוח חשבון" },
];

// Category-picker list rows (sent as an interactive LIST, not buttons, because
// there are 5 categories and Meta caps buttons at 3). Each row id is prefixed
// "cat:" + the canonical catalogue category so the inbound-tap router can seed
// that category and drop straight into the grounded compare flow — reusing the
// SAME compare handler the "השוואת מסלול" button already triggers (no new path).
const CAT_ROW_PREFIX = "cat:";
// Budget quick-reply button rows (≤ 3, so these go out as real buttons). Tapping
// one seeds the budget and runs the recommend flow. The "no cap" row recommends
// the best value with no ceiling. Ids are "bud:<n>" / "bud:any".
const BUD_BTN_PREFIX = "bud:";

// The ordered category list shown in the picker — canonical category + its
// Hebrew label from the shared CATEGORY_HE map (single source of truth).
const PICKER_CATEGORIES = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
] as const;

// Build the interactive-list sections for the category picker. Pure (no I/O) so
// the row ids/labels can be pinned in tests. One section, one row per category,
// each row id = "cat:<category>" and title = the Hebrew label (≤ 24 chars, well
// within Meta's cap). The compare button id is intentionally NOT here — this is
// the drill-down AFTER the user chose "compare".
export function buildCategoryPickerSections(): ListSection[] {
  return [{
    title: "קטגוריות",
    rows: PICKER_CATEGORIES.map((c) => ({
      id: `${CAT_ROW_PREFIX}${c}`,
      title: CATEGORY_HE[c] ?? c,
    })),
  }];
}

// The dynamic budget quick-reply buttons (≤ 3). Reuses the existing button path:
// each id is "bud:<n>"/"bud:any" and routes to the recommend flow with the budget
// seeded. Pure so the option set is testable.
export function buildBudgetButtons(): { id: string; title: string }[] {
  return [
    { id: `${BUD_BTN_PREFIX}50`, title: "עד ₪50" },
    { id: `${BUD_BTN_PREFIX}100`, title: "עד ₪100" },
    { id: `${BUD_BTN_PREFIX}any`, title: "הכי משתלם" },
  ];
}

// Parse a picker/budget tap id back into a slot patch. Returns the canonical
// category for a "cat:*" id, the numeric budget for "bud:<n>" (null budget for
// "bud:any"), or null when the id isn't one of ours. Pure + total.
export function parsePickerTapId(
  id: string,
): { category?: string; budget?: number | null } | null {
  const raw = (id ?? "").trim();
  if (raw.startsWith(CAT_ROW_PREFIX)) {
    const cat = normalizeCategory(raw.slice(CAT_ROW_PREFIX.length));
    return cat ? { category: cat } : null;
  }
  if (raw.startsWith(BUD_BTN_PREFIX)) {
    const v = raw.slice(BUD_BTN_PREFIX.length);
    if (v === "any") return { budget: null };
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? { budget: Math.round(n) } : null;
  }
  return null;
}

// Sends a text body with up to 3 reply buttons; returns Meta's wamid or null.
// Falls back to a plain text send if the interactive call is rejected (so the
// customer never gets silence), preserving the same outbound-storage contract.
async function sendButtons(
  to: string,
  body: string,
  buttons: { id: string; title: string }[] = MENU_BUTTONS,
): Promise<string | null> {
  if (!TOKEN) { jlog({ at: "wa.sendButtons", ok: false, error: "WHATSAPP_TOKEN not set" }); return null; }
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body.slice(0, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      }),
    });
    if (!res.ok) {
      jlog({ at: "wa.sendButtons", ok: false, status: res.status, msg: await res.text().catch(() => "") });
      return await sendText(to, body); // graceful degrade to plain text
    }
    const j = await res.json().catch(() => ({}));
    return j?.messages?.[0]?.id ?? null;
  } catch (e) {
    jlog({ at: "wa.sendButtons", ok: false, error: String(e) });
    return await sendText(to, body);
  }
}

// Split a reply into ordered bubbles, each ≤ `limit` chars, on the most natural
// boundary available: paragraph breaks first (blank line), then single newlines,
// then sentence ends, then whitespace, and only as a last resort a hard cut. A
// short reply returns a single-element array unchanged, so the common case is a
// no-op. Pure + total (never throws, never drops text) so the boundary logic can
// be pinned in tests. The concatenation of the result always equals the input
// with run-of-blank-lines normalised between merged paragraphs.
export function chunkReply(text: string, limit = CHUNK_SOFT_LIMIT): string[] {
  const body = (text ?? "").trim();
  if (!body) return [];
  if (body.length <= limit) return [body];

  // Greedily pack paragraphs (split on blank lines) into chunks; a paragraph
  // that is itself too long is recursively broken on softer boundaries.
  const paras = body.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) chunks.push(cur);
    cur = "";
  };
  for (const para of paras) {
    const piece = para.trim();
    if (!piece) continue;
    if (piece.length > limit) {
      // The paragraph alone overflows — flush what we have, then break it.
      flush();
      for (const sub of breakLong(piece, limit)) chunks.push(sub);
      continue;
    }
    const joined = cur ? `${cur}\n\n${piece}` : piece;
    if (joined.length <= limit) {
      cur = joined;
    } else {
      flush();
      cur = piece;
    }
  }
  flush();
  return chunks.length ? chunks : [body.slice(0, limit)];
}

// Break a single over-long block on softer boundaries: newline → sentence end →
// space → hard cut. Always makes progress (a chunk is never empty) so it can't
// loop. Used only by chunkReply for a paragraph that exceeds the limit on its own.
function breakLong(block: string, limit: number): string[] {
  const out: string[] = [];
  let rest = block.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    // Prefer the latest newline, then sentence terminator, then space.
    let cut = Math.max(
      window.lastIndexOf("\n"),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf(". "),
      window.lastIndexOf("׃ "),
      window.lastIndexOf("; "),
    );
    if (cut < limit * 0.5) cut = window.lastIndexOf(" "); // avoid a tiny first piece
    if (cut <= 0) cut = limit; // no boundary at all → hard cut
    else cut += 1; // keep the boundary char on the left piece
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Send a (possibly long) text reply as one or more ordered bubbles, pausing
// briefly between them so WhatsApp renders them in order. Returns the wamid of
// the FIRST bubble (the one we store as the canonical outbound row) or null.
// Each send goes through sendText, which already retries once on a 5xx; we add a
// one-shot retry around the FIRST bubble specifically so the stored message is as
// reliable as possible. Fail-soft throughout — a failed later chunk is logged,
// never thrown.
async function sendChunkedText(to: string, body: string): Promise<string | null> {
  const parts = chunkReply(body);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    // Single bubble: send once, and retry once on a null (covers a transient
    // failure the shared 5xx-retry didn't catch, e.g. a network throw).
    let id = await sendText(to, parts[0]);
    if (!id) id = await sendText(to, parts[0]);
    return id;
  }
  let firstId: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    let id = await sendText(to, parts[i]);
    if (i === 0) {
      if (!id) id = await sendText(to, parts[i]); // protect the canonical bubble
      firstId = id;
    } else if (!id) {
      jlog({ at: "wa.chunk", ok: false, idx: i, total: parts.length });
    }
    // Brief inter-bubble gap so ordering holds; skip after the last one.
    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, CHUNK_GAP_MS));
    }
  }
  return firstId;
}

// Inbound media → raw bytes (two bearer-gated, short-lived Graph hops). The
// shared download core: a bill image and a voice note both fetch the same way,
// they only differ in how the bytes are consumed (base64 for Vision, raw bytes
// for Whisper). Returns the codec mime + the bytes, or null on any failure /
// over-size (fail-soft). `fallbackMime` is used when Graph omits content-type.
async function downloadMediaBytes(
  mediaId: string,
  fallbackMime: string,
): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  if (!TOKEN) return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${mediaId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!meta.ok) { jlog({ at: "wa.media", ok: false, step: "lookup", status: meta.status }); return null; }
    const { url } = await meta.json();
    if (!url) return null;
    const bin = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!bin.ok) { jlog({ at: "wa.media", ok: false, step: "fetch", status: bin.status }); return null; }
    const bytes = new Uint8Array(await bin.arrayBuffer());
    if (bytes.length > MAX_MEDIA_BYTES) { jlog({ at: "wa.media", ok: false, step: "size", bytes: bytes.length }); return null; }
    return { mimeType: bin.headers.get("content-type") || fallbackMime, bytes };
  } catch (e) {
    jlog({ at: "wa.media", ok: false, error: String(e) });
    return null;
  }
}

// Inbound bill image → bytes → base64 (for Gemini Vision's inlineData).
async function downloadMedia(mediaId: string): Promise<{ mimeType: string; data: string } | null> {
  const got = await downloadMediaBytes(mediaId, "image/jpeg");
  if (!got) return null;
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < got.bytes.length; i += chunk) s += String.fromCharCode(...got.bytes.subarray(i, i + chunk));
  return { mimeType: got.mimeType, data: btoa(s) };
}

// Inbound voice note → transcript (Groq Whisper). Downloads the audio bytes then
// transcribes them in Hebrew. Returns "" on any failure (no token, unreadable
// media, no Groq key, STT failure) so the caller sends a friendly "write to me
// instead" nudge — never throws. The transcript, when non-empty, is fed to the
// SAME agent path as a typed message.
async function transcribeVoiceNote(mediaId: string, aiKeys: AiKeys): Promise<string> {
  if (!aiKeys.groq) return "";
  const audio = await downloadMediaBytes(mediaId, "audio/ogg");
  if (!audio) return "";
  return await transcribeAudio(aiKeys.groq, audio);
}

// ── persistence (service-role PostgREST) ─────────────────────────────────────

type Row = Record<string, unknown>;

// POST helper that can target a unique column (upsert / ignore-duplicates) and
// optionally return the affected row(s).
async function pgInsert(
  table: string,
  body: Row,
  opts: { onConflict?: string; merge?: boolean; ignore?: boolean; returnRep?: boolean } = {},
): Promise<Row[] | null> {
  const prefer: string[] = [];
  if (opts.merge) prefer.push("resolution=merge-duplicates");
  if (opts.ignore) prefer.push("resolution=ignore-duplicates");
  prefer.push(opts.returnRep ? "return=representation" : "return=minimal");
  const qs = opts.onConflict ? `?on_conflict=${encodeURIComponent(opts.onConflict)}` : "";
  const r = await serviceFetch(`/rest/v1/${table}${qs}`, {
    method: "POST",
    headers: { Prefer: prefer.join(",") },
    body: JSON.stringify(body),
  });
  if (!r) return null;
  if (!r.ok) { jlog({ at: "pgInsert", table, ok: false, status: r.status }); return null; }
  if (!opts.returnRep) return [];
  return await r.json().catch(() => []) as Row[];
}

async function pgPatch(table: string, filter: string, body: Row): Promise<void> {
  await serviceFetch(`/rest/v1/${table}?${filter}`, { method: "PATCH", body: JSON.stringify(body) });
}

// Append a Reg.13 audit record (best-effort, never blocks the reply). The
// service_role bypasses RLS on security_audit_log, so a plain insert is enough;
// we store no PII beyond the WhatsApp phone (the data subject of the request).
async function logSecurityEvent(event: string, detail: Row): Promise<void> {
  try {
    await pgInsert("security_audit_log", { event, detail });
  } catch (e) {
    jlog({ at: "wa.audit", ok: false, event, error: String(e) });
  }
}

async function upsertContact(phone: string, name?: string): Promise<Row | null> {
  const now = new Date().toISOString();
  const body: Row = { wa_phone: phone, last_inbound_at: now, last_message_at: now };
  if (name) body.wa_name = name;
  const rows = await pgInsert("whatsapp_contacts", body, { onConflict: "wa_phone", merge: true, returnRep: true });
  if (rows && rows.length) return rows[0];
  // Fall back to a plain select if the upsert returned nothing.
  const got = await fetchRows<Row>(`/rest/v1/whatsapp_contacts?wa_phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`);
  return got && got.length ? got[0] : null;
}

async function getOrCreateConversation(contactId: string): Promise<Row | null> {
  const open = await fetchRows<Row>(
    `/rest/v1/whatsapp_conversations?contact_id=eq.${contactId}&status=in.(open,bot,human)&order=created_at.desc&limit=1&select=id,status,bot_enabled,ai_state,relay_tg_chat_id`,
  );
  if (open && open.length) return open[0];
  const created = await pgInsert("whatsapp_conversations", { contact_id: contactId, status: "open" }, { returnRep: true });
  return created && created.length ? created[0] : null;
}

// True when the AI bot may auto-reply on this conversation. The gate column
// (whatsapp_conversations.bot_enabled, see supabase/crm-takeover-2026-06.sql)
// defaults true; a human takeover sets it false. We fail OPEN only when the
// column is genuinely absent/undefined (older row before the migration) so the
// bot keeps working pre-migration; an explicit `false` always silences it.
function botEnabled(convo: Row | null): boolean {
  if (!convo) return true;
  const v = convo.bot_enabled;
  if (v === undefined || v === null) return true; // column not present yet → behave as before
  return v !== false;
}

// RELAY-ACTIVE = a rep has taken the conversation over (bot_enabled=false) AND a
// relay target is set (whatsapp_conversations.relay_tg_chat_id, see the takeover
// contract). When both hold, an inbound customer message is forwarded to the rep's
// Telegram chat so they follow the live conversation; NULL relay = no relay.
function relayChatId(convo: Row | null): string | null {
  if (!convo) return null;
  const v = convo.relay_tg_chat_id;
  if (v === undefined || v === null) return null;
  const id = String(v).trim();
  return id || null;
}

// Forward ONE inbound customer message to the rep's Telegram relay chat. This is
// the customer→rep half of the live relay (rep→customer is the CRM/telegram side):
// the customer is in an ACTIVE human conversation, so this is NOT marketing and
// runs only AFTER the §30A opt-out gate. Best-effort + fail-soft: a Telegram error
// never blocks going silent for the human takeover. The customer inbound is already
// stored above — we send nothing back to the customer and store no new outbound.
async function relayInboundToRep(contact: Row, convo: Row, text: string): Promise<void> {
  const chatId = relayChatId(convo);
  if (!chatId) return;
  const who = String(contact.wa_name ?? "").trim() || String(contact.wa_phone ?? "").trim() || "לקוח";
  // HTML-escape the customer-controlled label + body (sendTelegram posts parse_mode
  // HTML), and clip the body so a long message can't blow past Telegram's limit.
  const body = tgEsc(text.slice(0, 3500));
  const prefix = `📩 <b>${tgEsc(who)}</b>:`;
  try {
    const cfg = await resolveCfgCached();
    // Route to the rep's specific relay chat (not the team default tgChat) by
    // overriding tgChat on the resolved config — sendTelegram sends to cfg.tgChat.
    await sendTelegram({ ...cfg, tgChat: chatId }, `${prefix} ${body}`);
  } catch (e) {
    jlog({ at: "wa.relay", ok: false, convId: String(convo.id), error: String(e) });
  }
}

// Append a crm_events audit row (inbound/outbound/system) for the activity feed
// the admin CRM streams. Best-effort: never blocks or fails the reply flow. The
// preview is whitespace-collapsed + clipped to 80 chars and NEVER carries bytes.
async function logCrmEvent(
  ev: { conversationId?: string | null; contactId?: string | null; actor: string; event: string; preview?: string },
): Promise<void> {
  const preview = (ev.preview ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
  await pgInsert("crm_events", {
    conversation_id: ev.conversationId ?? null,
    contact_id: ev.contactId ?? null,
    actor: ev.actor,
    event: ev.event,
    preview,
  });
}

// Recent turns for memory, excluding the just-stored inbound row (so the current
// message isn't duplicated — it's passed separately to generateReply).
async function recentHistory(convId: string, excludeId?: string | null): Promise<ChatTurn[]> {
  const ex = excludeId ? `&id=neq.${excludeId}` : "";
  const rows = await fetchRows<Row>(
    `/rest/v1/whatsapp_messages?conversation_id=eq.${convId}${ex}&order=created_at.desc&limit=8&select=direction,body`,
  );
  if (!rows) return [];
  return rows
    .reverse()
    .map((r) => ({ role: r.direction === "in" ? "user" : "bot", text: String(r.body ?? "") }))
    .filter((h) => h.text);
}

async function overLimit(contactId: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const rows = await fetchRows<Row>(
    `/rest/v1/whatsapp_messages?contact_id=eq.${contactId}&direction=eq.in&created_at=gte.${since}&select=id`,
  );
  return (rows?.length ?? 0) > PER_CONTACT_HOURLY;
}

// First contact = the only stored message is the one we just inserted (no prior
// turns at all). Drives the one-time WELCOME with the quick-reply menu.
async function isFirstContact(contactId: string, excludeId?: string | null): Promise<boolean> {
  const ex = excludeId ? `&id=neq.${excludeId}` : "";
  const rows = await fetchRows<Row>(
    `/rest/v1/whatsapp_messages?contact_id=eq.${contactId}${ex}&select=id&limit=1`,
  );
  return (rows?.length ?? 0) === 0;
}

// ── intents ──────────────────────────────────────────────────────────────────
// The intent regexes + classifyTextIntent routing live in intents.ts (imported
// above) so they can be unit-tested without booting the server — single source
// of truth. See tests/whatsapp_webhook_test.ts.

const FALLBACK_REPLY =
  'סליחה, נתקלתי בעומס רגעי 🙏 אפשר לנסות שוב עוד רגע, או להשוות הכול ב-https://switchy-ai.com . רוצה שאחבר אותך לנציג אנושי?';

// One-time greeting for a brand-new contact — explains what the bot can do,
// then offers the quick-reply menu (sent as interactive buttons).
const WELCOME_REPLY =
  'היי, אני העוזר החכם של Switchy AI 🤖\nאני משווה בשבילך מסלולי סלולר, אינטרנט, טלוויזיה וחבילות חו"ל ועוזר לחסוך בחשבון. אפשר לשאול אותי כל דבר, לשלוח צילום של החשבון לניתוח, או לבחור למטה 👇';

// Sent right after the welcome buttons land — primes the conversation.
const BILL_PROMPT_REPLY =
  'אפשר לשלוח לי צילום של החשבון הנוכחי 📄 ואחזיר ניתוח עם מסלולים זולים יותר. או פשוט לכתוב לי מי הספק והסכום החודשי.';

const COMPARE_PROMPT_REPLY =
  'בכיף! מה נשווה — סלולר, אינטרנט, טלוויזיה או חבילת חו"ל? ואם יש תקציב חודשי או ספק נוכחי, ספר/י לי ואדייק את ההמלצה 🙂';

// Marketing opt-out (STOP). Flips the contact to opted_out + clears the marketing
// flag, sends EXACTLY ONE confirmation (directly here, not via the normal reply
// path), records the consent withdrawal for the audit trail, and signals the
// caller to RETURN without any AI reply. Stays fully fail-soft: even if the DB
// patch is blocked, the person still gets the confirmation so they know they're
// out, and the failure is logged.
// Exported so the §30A opt-out side-effects (durable suppression + the PII-free
// breadcrumb log shape) can be exercised in tests; all DB/send helpers it calls
// are fail-soft and no-op without service-role env, so the test needs no DB.
export async function handleOptOut(contact: Row, inText: string): Promise<void> {
  const phone = String(contact.wa_phone ?? "");
  await pgPatch("whatsapp_contacts", `id=eq.${contact.id}`, {
    opted_in_marketing: false,
    status: "opted_out",
    last_message_at: new Date().toISOString(),
  });
  // §30A durable opt-out: append the phone to the cross-channel suppression
  // registry so EVERY proactive sender (the savings-watch watcher, any future
  // SMS/email/WhatsApp blast) honours this STOP — not just this conversation's
  // opted_out flag. UNIQUE(channel, contact) → re-opting-out is a harmless no-op
  // (ignore-duplicates). Best-effort: never blocks the single confirmation below.
  if (phone) {
    await pgInsert(
      "marketing_suppression",
      { channel: "whatsapp", contact: phone, reason: "whatsapp_stop" },
      { onConflict: "channel,contact", ignore: true },
    );
  }
  await logSecurityEvent("whatsapp_marketing_opt_out", {
    channel: "whatsapp",
    wa_phone: phone,
    contact_id: contact.id,
    trigger: inText.slice(0, 120),
  });
  // ONE confirmation, sent + stored as the only outbound for this message.
  const sentId = await sendText(phone, OPTOUT_CONFIRM_REPLY);
  const convId = contact._convId ? String(contact._convId) : null;
  if (convId) {
    await pgInsert("whatsapp_messages", {
      conversation_id: convId,
      contact_id: contact.id,
      direction: "out",
      actor: "bot",
      msg_type: "text",
      body: OPTOUT_CONFIRM_REPLY,
      wa_message_id: sentId,
      status: sentId ? "sent" : "failed",
    });
  }
  // Privacy-Law: do NOT put the phone (PII) in the structured log. The durable,
  // authoritative opt-out record already lives in marketing_suppression (and the
  // security_audit_log row above); this line is just an operational breadcrumb.
  jlog({ at: "wa.optout", ok: true });
}

// Send ONE deterministic reply and store it as the single outbound for this
// inbound — the same send+store shape handleOptOut uses, reused by the
// Amendment-13 access/erasure paths so those replies land on the CRM thread too.
// Fully fail-soft: sendText returns null without service-role/Graph env and the
// store is best-effort, so the customer is always acknowledged.
async function sendStoredReply(contact: Row, reply: string): Promise<void> {
  const phone = String(contact.wa_phone ?? "");
  const sentId = await sendText(phone, reply);
  const convId = contact._convId ? String(contact._convId) : null;
  if (convId) {
    await pgInsert("whatsapp_messages", {
      conversation_id: convId,
      contact_id: contact.id,
      direction: "out",
      actor: "bot",
      msg_type: "text",
      body: reply.slice(0, 4000),
      wa_message_id: sentId,
      status: sentId ? "sent" : "failed",
    });
  }
}

// Create the hand-off lead (Telegram rep card via the leads trigger) and flip the
// contact to handed_off. Returns whether the lead landed. Shared by the explicit
// handoff intent AND the agent's escalate_to_human tool, so both paths behave
// identically (one source of truth for "raise a human"). This is a SERVICE action
// — no marketing consent is required (the person asked for a human).
async function createHandoffLead(contact: Row, inText: string, history: ChatTurn[]): Promise<boolean> {
  const transcript = history
    .slice(-4)
    .map((h) => `${h.role === "user" ? "לקוח" : "בוט"}: ${h.text}`)
    .join("\n");
  const phone = String(contact.wa_phone ?? "");
  const name = String(contact.wa_name ?? "").trim() || phone;
  const created = await pgInsert("leads", {
    name,
    phone,
    source: "whatsapp",
    notes: `שיחת WhatsApp:\n${transcript}\n\nהודעה אחרונה: ${inText}`.slice(0, 900),
  }, { returnRep: true });
  // The leads AFTER-INSERT trigger fires notify-lead → Telegram rep card.
  const leadId = created && created.length ? created[0].id : null;
  await pgPatch("whatsapp_contacts", `id=eq.${contact.id}`, {
    status: "handed_off",
    ...(leadId ? { lead_id: leadId } : {}),
  });
  return !!created;
}

// Deterministic human-handoff reply text. §7b: a hand-off reaches a commission-
// bearing rep, so BOTH replies (the success line and the rate-limited fallback)
// MUST carry the SAME commission disclosure create_lead surfaces — the customer is
// told Switchy may earn a commission before the rep follows up. Pure + total so the
// disclosure contract can be pinned in tests without the DB. `ok` selects success
// vs. the insert-blocked reassurance; the existing copy is kept verbatim after the
// disclosure.
export function buildHandoffReply(ok: boolean): string {
  if (!ok) {
    // Insert blocked (e.g. per-phone rate limit) — still reassure the customer.
    return `${COMMISSION_DISCLOSURE}\nאני כאן לכל שאלה 🙂 רשמתי שתרצה/י לדבר עם נציג — ננסה לחזור אליך בהקדם. בינתיים אפשר לשאול אותי כל דבר על המסלולים.`;
  }
  return `${COMMISSION_DISCLOSURE}\nמעולה 🙌 נציג אנושי שלנו יחזור אליך כאן בוואטסאפ בהקדם. בינתיים אפשר להמשיך לשאול אותי כל דבר על המסלולים והמחירים.`;
}

async function handleHandoff(contact: Row, inText: string, history: ChatTurn[]): Promise<string> {
  const ok = await createHandoffLead(contact, inText, history);
  return buildHandoffReply(ok);
}

// A bill photo, read by Gemini Vision into grounded facts. Returns the extracted
// {provider, monthly, category} (the agent's analyze_bill turns it into cheaper
// suggestions) plus a deterministic `fallbackReply` used verbatim when the agent
// path is unavailable (no Gemini key, image unreadable, or amount not found).
// `hint` is null only when we couldn't read a usable monthly amount.
type BillExtract = {
  hint: { provider?: string; monthly: number; category?: string; imageId?: string } | null;
  fallbackReply: string;
};

async function extractBillHint(mediaId: string, aiKeys: AiKeys): Promise<BillExtract> {
  if (!aiKeys.gemini) {
    return {
      hint: null,
      fallbackReply: "אפשר לכתוב לי מה הספק הנוכחי והסכום החודשי, ואמליץ על מסלולים זולים יותר 🙂",
    };
  }
  const plans = await getPlans();
  const providers = catalogueProviders(plans);
  const img = await downloadMedia(mediaId);
  if (!img) {
    return {
      hint: null,
      fallbackReply: "לא הצלחתי לקרוא את התמונה 🙏 אפשר לשלוח שוב, או פשוט לכתוב לי מה הספק והסכום החודשי?",
    };
  }
  let out = "";
  try {
    out = await callGeminiVision(aiKeys.gemini, VISION_PROMPT.replace("__PROVIDERS__", providers.join(", ")), img);
  } catch (e) {
    jlog({ at: "wa.bill", ok: false, error: String(e) });
    return {
      hint: null,
      fallbackReply: "לא הצלחתי לנתח את החשבון כרגע 🙏 אפשר לנסות שוב, או לכתוב לי את הספק והסכום החודשי?",
    };
  }
  const ex = extractJson(out);
  const monthly = Number(ex?.monthly);
  if (!ex || !(monthly > 0)) {
    return {
      hint: null,
      fallbackReply: "לא הצלחתי לקרוא את הסכום מהחשבון 🙏 אפשר לשלוח תמונה ברורה יותר, או לכתוב לי את הספק והסכום החודשי?",
    };
  }
  const category = normalizeCategory(String(ex.category ?? ""));
  const provider = normalizeProvider(String(ex.provider ?? ""), providers);
  const spend = Math.round(Math.min(5000, Math.max(0, monthly)));
  return {
    hint: { provider: provider || undefined, monthly: spend, category: category || undefined, imageId: mediaId },
    fallbackReply: buildBillFallbackReply(plans, provider, spend, category),
  };
}

// Deterministic, grounded bill reply (the old handleBill body) — used as the
// agent's templateFallback for the bill flow so the customer always gets a real,
// catalogue-backed answer even when the LLM is unavailable.
function buildBillFallbackReply(plans: Plan[], provider: string, spend: number, category: string): string {
  const sugg = buildSuggestions(plans, category, spend, 3);
  const head = `קראתי את החשבון 📄 ${provider ? provider + ", " : ""}סביב ₪${spend} לחודש${category ? ` (${CATEGORY_HE[category] ?? category})` : ""}.`;
  if (!sugg.length) {
    return `${head}\nאשמח לדייק — איזה שירות זה (סלולר/אינטרנט/טלוויזיה)? ואחפש לך מסלול זול יותר. רוצה שאחבר נציג אנושי?`;
  }
  const lines = sugg.map((s) => `• ${s.provider} — ${s.name}: ₪${s.price}${s.annualSaving > 0 ? ` (חיסכון עד ~₪${s.annualSaving} בשנה)` : ""}`);
  return `${head}\nכמה מסלולים זולים יותר:\n${lines.join("\n")}\n\nרוצה שאחבר אותך לנציג שיסדר את המעבר?`;
}

// The DETERMINISTIC chat fallback — the agent's last-resort templateFallback for
// a free-text turn. The agent already tried the Gemini tool loop AND the no-tools
// grounded text chain (Gemini→Groq→OpenRouter) before reaching here, so this does
// NOT make another LLM call: it returns a grounded, catalogue-backed nudge built
// from the context we've gathered (a real recommend block when we know the
// category, else the generic FALLBACK_REPLY). Never fabricates a plan/price.
function buildChatFallback(plans: Plan[], recommend: boolean, ctx: ConvContext): string {
  if (recommend || ctx.category) {
    const block = buildRecommendBlock(
      plans,
      { category: ctx.category, budget: ctx.budget, abroad: ctx.abroad },
      3,
    );
    if (block) {
      const heCat = ctx.category ? (CATEGORY_HE[ctx.category] ?? ctx.category) : "";
      const head = heCat ? `כמה מסלולי ${heCat} מתאימים מהקטלוג שלנו 👇` : "כמה מסלולים מתאימים מהקטלוג שלנו 👇";
      return `${head}\n${block}\n\nרוצה שאמליץ לפי תקציב מסוים, או אחבר אותך לנציג שיסדר את המעבר?`;
    }
  }
  return FALLBACK_REPLY;
}

// ── per-conversation serialization (warm-isolate mutex) ──────────────────────
// Two DISTINCT-wamid inbound messages for the SAME conversation can arrive close
// together (the wamid dedup only collapses a RETRY of the SAME message, not two
// different ones). Without serialization their load→run→save cycles interleave and
// the second save clobbers the first's memory (a lost-update race on ai_state).
//
// Mitigation: a module-scope Map<key, Promise> that chains handleMessage so only
// ONE turn per conversation runs at a time — the next turn awaits the previous
// one's settlement before it starts. The key is the sender phone (a contact has a
// single open conversation, and the conversation id isn't known until after the DB
// round-trip inside the body), so this serialises per conversation in practice.
//
// SCOPE: in serverless this only serialises within ONE warm isolate. Two isolates
// (cold-start fan-out) still race; true cross-isolate safety would need a DB
// version/lock (optimistic concurrency on ai_state). This is a pragmatic, zero-
// dependency mitigation matched to Switchy's low QPS — most close-together turns
// from one number land on the same warm isolate. Fail-soft: the chain swallows the
// inner result/throw so one turn's failure never blocks the next.
const _convChains = new Map<string, Promise<void>>();

async function handleMessage(m: Row, profileName: string | undefined, aiKeys: AiKeys): Promise<void> {
  const key = String(m?.from ?? "");
  if (!key) return; // no sender → handleMessageInner returns immediately anyway
  // Chain onto any in-flight turn for this conversation. The prior link is already
  // a never-rejecting Promise (we store the .catch'd form below), so the new tail
  // simply awaits it, then runs this turn — serialising load→run→save per sender.
  const prev = _convChains.get(key) ?? Promise.resolve();
  const tail = prev.then(() => handleMessageInner(m, profileName, aiKeys));
  // Store the never-rejecting form as the new tail so the NEXT message waits on it
  // and one turn's throw never poisons the chain. Once it settles, drop the entry —
  // but only if WE are still the current tail (a newer turn may have replaced us) —
  // so the Map can't grow unbounded across distinct senders over the isolate's life.
  const guarded = tail.catch(() => {});
  _convChains.set(key, guarded);
  guarded.then(() => {
    if (_convChains.get(key) === guarded) _convChains.delete(key);
  });
  await tail;
}

async function handleMessageInner(m: Row, profileName: string | undefined, aiKeys: AiKeys): Promise<void> {
  const from = String(m?.from ?? "");
  if (!from) return;
  // Cheap in-memory per-sender burst shed — runs BEFORE any DB/AI work so a tight
  // loop (leaked-secret flood / distinct-wamid retry storm from one number) is
  // dropped without a round-trip. Generous window, so a normal conversation never
  // trips it; the durable per-hour cap (overLimit) + the HMAC gate are untouched.
  // Fail-soft: senderBurstOk swallows any limiter error and returns true.
  if (!senderBurstOk(from)) {
    jlog({ at: "wa.burst", from, ok: false });
    return;
  }
  const wamid = m?.id ? String(m.id) : null;
  const type = String(m?.type ?? "text");
  // A tap arrives as type "interactive": a quick-reply button is under
  // interactive.button_reply.{id,title}; a LIST selection (the category picker we
  // now send) is under interactive.list_reply.{id,title}. We read either, carry
  // the id (cmp/human/bill OR cat:*/bud:*) for routing, and store the title as the
  // body. One `tapReply` accessor so both shapes route through the same branch.
  const tapReply = type === "interactive"
    ? (() => {
      const ix = (m as Row & {
        interactive?: {
          button_reply?: { id?: string; title?: string };
          list_reply?: { id?: string; title?: string };
        };
      }).interactive;
      return ix?.button_reply ?? ix?.list_reply ?? undefined;
    })()
    : undefined;
  const buttonId = tapReply ? String(tapReply.id ?? "") : "";
  // Text + image bodies come from the shared messageText extractor; a tap's label
  // lives in its reply.title, which messageText doesn't cover. Capped to
  // MAX_INBOUND_TEXT — a cheap runaway-token guard before any (paid) AI fan-out.
  // Truncation (not rejection) keeps the bot answering; storage clips separately.
  const text = capInbound(
    type === "interactive" ? String(tapReply?.title ?? "") : messageText(m),
  );

  // 1) Persist contact + conversation, idempotently store the inbound message.
  const contact = await upsertContact(from, profileName);
  const convo = contact ? await getOrCreateConversation(String(contact.id)) : null;
  let insertedId: string | null = null;
  if (convo) {
    const ins = await pgInsert("whatsapp_messages", {
      conversation_id: convo.id,
      contact_id: contact!.id,
      direction: "in",
      actor: "customer",
      msg_type: type,
      body: text.slice(0, 4000),
      wa_message_id: wamid,
      status: "received",
    }, { onConflict: "wa_message_id", ignore: true, returnRep: true });
    if (ins && ins.length === 0 && wamid) {
      jlog({ at: "wa.dup", wamid });
      return; // Meta retry of a message we already handled.
    }
    insertedId = ins && ins.length ? String(ins[0].id) : null;
  }
  // Carry the conversation id on the contact so opt-out (handled before the
  // normal reply path) can store its single outbound against this conversation.
  if (contact && convo) contact._convId = convo.id;

  // Acknowledge receipt with a read tick as soon as we've accepted a NEW (non-
  // duplicate) inbound. This is a benign service acknowledgement — NOT a menu,
  // typing indicator, or marketing — so it's correct for every inbound we handle,
  // including a STOP (the person sees we registered their request) and a
  // human-takeover turn. Best-effort + fail-soft (returns null on any error).
  if (wamid) await waMarkRead(wamid);

  // Audit every (non-duplicate) inbound on the CRM activity feed — this is what
  // a human rep watches while they have a conversation taken over. Logged
  // regardless of the bot gate, so the feed is complete even when the bot is
  // silent. Best-effort.
  if (contact && convo) {
    await logCrmEvent({
      conversationId: String(convo.id),
      contactId: String(contact.id),
      actor: "customer",
      event: "inbound",
      preview: text,
    });
  }

  // 2) Marketing opt-out / STOP — checked FIRST (Spam Law). On a text/quick-reply
  //    match we flip the contact to opted_out, send ONE confirmation, log the
  //    consent withdrawal, and RETURN before any intent routing or AI fan-out.
  //    (Image messages route to bill analysis and never carry an opt-out.)
  if (contact && type !== "image" && isOptOut(text)) {
    await handleOptOut(contact, text);
    return;
  }

  // 2a) Amendment-13 (Privacy Protection Law) data-subject requests — checked
  //     RIGHT AFTER opt-out and BEFORE the human-takeover gate / agent fan-out, so
  //     they are deterministic + cheap (no paid AI). Erasure WINS over access (a
  //     "delete my data" must never resolve to a read-only summary). Both reply
  //     once and RETURN; both are reactive service replies to the person's own
  //     inbound (not marketing). Images carry neither.
  if (contact && type !== "image") {
    const phone = String(contact.wa_phone ?? "");
    if (isErasureRequest(text)) {
      const reply = await recordErasureRequest("whatsapp", phone);
      await sendStoredReply(contact, reply);
      jlog({ at: "wa.erasure", ok: true });
      return;
    }
    if (isDataAccessRequest(text)) {
      const reply = await summarizeDataFor("whatsapp", phone);
      await sendStoredReply(contact, reply);
      jlog({ at: "wa.dataaccess", ok: true });
      return;
    }
  }

  // 2b) HUMAN TAKEOVER GATE. When a rep has taken the conversation over
  //     (whatsapp_conversations.bot_enabled = false) the AI bot must NOT
  //     auto-reply. The inbound is already stored + audited above and STOP was
  //     already honoured (step 2, BEFORE this gate — opt-out always wins); we go
  //     silent for the BOT and let the human handle it. If a relay target is set
  //     (RELAY-ACTIVE), we additionally FORWARD this inbound to the rep's Telegram
  //     chat so they follow the live conversation — instead of the old silent
  //     store-only. The bot still does NOT auto-reply to the customer. Only the
  //     inbound timestamps are touched (no customer-facing outbound, no AI fan-out).
  if (convo && !botEnabled(convo)) {
    jlog({ at: "wa.silent", reason: "human_takeover", convId: String(convo.id) });
    if (contact && type !== "image") {
      // Customer→rep relay (NOT marketing — this is the customer's live human
      // conversation, gated behind the §30A opt-out above). Best-effort.
      await relayInboundToRep(contact, convo, text);
    }
    if (contact) {
      const now = new Date().toISOString();
      await pgPatch("whatsapp_conversations", `id=eq.${convo.id}`, { last_message_at: now });
      await pgPatch("whatsapp_contacts", `id=eq.${contact.id}`, { last_message_at: now });
    }
    return;
  }

  // 3) Abuse guard (per-contact hourly cap on AI fan-out).
  if (contact && await overLimit(String(contact.id))) {
    await sendText(from, "רגע 🙂 אני עונה לפי הסדר — חוזר אליך עוד כמה רגעים.");
    return;
  }

  // 4) Route by intent.
  const history = convo ? await recentHistory(String(convo.id), insertedId) : [];
  // Brand-new contact (no prior turns) → one-time welcome + quick-reply menu.
  const firstContact = contact ? await isFirstContact(String(contact.id), insertedId) : false;
  // Multi-turn memory: the structured context we persisted on prior turns
  // (last category/budget/abroad/topic), merged with whatever THIS message
  // reveals. New slots win; old ones fill the gaps — so a terse follow-up like
  // "וכמה זה עולה?" still routes against the category we were discussing.
  const priorCtx = parseContext(convo?.ai_state);
  let mergedCtx: ConvContext = { ...priorCtx };
  let reply = "";
  let intent = "qa";
  // When true, the reply is sent with the 3-button quick-reply menu instead of
  // plain text (welcome, or any moment we want to re-offer the main actions).
  let withMenu = false;
  // When true, the reply is sent as an interactive LIST (the 5-category picker) —
  // used after the user taps "compare". When true, the reply is sent with the
  // dynamic budget quick-reply buttons — used after they pick a category. Both are
  // reactive drill-downs of an action the user just chose, never proactive blasts.
  let withCategoryPicker = false;
  let withBudgetButtons = false;
  // When true, runWhatsappAgent already persisted ai_state (transcript + slots +
  // tool-call history nested under ai_state.agent). Step 6 must NOT then overwrite
  // ai_state with the bare top-level slots — that would drop the agent envelope.
  // For non-agent turns (welcome / button prompts / explicit handoff) this stays
  // false and step 6 writes mergedCtx as before.
  let agentSaved = false;

  // The agent's side-effect sinks (audit / consent-gated lead / human escalation).
  // Built once per message; only used when we route a turn through runWhatsappAgent.
  // Every sink is best-effort and reuses the webhook's existing honest paths:
  //   • captureLead → _shared/leads.ts captureAiLead (consent===true gate + §7b)
  //   • escalate    → createHandoffLead (service action: lead + status=handed_off)
  const agentDeps: AgentRunnerDeps = {
    conversationId: convo ? String(convo.id) : null,
    contactId: contact ? String(contact.id) : null,
    logCrmEvent: (ev) =>
      logCrmEvent({
        conversationId: convo ? String(convo.id) : null,
        contactId: contact ? String(contact.id) : null,
        actor: ev.actor,
        event: ev.event,
        preview: ev.preview,
      }),
    logSecurityEvent: (event, detail) => logSecurityEvent(event, detail as Row),
    captureLead: (lead) => captureAiLead(lead),
    escalate: (reason) =>
      contact ? createHandoffLead(contact, reason || "המשתמש ביקש נציג", history) : false,
  };

  // Whether this contact has opted out of marketing — computed up here because it
  // ALSO gates the typing indicator: an opted-out person gets reactive service
  // replies but never a "typing…" affordance (treated as part of the proactive
  // surface we suppress for them, alongside the menus). Reused in step 6.
  const optedOut = contact ? isOptedOut(contact.status) : false;
  // Show the "typing…" indicator while we work on the reply (it can involve a
  // Vision + agent round-trip). Suppressed for opted-out contacts. Tied to the
  // inbound wamid per Graph's model. Best-effort; cleared right before we send.
  const canType = !!wamid && !optedOut;
  if (canType) await waMarkTyping(wamid, true);

  // VOICE NOTE → transcript. A WhatsApp voice note (type "audio", with voice:true)
  // or any inbound audio is transcribed to Hebrew text via Groq Whisper, then
  // routed through the SAME free-text agent path as if the customer had typed it.
  // The guard chain above (HMAC / §30A opt-out / human-takeover / rate-limit) is
  // UNTOUCHED — this runs only after all of it. If we can't hear the message (no
  // Groq key, unreadable media, empty transcript), we reply with a friendly ask to
  // write instead. `routeType`/`routeText` let the existing dispatch below treat a
  // successful transcript exactly like a typed message (no duplicated agent block).
  let routeType = type;
  let routeText = text;
  // True once an inbound voice note was successfully transcribed — used to skip
  // the first-contact WELCOME branch so a spoken first message reaches the agent
  // directly (the customer asked something out loud; answer it).
  let transcribed = false;
  if (type === "audio" || type === "voice") {
    intent = "qa";
    const mediaId = (m as Row & { audio?: { id?: string }; voice?: { id?: string } }).audio?.id ??
      (m as Row & { voice?: { id?: string } }).voice?.id;
    const transcript = mediaId ? await transcribeVoiceNote(String(mediaId), aiKeys) : "";
    if (transcript) {
      // Treat the transcript as a typed free-text message: fall through to the
      // text path below by rebranding the routing type + text.
      routeType = "text";
      routeText = transcript;
      transcribed = true;
      jlog({ at: "wa.voice", ok: true, chars: transcript.length });
    } else {
      // Couldn't hear it → friendly Hebrew nudge to write instead. We DON'T fall
      // through (routeType stays "audio"), so no agent/text branch runs below.
      reply = "לא הצלחתי לשמוע את ההודעה הקולית — אפשר לכתוב לי בכתב? 🙏";
      jlog({ at: "wa.voice", ok: false });
      // Persistent audit so a silent voice failure is observable (was the Groq key
      // missing? did the media never arrive?). NO phone/PII — only the two cheap
      // booleans that explain WHY transcription produced nothing. Best-effort.
      await logSecurityEvent("voice_transcription_failed", {
        hasGroqKey: !!aiKeys.groq,
        mediaPresent: !!mediaId,
      });
    }
  }

  if (routeType === "audio" || routeType === "voice") {
    // Voice note we couldn't transcribe — `reply` is already the friendly nudge
    // set above; skip every routing branch and go straight to send (step 5/6).
  } else if (routeType === "image") {
    intent = "bill";
    const mediaId = (m as Row & { image?: { id?: string } }).image?.id;
    if (!mediaId) {
      reply = "שלחת תמונה אבל לא הצלחתי לקרוא אותה — אפשר לשלוח שוב?";
    } else {
      // Read the bill with Vision into grounded facts, then let the AGENT turn
      // them into cheaper suggestions (analyze_bill) so a bill photo gets the
      // same tool-using treatment as text. The deterministic suggestion builder
      // is the agent's templateFallback (used when the LLM is unavailable, or
      // when Vision couldn't read an amount — then we have no hint to pass).
      const bill = await extractBillHint(String(mediaId), aiKeys);
      if (!bill.hint) {
        reply = bill.fallbackReply; // no usable amount → deterministic ask
      } else {
        const r = await runWhatsappAgent({
          sessionKey: convo ? String(convo.id) : "",
          message: text || 'צירפתי צילום של החשבון שלי, אפשר לנתח ולמצוא מסלול זול יותר?',
          plans: await getPlans(),
          keys: aiKeys,
          deps: agentDeps,
          billHint: bill.hint,
          templateFallback: () => bill.fallbackReply,
          slotPatch: bill.hint.category ? { category: bill.hint.category } : undefined,
        });
        reply = r.reply || bill.fallbackReply;
        if (convo) agentSaved = true;
      }
    }
  } else if (buttonId) {
    // Inbound tap (quick-reply button OR list selection) → route by the id.
    // A category/budget picker tap is detected first (parsePickerTapId), then the
    // fixed menu ids, so the drill-down rows can't collide with the menu actions.
    const pick = parsePickerTapId(buttonId);
    if (pick) {
      // Picker drill-down. A category tap seeds the category and offers budget
      // buttons; a budget tap seeds the budget and runs the grounded recommend
      // flow now (reusing the SAME agent path a typed "סלולר עד 50" would take).
      mergedCtx = mergeContext(mergedCtx, { topic: "compare" });
      if (pick.category) mergedCtx.category = pick.category;
      if (pick.budget !== undefined && pick.budget !== null) mergedCtx.budget = pick.budget;
      intent = "recommend";
      if (pick.category && pick.budget === undefined) {
        // Category chosen → ask budget via the dynamic buttons (reactive).
        const heCat = CATEGORY_HE[pick.category] ?? pick.category;
        reply = `מעולה — ${heCat} 👍 מה התקציב החודשי? אפשר לבחור למטה, או פשוט לכתוב לי סכום.`;
        withBudgetButtons = true;
      } else {
        // Budget chosen (or a budget-only tap) → run the grounded recommend flow.
        const plans = await getPlans();
        const templateFallback = (): string =>
          buildChatFallback(plans, true, mergedCtx);
        const r = await runWhatsappAgent({
          sessionKey: convo ? String(convo.id) : "",
          message: text ||
            `ממליץ לי על ${mergedCtx.category ? (CATEGORY_HE[mergedCtx.category] ?? mergedCtx.category) : "מסלול"}${
              mergedCtx.budget ? ` עד ₪${mergedCtx.budget}` : ""
            }`,
          plans,
          keys: aiKeys,
          deps: agentDeps,
          templateFallback,
          slotPatch: {
            ...(mergedCtx.category ? { category: mergedCtx.category } : {}),
            ...(mergedCtx.budget ? { budget: mergedCtx.budget } : {}),
            topic: "compare",
          },
        });
        reply = r.reply || templateFallback();
        if (convo) agentSaved = true;
      }
    } else if (buttonId === BTN_HUMAN) {
      intent = "human";
      reply = contact ? await handleHandoff(contact, text || "נציג אנושי", history) : FALLBACK_REPLY;
    } else if (buttonId === BTN_BILL) {
      intent = "bill";
      reply = BILL_PROMPT_REPLY;
    } else { // BTN_COMPARE (or any unknown id) → offer the category picker.
      intent = "recommend";
      reply = COMPARE_PROMPT_REPLY;
      withCategoryPicker = true;
      // Remember that we're in a compare flow so a terse follow-up — "סלולר עד 50"
      // — is routed straight to the grounded compare template.
      mergedCtx = mergeContext(mergedCtx, { topic: "compare" });
    }
  } else if (firstContact && !transcribed) {
    // First message from this contact → greet, explain, offer the menu. A
    // transcribed voice note skips this (transcribed === true) and routes to the
    // agent below, so a spoken first question gets a real answer, not the menu.
    intent = "greeting";
    reply = WELCOME_REPLY;
    withMenu = true;
  } else {
    const t = routeText.trim();
    // Update the structured memory with anything this message reveals
    // (category/budget/abroad/topic), merged onto what we already knew.
    const slots = extractSlots(t);
    mergedCtx = mergeContext(mergedCtx, slots);
    intent = classifyTextIntent(t);
    if (intent === "human") {
      // An explicit "I want a human" stays a deterministic service action — we
      // don't need an LLM round-trip to honour it (create the lead, reassure).
      reply = contact ? await handleHandoff(contact, t, history) : FALLBACK_REPLY;
    } else {
      // Effective topic for THIS turn (this message's topic, or a continuation of
      // the prior thread) — used both to remember the thread and to build the
      // deterministic templateFallback the agent falls back to.
      const topic = effectiveTopic(t, slots, priorCtx.topic);
      if (topic) {
        mergedCtx.topic = topic;
        intent = topic === "switch" || topic === "cancel" || topic === "coverage" ? "qa" : "recommend";
      } else if (intent === "recommend") {
        // keep intent
      }
      const plans = await getPlans();
      // The deterministic, fully-grounded fallback: a templated topic answer
      // (switch/roaming/compare/cheapest/coverage/cancel) enriched with a real
      // saving hint when we know the budget, else a grounded recommend block.
      const templateFallback = (): string => {
        const templated = topic
          ? buildTopicReply(topic, plans, { category: mergedCtx.category, budget: mergedCtx.budget })
          : null;
        if (templated && topic) {
          const hint = (topic === "compare" || topic === "cheapest")
            ? buildSavingHint(plans, mergedCtx.category, mergedCtx.budget)
            : "";
          return hint ? `${templated}\n\n${hint}` : templated;
        }
        return buildChatFallback(plans, intent === "recommend", mergedCtx);
      };
      // PRIMARY path: the shared tool-using agent. It recommends from the
      // catalogue, captures consent-gated leads (§7b first), books callbacks,
      // and escalates — all via tools — then degrades to the templateFallback
      // above and finally a hard fallback, so the customer always gets a reply.
      const r = await runWhatsappAgent({
        sessionKey: convo ? String(convo.id) : "",
        message: t,
        plans,
        keys: aiKeys,
        deps: agentDeps,
        templateFallback,
        slotPatch: {
          ...(mergedCtx.category ? { category: mergedCtx.category } : {}),
          ...(mergedCtx.budget ? { budget: mergedCtx.budget } : {}),
          ...(mergedCtx.abroad ? { abroad: mergedCtx.abroad } : {}),
          ...(mergedCtx.topic ? { topic: mergedCtx.topic } : {}),
        },
      });
      reply = r.reply || templateFallback();
      if (convo) agentSaved = true;
    }
  }

  // 5) On the contact's FIRST inbound, append the one-line §11 privacy notice
  //    (who we are + privacy-policy link + how to stop). Shown exactly once;
  //    no-op on every later message.
  reply = withFirstContactNotice(reply, firstContact);

  // 6) Reply + store outbound + update CRM timestamps. Clear the typing indicator
  // first (we're about to send). The welcome menu, the category picker, and the
  // budget buttons are all INTERACTIVE; everything else is plain text — and a long
  // plain-text reply is split into ordered bubbles by sendChunkedText. Every path
  // returns a wamid (the first bubble's, for the canonical outbound row), so
  // outbound storage is unchanged.
  // Outbound guard: never send the proactive/marketing quick-reply menu OR the
  // reactive interactive pickers to an opted-out contact — degrade to plain text.
  if (canType) await waMarkTyping(wamid, false);
  const useMenu = withMenu && !optedOut;
  const usePicker = withCategoryPicker && !optedOut;
  const useBudget = withBudgetButtons && !optedOut;
  const interactive = useMenu || usePicker || useBudget;
  let sentId: string | null;
  if (useMenu) {
    sentId = await sendButtons(from, reply); // the 3-action main menu
  } else if (useBudget) {
    sentId = await sendButtons(from, reply, buildBudgetButtons()); // ≤3 → buttons
  } else if (usePicker) {
    // 5 categories > the 3-button cap → an interactive LIST. Degrade to the buttons
    // menu (then plain text) if Graph rejects the list, so the user is never stuck.
    sentId = await waSendList(from, reply, buildCategoryPickerSections()) ??
      await sendButtons(from, reply);
  } else {
    sentId = await sendChunkedText(from, reply); // plain text, chunked if long
  }
  if (convo) {
    await pgInsert("whatsapp_messages", {
      conversation_id: convo.id,
      contact_id: contact!.id,
      direction: "out",
      actor: "bot",
      msg_type: interactive ? "interactive" : "text",
      body: reply.slice(0, 4000),
      wa_message_id: sentId,
      status: sentId ? "sent" : "failed",
    });
    const now = new Date().toISOString();
    await pgPatch("whatsapp_conversations", `id=eq.${convo.id}`, {
      intent,
      last_message_at: now,
      // Persist the multi-turn memory (last category/budget/abroad/topic) so the
      // next inbound continues the thread. Stored in the reserved ai_state jsonb.
      // SKIP when the agent already saved ai_state this turn — its envelope nests
      // the transcript + tool-call history under ai_state.agent, and overwriting
      // with the bare slots here would drop it (the agent's save already carried
      // the same merged top-level slots forward).
      ...(agentSaved ? {} : { ai_state: mergedCtx as Row }),
      ...(intent === "human" ? { status: "human" } : {}),
    });
    await pgPatch("whatsapp_contacts", `id=eq.${contact!.id}`, { last_message_at: now });
    // Audit the bot's outbound on the CRM activity feed (best-effort).
    await logCrmEvent({
      conversationId: String(convo.id),
      contactId: String(contact!.id),
      actor: "bot",
      event: "outbound",
      preview: reply,
    });
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

// The real request logic. Wrapped by the Deno.serve handler below so any
// UNEXPECTED throw is captured for observability (fire-and-forget; dark until a
// Sentry DSN exists) and STILL returns a fail-soft response — every status/shape
// Meta + the verification handshake depend on is preserved exactly.
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // 1) Webhook verification handshake (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    if (mode === "subscribe") return new Response("verification failed", { status: 403 });
    return new Response("Switchy WhatsApp webhook is live", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // 2) Incoming events (POST) — must pass the App Secret signature check
  if (req.method === "POST") {
    const raw = await req.text();
    if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
      jlog({ at: "wa.post", ok: false, error: "bad/missing X-Hub-Signature-256" });
      return new Response("invalid signature", { status: 401 });
    }
    try {
      const body = JSON.parse(raw);
      const value = body?.entry?.[0]?.changes?.[0]?.value;
      const messages = value?.messages;
      if (Array.isArray(messages) && messages.length) {
        const aiKeys: AiKeys = {
          gemini: await geminiKey(),
          groq: Deno.env.get("GROQ_API_KEY") ?? "",
          cerebras: Deno.env.get("CEREBRAS_API_KEY") ?? "",
          openrouter: Deno.env.get("OPENROUTER_API_KEY") ?? "",
        };
        const profileName: string | undefined = value?.contacts?.[0]?.profile?.name;
        for (const m of messages) await handleMessage(m as Row, profileName, aiKeys);
      }
    } catch (e) {
      jlog({ at: "wa.post", ok: false, error: String(e) });
      // Surface the unexpected per-message throw to observability (dark until a
      // DSN exists). Still 200 below so Meta does not hammer retries.
      captureError(e, { fn: "whatsapp-webhook", phase: "process" });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response("OK", { status: 200 });
}

// Observability wrapper (fire-and-forget; dark until a Sentry DSN is configured).
// A throw OUTSIDE handle's own try/catch (e.g. reading the body, the signature
// check) is captured and degraded to the SAME 200 {ok:true} Meta expects, so the
// webhook never 5xx's into a Meta retry storm. captureError never throws/blocks.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "whatsapp-webhook", phase: "request", method: req.method });
    jlog({ at: "wa.post", ok: false, error: String(e) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
