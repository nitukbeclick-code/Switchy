// crm-api actions: the lead pipeline — list/detail, status changes, notes,
// claims, the won-flow saving record, the consented sellable-leads feed, and
// the per-rep leaderboard.

import { fetchRows, insertRow, patchCount, patchCountResult } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import {
  aggregateReps,
  clampListLimit,
  clampOffset,
  eventPreview,
  isUuidish,
  LEAD_SORTS,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  MAX_FOLLOW_UP_NOTE_LEN,
  MAX_LOST_REASON_LEN,
  MAX_NOTE_LEN,
  nextBestLeadAction,
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
import { actorName, err, json, logAudit, q, type Row } from "./helpers.ts";
import { SLA_HOURS } from "../lead-digest/lib.ts";

// setLeadStatus {leadId, status} → patch leads.status + lead_events audit row.
// The row is read first (old_status for the trail + a clean 404) and the PATCH
// goes through patchCountResult, so a missing id is an honest 404 — never
// ok:true with a phantom audit trail. Entering `contacted` stamps contacted_at
// ONLY while it is still null (the guarded PATCH can never overwrite the true
// first-touch time), so console-driven touches feed the speed-to-lead KPIs.
export async function actSetLeadStatus(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  const status = s(b.status).trim();
  const lostReason = s(b.lostReason).trim().slice(0, MAX_LOST_REASON_LEN);
  if (!leadId || !status) return err("leadId/status חסרים", 400, "bad_request");
  if (!isUuidish(leadId)) return err("leadId לא תקין", 400, "bad_request");
  if (!LEAD_STATUSES.has(status)) return err("סטטוס ליד לא תקין", 400, "invalid_status");
  const [cur, actor] = await Promise.all([
    fetchRows<Row>(`/rest/v1/leads?id=eq.${q(leadId)}&limit=1&select=id,status,contacted_at`),
    actorName(actorUid),
  ]);
  if (cur === null) return err("עדכון הליד נכשל", 502, "db_error");
  if (!cur.length) return err("הליד לא נמצא", 404, "not_found");
  const oldStatus = s(cur[0].status) || null;
  const n = await patchCountResult(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    status,
    ...(status === "lost" && lostReason ? { lost_reason: lostReason } : {}),
  });
  if (n === null) {
    jlog({ at: "crm.setLeadStatus", ok: false, leadId });
    return err("עדכון הליד נכשל", 502, "db_error");
  }
  if (n === 0) return err("הליד לא נמצא", 404, "not_found");
  // First touch: stamp contacted_at only-if-null (best-effort; the is.null guard
  // means a lead the Telegram flow already stamped is never re-stamped).
  if (status === "contacted" && !s(cur[0].contacted_at)) {
    await patchCount(`/rest/v1/leads?id=eq.${q(leadId)}&contacted_at=is.null`, {
      contacted_at: new Date().toISOString(),
    });
  }
  // Audit trail — written only after a row REALLY changed; never blocks the response.
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "status_change",
    old_status: oldStatus,
    new_status: status,
    actor_name: actor,
    ...(status === "lost" && lostReason ? { note: `סיבת סגירה: ${lostReason}` } : {}),
  });
  // Reg.13 security-audit: which admin moved which lead to which pipeline status.
  await logAudit(actorUid, "crm_lead_status", {
    lead_id: leadId,
    status,
    old_status: oldStatus,
    has_lost_reason: Boolean(lostReason),
  });
  return json({ ok: true });
}

