// crm-api — admin CRM backend for the Switchy WhatsApp pipeline.
//
// One POST endpoint, dispatched by a {action} body. EVERY request must carry an
// Authorization: Bearer <supabase user access token> and pass the is_admin gate
// (requireAdmin → 403). All DB access is service-role via _shared/db.ts — the
// app/site never touch the whatsapp_* tables directly.
//
// Actions (see SHARED CONTRACT):
//   overview            → pipeline counts + recent conversations
//   listConversations   → filtered conversation list
//   getThread           → one conversation's contact + messages
//   sendReply           → store an out/rep message, best-effort Graph send
//                         (implicitly takes over: bot_enabled=false + crm_event)
//   takeOver            → human takes the conversation (bot_enabled=false, silent)
//   handBack            → return control to the AI bot (bot_enabled=true)
//   setContactStatus    → patch whatsapp_contacts.status
//   setLeadStatus       → patch leads.status + lead_events audit row
//   listLeads           → the lead pipeline
//
// takeOver/handBack flip whatsapp_conversations.bot_enabled — the single gate the
// whatsapp-webhook checks before any AI auto-reply — and append a crm_events row
// (the admin CRM streams that feed via Realtime). See supabase/crm-takeover-2026-06.sql.
//
// Errors are always JSON {error}: 401 (no/invalid token), 403 (not admin),
// 400 (bad shape), 500 (unexpected). 502 when a DB write fails.
//
// Deploy: supabase functions deploy crm-api   (JWT is verified by us, not the
// gateway — requireAdmin does the real check, so --no-verify-jwt is fine too).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { sendText } from "../_shared/whatsapp.ts";
import { jlog } from "../_shared/log.ts";
import {
  clampLimit,
  CONTACT_STATUSES,
  contactName,
  CONVERSATION_STATUSES,
  eventPreview,
  LEAD_STATUSES,
  MAX_REPLY_LEN,
  s,
  snippet,
} from "./crm_logic.ts";

type Row = Record<string, unknown>;

// Status sets, length caps, and the s/snippet/contactName helpers live in
// crm_logic.ts (imported above) so they can be unit-tested without booting the
// server — this is the single source of truth for those validation/formatting
// rules. See tests/crm_api_test.ts.

// ── CORS + JSON (mirrors site-subscribe) ─────────────────────────────────────
function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────
const q = encodeURIComponent;

// Most-recent message body per conversation, for snippet columns. Returns a map
// conversationId → { body, at }. One query over the candidate conversation ids.
async function lastMessages(
  convIds: string[],
): Promise<Map<string, { body: string; at: string }>> {
  const out = new Map<string, { body: string; at: string }>();
  if (!convIds.length) return out;
  const list = convIds.map((id) => q(id)).join(",");
  // Newest first; we keep only the first row seen per conversation.
  const rows = await fetchRows<Row>(
    `/rest/v1/whatsapp_messages?conversation_id=in.(${list})&order=created_at.desc&select=conversation_id,body,created_at`,
  );
  if (!rows) return out;
  for (const r of rows) {
    const cid = s(r.conversation_id);
    if (!cid || out.has(cid)) continue;
    out.set(cid, { body: s(r.body), at: s(r.created_at) });
  }
  return out;
}

// Map of contactId → contact row, for a batch of ids.
async function contactsById(ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  if (!ids.length) return out;
  const list = ids.map((id) => q(id)).join(",");
  const rows = await fetchRows<Row>(
    `/rest/v1/whatsapp_contacts?id=in.(${list})&select=id,wa_name,wa_phone,status,lead_id`,
  );
  if (!rows) return out;
  for (const r of rows) out.set(s(r.id), r);
  return out;
}

// Map of leadId → leads.status, for a batch of ids.
async function leadStatusById(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  const list = uniq.map((id) => q(id)).join(",");
  const rows = await fetchRows<Row>(`/rest/v1/leads?id=in.(${list})&select=id,status`);
  if (!rows) return out;
  for (const r of rows) out.set(s(r.id), s(r.status));
  return out;
}

