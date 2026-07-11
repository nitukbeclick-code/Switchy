// crm-api actions: WhatsApp conversations — the list/thread views, rep replies,
// bot takeover / handback, and the contact lifecycle (status + list).

import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { sendText } from "../_shared/whatsapp.ts";
import {
  clampLimit,
  CONTACT_STATUSES,
  contactName,
  CONVERSATION_STATUSES,
  eventPreview,
  MAX_REPLY_LEN,
  s,
  shapeContact,
  snippet,
} from "./crm_logic.ts";
import {
  contactsById,
  json,
  lastMessages,
  leadStatusById,
  logAudit,
  logCrmEvent,
  q,
  type Row,
} from "./helpers.ts";

// listConversations {status?,search?,limit?} → enriched conversation list.
export async function actListConversations(b: Row): Promise<Response> {
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
export async function actGetThread(b: Row): Promise<Response> {
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
export async function actSendReply(b: Row, actorUid: string): Promise<Response> {
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
export async function actTakeOver(b: Row, actorUid: string): Promise<Response> {
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
export async function actHandBack(b: Row, actorUid: string): Promise<Response> {
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
export async function actSetContactStatus(b: Row, actorUid: string): Promise<Response> {
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
export async function actListContacts(b: Row): Promise<Response> {
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