// setLeadWorkflow {leadId, priority, followUpAt?, followUpNote?, lostReason?}
// → update the rep's next-action controls. The public clients have no column
// grants for these fields; this access-gated service-role action is the only web
// write path. Free text is length-bounded and the security audit records only
// presence flags, never the note/reason bytes.
export async function actSetLeadWorkflow(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  const priority = s(b.priority).trim();
  if (!leadId) return err("leadId חסר", 400, "bad_request");
  if (!isUuidish(leadId)) return err("leadId לא תקין", 400, "bad_request");
  if (!LEAD_PRIORITIES.has(priority)) return err("עדיפות לא תקינה", 400, "bad_request");

  const rawFollowUpAt = s(b.followUpAt).trim();
  let followUpAt: string | null = null;
  if (rawFollowUpAt) {
    const parsed = new Date(rawFollowUpAt);
    if (Number.isNaN(parsed.getTime())) return err("מועד המעקב לא תקין", 400, "bad_request");
    followUpAt = parsed.toISOString();
  }
  const followUpNote = s(b.followUpNote).trim().slice(0, MAX_FOLLOW_UP_NOTE_LEN) || null;
  const lostReason = s(b.lostReason).trim().slice(0, MAX_LOST_REASON_LEN) || null;
  const n = await patchCountResult(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    priority,
    follow_up_at: followUpAt,
    follow_up_note: followUpNote,
    lost_reason: lostReason,
  });
  if (n === null) {
    jlog({ at: "crm.setLeadWorkflow", ok: false, leadId });
    return err("שמירת תכנית הטיפול נכשלה", 502, "db_error");
  }
  if (n === 0) return err("הליד לא נמצא", 404, "not_found");

  const dueText = followUpAt ? new Date(followUpAt).toLocaleString("he-IL") : "ללא מועד";
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "workflow_update",
    note: `עדיפות: ${priority} · מעקב: ${dueText}`,
    actor_name: await actorName(actorUid),
  });
  await logAudit(actorUid, "crm_lead_workflow", {
    lead_id: leadId,
    priority,
    follow_up_at: followUpAt,
    has_follow_up_note: Boolean(followUpNote),
    has_lost_reason: Boolean(lostReason),
  });
  return json({ ok: true });
}

// listLeads {status?, search?, sort?, limit?, offset?} → the lead pipeline.
// `sort` = "oldest" flips to created_at ASC (default/"recent" = newest-first;
// anything else → 400, never a silent fallback). `search` is an in-memory
// name/phone filter over the fetched window (same safe post-fetch pattern as
// listConversations — never interpolated into the PostgREST query string).
// limit/offset page the DB window (default: the historical 200 rows, so an
// omitted limit changes nothing) and the additive `hasMore` reports whether the
// table continues past the window — computed on the RAW window, before the
// search filter (it describes the page, not the matches).
export async function actListLeads(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  if (status && !LEAD_STATUSES.has(status)) return err("סטטוס ליד לא תקין", 400, "invalid_status");
  const sort = s(b.sort).trim();
  if (!LEAD_SORTS.has(sort)) return err("מיון לא תקין", 400, "bad_request");
  const search = s(b.search).trim().toLowerCase();
  const asc = sort === "oldest";
  const limit = clampListLimit(b.limit);
  const offset = clampOffset(b.offset);
  // Fetch one row past the window — the cheap "is there a next page?" probe.
  let path =
    `/rest/v1/leads?order=created_at.${asc ? "asc" : "desc"}&limit=${limit + 1}&offset=${offset}&select=id,name,phone,provider,source,status,created_at,claimed_by,priority,follow_up_at`;
  if (status) path += `&status=eq.${q(status)}`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return err("שגיאה בטעינת הלידים", 502, "db_error");
  const hasMore = rows.length > limit;
  let leads = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    provider: s(r.provider) || null,
    source: s(r.source) || null,
    status: s(r.status),
    createdAt: s(r.created_at) || null,
    claimedBy: s(r.claimed_by) || null,
    priority: s(r.priority) || "normal",
    followUpAt: s(r.follow_up_at) || null,
  }));
  if (search) {
    leads = leads.filter((l) =>
      l.name.toLowerCase().includes(search) || l.phone.toLowerCase().includes(search)
    );
  }
  return json({ leads, hasMore });
}

