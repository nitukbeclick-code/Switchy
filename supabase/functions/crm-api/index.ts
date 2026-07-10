// crm-api — admin CRM backend for the Switchy WhatsApp pipeline.
//
// One POST endpoint, dispatched by a {action} body. EVERY request must carry an
// Authorization: Bearer <supabase user access token> and pass the is_admin gate
// (requireAdmin → 403). All DB access is service-role via _shared/db.ts — the
// app/site never touch the whatsapp_* tables directly.
//
// Actions (see SHARED CONTRACT):
//   overview            → pipeline counts + recent conversations
//   slaMetrics          → speed-to-lead: median response + uncontacted/SLA-breach
//   listConversations   → filtered conversation list
//   getThread           → one conversation's contact + messages
//   sendReply           → store an out/rep message, best-effort Graph send
//                         (implicitly takes over: bot_enabled=false + crm_event)
//   takeOver            → human takes the conversation (bot_enabled=false, silent)
//   handBack            → return control to the AI bot (bot_enabled=true)
//   setContactStatus    → patch whatsapp_contacts.status
//   listContacts        → the WhatsApp-contact lifecycle list
//   setLeadStatus       → patch leads.status + lead_events audit row
//   listLeads           → the lead pipeline
//   listMeetings        → Zoom-booking list · getMeeting → detail + timeline
//   setMeetingStatus    → patch meetings.status + meeting_events audit row
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

