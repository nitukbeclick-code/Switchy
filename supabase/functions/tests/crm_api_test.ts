// Unit tests for the crm-api pure helpers (crm-api/crm_logic.ts) — the status
// validation sets, snippet formatter, contact-name fallback and page-size clamp
// the function applies before any service-role write. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  aggregateReps,
  auditDetail,
  clampLimit,
  contactName,
  CONTACT_STATUSES,
  CONVERSATION_STATUSES,
  EVENT_PREVIEW_LEN,
  eventPreview,
  isValidContactStatus,
  isValidConversationStatus,
  isValidLeadStatus,
  isValidMeetingStatus,
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
  shapeMember,
  shapeSellableLead,
  snippet,
  SNIPPET_LEN,
} from "../crm-api/crm_logic.ts";

// ── status validation sets ────────────────────────────────────────────────────

Deno.test("contact statuses mirror the Flutter CRM DTO exactly", () => {
  assertEquals(
    [...CONTACT_STATUSES].sort(),
    ["active", "blocked", "handed_off", "lost", "new", "qualified", "won"],
  );
  for (const st of CONTACT_STATUSES) assert(isValidContactStatus(st));
  // A malformed client can't stamp an arbitrary status.
  assertFalse(isValidContactStatus("vip"));
  assertFalse(isValidContactStatus(""));
  assertFalse(isValidContactStatus("WON")); // case-sensitive
});

Deno.test("lead statuses are the four pipeline columns", () => {
  assertEquals([...LEAD_STATUSES].sort(), ["contacted", "lost", "new", "won"]);
  for (const st of LEAD_STATUSES) assert(isValidLeadStatus(st));
  assertFalse(isValidLeadStatus("qualified")); // a contact status, not a lead one
  assertFalse(isValidLeadStatus("open"));
});

Deno.test("conversation statuses gate the ?status= filter param", () => {
  assertEquals([...CONVERSATION_STATUSES].sort(), ["bot", "closed", "human", "open"]);
  for (const st of CONVERSATION_STATUSES) assert(isValidConversationStatus(st));
  // A bad ?status= can't be smuggled into the PostgREST query string.
  assertFalse(isValidConversationStatus("won"));
  assertFalse(isValidConversationStatus("'; drop table"));
});

// ── snippet ───────────────────────────────────────────────────────────────────

Deno.test("snippet collapses whitespace to a single line", () => {
  assertEquals(snippet("היי   שם\n\nשורה שנייה"), "היי שם שורה שנייה");
  assertEquals(snippet("  trimmed  "), "trimmed");
});

Deno.test("snippet truncates with an ellipsis past the length cap", () => {
  const long = "א".repeat(SNIPPET_LEN + 20);
  const out = snippet(long);
  assertEquals(out.length, SNIPPET_LEN); // SNIPPET_LEN-1 chars + the "…"
  assert(out.endsWith("…"));
  // Exactly at the cap, nothing is clipped.
  const exact = "ב".repeat(SNIPPET_LEN);
  assertEquals(snippet(exact), exact);
});

Deno.test("snippet is null-safe", () => {
  assertEquals(snippet(null), "");
  assertEquals(snippet(undefined), "");
});

// ── contactName fallback chain ────────────────────────────────────────────────

Deno.test("contactName prefers wa_name, then phone, then a neutral placeholder", () => {
  assertEquals(contactName({ wa_name: "דנה לוי", wa_phone: "0521234567" }), "דנה לוי");
  assertEquals(contactName({ wa_name: "  ", wa_phone: "0521234567" }), "0521234567");
  assertEquals(contactName({}), "ללא שם");
  assertEquals(contactName({ wa_name: null, wa_phone: null }), "ללא שם");
});

// ── helpers ───────────────────────────────────────────────────────────────────

Deno.test("s null-safely stringifies", () => {
  assertEquals(s(null), "");
  assertEquals(s(undefined), "");
  assertEquals(s(42), "42");
  assertEquals(s("x"), "x");
});

Deno.test("clampLimit holds the requested page size inside 1..100 (default 50)", () => {
  assertEquals(clampLimit(undefined), 50);
  assertEquals(clampLimit(0), 50); // 0 is falsy → default
  assertEquals(clampLimit("not a number"), 50);
  assertEquals(clampLimit(25), 25);
  assertEquals(clampLimit(500), 100); // capped
  assertEquals(clampLimit(-10), 1); // floored
});

Deno.test("MAX_REPLY_LEN matches the stored-body slice cap", () => {
  assertEquals(MAX_REPLY_LEN, 4000);
});

// ── eventPreview (crm_events.preview snippet) ─────────────────────────────────