// attentionLeads → a complete, purpose-built work queue. The generic listLeads
// endpoint exposes a bounded chronological window, so filtering that window in
// the browser can miss a newly-created urgent lead or an older due follow-up.
// These three targeted, indexed reads start from the actual attention signals,
// then merge/de-dupe overlaps. Each lane keeps the 100 oldest/most overdue rows;
// `hasMore` is explicit if a lane is larger, so the UI never presents a capped
// queue as complete.
const ATTENTION_LANE_LIMIT = 100;
const LEAD_LIST_SELECT =
  "id,name,phone,provider,source,status,created_at,claimed_by,priority,follow_up_at";

function shapeLeadSummary(r: Row) {
  return {
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    provider: s(r.provider) || null,
    source: s(r.source) || null,
    status: s(r.status),
    createdAt: s(r.created_at) || null,
    claimedBy: s(r.claimed_by) || null,
    priority: s(r.priority) || "normal",
    followUpAt: s(r.follow_up_at) || null,
  };
}

export async function actAttentionLeads(): Promise<Response> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const slaCutoffIso = new Date(nowMs - SLA_HOURS * 3_600_000).toISOString();
  const probe = ATTENTION_LANE_LIMIT + 1;
  const [dueRows, priorityRows, slaRows] = await Promise.all([
    fetchRows<Row>(
      `/rest/v1/leads?status=in.(new,contacted)&follow_up_at=not.is.null&follow_up_at=lte.${q(nowIso)}` +
        `&order=follow_up_at.asc&limit=${probe}&select=${LEAD_LIST_SELECT}`,
    ),
    fetchRows<Row>(
      `/rest/v1/leads?status=in.(new,contacted)&priority=in.(urgent,high)` +
        `&order=created_at.asc&limit=${probe}&select=${LEAD_LIST_SELECT}`,
    ),
    fetchRows<Row>(
      `/rest/v1/leads?status=eq.new&created_at=lte.${q(slaCutoffIso)}` +
        `&order=created_at.asc&limit=${probe}&select=${LEAD_LIST_SELECT}`,
    ),
  ]);
  if (dueRows === null || priorityRows === null || slaRows === null) {
    return err("שגיאה בטעינת מרכז העבודה", 502, "db_error");
  }

  const hasMore = [dueRows, priorityRows, slaRows].some(
    (rows) => rows.length > ATTENTION_LANE_LIMIT,
  );
  type AttentionLead = ReturnType<typeof shapeLeadSummary> & {
    nextBestAction: ReturnType<typeof nextBestLeadAction>;
  };
  const merged = new Map<string, AttentionLead>();
  for (const row of [
    ...dueRows.slice(0, ATTENTION_LANE_LIMIT),
    ...priorityRows.slice(0, ATTENTION_LANE_LIMIT),
    ...slaRows.slice(0, ATTENTION_LANE_LIMIT),
  ]) {
    const base = shapeLeadSummary(row);
    const lead = {
      ...base,
      nextBestAction: nextBestLeadAction(base, nowMs, SLA_HOURS),
    };
    if (lead.id) merged.set(lead.id, lead);
  }

  const priorityRank: Record<string, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };
  const leads = [...merged.values()].sort((a, b) => {
    const actionScore = (b.nextBestAction?.score ?? 0) - (a.nextBestAction?.score ?? 0);
    if (actionScore) return actionScore;
    const priority = (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0);
    if (priority) return priority;
    const aDue = a.followUpAt ? Date.parse(a.followUpAt) : Number.POSITIVE_INFINITY;
    const bDue = b.followUpAt ? Date.parse(b.followUpAt) : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    const aCreated = Date.parse(a.createdAt ?? "");
    const bCreated = Date.parse(b.createdAt ?? "");
    return (Number.isFinite(aCreated) ? aCreated : Number.POSITIVE_INFINITY) -
      (Number.isFinite(bCreated) ? bCreated : Number.POSITIVE_INFINITY);
  });
  const summary = {
    total: leads.length,
    overdueFollowUps: leads.filter(
      (lead) => lead.followUpAt && Date.parse(lead.followUpAt) <= nowMs,
    ).length,
    highPriority: leads.filter(
      (lead) => lead.priority === "urgent" || lead.priority === "high",
    ).length,
    slaBreaches: leads.filter(
      (lead) =>
        lead.status === "new" &&
        lead.createdAt != null &&
        Date.parse(lead.createdAt) <= Date.parse(slaCutoffIso),
    ).length,
  };
  return json({ leads, summary, hasMore, asOf: nowIso });
}