// Append a row to the crm_events audit feed (takeover / handback / rep_reply …).
// Best-effort: never blocks or fails the caller, mirrors the lead_events pattern.
// The admin CRM screen streams these via Realtime, so each control action shows
// up on the activity timeline. preview is clamped + PII-light (eventPreview).
async function logCrmEvent(ev: {
  conversationId?: string | null;
  contactId?: string | null;
  actor: string; // 'rep' / 'bot' / 'customer' / 'system'
  event: string; // 'takeover' / 'handback' / 'rep_reply' / 'inbound' / 'outbound'
  preview?: string;
}): Promise<void> {
  await insertRow("crm_events", {
    conversation_id: ev.conversationId || null,
    contact_id: ev.contactId || null,
    actor: ev.actor,
    event: ev.event,
    preview: ev.preview ? eventPreview(ev.preview) : null,
  });
}

// ── actions ──────────────────────────────────────────────────────────────────

// overview {} → pipeline counts (over leads) + up to 12 recent conversations.
async function actOverview(): Promise<Response> {
  const statuses = ["new", "contacted", "won", "lost"] as const;
  const pipeline: Record<string, number> = { new: 0, contacted: 0, won: 0, lost: 0 };
  // Count leads per status — one head request each (cheap, exact via
  // Content-Range), fanned out in parallel so it's a single round-trip wall-time.
  const counts = await Promise.all(
    statuses.map((st) => countRows(`/rest/v1/leads?status=eq.${q(st)}&select=id`)),
  );
  statuses.forEach((st, i) => (pipeline[st] = counts[i]));

  const convs = await fetchRows<Row>(
    `/rest/v1/whatsapp_conversations?order=last_message_at.desc.nullslast,created_at.desc&limit=12&select=id,contact_id,status,last_message_at`,
  );
  if (convs === null) return json({ error: "שגיאה בטעינת הנתונים" }, 502);

  const convIds = convs.map((c) => s(c.id)).filter(Boolean);
  const contactIds = convs.map((c) => s(c.contact_id)).filter(Boolean);
  const [snips, contacts] = await Promise.all([
    lastMessages(convIds),
    contactsById(contactIds),
  ]);

  const recent = convs.map((c) => {
    const cid = s(c.id);
    const contact = contacts.get(s(c.contact_id)) ?? {};
    const last = snips.get(cid);
    return {
      conversationId: cid,
      contactId: s(c.contact_id),
      name: contactName(contact),
      phone: s(contact.wa_phone),
      status: s(c.status),
      lastSnippet: snippet(last?.body),
      lastAt: last?.at || s(c.last_message_at) || null,
    };
  });

  return json({ pipeline, recent });
}

// listConversations {status?,search?,limit?} → enriched conversation list.
async function actListConversations(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  const search = s(b.search).trim();
  const limit = clampLimit(b.limit);
  if (status && !CONVERSATION_STATUSES.has(status)) {
    return json({ error: "סטטוס שיחה לא תקין" }, 400);
  }

  let path =
    `/rest/v1/whatsapp_conversations?order=last_message_at.desc.nullslast,created_at.desc&limit=${limit}&select=id,contact_id,status,intent,last_message_at`;
  if (status) path += `&status=eq.${q(status)}`;
  const convs = await fetchRows<Row>(path);
  if (convs === null) return json({ error: "שגיאה בטעינת השיחות" }, 502);

  const convIds = convs.map((c) => s(c.id)).filter(Boolean);
  const contactIds = convs.map((c) => s(c.contact_id)).filter(Boolean);
  const [snips, contacts] = await Promise.all([
    lastMessages(convIds),
    contactsById(contactIds),
  ]);
  const leadIds = [...contacts.values()].map((c) => s(c.lead_id)).filter(Boolean);
  const leadStatuses = await leadStatusById(leadIds);

  let rows = convs.map((c) => {
    const cid = s(c.id);
    const contact = contacts.get(s(c.contact_id)) ?? {};
    const last = snips.get(cid);
    const leadId = s(contact.lead_id);
    return {
      conversationId: cid,
      contactId: s(c.contact_id),
      name: contactName(contact),
      phone: s(contact.wa_phone),
      status: s(c.status),
      intent: s(c.intent) || null,
      lastSnippet: snippet(last?.body),
      lastAt: last?.at || s(c.last_message_at) || null,
      leadStatus: leadId ? (leadStatuses.get(leadId) || null) : null,
    };
  });

  // In-memory free-text filter over name / phone (kept simple, post-fetch).
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter((r) =>
      r.name.toLowerCase().includes(needle) || r.phone.toLowerCase().includes(needle)
    );
  }

  return json({ conversations: rows });
}