Deno.test("eventPreview collapses whitespace to a single PII-light line", () => {
  assertEquals(eventPreview("נציג  דנה\n\nהשתלט"), "נציג דנה השתלט");
  assertEquals(eventPreview("  trimmed  "), "trimmed");
});

Deno.test("eventPreview clips past the 80-char cap with an ellipsis", () => {
  const long = "א".repeat(EVENT_PREVIEW_LEN + 30);
  const out = eventPreview(long);
  assertEquals(out.length, EVENT_PREVIEW_LEN); // EVENT_PREVIEW_LEN-1 chars + "…"
  assert(out.endsWith("…"));
  // Exactly at the cap, nothing is clipped.
  const exact = "ב".repeat(EVENT_PREVIEW_LEN);
  assertEquals(eventPreview(exact), exact);
  assertEquals(EVENT_PREVIEW_LEN, 80);
});

Deno.test("eventPreview is null-safe", () => {
  assertEquals(eventPreview(null), "");
  assertEquals(eventPreview(undefined), "");
});

// ── auditDetail (security_audit_log.detail shaping) ───────────────────────────

Deno.test("auditDetail stamps the admin uid first as actor, then the action fields", () => {
  const d = auditDetail("uid-123", { conversation_id: "c1", rep: "דנה" });
  assertEquals(d, { actor: "uid-123", conversation_id: "c1", rep: "דנה" });
  // actor is the single source of WHO — it comes from the verified admin, not the
  // request body, so a client can't spoof it via an `actor` field in `extra`.
  const spoof = auditDetail("uid-real", { actor: "uid-attacker", lead_id: "L1" });
  assertEquals(spoof.actor, "uid-real");
  assertEquals(spoof.lead_id, "L1");
});

Deno.test("auditDetail records a missing uid as null, not an empty string", () => {
  assertEquals(auditDetail(""), { actor: null });
  assertEquals(auditDetail("", { status: "won" }), { actor: null, status: "won" });
});

Deno.test("auditDetail defaults extra to an empty bag", () => {
  assertEquals(auditDetail("uid-9"), { actor: "uid-9" });
});

// ── shapeLeadDetail / shapeLeadEvent (admin lead-detail DTOs) ─────────────────
// These are ALLOWLIST shapers: the client only ever sees the mapped fields, so a
// server-internal column (source_ip) can NEVER leak through even if a future
// select pulled it. This is the PII spine of the lead-detail view.

Deno.test("shapeLeadDetail maps the CRM fields + coerces empties/consent honestly", () => {
  const d = shapeLeadDetail({
    id: "L1", name: "דנה לוי", phone: "0521234567", email: "d@x.com",
    provider: "סלקום", plan_id: "c1", source: "form", callback_time: "evening",
    city: "חיפה", status: "contacted", created_at: "2026-07-01T10:00:00Z",
    claimed_by: "רון", claimed_at: "2026-07-01T11:00:00Z", contacted_at: "",
    actual_saving: 480, notes: "מעוניין", referrer_code: "",
    consent_marketing_sms: true, consent_marketing_email: false, consent_marketing_whatsapp: true,
  });
  assertEquals(d.name, "דנה לוי");
  assertEquals(d.email, "d@x.com");
  assertEquals(d.actualSaving, 480);
  assertEquals(d.contactedAt, null); // "" → null, never an empty string
  assertEquals(d.referrerCode, null);
  assertEquals(d.consent, { sms: true, email: false, whatsapp: true });
});

Deno.test("shapeLeadDetail is an allowlist — a stray source_ip can NEVER leak", () => {
  const d = shapeLeadDetail({
    id: "L1", name: "x", phone: "05200", status: "new",
    // Hostile / accidental extra columns that must be dropped by the allowlist:
    source_ip: "1.2.3.4", claimed_by_tg_id: 999, notified_at: "2026-01-01",
  });
  const keys = Object.keys(d);
  assert(!keys.includes("source_ip"), "source_ip must never appear in the DTO");
  assert(!keys.includes("claimed_by_tg_id"));
  assert(!keys.includes("notified_at"));
  // actual_saving absent → null (no fabricated saving).
  assertEquals(d.actualSaving, null);
});

Deno.test("shapeLeadEvent maps the timeline row + null-coerces empties", () => {
  const e = shapeLeadEvent({
    id: "e1", event: "status_change", old_status: "new", new_status: "contacted",
    actor_name: "CRM", note: "", created_at: "2026-07-02T09:00:00Z",
  });
  assertEquals(e.event, "status_change");
  assertEquals(e.oldStatus, "new");
  assertEquals(e.newStatus, "contacted");
  assertEquals(e.note, null);
  assertEquals(e.actorName, "CRM");
});