// getLeadDetail {leadId} → one lead's CRM-relevant fields + its lead_events
// activity timeline. This is the ONE place richer lead fields (email, notes,
// claim/contact stamps, actual_saving, consent) are exposed — behind the admin
// gate, via service_role. `source_ip` is deliberately NOT selected (it's a
// rate-limit signal, never CRM data). Nothing is fabricated: absent → null, and
// a failed events read is a 502 — never rendered as an empty timeline.
export async function actGetLeadDetail(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  if (!leadId) return err("leadId חסר", 400, "bad_request");
  if (!isUuidish(leadId)) return err("leadId לא תקין", 400, "bad_request");
  const rows = await fetchRows<Row>(
    `/rest/v1/leads?id=eq.${q(leadId)}&limit=1&select=id,name,phone,email,provider,plan_id,source,callback_time,city,status,created_at,claimed_by,claimed_at,contacted_at,actual_saving,priority,follow_up_at,follow_up_note,lost_reason,notes,referrer_code,consent_marketing_sms,consent_marketing_email,consent_marketing_whatsapp`,
  );
  if (rows === null) return err("שגיאה בטעינת הליד", 502, "db_error");
  if (rows.length === 0) return err("הליד לא נמצא", 404, "not_found");
  const lead = shapeLeadDetail(rows[0]);
  // Append-only audit timeline (status changes / claims / notes / savings).
  const evs = await fetchRows<Row>(
    `/rest/v1/lead_events?lead_id=eq.${q(leadId)}&order=created_at.desc&limit=50&select=id,event,old_status,new_status,actor_name,note,created_at`,
  );
  if (evs === null) return err("שגיאה בטעינת יומן הליד", 502, "db_error");
  const events = evs.map(shapeLeadEvent);
  // Reg.13: the detail view is a PII-heavy READ (name/phone/email/notes), so it
  // is audited like the sellable feed — WHO viewed WHICH lead, ids only.
  await logAudit(actorUid, "crm_lead_view", { lead_id: leadId });
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
  // A status is only APPLIED when it is a real sellable status; anything else
  // (e.g. "lost", or absent) falls back to the full sellable set — so the audit
  // below can record the effective filter, never the raw (possibly-ignored) ask.
  const narrowed = status !== "" && (SELLABLE_STATUSES as readonly string[]).includes(status);
  const statuses = narrowed ? [status] : [...SELLABLE_STATUSES];
  const path =
    `/rest/v1/leads?consent_share_at=not.is.null&status=in.(${statuses.map((st) => q(st)).join(",")})` +
    `&order=created_at.desc&limit=500&select=id,name,phone,email,provider,source,status,consent_share_at,created_at`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return err("שגיאה בטעינת הלידים לשיתוף", 502, "db_error");
  // Defence in depth: re-apply the exporter's isSellable gate even though the query
  // already filtered — a consent-less row can never slip through, ever.
  const leads = rows.filter((r) => isSellable(r as unknown as Lead)).map(shapeSellableLead);
  // Reg.13: the single most audit-sensitive READ — who saw the saleable feed + size.
  // Record the filter ACTUALLY applied (the effective statuses; "all" on fallback),
  // never the raw request — a "lost" ask that fell back to the full set must not be
  // logged as if it narrowed the feed, or the trail misreports which PII was returned.
  await logAudit(actorUid, "crm_lead_export", {
    count: leads.length,
    status: narrowed ? status : "all",
    statuses,
  });
  return json({ leads });
}

