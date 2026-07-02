// ─────────────────────────────────────────────────────────────────────────────
// account-delete/lib.ts — PURE helpers for the account-delete edge function.
// No I/O, no env, no clock: everything here is unit-testable in isolation
// (tests/account_delete_test.ts). index.ts owns the network side.
//
// The deletion is planned as an ORDERED op list (planAccountDeletion) so the
// execution order — PII scrubs first, auth-user deletion LAST — is a tested
// invariant, not an accident of code layout. deleteUser must stay last: every
// earlier step is fail-soft + idempotent, so a partially-failed run can simply
// be retried, but once auth.users loses the row the caller can never
// re-authenticate to finish the cleanup.
//
// CROSS-USER GUARD: contact-matched scrubs (rows keyed by phone/email rather
// than user_id) are derived ONLY from the caller's own profiles row. An empty
// profile phone/email yields NO contact filter at all — we never scrub by a
// blank value, which on `eq.` would happily match other people's blank rows.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeIlPhone } from "../_shared/lead_quality.ts";

// Re-export the repo's single IL phone normalizer (E.164 "+9725XXXXXXXX", or ""
// for junk) so index.ts and the tests import every helper from one place.
export { normalizeIlPhone };

// ── Scrub payloads ────────────────────────────────────────────────────────────
// public.leads: name + phone are NOT NULL (schema.sql) → scrub to ''; email and
// notes are nullable → null. Everything else on the row (status, timestamps,
// claimed_by…) is business/audit state, not the customer's PII.
export const SCRUB_LEAD_PAYLOAD = {
  name: "",
  phone: "",
  email: null,
  notes: null,
} as const;

// public.meetings mirrors the same column shapes (meetings-2026-06.sql):
// name + phone NOT NULL → '', email + notes nullable → null. join_url /
// zoom_meeting_id are server-managed meeting artifacts, not caller PII.
export const SCRUB_MEETING_PAYLOAD = {
  name: "",
  phone: "",
  email: null,
  notes: null,
} as const;

// The caller's own profiles row (name, phone, email) — the ONLY source of
// contact-matched filters. Unknown-typed on purpose: it comes off the wire.
export type ProfileContact = { name?: unknown; phone?: unknown; email?: unknown };

// Lowercased, trimmed email or "" when it can't be an address. The '@' gate is
// deliberately minimal — it only has to stop blanks/garbage from ever becoming
// an eq-filter, not to fully validate RFC addresses.
export function cleanEmail(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return s.includes("@") ? s : "";
}

// whatsapp_contacts.wa_phone stores Meta's messages[].from — E.164 DIGITS with
// no '+' ("9725XXXXXXXX", see whatsapp-2026-06.sql). Derive that spelling from
// the profile phone; "" when the profile has no valid IL number.
export function waPhoneFromProfile(profile: ProfileContact): string {
  const e164 = normalizeIlPhone(profile.phone);
  return e164 ? e164.slice(1) : "";
}

// PostgREST filter strings for the contact-matched scrubs, or null when the
// profile lacks that contact (→ the op is skipped entirely: the cross-user
// guard). Phone matches every stored spelling of the same number (E.164,
// national 0-leading, bare digits) since the capture paths differ; email
// matches the as-typed and lowercased spellings.
export type ContactFilters = { phone: string | null; email: string | null };

// Quote + URL-encode one in-list member ("value" → %22value%22) — PostgREST
// needs the quotes so '+' and '@' survive inside in.(…).
function inMember(v: string): string {
  return encodeURIComponent(`"${v}"`);
}