// ── meetings (Zoom bookings) ─────────────────────────────────────────────────

Deno.test("meeting statuses mirror the meetings.status enum", () => {
  assertEquals(
    [...MEETING_STATUSES].sort(),
    ["cancelled", "completed", "confirmed", "expired", "no_rep", "pending"],
  );
  assert(isValidMeetingStatus("confirmed"));
  assertFalse(isValidMeetingStatus("bogus"));
});

Deno.test("shapeMeeting is a light allowlist — no email/join_url/notes/internal ids leak", () => {
  const m = shapeMeeting({
    id: "M1", name: "רון כהן", phone: "0539998887", provider: "פרטנר",
    meeting_date: "2026-07-15", slot: "14:30", starts_at: "2026-07-15T11:30:00Z",
    status: "confirmed", source: "site", claimed_by: "דנה", claimed_at: "",
    // Fields that must NOT appear in the light list DTO:
    email: "r@x.com", join_url: "https://zoom.us/j/1", notes: "פרטי",
    zoom_meeting_id: "z1", gcal_event_id: "g1", claimed_by_tg_id: 42,
  });
  const keys = Object.keys(m);
  for (const leak of ["email", "join_url", "notes", "zoom_meeting_id", "gcal_event_id", "claimed_by_tg_id"]) {
    assertFalse(keys.includes(leak), `${leak} must not appear in the meeting list DTO`);
  }
  assertEquals(m.name, "רון כהן");
  assertEquals(m.slot, "14:30");
  assertEquals(m.status, "confirmed");
});

Deno.test("shapeMeetingDetail maps the CRM fields but still drops internal columns", () => {
  const d = shapeMeetingDetail({
    id: "M1", name: "רון", phone: "0539998887", email: "r@x.com",
    provider: "פרטנר", plan_id: "p1", meeting_date: "2026-07-15", slot: "14:30",
    starts_at: "2026-07-15T11:30:00Z", status: "confirmed",
    join_url: "https://zoom.us/j/1", zoom_meeting_id: "z1", notes: "",
    source: "site", claimed_by: "דנה", claimed_at: "2026-07-10T09:00:00Z",
    confirmed_at: "2026-07-10T09:05:00Z", created_at: "2026-07-09T08:00:00Z",
    // Internal columns that must be dropped by the allowlist:
    gcal_event_id: "g1", claimed_by_tg_id: 42, reminded_rep_at: "2026-07-10",
  });
  const keys = Object.keys(d);
  for (const leak of ["gcal_event_id", "claimed_by_tg_id", "reminded_rep_at"]) {
    assertFalse(keys.includes(leak), `${leak} must not appear in the meeting detail DTO`);
  }
  assertEquals(d.email, "r@x.com");
  assertEquals(d.joinUrl, "https://zoom.us/j/1");
  assertEquals(d.notes, null); // "" → null
});

Deno.test("shapeMeetingEvent maps the timeline row + null-coerces empties", () => {
  const e = shapeMeetingEvent({
    id: "me1", event: "status_change", old_status: "pending", new_status: "confirmed",
    actor_name: "CRM", note: "", created_at: "2026-07-10T09:05:00Z",
  });
  assertEquals(e.newStatus, "confirmed");
  assertEquals(e.note, null);
  assertEquals(e.actorName, "CRM");
});

Deno.test("shapeContact is an allowlist — wa_id / internal columns never leak", () => {
  const c = shapeContact({
    id: "C1", wa_name: "יעל", wa_phone: "0501112233", status: "active",
    lead_id: "L9", last_message_at: "2026-07-10T08:00:00Z",
    // Internal columns that must NOT appear in the DTO:
    wa_id: "972501112233", bot_enabled: true, source_ip: "9.9.9.9",
  });
  const keys = Object.keys(c);
  for (const leak of ["wa_id", "bot_enabled", "source_ip"]) {
    assertFalse(keys.includes(leak), `${leak} must not appear in the contact DTO`);
  }
  assertEquals(c.name, "יעל");
  assertEquals(c.phone, "0501112233");
  assertEquals(c.leadId, "L9");
});

Deno.test("shapeContact leaves an unnamed contact's name blank (no fabrication)", () => {
  const c = shapeContact({ id: "C2", wa_phone: "0500000000", status: "new" });
  assertEquals(c.name, "");
  assertEquals(c.leadId, null);
  assertEquals(c.lastMessageAt, null);
});

// ── sellable leads (third-party-sharing feed) ────────────────────────────────