// getThread {conversationId} → contact + ordered messages (oldest→newest).
async function actGetThread(b: Row): Promise<Response> {
  const convId = s(b.conversationId).trim();
  if (!convId) return json({ error: "conversationId חסר" }, 400);

  const convRows = await fetchRows<Row>(
    `/rest/v1/whatsapp_conversations?id=eq.${q(convId)}&limit=1&select=id,contact_id`,
  );
  if (convRows === null) return json({ error: "שגיאה בטעינת השיחה" }, 502);
  if (!convRows.length) return json({ error: "השיחה לא נמצאה" }, 404);

  const contactId = s(convRows[0].contact_id);
  const contactRows = contactId
    ? await fetchRows<Row>(
      `/rest/v1/whatsapp_contacts?id=eq.${q(contactId)}&limit=1&select=id,wa_name,wa_phone,status,lead_id`,
    )
    : [];
  if (contactRows === null) return json({ error: "שגיאה בטעינת איש הקשר" }, 502);
  const contact = contactRows.length ? contactRows[0] : {};
  const leadId = s(contact.lead_id);
  const leadStatuses = leadId ? await leadStatusById([leadId]) : new Map<string, string>();

  const msgRows = await fetchRows<Row>(
    `/rest/v1/whatsapp_messages?conversation_id=eq.${q(convId)}&order=created_at.asc&select=id,direction,actor,body,created_at`,
  );
  if (msgRows === null) return json({ error: "שגיאה בטעינת ההודעות" }, 502);

  const messages = msgRows.map((m) => ({
    id: s(m.id),
    direction: s(m.direction),
    actor: s(m.actor),
    body: s(m.body),
    createdAt: s(m.created_at) || null,
  }));

  return json({
    contact: {
      id: contactId,
      name: contactName(contact),
      phone: s(contact.wa_phone),
      status: s(contact.status),
      leadId: leadId || null,
      leadStatus: leadId ? (leadStatuses.get(leadId) || null) : null,
    },
    messages,
  });
}