import { fetchRows, insertRow, logMeetingEvent, serviceFetch } from "../_shared/db.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { sendText } from "../_shared/whatsapp.ts";
import { jlog } from "../_shared/log.ts";
// Speed-to-lead metrics reuse the SAME shared sources as the Telegram digest/nudge
// so the CRM never drifts from the team's push alerts: the first-response median
// (medianMinutes) and the response-SLA window (SLA_HOURS). Both are pure/side-
// effect-free (lead-digest/lib.ts is explicitly safe to import in isolation).
import { medianMinutes } from "../_shared/digests.ts";
import { SLA_HOURS } from "../lead-digest/lib.ts";
import {
  auditDetail,
  clampLimit,
  CONTACT_STATUSES,
  contactName,
  CONVERSATION_STATUSES,
  eventPreview,
  LEAD_STATUSES,
  MAX_REPLY_LEN,
  MEETING_STATUSES,
  s,
  shapeContact,
  shapeLeadDetail,
  shapeLeadEvent,
  shapeMeeting,
  shapeMeetingDetail,
  shapeMeetingEvent,
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

// Append a Reg.13 security-audit row for an admin CRM control action. This is a
// SEPARATE, tamper-evident trail from the user-facing crm_events feed: it records
// WHO (the verified admin uid) did WHAT to WHICH entity, into the service-role-only
// public.security_audit_log (RLS-locked; see audit-observability-2026-06.sql).
// Best-effort by contract — wrapped so a logging failure NEVER blocks or fails the
// control action it audits. The actor uid + entity ids + a PII-light preview live
// inside `detail`; `event` is the action label. NEVER store bytes/raw message PII.
async function logAudit(
  actorUid: string,
  event: string, // 'crm_takeover' / 'crm_handback' / 'crm_reply' / 'crm_contact_status' / 'crm_lead_status'
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await insertRow("security_audit_log", {
      user_id: actorUid || null,
      event,
      detail: auditDetail(actorUid, detail),
    });
  } catch (e) {
    jlog({ at: "crm.audit", ok: false, event, error: String(e) });
  }
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

// slaMetrics {} → speed-to-lead health for the dashboard. Three real figures:
//   • medianResponseMinutes — median (created_at → contacted_at) over the last 200
//     contacted leads (median, not mean, so one very late reply can't skew it —
//     matches the weekly report's medianContactMinutes).
//   • uncontacted — leads still `new` with no contacted_at (awaiting first touch).
//   • breaching — those uncontacted MORE than SLA_HOURS (the single most actionable
//     number; identical threshold to the Telegram stale-lead nudge).
// Nothing is fabricated: no contacted leads → median null; empty queue → 0.
async function actSlaMetrics(): Promise<Response> {
  const nowMs = Date.now();
  const slaCutoff = q(new Date(nowMs - SLA_HOURS * 3_600_000).toISOString());
  const [uncontacted, breaching, oldestRows, contactedRows] = await Promise.all([
    countRows(`/rest/v1/leads?status=eq.new&contacted_at=is.null&select=id`),
    countRows(`/rest/v1/leads?status=eq.new&contacted_at=is.null&created_at=lt.${slaCutoff}&select=id`),
    fetchRows<Row>(`/rest/v1/leads?status=eq.new&contacted_at=is.null&order=created_at.asc&limit=1&select=created_at`),
    fetchRows<Row>(`/rest/v1/leads?contacted_at=not.is.null&order=contacted_at.desc&limit=200&select=created_at,contacted_at`),
  ]);
  const oldestUncontactedAt = oldestRows && oldestRows.length ? (s(oldestRows[0].created_at) || null) : null;
  const medianResponseMinutes = contactedRows
    ? medianMinutes(contactedRows.map((r) => ({ created_at: s(r.created_at), contacted_at: s(r.contacted_at) })))
    : null;
  return json({
    sla: {
      slaHours: SLA_HOURS,
      uncontacted,
      breaching,
      oldestUncontactedAt,
      medianResponseMinutes,
      responseSampleSize: contactedRows?.length ?? 0,
    },
  });
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
async function actSendReply(b: Row, actorUid: string): Promise<Response> {
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

  // 5) Reg.13 security-audit trail: which admin sent a reply on which conversation
  //    (preview clamped + PII-light; raw body never stored here). Best-effort.
  await logAudit(actorUid, "crm_reply", {
    conversation_id: convId,
    contact_id: contactId || null,
    delivered: Boolean(wamid),
    preview: eventPreview(body),
  });

  return json({ ok: true, messageId: wamid });
}

// takeOver {conversationId, rep?} → a human takes the conversation from the bot.
// Flips bot_enabled OFF (the whatsapp-webhook bot then stores inbound but stays
// silent), marks the conversation 'human', stamps human_active_at, and audits a
// 'takeover' event. Idempotent: taking over an already-human conversation is a
// no-op flip that still records the (re)takeover for the timeline.
async function actTakeOver(b: Row, actorUid: string): Promise<Response> {
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
  // Reg.13 security-audit: which admin took the conversation off the bot.
  await logAudit(actorUid, "crm_takeover", {
    conversation_id: convId,
    contact_id: s(rows[0].contact_id) || null,
    rep: rep || null,
  });
  return json({ ok: true, botEnabled: false });
}

// handBack {conversationId} → return control to the AI bot. Flips bot_enabled
// back ON, marks the conversation 'bot', clears assigned_rep, and audits a
// 'handback' event. Idempotent (handing back a bot-driven conversation is a
// no-op flip that still records the event).
async function actHandBack(b: Row, actorUid: string): Promise<Response> {
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
  // Reg.13 security-audit: which admin handed the conversation back to the bot.
  await logAudit(actorUid, "crm_handback", {
    conversation_id: convId,
    contact_id: s(rows[0].contact_id) || null,
  });
  return json({ ok: true, botEnabled: true });
}

// setContactStatus {contactId, status} → patch whatsapp_contacts.status.
async function actSetContactStatus(b: Row, actorUid: string): Promise<Response> {
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
  // Reg.13 security-audit: which admin set which contact to which status.
  await logAudit(actorUid, "crm_contact_status", { contact_id: contactId, status });
  return json({ ok: true });
}

// listContacts {status?, search?} → the WhatsApp-contact lifecycle list, most
// recently active first. `search` is the same safe in-memory name/phone filter
// as listLeads (never interpolated into the query). Light allowlist DTO.
async function actListContacts(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  if (status && !CONTACT_STATUSES.has(status)) return json({ error: "סטטוס איש קשר לא תקין" }, 400);
  const search = s(b.search).trim().toLowerCase();
  let path =
    `/rest/v1/whatsapp_contacts?order=last_message_at.desc.nullslast&limit=200&select=id,wa_name,wa_phone,status,lead_id,last_message_at`;
  if (status) path += `&status=eq.${q(status)}`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return json({ error: "שגיאה בטעינת אנשי הקשר" }, 502);
  let contacts = rows.map(shapeContact);
  if (search) {
    contacts = contacts.filter((c) =>
      c.name.toLowerCase().includes(search) || c.phone.toLowerCase().includes(search)
    );
  }
  return json({ contacts });
}

// setLeadStatus {leadId, status} → patch leads.status + lead_events audit row.
async function actSetLeadStatus(b: Row, actorUid: string): Promise<Response> {
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
  // Reg.13 security-audit: which admin moved which lead to which pipeline status.
  await logAudit(actorUid, "crm_lead_status", { lead_id: leadId, status });
  return json({ ok: true });
}

// listLeads {status?, search?, sort?} → the lead pipeline. `sort` = "oldest"
// flips to created_at ASC (default newest-first). `search` is an in-memory
// name/phone filter over the fetched window (same safe post-fetch pattern as
// listConversations — never interpolated into the PostgREST query string).
async function actListLeads(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  if (status && !LEAD_STATUSES.has(status)) return json({ error: "סטטוס ליד לא תקין" }, 400);
  const search = s(b.search).trim().toLowerCase();
  const asc = s(b.sort).trim() === "oldest";
  let path =
    `/rest/v1/leads?order=created_at.${asc ? "asc" : "desc"}&limit=200&select=id,name,phone,provider,source,status,created_at`;
  if (status) path += `&status=eq.${q(status)}`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return json({ error: "שגיאה בטעינת הלידים" }, 502);
  let leads = rows.map((r) => ({
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    provider: s(r.provider) || null,
    source: s(r.source) || null,
    status: s(r.status),
    createdAt: s(r.created_at) || null,
  }));
  if (search) {
    leads = leads.filter((l) =>
      l.name.toLowerCase().includes(search) || l.phone.toLowerCase().includes(search)
    );
  }
  return json({ leads });
}

// getLeadDetail {leadId} → one lead's CRM-relevant fields + its lead_events
// activity timeline. This is the ONE place richer lead fields (email, notes,
// claim/contact stamps, actual_saving, consent) are exposed — behind the admin
// gate, via service_role. `source_ip` is deliberately NOT selected (it's a
// rate-limit signal, never CRM data). Nothing is fabricated: absent → null.
async function actGetLeadDetail(b: Row): Promise<Response> {
  const leadId = s(b.leadId).trim();
  if (!leadId) return json({ error: "leadId חסר" }, 400);
  const rows = await fetchRows<Row>(
    `/rest/v1/leads?id=eq.${q(leadId)}&limit=1&select=id,name,phone,email,provider,plan_id,source,callback_time,city,status,created_at,claimed_by,claimed_at,contacted_at,actual_saving,notes,referrer_code,consent_marketing_sms,consent_marketing_email,consent_marketing_whatsapp`,
  );
  if (rows === null) return json({ error: "שגיאה בטעינת הליד" }, 502);
  if (rows.length === 0) return json({ error: "הליד לא נמצא" }, 404);
  const lead = shapeLeadDetail(rows[0]);
  // Append-only audit timeline (status changes / claims / notes / savings).
  const evs = await fetchRows<Row>(
    `/rest/v1/lead_events?lead_id=eq.${q(leadId)}&order=created_at.desc&limit=50&select=id,event,old_status,new_status,actor_name,note,created_at`,
  );
  const events = (evs ?? []).map(shapeLeadEvent);
  return json({ lead, events });
}

// addNote {leadId, note} → append a note to the lead's activity timeline
// (lead_events). Does NOT overwrite the single leads.notes field — the timeline
// preserves history. Clamped; PII-light audit preview.
async function actAddNote(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  const note = s(b.note).trim().slice(0, 2000);
  if (!leadId) return json({ error: "leadId חסר" }, 400);
  if (!note) return json({ error: "אי אפשר להוסיף הערה ריקה" }, 400);
  const wrote = await insertRow("lead_events", {
    lead_id: leadId,
    event: "note",
    note,
    actor_name: "CRM",
  });
  if (!wrote) return json({ error: "שמירת ההערה נכשלה" }, 502);
  await logAudit(actorUid, "crm_lead_note", { lead_id: leadId, preview: eventPreview(note) });
  return json({ ok: true });
}

// recordSaving {leadId, annualSaving} → the won-flow: stamp the REAL annual saving
// (₪/year, clamped 0..100000) AND close the lead (status=won), with a timeline
// row. A saving is only ever a real recorded figure — the clamp stops a fat-finger
// from planting a giant fake number.
async function actRecordSaving(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  if (!leadId) return json({ error: "leadId חסר" }, 400);
  const raw = Number(b.annualSaving);
  const saving = Number.isFinite(raw) ? Math.round(Math.min(100000, Math.max(0, raw))) : NaN;
  if (!Number.isFinite(saving) || saving <= 0) return json({ error: "סכום חיסכון לא תקין" }, 400);
  const r = await serviceFetch(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ actual_saving: saving, status: "won" }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.recordSaving", ok: false, status: r?.status });
    return json({ error: "רישום החיסכון נכשל" }, 502);
  }
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "saving",
    new_status: "won",
    note: `חיסכון שנתי שנרשם: ₪${saving}`,
    actor_name: "CRM",
  });
  await logAudit(actorUid, "crm_lead_saving", { lead_id: leadId, saving });
  return json({ ok: true });
}

