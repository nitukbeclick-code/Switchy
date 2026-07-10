// Pure, dependency-free helpers for the crm-api edge function — extracted so they
// can be unit-tested without booting `Deno.serve` (the notify-lead/*.ts pattern).
// These mirror the validation + formatting rules the function applies before any
// PostgREST write, so a malformed client can never stamp an arbitrary status onto
// a row or smuggle a bad ?status= filter into the query string.

export const SNIPPET_LEN = 60;
export const MAX_REPLY_LEN = 4000; // matches the body.slice cap on the stored row
export const EVENT_PREVIEW_LEN = 80; // crm_events.preview cap — a short, PII-light snippet

// Allowed status values, mirrored from the Flutter CRM DTOs (lib/services/
// backend/backend.dart). Writes AND filter params are validated against these.
export const CONTACT_STATUSES = new Set([
  "new",
  "active",
  "qualified",
  "handed_off",
  "won",
  "lost",
  "blocked",
]);
export const LEAD_STATUSES = new Set(["new", "contacted", "won", "lost"]);
export const CONVERSATION_STATUSES = new Set(["open", "bot", "human", "closed"]);
// Zoom-booking lifecycle (mirrors the meetings.status enum + MeetingRow in
// _shared/types.ts). Writes AND filter params are validated against this set.
export const MEETING_STATUSES = new Set([
  "pending",
  "confirmed",
  "no_rep",
  "cancelled",
  "expired",
  "completed",
]);

/** Null-safe stringify — `null`/`undefined` become "". */
export function s(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Collapse whitespace and clip a message body to a one-line list snippet. */
export function snippet(body: unknown): string {
  const t = s(body).trim().replace(/\s+/g, " ");
  return t.length > SNIPPET_LEN ? t.slice(0, SNIPPET_LEN - 1) + "…" : t;
}

/** Display name: explicit wa_name, else the phone, else a neutral placeholder. */
export function contactName(c: Record<string, unknown>): string {
  return s(c.wa_name).trim() || s(c.wa_phone).trim() || "ללא שם";
}

/**
 * Clamp an arbitrary string into a crm_events.preview snippet: whitespace
 * collapsed to one line, clipped to EVENT_PREVIEW_LEN with a trailing ellipsis.
 * Never returns bytes/PII beyond the (already redacted) text it is handed.
 */
export function eventPreview(body: unknown): string {
  const t = s(body).trim().replace(/\s+/g, " ");
  return t.length > EVENT_PREVIEW_LEN ? t.slice(0, EVENT_PREVIEW_LEN - 1) + "…" : t;
}

/** True when [status] is a writable contact lifecycle status. */
export function isValidContactStatus(status: string): boolean {
  return CONTACT_STATUSES.has(status);
}

/** True when [status] is a writable lead pipeline status. */
export function isValidLeadStatus(status: string): boolean {
  return LEAD_STATUSES.has(status);
}

/** True when [status] is a valid conversation-list filter value. */
export function isValidConversationStatus(status: string): boolean {
  return CONVERSATION_STATUSES.has(status);
}

/** True when [status] is a writable/filterable meeting lifecycle status. */
export function isValidMeetingStatus(status: string): boolean {
  return MEETING_STATUSES.has(status);
}

/** Clamp a requested page size into the 1..100 window (default 50). */
export function clampLimit(raw: unknown): number {
  return Math.min(100, Math.max(1, Number(raw) || 50));
}

/**
 * Build the `detail` jsonb for a Reg.13 security_audit_log row recording an admin
 * CRM control action. The verified admin uid is stamped first as `actor` (single
 * source of WHO), then the per-action fields are spread on top. This is a pure
 * shaping helper so the audit payload can be unit-tested without a network write.
 *
 * The caller is responsible for keeping `extra` PII-light (entity ids + clamped
 * previews via eventPreview — NEVER raw message bytes/base64). actorUid "" → null
 * so a missing uid is recorded honestly rather than as an empty string.
 *
 * `actor` is stamped LAST so the verified admin uid always wins — a caller (or a
 * client field that leaked into `extra`) can never override WHO did the action.
 */
export function auditDetail(
  actorUid: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...extra, actor: actorUid || null };
}

/** `null`/`undefined`/"" → null, otherwise the trimmed string. */
function emptyToNull(v: unknown): string | null {
  const t = s(v).trim();
  return t || null;
}

// The CRM-relevant lead fields the detail view exposes (behind the admin gate).
export interface LeadDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  provider: string | null;
  planId: string | null;
  source: string | null;
  callbackTime: string | null;
  city: string | null;
  status: string;
  createdAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  contactedAt: string | null;
  actualSaving: number | null;
  notes: string | null;
  referrerCode: string | null;
  consent: { sms: boolean; email: boolean; whatsapp: boolean };
}