export function contactFilters(profile: ProfileContact): ContactFilters {
  let phone: string | null = null;
  const e164 = normalizeIlPhone(profile.phone);
  if (e164) {
    const digits = e164.slice(1); // 9725XXXXXXXX
    const national = "0" + e164.slice(4); // 05XXXXXXXX
    phone = `phone=in.(${[e164, national, digits].map(inMember).join(",")})`;
  }

  let email: string | null = null;
  const lower = cleanEmail(profile.email);
  if (lower) {
    const typed = String(profile.email ?? "").trim();
    const spellings = typed && typed !== lower ? [typed, lower] : [lower];
    email = `email=in.(${spellings.map(inMember).join(",")})`;
  }
  return { phone, email };
}

// ── The ordered deletion plan ─────────────────────────────────────────────────
// One discriminated op per step; index.ts executes them in array order. Every
// op except deleteUser is fail-soft + idempotent; deleteUser is ALWAYS last.
export type DeletionOp =
  | { op: "cancelOpenMeetings"; emailFilter: string | null }
  | { op: "scrubMeetings"; emailFilter: string | null }
  | { op: "scrubLeads"; phoneFilter: string | null; emailFilter: string | null }
  | { op: "deleteWhatsappContact"; waPhone: string }
  | { op: "deleteAiSession"; sessionId: string }
  | { op: "deleteEmailOtps"; email: string }
  | { op: "deleteCommunityNotifications" }
  | { op: "anonymizeCommunityReports" }
  | { op: "deleteStorageObjects"; prefix: string }
  | { op: "auditAndSuppress"; phoneE164: string; email: string }
  | { op: "deleteUser" };

/**
 * Build the ordered deletion plan for one caller. Pure: derives everything from
 * the uid + the caller's own profile row + the (optional) advisor session id
 * the client passed. Contact-dependent ops are ONLY planned when the profile
 * actually carries that contact (cross-user guard); the plan ALWAYS ends with
 * deleteUser — the single fail-CLOSED step.
 */
export function planAccountDeletion(
  uid: string,
  profile: ProfileContact,
  advisorSessionId?: unknown,
): DeletionOp[] {
  const f = contactFilters(profile);
  const waPhone = waPhoneFromProfile(profile);
  const email = cleanEmail(profile.email);
  const e164 = normalizeIlPhone(profile.phone);
  // Opaque client-generated id (ai-sessions-2026-06.sql); clipped for URL hygiene.
  const sessionId = typeof advisorSessionId === "string"
    ? advisorSessionId.trim().slice(0, 200)
    : "";

  const ops: DeletionOp[] = [
    // 3) Cancel open meetings BEFORE scrubbing, while email still matches rows.
    { op: "cancelOpenMeetings", emailFilter: f.email },
    // 4) Scrub PII off every meetings row (uid- and email-matched).
    { op: "scrubMeetings", emailFilter: f.email },
    // 5) Scrub PII off every leads row (uid-, phone- and email-matched).
    { op: "scrubLeads", phoneFilter: f.phone, emailFilter: f.email },
  ];
  // 6) whatsapp_contacts delete cascades conversations + messages (FKs in
  //    whatsapp-2026-06.sql) — only when the profile carries a valid phone.
  if (waPhone) ops.push({ op: "deleteWhatsappContact", waPhone });
  // 7) The advisor chat transcript (public.ai_sessions) + any email OTP rows.
  if (sessionId) ops.push({ op: "deleteAiSession", sessionId });
  if (email) ops.push({ op: "deleteEmailOtps", email });
  // 8) Community footprint: notifications go, reports stay but lose the author.
  ops.push({ op: "deleteCommunityNotifications" });
  ops.push({ op: "anonymizeCommunityReports" });
  // 9) Storage objects under community-media/<uid>/ must go BEFORE the auth row
  //    (afterwards nothing ties the prefix back to a deletable owner).
  ops.push({ op: "deleteStorageObjects", prefix: `${uid}/` });
  // 10) Counts-only audit row + do-not-contact suppression for phone/email.
  ops.push({ op: "auditAndSuppress", phoneE164: e164, email });
  // 11) The point of no return — ALWAYS last (tested invariant).
  ops.push({ op: "deleteUser" });
  return ops;
}