Deno.test("shapeSellableLead is an allowlist — source_ip / notes / internal cols never leak", () => {
  const d = shapeSellableLead({
    id: "L1", name: "דנה", phone: "0521234567", email: "d@x.com",
    provider: "סלקום", source: "advisor", status: "new",
    consent_share_at: "2026-07-01T10:00:00Z", created_at: "2026-07-01T09:00:00Z",
    // Columns that must NEVER reach a sellable DTO:
    source_ip: "9.9.9.9", notes: "פרטי — לא לרוכש", actual_saving: 480, referrer_code: "SW-1",
  });
  const keys = Object.keys(d);
  for (const leak of ["source_ip", "notes", "actual_saving", "referrer_code"]) {
    assertFalse(keys.includes(leak), `${leak} must not appear in the sellable DTO`);
  }
  assertEquals(d.name, "דנה");
  assertEquals(d.email, "d@x.com");
  assertEquals(d.consentShareAt, "2026-07-01T10:00:00Z");
});

Deno.test("shapeSellableLead null-coerces an absent consent stamp (no fabrication)", () => {
  const d = shapeSellableLead({ id: "L2", name: "x", phone: "05200", status: "new" });
  assertEquals(d.consentShareAt, null);
  assertEquals(d.email, null);
});

// ── shapeMember (C.2 roles roster) ───────────────────────────────────────────

Deno.test("shapeMember maps uid/role/grantedAt + the member's own name/email only", () => {
  const d = shapeMember(
    { uid: "u1", role: "rep", granted_at: "2026-07-10T10:00:00Z", updated_at: "2026-07-10T11:00:00Z" },
    { name: "דנה", email: "d@x.com" },
  );
  assertEquals(d, {
    uid: "u1",
    role: "rep",
    name: "דנה",
    email: "d@x.com",
    grantedAt: "2026-07-10T10:00:00Z",
  });
});

Deno.test("shapeMember is an allowlist — a stray profile column (is_admin) can NEVER leak", () => {
  const d = shapeMember(
    { uid: "u2", role: "viewer", granted_at: "2026-07-10T10:00:00Z" },
    // A profile object that accidentally carries privileged fields:
    { name: "רן", email: "r@x.com", is_admin: true, phone: "0521111111" } as Record<string, unknown>,
  );
  const keys = Object.keys(d);
  for (const leak of ["is_admin", "phone", "updated_at", "granted_by"]) {
    assertFalse(keys.includes(leak), `${leak} must not appear in the member DTO`);
  }
  assertEquals(d.role, "viewer");
});

Deno.test("shapeMember null-coerces a missing profile (no fabrication)", () => {
  const d = shapeMember({ uid: "u3", role: "rep", granted_at: null });
  assertEquals(d.name, null);
  assertEquals(d.email, null);
  assertEquals(d.grantedAt, null);
});

// ── aggregateReps (per-rep leaderboard) ──────────────────────────────────────

Deno.test("aggregateReps counts per rep and sums saving from WON leads only", () => {
  const reps = aggregateReps([
    { claimed_by: "דנה", status: "won", actual_saving: 600 },
    { claimed_by: "דנה", status: "won", actual_saving: 400 },
    { claimed_by: "דנה", status: "contacted", actual_saving: 999 }, // not won → no saving
    { claimed_by: "רון", status: "lost", actual_saving: 500 }, // lost → no saving
    { claimed_by: "רון", status: "won", actual_saving: 300 },
  ]);
  const dana = reps.find((r) => r.rep === "דנה")!;
  const ron = reps.find((r) => r.rep === "רון")!;
  assertEquals(dana.claimed, 3);
  assertEquals(dana.won, 2);
  assertEquals(dana.totalSaving, 1000); // 600 + 400, NOT the contacted lead's 999
  assertEquals(ron.claimed, 2);
  assertEquals(ron.lost, 1);
  assertEquals(ron.totalSaving, 300); // the lost lead's 500 is never counted
  // Sorted by booked saving desc → דנה (1000) before רון (300).
  assertEquals(reps[0].rep, "דנה");
});

Deno.test("aggregateReps ignores unclaimed rows and non-positive savings", () => {
  const reps = aggregateReps([
    { claimed_by: "", status: "won", actual_saving: 100 }, // no rep → skipped
    { claimed_by: null, status: "won", actual_saving: 100 }, // no rep → skipped
    { claimed_by: "יעל", status: "won", actual_saving: 0 }, // won but 0 → counted as won, saving 0
    { claimed_by: "יעל", status: "won", actual_saving: -50 }, // negative → not summed
  ]);
  assertEquals(reps.length, 1);
  assertEquals(reps[0].rep, "יעל");
  assertEquals(reps[0].won, 2);
  assertEquals(reps[0].totalSaving, 0);
});