// claimLead {leadId, rep} → assign the lead to a named rep (claimed_by + timestamp)
// with a timeline row. `rep` is a display string (same model as assigned_rep /
// crm_events.actor='rep' — no reps table).
async function actClaimLead(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  const rep = s(b.rep).trim().slice(0, 120);
  if (!leadId) return json({ error: "leadId חסר" }, 400);
  if (!rep) return json({ error: "שם נציג חסר" }, 400);
  const r = await serviceFetch(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ claimed_by: rep, claimed_at: new Date().toISOString() }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.claimLead", ok: false, status: r?.status });
    return json({ error: "שיוך הליד נכשל" }, 502);
  }
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "claim",
    note: `שויך ל${rep}`,
    actor_name: rep,
  });
  await logAudit(actorUid, "crm_lead_claim", { lead_id: leadId, rep });
  return json({ ok: true });
}

// ── meetings (Zoom bookings) ───────────────────────────────────────────────

// listMeetings {status?} → upcoming-first meeting list (light, PII-safe shape).
async function actListMeetings(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  if (status && !MEETING_STATUSES.has(status)) return json({ error: "סטטוס פגישה לא תקין" }, 400);
  let path =
    `/rest/v1/meetings?order=starts_at.desc.nullslast,created_at.desc&limit=200&select=id,name,phone,provider,meeting_date,slot,starts_at,status,source,claimed_by`;
  if (status) path += `&status=eq.${q(status)}`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return json({ error: "שגיאה בטעינת הפגישות" }, 502);
  return json({ meetings: rows.map(shapeMeeting) });
}

