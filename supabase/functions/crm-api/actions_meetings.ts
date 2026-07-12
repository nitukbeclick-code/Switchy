// crm-api actions: Zoom-booking meetings — list, detail + timeline, status.

import { fetchRows, logMeetingEvent, patchCountResult } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import {
  clampListLimit,
  clampOffset,
  isUuidish,
  MEETING_STATUSES,
  s,
  shapeMeeting,
  shapeMeetingDetail,
  shapeMeetingEvent,
} from "./crm_logic.ts";
import { actorName, err, json, logAudit, q, type Row } from "./helpers.ts";

// ── meetings (Zoom bookings) ───────────────────────────────────────────────

// listMeetings {status?, limit?, offset?} → upcoming-first meeting list (light,
// PII-safe shape). limit/offset+hasMore page the window exactly like listLeads
// (default: the historical 200 rows).
export async function actListMeetings(b: Row): Promise<Response> {
  const status = s(b.status).trim();
  if (status && !MEETING_STATUSES.has(status)) return err("סטטוס פגישה לא תקין", 400, "invalid_status");
  const limit = clampListLimit(b.limit);
  const offset = clampOffset(b.offset);
  let path =
    `/rest/v1/meetings?order=starts_at.desc.nullslast,created_at.desc&limit=${limit + 1}&offset=${offset}&select=id,name,phone,provider,meeting_date,slot,starts_at,status,source,claimed_by`;
  if (status) path += `&status=eq.${q(status)}`;
  const rows = await fetchRows<Row>(path);
  if (rows === null) return err("שגיאה בטעינת הפגישות", 502, "db_error");
  const hasMore = rows.length > limit;
  return json({ meetings: (hasMore ? rows.slice(0, limit) : rows).map(shapeMeeting), hasMore });
}

// getMeeting {meetingId} → one meeting's detail + its meeting_events timeline.
// The ONE place richer meeting fields (email, join_url, notes) are exposed —
// behind the admin gate, via service_role, through the allowlist shaper. A
// failed timeline read is a 502, never rendered as an empty timeline.
export async function actGetMeeting(b: Row, actorUid: string): Promise<Response> {
  const meetingId = s(b.meetingId).trim();
  if (!meetingId) return err("meetingId חסר", 400, "bad_request");
  if (!isUuidish(meetingId)) return err("meetingId לא תקין", 400, "bad_request");
  const rows = await fetchRows<Row>(
    `/rest/v1/meetings?id=eq.${q(meetingId)}&limit=1&select=id,name,phone,email,provider,plan_id,meeting_date,slot,starts_at,status,join_url,zoom_meeting_id,notes,source,claimed_by,claimed_at,confirmed_at,created_at`,
  );
  if (rows === null) return err("שגיאה בטעינת הפגישה", 502, "db_error");
  if (!rows.length) return err("פגישה לא נמצאה", 404, "not_found");
  const events = await fetchRows<Row>(
    `/rest/v1/meeting_events?meeting_id=eq.${q(meetingId)}&order=created_at.desc&limit=50&select=id,event,old_status,new_status,actor_name,note,created_at`,
  );
  if (events === null) return err("שגיאה בטעינת יומן הפגישה", 502, "db_error");
  // Reg.13: the detail view is a PII-heavy READ (name/phone/email/join_url), so
  // it is audited — WHO viewed WHICH meeting, ids only.
  await logAudit(actorUid, "crm_meeting_view", { meeting_id: meetingId });
  return json({ meeting: shapeMeetingDetail(rows[0]), events: events.map(shapeMeetingEvent) });
}

// setMeetingStatus {meetingId,status} → patch meetings.status + meeting_events
// audit row + Reg.13 security-audit. Same fail-closed validation as leads: the
// row is read first (old_status for the trail + a clean 404) and the PATCH goes
// through patchCountResult — a missing id is an honest 404, never ok:true with
// a phantom trail.
export async function actSetMeetingStatus(b: Row, actorUid: string): Promise<Response> {
  const meetingId = s(b.meetingId).trim();
  const status = s(b.status).trim();
  if (!meetingId || !status) return err("meetingId/status חסרים", 400, "bad_request");
  if (!isUuidish(meetingId)) return err("meetingId לא תקין", 400, "bad_request");
  if (!MEETING_STATUSES.has(status)) return err("סטטוס פגישה לא תקין", 400, "invalid_status");
  const [cur, actor] = await Promise.all([
    fetchRows<Row>(`/rest/v1/meetings?id=eq.${q(meetingId)}&limit=1&select=id,status`),
    actorName(actorUid),
  ]);
  if (cur === null) return err("עדכון הפגישה נכשל", 502, "db_error");
  if (!cur.length) return err("פגישה לא נמצאה", 404, "not_found");
  const oldStatus = s(cur[0].status) || null;
  const n = await patchCountResult(`/rest/v1/meetings?id=eq.${q(meetingId)}`, { status });
  if (n === null) {
    jlog({ at: "crm.setMeetingStatus", ok: false, meetingId });
    return err("עדכון הפגישה נכשל", 502, "db_error");
  }
  if (n === 0) return err("פגישה לא נמצאה", 404, "not_found");
  await logMeetingEvent({
    meeting_id: meetingId,
    event: "status_change",
    old_status: oldStatus,
    new_status: status,
    actor_name: actor,
  });
  await logAudit(actorUid, "crm_meeting_status", {
    meeting_id: meetingId,
    status,
    old_status: oldStatus,
  });
  return json({ ok: true });
}
