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