// addNote {leadId, note} → append a note to the lead's activity timeline
// (lead_events). Does NOT overwrite the single leads.notes field — the timeline
// preserves history. Clamped to the unified MAX_NOTE_LEN; PII-light audit preview.
export async function actAddNote(b: Row, actorUid: string): Promise<Response> {
  const leadId = s(b.leadId).trim();
  const note = s(b.note).trim().slice(0, MAX_NOTE_LEN);
  if (!leadId) return err("leadId חסר", 400, "bad_request");
  if (!isUuidish(leadId)) return err("leadId לא תקין", 400, "bad_request");
  if (!note) return err("אי אפשר להוסיף הערה ריקה", 400, "bad_request");
  const wrote = await insertRow("lead_events", {
    lead_id: leadId,
    event: "note",
    note,
    actor_name: await actorName(actorUid),
  });
  if (!wrote) return err("שמירת ההערה נכשלה", 502, "db_error");
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
  if (!leadId) return err("leadId חסר", 400, "bad_request");
  if (!isUuidish(leadId)) return err("leadId לא תקין", 400, "bad_request");
  const n = await patchCountResult(`/rest/v1/leads?id=eq.${q(leadId)}`, { notes: note || null });
  if (n === null) {
    jlog({ at: "crm.setLeadNote", ok: false, leadId });
    return err("עדכון ההערה נכשל", 502, "db_error");
  }
  // Honest 404 on a missing id — no phantom note_edit trail for a row that
  // never changed.
  if (n === 0) return err("הליד לא נמצא", 404, "not_found");
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "note_edit",
    note: note || "(ההערה נמחקה)",
    actor_name: await actorName(actorUid),
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
  if (!leadId) return err("leadId חסר", 400, "bad_request");
  if (!isUuidish(leadId)) return err("leadId לא תקין", 400, "bad_request");
  const raw = Number(b.annualSaving);
  const saving = Number.isFinite(raw) ? Math.round(Math.min(100000, Math.max(0, raw))) : NaN;
  if (!Number.isFinite(saving) || saving <= 0) return err("סכום חיסכון לא תקין", 400, "bad_request");
  const n = await patchCountResult(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    actual_saving: saving,
    status: "won",
  });
  if (n === null) {
    jlog({ at: "crm.recordSaving", ok: false, leadId });
    return err("רישום החיסכון נכשל", 502, "db_error");
  }
  // Honest 404 — a saving is only ever recorded onto a REAL lead.
  if (n === 0) return err("הליד לא נמצא", 404, "not_found");
  await insertRow("lead_events", {
    lead_id: leadId,
    event: "saving",
    new_status: "won",
    note: `חיסכון שנתי שנרשם: ₪${saving}`,
    actor_name: await actorName(actorUid),
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
  if (!leadId) return err("leadId חסר", 400, "bad_request");
  if (!isUuidish(leadId)) return err("leadId לא תקין", 400, "bad_request");
  if (!rep) return err("שם נציג חסר", 400, "bad_request");
  const n = await patchCountResult(`/rest/v1/leads?id=eq.${q(leadId)}`, {
    claimed_by: rep,
    claimed_at: new Date().toISOString(),
  });
  if (n === null) {
    jlog({ at: "crm.claimLead", ok: false, leadId });
    return err("שיוך הליד נכשל", 502, "db_error");
  }
  // Honest 404 — no claim event/audit for a lead that doesn't exist.
  if (n === 0) return err("הליד לא נמצא", 404, "not_found");
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
  if (rows === null) return err("שגיאה בטעינת נתוני הנציגים", 502, "db_error");
  return json({ reps: aggregateReps(rows), sampled: rows.length, capped: rows.length >= LIMIT });
}
