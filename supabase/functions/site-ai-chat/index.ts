import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// site-ai-chat — חוסך AI  (Track 2E: lead capture + memory + grounding)
//
// Public chat endpoint behind the "חוסך AI" widget on app.html. Three pillars:
//
//  1. GROUNDING — answers are STRICTLY grounded in the real plan catalogue
//     (bundled plans-snapshot.json, the site/data/plans.json shape) via the
//     shared _shared/catalogue.ts. The model only ever sees real rows, each
//     tagged with a citation marker [Sn], and is instructed to cite [Sn] and to
//     OMIT/refuse when data is missing. It can never invent providers/prices.
//
//  2. MULTI-TURN MEMORY — when the client sends a sessionId we load the stored
//     transcript from public.ai_sessions (service role), merge it with the
//     browser-replayed history, answer, then persist the capped transcript. The
//     conversation survives a reload. If the table isn't migrated yet this is a
//     best-effort no-op (the chat still works statelessly via `history`).
//
//  3. LEAD CAPTURE — when the chat detects a genuine switch/contact intent it
//     sets `offerLead:true` so the front-end can collect name+phone+CONSENT. If
//     the client posts that structured `lead`, we capture it into public.leads
//     via _shared/leads.ts — WITH proper consent (mandatory terms+privacy
//     required; per-channel marketing opt-ins optional/default-off, Spam Law).
//     Consent is NEVER fabricated; no consent ⇒ no capture.
//
// POST {
//   message: string,
//   history?: { role: 'user'|'bot', text: string }[],
//   sessionId?: string,                 // opaque, enables cross-reload memory
//   lead?: { name, phone, consent, consent_marketing_sms?, _email?, _whatsapp?,
//            provider?, category?, notes? }   // captured only with consent===true
// }
//   -> { reply: string, offerLead?: boolean, leadCaptured?: boolean, sessionId?: string }
//
// Deploy: supabase functions deploy site-ai-chat --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { firstEnv, resolveCfgCached } from "../_shared/config.ts";
import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { type AiKeys, generateReply, type ReplyMeta } from "../_shared/ai.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { buildCitedCatalogueContext, type Plan, plansFromSnapshot } from "../_shared/catalogue.ts";
import { type AiLeadInput, captureAiLead, detectSwitchIntent } from "../_shared/leads.ts";
import plansSnapshot from "./plans-snapshot.json" with { type: "json" };

const MAX_MESSAGE_LEN = 500;
// Hard ceiling on the raw incoming message — a cheap abuse/cost guard that
// rejects oversized payloads BEFORE any (paid) AI call. The 500-char limit below
// still applies; this is the coarse "obviously abusive" gate.
const MAX_INPUT_LEN = 2000;
const MAX_HISTORY_TURNS = 6;
// Stored transcript cap (12 entries ≈ 6 user+bot turns). The persisted memory is
// bounded so a long chat can't bloat the row or the next prompt.
const MAX_STORED_MESSAGES = 12;
const MAX_OUTPUT_TOKENS = 350;
const PER_IP_HOURLY_LIMIT = 15;
const MAX_SESSION_ID_LEN = 64;

// CORS is per-request now: corsHeaders(req) reflects only an allowlisted Origin
// (this is a public, paid-LLM endpoint — `*` would let any site spend our quota).
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

type ChatTurn = { role: string; text: string };

// Bundled at deploy time (the production site isn't fetched at runtime) — refresh
// plans-snapshot.json from site/data/plans.json and redeploy when prices change.
function loadPlans(): Plan[] {
  return plansFromSnapshot(plansSnapshot);
}

// Grounded Hebrew system prompt: persona + hard rules + the cited catalogue. The
// model only ever sees real rows ([Sn] markers), must cite them, and must OMIT
// when a fact isn't in the list — the E-E-A-T / honesty guarantee.
const SYSTEM_PROMPT_HEADER =
  `את/ה "חוסך AI" — עוזר/ת וירטואלי/ת באתר חוסך, שירות ישראלי להשוואת מסלולי סלולר/אינטרנט/טלוויזיה/חבילה משולבת/חו"ל וחיסכון בחשבונות תקשורת.
כללים מחייבים:
- ענה/י בעברית בלבד, בקצרה (2-4 משפטים), בטון חם ומקצועי.
- התבסס/י אך ורק על נתוני המסלולים שמופיעים למטה (כל שורה מסומנת ב-[Sn]). אסור להמציא ספק, מסלול, מחיר או תכונה שלא מופיעים ברשימה.
- כשמציינים מסלול או מחיר ספציפי, צ_טט/י את המקור בסוגריים מרובעים בסוף המשפט, למשל [S3]. אם אין נתון שתומך בתשובה — אמר/י זאת בכנות ואל תמציא/י; הפנה/י לטופס "קבלו השוואה חינם" או לוואטסאפ.
- אל תבטיח/י חיסכון מדויק לאדם ספציפי — רק טווחים כלליים שמבוססים על הנתונים.
- אם המשתמש/ת רוצה לעבור ספק, לקבל הצעה אישית, שיחזרו אליו/ה, או לדבר עם נציג — עודד/י בעדינות להשאיר שם וטלפון כדי שנחזור עם השוואה (השירות חינמי, ללא התחייבות). אל תבקש/י פרטים רגישים אחרים.
- אל תיתן/י מידע רגיש או לא קשור לתחום התקשורת/האתר.

נתוני מסלולים אמיתיים (מקור | קטגוריה | ספק | מסלול | מחיר | תכונות):
`;

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

