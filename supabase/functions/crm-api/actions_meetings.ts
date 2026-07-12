// crm-api actions: Zoom-booking meetings — list, detail + timeline, status.

import { fetchRows, logMeetingEvent, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { MEETING_STATUSES, s, shapeMeeting, shapeMeetingDetail, shapeMeetingEvent } from "./crm_logic.ts";
import { json, logAudit, q, type Row } from "./helpers.ts";

// ── meetings (Zoom bookings) ───────────────────────────────────────────────

// listMeetings {status?} → upcoming-first meeting list (light, PII-safe shape).
export async function actListMeetings(b: Row): Promise<Response> {
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
export async function actGetMeeting(b: Row): Promise<Response> {
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
export async function actSetMeetingStatus(b: Row, actorUid: string): Promise<Response> {
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
