// crm-api actions: the lead pipeline — list/detail, status changes, notes,
// claims, the won-flow saving record, the consented sellable-leads feed, and
// the per-rep leaderboard.

import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import {
  aggregateReps,
  eventPreview,
  LEAD_STATUSES,
  MAX_NOTE_LEN,
  s,
  shapeLeadDetail,
  shapeLeadEvent,
  shapeSellableLead,
} from "./crm_logic.ts";
// The sellable-leads console view reuses the exporter's LEGAL gate so it can never
// drift: isSellable (a lead is sellable ⇔ it has an explicit consent_share_at) +
// SELLABLE_STATUSES (new/contacted/won — a 'lost' lead is never a candidate).
import { isSellable, SELLABLE_STATUSES } from "../lead-export/lib.ts";
import type { Lead } from "../_shared/types.ts";
import { json, logAudit, q, type Row } from "./helpers.ts";

// setLeadStatus {leadId, status} → patch leads.status + lead_events audit row.
export async function actSetLeadStatus(b: Row, actorUid: string): Promise<Response> {
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
export async function actListLeads(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  if (status && !LEAD_STATUSES.has(status)) return json({ error: "סטטוס ליד לא תקין" }, 400);
  const search = s(b.search).trim().toLowerCase();
  const asc = s(b.sort).trim() === "oldest";
  let path =
    `/rest/v1/leads?order=created_at.${asc ? "asc" : "desc"}&limit=200&select=id,name,phone,provider,source,status,created_at,claimed_by`;
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
    claimedBy: s(r.claimed_by) || null,
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
export async function actGetLeadDetail(b: Row): Promise<Response> {
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

// listSellableLeads {status?} → the READ-ONLY third-party-sharing feed for the
// console: ONLY leads carrying an explicit consent_share_at (the SAME hard legal
// gate the lead-export function uses), never a 'lost' lead, through an allowlist
// DTO (no source_ip / notes). Because the business is exposing saleable PII, this
// read is more sensitive than most writes, so EVERY view is audited
// (crm_lead_export: who viewed how many consented leads). It NEVER pushes anything
// to a buyer — the secret-gated lead-export cron stays the only path that can.
export async function actListSellableLeads(b: Row, actorUid: string): Promise<Response> {
  const status = s(b.status).trim();
  const statuses = status && (SELLABLE_STATUSES as readonly string[]).includes(status)
    ? [status]
    : [...SELLABLE_STATUSES];
  const path =
    `/rest/v1/leads?consent_share_at=not.is.null&status=in.(${statuses.map((st) => q(st)).join(",")})` +
    `&order=created_at.desc&limit=500&select=id,name,phone,email,provider,source,status,consent_share_at,created_at`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return json({ error: "שגיאה בטעינת הלידים לשיתוף" }, 502);
  // Defence in depth: re-apply the exporter's isSellable gate even though the query
  // already filtered — a consent-less row can never slip through, ever.
  const leads = rows.filter((r) => isSellable(r as unknown as Lead)).map(shapeSellableLead);
  // Reg.13: the single most audit-sensitive READ — who saw the saleable feed + size.
  await logAudit(actorUid, "crm_lead_export", { count: leads.length, status: status || "all" });
  return json({ leads });
}

// addNote {leadId, note} → append a note to the lead's activity timeline
// (lead_events). Does NOT overwrite the single leads.notes field — the timeline
// preserves history. Clamped; PII-light audit preview.
export async function actAddNote(b: Row, actorUid: string): Promise<Response> {
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

// setLeadNote {leadId, note} → OVERWRITE the single leads.notes field (the primary
// note shown in the drawer). Unlike addNote (append-only), this replaces the field,
// so we record every save on the timeline (event=note_edit) — the sequence of
// note_edit rows IS the edit history, nothing is silently lost. Clamped to
// MAX_NOTE_LEN; the audit stays PII-light (length + clipped preview only).
export async function actSetLeadNote(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  const note = s(b.note).slice(0, MAX_NOTE_LEN);
  if (!leadId) return json({ error: "leadId חסר" }, 400);
  const r = await serviceFetch(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: note || null }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.setLeadNote", ok: false, status: r?.status });
    return json({ error: "עדכון ההערה נכשל" }, 502);
  }
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "note_edit",
    note: note || "(ההערה נמחקה)",
    actor_name: "CRM",
  });
  await logAudit(actorUid, "crm_lead_note_edit", { lead_id: leadId, len: note.length, preview: eventPreview(note) });
  return json({ ok: true });
}

// recordSaving {leadId, annualSaving} → the won-flow: stamp the REAL annual saving
// (₪/year, clamped 0..100000) AND close the lead (status=won), with a timeline
// row. A saving is only ever a real recorded figure — the clamp stops a fat-finger
// from planting a giant fake number.
export async function actRecordSaving(b: Row, actorUid: string): Promise<Response> {
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
export async function actClaimLead(b: Row, actorUid: string): Promise<Response> {
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

// repLeaderboard {} → per-rep performance over the claimed leads: how many each
// rep took, closed as won / lost, and the REAL annual saving they booked. There
// is no PostgREST GROUP BY without an RPC, so we read the claimed leads and
// aggregate in-edge (aggregateReps, pure + tested). Only claimed_by/status/
// actual_saving are read — no name/phone/PII enters the rollup. `capped` flags a
// window overflow so the UI can say the totals are a recent sample, not lifetime.
export async function actRepLeaderboard(): Promise<Response> {
  const LIMIT = 2000;
  const rows = await fetchRows<Row>(
    `/rest/v1/leads?claimed_by=not.is.null&order=created_at.desc&limit=${LIMIT}&select=claimed_by,status,actual_saving`,
  );
  if (rows === null) return json({ error: "שגיאה בטעינת נתוני הנציגים" }, 502);
  return json({ reps: aggregateReps(rows), sampled: rows.length, capped: rows.length >= LIMIT });
}
