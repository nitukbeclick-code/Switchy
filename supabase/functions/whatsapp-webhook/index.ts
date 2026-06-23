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
  VISION_PROMPT,
} from "../_shared/ai.ts";
import {
  classifyTextIntent,
  isOptedOut,
  isOptOut,
  messageText,
  OPTOUT_CONFIRM_REPLY,
  withFirstContactNotice,
} from "./intents.ts";
import {
  type ConvContext,
  effectiveTopic,
  extractSlots,
  mergeContext,
  parseContext,
} from "./context.ts";
import { buildSavingHint, buildTopicReply } from "./flows.ts";
import { captureAiLead } from "../_shared/leads.ts";
import { type AgentRunnerDeps, runWhatsappAgent } from "./agent_runner.ts";

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

// Sends a text reply; returns Meta's wamid (for idempotent outbound storage) or null.
async function sendText(to: string, body: string): Promise<string | null> {
  if (!TOKEN) { jlog({ at: "wa.sendText", ok: false, error: "WHATSAPP_TOKEN not set" }); return null; }
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    if (!res.ok) {
      jlog({ at: "wa.sendText", ok: false, status: res.status, msg: await res.text().catch(() => "") });
      return null;
    }
    const j = await res.json().catch(() => ({}));
    return j?.messages?.[0]?.id ?? null;
  } catch (e) {
    jlog({ at: "wa.sendText", ok: false, error: String(e) });
    return null;
  }
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

// Inbound bill image → bytes → base64 (two bearer-gated, short-lived Graph hops).
async function downloadMedia(mediaId: string): Promise<{ mimeType: string; data: string } | null> {
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
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return { mimeType: bin.headers.get("content-type") || "image/jpeg", data: btoa(s) };
  } catch (e) {
    jlog({ at: "wa.media", ok: false, error: String(e) });
    return null;
  }
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
    `/rest/v1/whatsapp_conversations?contact_id=eq.${contactId}&status=in.(open,bot,human)&order=created_at.desc&limit=1&select=id,status,bot_enabled,ai_state`,
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
  'היי, אני העוזר החכם של חוסך (Switchy) 🤖\nאני משווה בשבילך מסלולי סלולר, אינטרנט, טלוויזיה וחבילות חו"ל ועוזר לחסוך בחשבון. אפשר לשאול אותי כל דבר, לשלוח צילום של החשבון לניתוח, או לבחור למטה 👇';

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
async function handleOptOut(contact: Row, inText: string): Promise<void> {
  const phone = String(contact.wa_phone ?? "");
  await pgPatch("whatsapp_contacts", `id=eq.${contact.id}`, {
    opted_in_marketing: false,
    status: "opted_out",
    last_message_at: new Date().toISOString(),
  });
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
  jlog({ at: "wa.optout", phone, ok: true });
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

async function handleHandoff(contact: Row, inText: string, history: ChatTurn[]): Promise<string> {
  const ok = await createHandoffLead(contact, inText, history);
  if (!ok) {
    // Insert blocked (e.g. per-phone rate limit) — still reassure the customer.
    return "אני כאן לכל שאלה 🙂 רשמתי שתרצה/י לדבר עם נציג — ננסה לחזור אליך בהקדם. בינתיים אפשר לשאול אותי כל דבר על המסלולים.";
  }
  return "מעולה 🙌 נציג אנושי שלנו יחזור אליך כאן בוואטסאפ בהקדם. בינתיים אפשר להמשיך לשאול אותי כל דבר על המסלולים והמחירים.";
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

// ── per-message orchestration ────────────────────────────────────────────────

async function handleMessage(m: Row, profileName: string | undefined, aiKeys: AiKeys): Promise<void> {
  const from = String(m?.from ?? "");
  if (!from) return;
  const wamid = m?.id ? String(m.id) : null;
  const type = String(m?.type ?? "text");
  // A quick-reply tap arrives as type "interactive" with button_reply.{id,title}.
  // We carry the id (cmp/human/bill) for routing and store the title as the body.
  const buttonId = type === "interactive"
    ? String(
      (m as Row & { interactive?: { button_reply?: { id?: string } } }).interactive?.button_reply?.id ?? "",
    )
    : "";
  // Text + image bodies come from the shared messageText extractor; a quick-reply
  // tap's label lives in button_reply.title, which messageText doesn't cover.
  const text = type === "interactive"
    ? String(
      (m as Row & { interactive?: { button_reply?: { title?: string } } }).interactive?.button_reply?.title ?? "",
    )
    : messageText(m);

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

  // 2b) HUMAN TAKEOVER GATE. When a rep has taken the conversation over
  //     (whatsapp_conversations.bot_enabled = false) the AI bot must NOT
  //     auto-reply. The inbound is already stored + audited above and STOP was
  //     already honoured; we simply go silent and let the human handle it. Only
  //     the inbound timestamps are touched (no outbound, no AI fan-out).
  if (convo && !botEnabled(convo)) {
    jlog({ at: "wa.silent", reason: "human_takeover", convId: String(convo.id) });
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

  if (type === "image") {
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
    // Inbound quick-reply tap → route by the button id.
    if (buttonId === BTN_HUMAN) {
      intent = "human";
      reply = contact ? await handleHandoff(contact, text || "נציג אנושי", history) : FALLBACK_REPLY;
    } else if (buttonId === BTN_BILL) {
      intent = "bill";
      reply = BILL_PROMPT_REPLY;
    } else { // BTN_COMPARE (or any unknown id) → the comparison/recommend prompt.
      intent = "recommend";
      reply = COMPARE_PROMPT_REPLY;
      // Remember that we're in a compare flow so the next (likely terse) reply
      // — "סלולר עד 50" — is routed straight to the grounded compare template.
      mergedCtx = mergeContext(mergedCtx, { topic: "compare" });
    }
  } else if (firstContact) {
    // First message from this contact → greet, explain, offer the menu.
    intent = "greeting";
    reply = WELCOME_REPLY;
    withMenu = true;
  } else {
    const t = text.trim();
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

  // 6) Reply + store outbound + update CRM timestamps. The welcome (and any
  // menu-flagged reply) goes out as interactive buttons; everything else stays
  // plain text. Both paths return a wamid, so outbound storage is unchanged.
  // Outbound guard: never send the proactive/marketing quick-reply menu to an
  // opted-out contact — degrade to a plain-text service reply instead.
  const optedOut = contact ? isOptedOut(contact.status) : false;
  const useMenu = withMenu && !optedOut;
  const sentId = useMenu ? await sendButtons(from, reply) : await sendText(from, reply);
  if (convo) {
    await pgInsert("whatsapp_messages", {
      conversation_id: convo.id,
      contact_id: contact!.id,
      direction: "out",
      actor: "bot",
      msg_type: useMenu ? "interactive" : "text",
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

Deno.serve(async (req: Request) => {
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
          openrouter: Deno.env.get("OPENROUTER_API_KEY") ?? "",
        };
        const profileName: string | undefined = value?.contacts?.[0]?.profile?.name;
        for (const m of messages) await handleMessage(m as Row, profileName, aiKeys);
      }
    } catch (e) {
      jlog({ at: "wa.post", ok: false, error: String(e) });
      // Still 200 so Meta does not hammer retries on a transient error.
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response("OK", { status: 200 });
});