/**
 * Shape a service-role `leads` row into the admin lead-detail DTO. This is an
 * ALLOWLIST: it maps ONLY the fields above, so even if the caller's select ever
 * pulled a sensitive server-internal column (e.g. `source_ip`), it can NEVER
 * reach the client through this DTO. Nothing is invented — absent → null.
 */
export function shapeLeadDetail(r: Record<string, unknown>): LeadDetail {
  return {
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    email: emptyToNull(r.email),
    provider: emptyToNull(r.provider),
    planId: emptyToNull(r.plan_id),
    source: emptyToNull(r.source),
    callbackTime: emptyToNull(r.callback_time),
    city: emptyToNull(r.city),
    status: s(r.status),
    createdAt: emptyToNull(r.created_at),
    claimedBy: emptyToNull(r.claimed_by),
    claimedAt: emptyToNull(r.claimed_at),
    contactedAt: emptyToNull(r.contacted_at),
    actualSaving: r.actual_saving == null ? null : Number(r.actual_saving),
    notes: emptyToNull(r.notes),
    referrerCode: emptyToNull(r.referrer_code),
    consent: {
      sms: r.consent_marketing_sms === true,
      email: r.consent_marketing_email === true,
      whatsapp: r.consent_marketing_whatsapp === true,
    },
  };
}

export interface LeadEvent {
  id: string;
  event: string;
  oldStatus: string | null;
  newStatus: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string | null;
}

/** Shape a `lead_events` row into the activity-timeline DTO (allowlist, as above). */
export function shapeLeadEvent(e: Record<string, unknown>): LeadEvent {
  return {
    id: s(e.id),
    event: s(e.event),
    oldStatus: emptyToNull(e.old_status),
    newStatus: emptyToNull(e.new_status),
    actorName: emptyToNull(e.actor_name),
    note: emptyToNull(e.note),
    createdAt: emptyToNull(e.created_at),
  };
}

// ── meetings (Zoom bookings) ────────────────────────────────────────────────

// The light meeting fields the LIST view shows (no email/join_url/notes — those
// live only in the detail DTO, one row at a time).
export interface MeetingSummary {
  id: string;
  name: string;
  phone: string;
  provider: string | null;
  meetingDate: string | null;
  slot: string | null;
  startsAt: string | null;
  status: string;
  source: string | null;
  claimedBy: string | null;
}

/** Shape a service-role `meetings` row into the list DTO (ALLOWLIST — a stray
 *  internal column can never leak). Nothing invented: absent → null. */
export function shapeMeeting(r: Record<string, unknown>): MeetingSummary {
  return {
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    provider: emptyToNull(r.provider),
    meetingDate: emptyToNull(r.meeting_date),
    slot: emptyToNull(r.slot),
    startsAt: emptyToNull(r.starts_at),
    status: s(r.status),
    source: emptyToNull(r.source),
    claimedBy: emptyToNull(r.claimed_by),
  };
}

// The full meeting detail the drawer shows (still an allowlist — no gcal ids,
// no rep tg-id, no internal stamps beyond what the console needs).
export interface MeetingDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  provider: string | null;
  planId: string | null;
  meetingDate: string | null;
  slot: string | null;
  startsAt: string | null;
  status: string;
  joinUrl: string | null;
  zoomMeetingId: string | null;
  notes: string | null;
  source: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  confirmedAt: string | null;
  createdAt: string | null;
}

/** Shape a `meetings` row into the detail DTO (allowlist, as above). */
export function shapeMeetingDetail(r: Record<string, unknown>): MeetingDetail {
  return {
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    email: emptyToNull(r.email),
    provider: emptyToNull(r.provider),
    planId: emptyToNull(r.plan_id),
    meetingDate: emptyToNull(r.meeting_date),
    slot: emptyToNull(r.slot),
    startsAt: emptyToNull(r.starts_at),
    status: s(r.status),
    joinUrl: emptyToNull(r.join_url),
    zoomMeetingId: emptyToNull(r.zoom_meeting_id),
    notes: emptyToNull(r.notes),
    source: emptyToNull(r.source),
    claimedBy: emptyToNull(r.claimed_by),
    claimedAt: emptyToNull(r.claimed_at),
    confirmedAt: emptyToNull(r.confirmed_at),
    createdAt: emptyToNull(r.created_at),
  };
}

export interface MeetingEvent {
  id: string;
  event: string;
  oldStatus: string | null;
  newStatus: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string | null;
}

/** Shape a `meeting_events` row into the timeline DTO (allowlist, as above). */
export function shapeMeetingEvent(e: Record<string, unknown>): MeetingEvent {
  return {
    id: s(e.id),
    event: s(e.event),
    oldStatus: emptyToNull(e.old_status),
    newStatus: emptyToNull(e.new_status),
    actorName: emptyToNull(e.actor_name),
    note: emptyToNull(e.note),
    createdAt: emptyToNull(e.created_at),
  };
}