// sendReply {conversationId, body} → store out/rep row (authoritative), then
// best-effort Graph send + status update.
async function actSendReply(b: Row): Promise<Response> {
  const convId = s(b.conversationId).trim();
  const body = s(b.body).trim();
  if (!convId) return json({ error: "conversationId חסר" }, 400);
  if (!body) return json({ error: "אי אפשר לשלוח הודעה ריקה" }, 400);
  if (body.length > MAX_REPLY_LEN) return json({ error: "ההודעה ארוכה מדי" }, 400);

  // Resolve the conversation → contact (for the phone we send to + contact_id).
  const convRows = await fetchRows<Row>(
    `/rest/v1/whatsapp_conversations?id=eq.${q(convId)}&limit=1&select=id,contact_id`,
  );
  if (convRows === null) return json({ error: "שגיאה בטעינת השיחה" }, 502);
  if (!convRows.length) return json({ error: "השיחה לא נמצאה" }, 404);
  const contactId = s(convRows[0].contact_id);
  const contactRows = contactId
    ? await fetchRows<Row>(
      `/rest/v1/whatsapp_contacts?id=eq.${q(contactId)}&limit=1&select=id,wa_phone`,
    )
    : [];
  if (contactRows === null) return json({ error: "שגיאה בטעינת איש הקשר" }, 502);
  const phone = contactRows.length ? s(contactRows[0].wa_phone) : "";

  // 1) Best-effort Graph send first so we can record the real wamid + status.
  const wamid = phone ? await sendText(phone, body) : null;
  if (!phone) jlog({ at: "crm.sendReply", ok: false, error: "contact has no phone", convId });

  // 2) DB write is authoritative — store the outbound message regardless of send.
  const wrote = await insertRow("whatsapp_messages", {
    conversation_id: convId,
    contact_id: contactId || null,
    direction: "out",
    actor: "rep",
    msg_type: "text",
    body: body.slice(0, MAX_REPLY_LEN),
    wa_message_id: wamid,
    status: wamid ? "sent" : "failed",
  });
  if (!wrote) return json({ error: "שמירת ההודעה נכשלה" }, 502);

  // 3) A rep reply is an implicit takeover: flip the gate OFF so the bot stops
  //    auto-replying, mark the conversation human, and stamp the human-active
  //    time. Touch the contact + conversation timestamps in the same patch.
  const now = new Date().toISOString();
  await serviceFetch(`/rest/v1/whatsapp_conversations?id=eq.${q(convId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "human",
      bot_enabled: false,
      human_active_at: now,
      last_message_at: now,
    }),
  });
  if (contactId) {
    await serviceFetch(`/rest/v1/whatsapp_contacts?id=eq.${q(contactId)}`, {
      method: "PATCH",
      body: JSON.stringify({ last_message_at: now }),
    });
  }

  // 4) Audit the rep reply on the activity feed (best-effort).
  await logCrmEvent({
    conversationId: convId,
    contactId: contactId || null,
    actor: "rep",
    event: "rep_reply",
    preview: body,
  });

  return json({ ok: true, messageId: wamid });
}

// takeOver {conversationId, rep?} → a human takes the conversation from the bot.
// Flips bot_enabled OFF (the whatsapp-webhook bot then stores inbound but stays
// silent), marks the conversation 'human', stamps human_active_at, and audits a
// 'takeover' event. Idempotent: taking over an already-human conversation is a
// no-op flip that still records the (re)takeover for the timeline.
async function actTakeOver(b: Row): Promise<Response> {
  const convId = s(b.conversationId).trim();
  if (!convId) return json({ error: "conversationId חסר" }, 400);
  const rep = s(b.rep).trim().slice(0, 120);

  const now = new Date().toISOString();
  const patch: Row = { bot_enabled: false, status: "human", human_active_at: now };
  if (rep) patch.assigned_rep = rep;
  const r = await serviceFetch(`/rest/v1/whatsapp_conversations?id=eq.${q(convId)}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.takeOver", ok: false, status: r?.status });
    return json({ error: "המעבר לטיפול אנושי נכשל" }, 502);
  }
  const rows = await r.json().catch(() => []) as Row[];
  if (!Array.isArray(rows) || !rows.length) return json({ error: "השיחה לא נמצאה" }, 404);

  await logCrmEvent({
    conversationId: convId,
    contactId: s(rows[0].contact_id) || null,
    actor: "rep",
    event: "takeover",
    preview: rep ? `נציג ${rep} השתלט על השיחה` : "נציג השתלט על השיחה",
  });
  return json({ ok: true, botEnabled: false });
}

// handBack {conversationId} → return control to the AI bot. Flips bot_enabled
// back ON, marks the conversation 'bot', clears assigned_rep, and audits a
// 'handback' event. Idempotent (handing back a bot-driven conversation is a
// no-op flip that still records the event).
async function actHandBack(b: Row): Promise<Response> {
  const convId = s(b.conversationId).trim();
  if (!convId) return json({ error: "conversationId חסר" }, 400);

  const r = await serviceFetch(`/rest/v1/whatsapp_conversations?id=eq.${q(convId)}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ bot_enabled: true, status: "bot", assigned_rep: null }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.handBack", ok: false, status: r?.status });
    return json({ error: "ההחזרה לבוט נכשלה" }, 502);
  }
  const rows = await r.json().catch(() => []) as Row[];
  if (!Array.isArray(rows) || !rows.length) return json({ error: "השיחה לא נמצאה" }, 404);

  await logCrmEvent({
    conversationId: convId,
    contactId: s(rows[0].contact_id) || null,
    actor: "rep",
    event: "handback",
    preview: "השיחה הוחזרה לבוט האוטומטי",
  });
  return json({ ok: true, botEnabled: true });
}

// setContactStatus {contactId, status} → patch whatsapp_contacts.status.
async function actSetContactStatus(b: Row): Promise<Response> {
  const contactId = s(b.contactId).trim();
  const status = s(b.status).trim();
  if (!contactId || !status) return json({ error: "contactId/status חסרים" }, 400);
  if (!CONTACT_STATUSES.has(status)) return json({ error: "סטטוס איש קשר לא תקין" }, 400);
  const r = await serviceFetch(`/rest/v1/whatsapp_contacts?id=eq.${q(contactId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.setContactStatus", ok: false, status: r?.status });
    return json({ error: "עדכון הסטטוס נכשל" }, 502);
  }
  return json({ ok: true });
}

// setLeadStatus {leadId, status} → patch leads.status + lead_events audit row.
async function actSetLeadStatus(b: Row): Promise<Response> {
  const leadId = s(b.leadId).trim();
  const status = s(b.status).trim();
  if (!leadId || !status) return json({ error: "leadId/status חסרים" }, 400);
  if (!LEAD_STATUSES.has(status)) return json({ error: "סטטוס ליד לא תקין" }, 400);
  const r = await serviceFetch(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.setLeadStatus", ok: false, status: r?.status });
    return json({ error: "עדכון הליד נכשל" }, 502);
  }
  // Audit trail; never blocks the response.
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "status_change",
    new_status: status,
    actor_name: "CRM",
  });
  return json({ ok: true });
}