// getMeeting {meetingId} → one meeting's detail + its meeting_events timeline.
// The ONE place richer meeting fields (email, join_url, notes) are exposed —
// behind the admin gate, via service_role, through the allowlist shaper.
async function actGetMeeting(b: Row): Promise<Response> {
  const meetingId = s(b.meetingId).trim();
  if (!meetingId) return json({ error: "meetingId חסר" }, 400);
  const rows = await fetchRows<Row>(
    `/rest/v1/meetings?id=eq.${q(meetingId)}&limit=1&select=id,name,phone,email,provider,plan_id,meeting_date,slot,starts_at,status,join_url,zoom_meeting_id,notes,source,claimed_by,claimed_at,confirmed_at,created_at`,
  );
  if (rows === null) return json({ error: "שגיאה בטעינת הפגישה" }, 502);
  if (!rows.length) return json({ error: "פגישה לא נמצאה" }, 404);
  const events = await fetchRows<Row>(
    `/rest/v1/meeting_events?meeting_id=eq.${q(meetingId)}&order=created_at.desc&limit=50&select=id,event,old_status,new_status,actor_name,note,created_at`,
  );
  return json({ meeting: shapeMeetingDetail(rows[0]), events: (events ?? []).map(shapeMeetingEvent) });
}

// setMeetingStatus {meetingId,status} → patch meetings.status + meeting_events
// audit row + Reg.13 security-audit. Same fail-closed validation as leads.
async function actSetMeetingStatus(b: Row, actorUid: string): Promise<Response> {
  const meetingId = s(b.meetingId).trim();
  const status = s(b.status).trim();
  if (!meetingId || !status) return json({ error: "meetingId/status חסרים" }, 400);
  if (!MEETING_STATUSES.has(status)) return json({ error: "סטטוס פגישה לא תקין" }, 400);
  const r = await serviceFetch(`/rest/v1/meetings?id=eq.${q(meetingId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.setMeetingStatus", ok: false, status: r?.status });
    return json({ error: "עדכון הפגישה נכשל" }, 502);
  }
  await logMeetingEvent({ meeting_id: meetingId, event: "status_change", new_status: status, actor_name: "CRM" });
  await logAudit(actorUid, "crm_meeting_status", { meeting_id: meetingId, status });
  return json({ ok: true });
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
      case "slaMetrics":
        return await actSlaMetrics();
      case "listConversations":
        return await actListConversations(body);
      case "getThread":
        return await actGetThread(body);
      case "sendReply":
        return await actSendReply(body, admin.uid);
      case "takeOver":
        return await actTakeOver(body, admin.uid);
      case "handBack":
        return await actHandBack(body, admin.uid);
      case "setContactStatus":
        return await actSetContactStatus(body, admin.uid);
      case "listContacts":
        return await actListContacts(body);
      case "setLeadStatus":
        return await actSetLeadStatus(body, admin.uid);
      case "listLeads":
        return await actListLeads(body);
      case "getLeadDetail":
        return await actGetLeadDetail(body);
      case "addNote":
        return await actAddNote(body, admin.uid);
      case "recordSaving":
        return await actRecordSaving(body, admin.uid);
      case "claimLead":
        return await actClaimLead(body, admin.uid);
      case "listMeetings":
        return await actListMeetings(body);
      case "getMeeting":
        return await actGetMeeting(body);
      case "setMeetingStatus":
        return await actSetMeetingStatus(body, admin.uid);
      default:
        return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
    }
  } catch (e) {
    jlog({ at: "crm.dispatch", ok: false, action, error: String(e) });
    return json({ error: "אירעה שגיאה בשרת" }, 500);
  }
});
