// Shared plumbing for the crm-api action modules — extracted from index.ts so
// the actions_*.ts modules and the thin gate+router can import it without
// cycles: CORS/JSON response builders, the batched PostgREST lookup helpers,
// the crm_events / security-audit loggers, and the exact-count reader.

import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { auditDetail, eventPreview, s } from "./crm_logic.ts";

export type Row = Record<string, unknown>;

// ── CORS + JSON (mirrors site-subscribe) ─────────────────────────────────────
export function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────
export const q = encodeURIComponent;

// Most-recent message body per conversation, for snippet columns. Returns a map
// conversationId → { body, at }. One query over the candidate conversation ids.
export async function lastMessages(
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
export async function contactsById(ids: string[]): Promise<Map<string, Row>> {
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
export async function leadStatusById(ids: string[]): Promise<Map<string, string>> {
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
export async function logCrmEvent(ev: {
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
export async function logAudit(
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

// Exact row count via a ranged read (Range: 0-0) reading the Content-Range
// header. PostgREST answers a ranged read with 206 Partial Content, which is a
// 2xx so `r.ok` is true; anything else (or no creds) counts as 0.
export async function countRows(path: string): Promise<number> {
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