// listLeads {status?} → the lead pipeline (newest first).
async function actListLeads(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  if (status && !LEAD_STATUSES.has(status)) return json({ error: "סטטוס ליד לא תקין" }, 400);
  let path =
    `/rest/v1/leads?order=created_at.desc&limit=200&select=id,name,phone,provider,source,status,created_at`;
  if (status) path += `&status=eq.${q(status)}`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return json({ error: "שגיאה בטעינת הלידים" }, 502);
  const leads = rows.map((r) => ({
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    provider: s(r.provider) || null,
    source: s(r.source) || null,
    status: s(r.status),
    createdAt: s(r.created_at) || null,
  }));
  return json({ leads });
}

// Exact row count via a ranged read (Range: 0-0) reading the Content-Range
// header. PostgREST answers a ranged read with 206 Partial Content, which is a
// 2xx so `r.ok` is true; anything else (or no creds) counts as 0.
async function countRows(path: string): Promise<number> {
  try {
    const r = await serviceFetch(path, {
      method: "GET",
      headers: { "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0" },
    });
    if (!r || !r.ok) {
      jlog({ at: "crm.countRows", path, ok: false, status: r?.status });
      // Drain any body so the connection can be reused, then bail.
      await r?.text().catch(() => "");
      return 0;
    }
    const cr = r.headers.get("content-range") ?? ""; // e.g. "0-0/42" or "*/42"
    const total = cr.split("/")[1];
    const n = Number(total);
    // Drain the body so the connection can be reused.
    await r.text().catch(() => "");
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    jlog({ at: "crm.countRows", path, ok: false, error: String(e) });
    return 0;
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "POST, OPTIONS" }) });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Admin gate: requireAdmin distinguishes "no/invalid token" from "not admin"
  // only by returning null — so we re-derive the 401-vs-403 split: a present
  // bearer that fails ⇒ 403, an absent bearer ⇒ 401.
  const admin = await requireAdmin(req);
  if (!admin) {
    const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const hasBearer = auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim().length > 0;
    return hasBearer
      ? json({ error: "אין הרשאת ניהול" }, 403)
      : json({ error: "נדרשת התחברות" }, 401);
  }

  let body: Row;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "בקשה לא תקינה" }, 400);
  }
  const action = s(body.action).trim();
  if (!action) return json({ error: "action חסר" }, 400);

  try {
    switch (action) {
      case "overview":
        return await actOverview();
      case "listConversations":
        return await actListConversations(body);
      case "getThread":
        return await actGetThread(body);
      case "sendReply":
        return await actSendReply(body);
      case "takeOver":
        return await actTakeOver(body);
      case "handBack":
        return await actHandBack(body);
      case "setContactStatus":
        return await actSetContactStatus(body);
      case "setLeadStatus":
        return await actSetLeadStatus(body);
      case "listLeads":
        return await actListLeads(body);
      default:
        return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
    }
  } catch (e) {
    jlog({ at: "crm.dispatch", ok: false, action, error: String(e) });
    return json({ error: "אירעה שגיאה בשרת" }, 500);
  }
});