// ── Multi-turn memory (public.ai_sessions, service role) ─────────────────────
// A sane, length-bounded session id: clip + strip anything that isn't a safe
// id char so it can't smuggle a PostgREST filter. Empty ⇒ memory disabled.
function safeSessionId(raw: unknown): string {
  const s = String(raw ?? "").trim().slice(0, MAX_SESSION_ID_LEN);
  return /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : "";
}

function sanitizeTurns(raw: unknown): ChatTurn[] {
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

// Load the stored transcript for a session. Fail-soft: any error (table not
// migrated, DB down) yields [] so the chat still works statelessly.
async function loadSession(sessionId: string): Promise<ChatTurn[]> {
  if (!sessionId) return [];
  const rows = await fetchRows<{ messages?: unknown }>(
    `/rest/v1/ai_sessions?select=messages&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`,
  );
  if (!rows || rows.length === 0) return [];
  return sanitizeTurns(rows[0].messages).slice(-MAX_STORED_MESSAGES);
}

// Persist the capped transcript (upsert on session_id). Best-effort: never
// blocks or fails the reply.
async function saveSession(sessionId: string, ip: string, turns: ChatTurn[]): Promise<void> {
  if (!sessionId) return;
  const messages = turns.slice(-MAX_STORED_MESSAGES);
  try {
    // PostgREST upsert: POST with on_conflict + merge-duplicates Prefer.
    const r = await serviceFetch(
      `/rest/v1/ai_sessions?on_conflict=session_id`,
      {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          session_id: sessionId,
          messages,
          ip: ip || null,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!r || !r.ok) jlog({ at: "ai-chat.saveSession", ok: false, status: r?.status });
  } catch (e) {
    jlog({ at: "ai-chat.saveSession", ok: false, error: String(e) });
  }
}

const FRIENDLY_BUSY = "שירות עמוס כרגע, נסו שוב בעוד רגע";
const FALLBACK_REPLY =
  "מצטער/ת, לא הצלחתי לנסח תשובה כרגע — נסו לשאול אחרת או דברו איתנו בוואטסאפ.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const geminiKey = (await resolveCfgCached()).gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  const groqKey = firstEnv(["GROQ_API_KEY"]);
  const openrouterKey = firstEnv(["OPENROUTER_API_KEY"]);
  // Configured if ANY provider in the fallback chain has a key.
  if (!geminiKey && !groqKey && !openrouterKey) {
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

  // ── Memory: stored transcript ⊕ browser-replayed history ───────────────────
  // The stored session is authoritative for older turns; the client history
  // covers the very latest (and works when memory is disabled). Merge by taking
  // stored first, then any client turns not already present, capped.
  const stored = await loadSession(sessionId);
  const merged: ChatTurn[] = [...stored];
  for (const h of clientHistory) {
    if (!merged.some((m) => m.role === h.role && m.text === h.text)) merged.push(h);
  }
  const history = merged.slice(-MAX_HISTORY_TURNS);
  // Honesty signal: tell the client when older turns fell outside the window the
  // model actually saw, so the UI can note the assistant has limited recall of
  // earlier messages (the conversation isn't fully in-context).
  const contextTruncated = merged.length > history.length;

  // ── Grounding: cited catalogue context ─────────────────────────────────────
  const plans = loadPlans();
  const systemPrompt = SYSTEM_PROMPT_HEADER + buildCitedCatalogueContext(plans);

  // ── Generate (shared Gemini → Groq → OpenRouter chain, reply cleaned) ──────
  const keys: AiKeys = { gemini: geminiKey, groq: groqKey, openrouter: openrouterKey };
  const replyMeta: ReplyMeta = { timedOut: false };
  let reply = "";
  try {
    reply = await generateReply(keys, systemPrompt, history, message, MAX_OUTPUT_TOKENS, replyMeta);
  } catch (e) {
    jlog({ at: "ai-chat", ok: false, error: String(e) });
    return json(req, { error: "ai request failed" }, 502);
  }
  // Every provider failed AND at least one aborted on its timeout → 504 so the
  // client can show "try again" rather than a generic error or a fake answer.
  if (!reply && replyMeta.timedOut) {
    jlog({ at: "ai-chat", ok: false, timedOut: true });
    return json(req, { error: FRIENDLY_BUSY }, 504);
  }
  const finalReply = reply || FALLBACK_REPLY;

  // Detect a genuine switch/contact intent so the front-end can offer to collect
  // name+phone+consent. We only OFFER here — capture still requires consent.
  // Suppress the offer if a lead was just captured.
  const offerLead = !leadCaptured && detectSwitchIntent(message);

  // Persist memory: append the new user + bot turn. Best-effort.
  if (sessionId) {
    const next = [...merged, { role: "user", text: message }, { role: "bot", text: finalReply }];
    saveSession(sessionId, ip, next).catch(() => {});
  }
  // Best-effort rate-limit audit row, never blocks the reply.
  insertRow("chat_messages", { ip: ip || null }).catch(() => {});

  const out: Record<string, unknown> = { reply: finalReply };
  if (offerLead) out.offerLead = true;
  if (leadCaptured) out.leadCaptured = true;
  if (contextTruncated) out.contextTruncated = true;
  if (sessionId) out.sessionId = sessionId;
  return json(req, out);
});
