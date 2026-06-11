// Unit tests for the rep-brain pure logic: agenda, week, stats, dossier,
// reschedule parsing, returning-customer line. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Lead, MeetingRow } from "../_shared/types.ts";
import {
  agendaIsEmpty, type AgendaInput, buildAgenda, buildDossier, buildReturningLine,
  buildStats, buildWeek, israelDay,
} from "../_shared/agenda.ts";
import { parseReschedule } from "../_shared/reschedule.ts";

// 2026-06-16 is a Tuesday. 11:30Z = 14:30 Israel (summer, UTC+3).
const NOW = Date.parse("2026-06-16T09:00:00.000Z"); // 12:00 Israel
const meeting = (over: Partial<MeetingRow>): MeetingRow => ({
  id: "11111111-2222-3333-4444-555555555555",
  name: "דנה כהן", phone: "050-1234567", provider: "פרטנר",
  meeting_date: "2026-06-16", slot: "14:30", starts_at: "2026-06-16T11:30:00.000Z",
  status: "confirmed", created_at: "2026-06-10T08:00:00.000Z", ...over,
});
const lead = (over: Partial<Lead>): Lead => ({
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  name: "יוסי לוי", phone: "052-7654321", status: "new",
  created_at: "2026-06-16T07:00:00.000Z", ...over,
});

// ── israelDay ────────────────────────────────────────────────────────────────

Deno.test("israelDay returns the Israel calendar day, not UTC", () => {
  // 22:30Z on 2026-06-16 is already 01:30 the next day in Israel (UTC+3)
  assertEquals(israelDay(Date.parse("2026-06-16T22:30:00Z")), "2026-06-17");
  assertEquals(israelDay(NOW), "2026-06-16");
});

// ── buildAgenda ──────────────────────────────────────────────────────────────

Deno.test("buildAgenda lists today's confirmed meetings with Israel times", () => {
  const input: AgendaInput = {
    confirmed: [meeting({ starts_at: "2026-06-16T11:30:00.000Z" }), meeting({ name: "מחר", starts_at: "2026-06-17T11:30:00.000Z" })],
    pending: [],
    uncontacted: [],
  };
  const text = buildAgenda(input, NOW);
  assertStringIncludes(text, "סדר היום");
  assertStringIncludes(text, "14:30"); // Israel wall-clock
  assertStringIncludes(text, "דנה כהן");
  assertFalse(text.includes("מחר")); // tomorrow's meeting is trimmed out
});

Deno.test("buildAgenda sorts confirmed meetings by time", () => {
  const input: AgendaInput = {
    confirmed: [
      meeting({ name: "שני", starts_at: "2026-06-16T14:00:00.000Z" }),
      meeting({ name: "ראשון", starts_at: "2026-06-16T08:00:00.000Z" }),
    ],
    pending: [], uncontacted: [],
  };
  const text = buildAgenda(input, NOW);
  assert(text.indexOf("ראשון") < text.indexOf("שני"));
});

Deno.test("buildAgenda shows pending meetings and uncontacted leads", () => {
  const input: AgendaInput = {
    confirmed: [],
    pending: [meeting({ status: "pending", name: "ממתינה" })],
    uncontacted: [lead({ name: "ליד חדש" })],
  };
  const text = buildAgenda(input, NOW);
  assertStringIncludes(text, "ממתינות לאישור");
  assertStringIncludes(text, "ממתינה");
  assertStringIncludes(text, "לא טופלו");
  assertStringIncludes(text, "ליד חדש");
});

Deno.test("buildAgenda renders an all-clear message when nothing is pending", () => {
  const text = buildAgenda({ confirmed: [], pending: [], uncontacted: [] }, NOW);
  assertStringIncludes(text, "הכול נקי");
});

Deno.test("buildAgenda ignores non-new leads in the uncontacted list", () => {
  const input: AgendaInput = { confirmed: [], pending: [], uncontacted: [lead({ status: "won", name: "כבר נסגר" })] };
  const text = buildAgenda(input, NOW);
  assertFalse(text.includes("כבר נסגר"));
  assertStringIncludes(text, "הכול נקי");
});

Deno.test("buildAgenda escapes HTML in customer-controlled fields", () => {
  const input: AgendaInput = { confirmed: [], pending: [], uncontacted: [lead({ name: "<b>x</b>" })] };
  const text = buildAgenda(input, NOW);
  assertFalse(text.includes("<b>x</b>"));
  assertStringIncludes(text, "&lt;b&gt;x&lt;/b&gt;");
});

Deno.test("agendaIsEmpty matches buildAgenda's all-clear case", () => {
  assert(agendaIsEmpty({ confirmed: [], pending: [], uncontacted: [] }, NOW));
  // only a tomorrow meeting → empty for today
  assert(agendaIsEmpty({ confirmed: [meeting({ starts_at: "2026-06-17T11:30:00Z" })], pending: [], uncontacted: [] }, NOW));
  assertFalse(agendaIsEmpty({ confirmed: [meeting({})], pending: [], uncontacted: [] }, NOW));
  assertFalse(agendaIsEmpty({ confirmed: [], pending: [], uncontacted: [lead({})] }, NOW));
});

// ── buildWeek ────────────────────────────────────────────────────────────────

Deno.test("buildWeek groups confirmed meetings by day within the next 7 days", () => {
  const meetings = [
    meeting({ name: "היום", starts_at: "2026-06-16T11:30:00Z" }),
    meeting({ name: "מחרתיים", starts_at: "2026-06-18T07:00:00Z" }),
    meeting({ name: "רחוק", starts_at: "2026-06-30T07:00:00Z" }), // out of window
    meeting({ name: "פנדינג", status: "pending", starts_at: "2026-06-17T07:00:00Z" }), // not confirmed
  ];
  const text = buildWeek(meetings, NOW);
  assertStringIncludes(text, "היום");
  assertStringIncludes(text, "מחרתיים");
  assertFalse(text.includes("רחוק"));
  assertFalse(text.includes("פנדינג"));
  assert(text.indexOf("היום") < text.indexOf("מחרתיים")); // chronological
});

Deno.test("buildWeek reports an empty week cleanly", () => {
  assertStringIncludes(buildWeek([], NOW), "אין פגישות מאושרות");
});

// ── buildStats ───────────────────────────────────────────────────────────────

Deno.test("buildStats computes the weekly funnel and conversion %", () => {
  const weekLeads: Lead[] = [
    lead({ status: "new" }),
    lead({ status: "contacted", contacted_at: "2026-06-16T08:00:00Z" }),
    lead({ status: "won", contacted_at: "2026-06-16T08:00:00Z" }),
    lead({ status: "won", contacted_at: "2026-06-16T08:00:00Z" }),
    lead({ status: "lost" }),
  ];
  const weekMeetings: MeetingRow[] = [
    meeting({ status: "pending" }), meeting({ status: "confirmed" }), meeting({ status: "completed" }),
  ];
  const text = buildStats({ weekLeads, weekMeetings });
  assertStringIncludes(text, "לידים חדשים: <b>5</b>");
  assertStringIncludes(text, "🏆 2 נסגרו");
  assertStringIncludes(text, "שיעור סגירה: <b>40%</b>"); // 2/5
  assertStringIncludes(text, "פגישות שנקבעו: <b>3</b>");
  assertStringIncludes(text, "✅ 2 אושרו"); // confirmed + completed
  assertStringIncludes(text, "🏁 1 הסתיימו");
});

Deno.test("buildStats handles an empty week without dividing by zero", () => {
  const text = buildStats({ weekLeads: [], weekMeetings: [] });
  assertStringIncludes(text, "שיעור סגירה: <b>0%</b>");
});

// ── buildDossier ─────────────────────────────────────────────────────────────

Deno.test("buildDossier renders profile name, leads, meetings, tracked plans and reviews", () => {
  const text = buildDossier({
    query: "0527654321",
    profileName: "יוסי לוי",
    leads: [
      lead({ created_at: "2026-05-01T08:00:00Z", status: "won", provider: "סלקום", actual_saving: 1200 }),
      lead({ created_at: "2026-06-16T08:00:00Z", status: "new", provider: "פרטנר" }),
    ],
    meetings: [meeting({ meeting_date: "2026-05-10", status: "completed", provider: "סלקום" })],
    tracked: [{ provider: "סלקום", plan_name: "5G 200", monthly_price: 49, promo_end_date: "2026-09-01" }],
    reviews: [{ provider: "סלקום", overall: 4, body: "שירות טוב" }],
  });
  assertStringIncludes(text, "תיק לקוח");
  assertStringIncludes(text, "יוסי לוי");
  assertStringIncludes(text, "פניות (2)");
  assertStringIncludes(text, "💰₪1200");
  assertStringIncludes(text, "פגישות (1)");
  assertStringIncludes(text, "מסלולים במעקב (1)");
  assertStringIncludes(text, "5G 200");
  assertStringIncludes(text, "ביקורות שכתב (1)");
  assertStringIncludes(text, "★★★★");
  // newest lead first
  assert(text.indexOf("2026-06-16") < text.indexOf("2026-05-01"));
});

Deno.test("buildDossier handles a customer with no history gracefully", () => {
  const text = buildDossier({ query: "0500000000", leads: [], meetings: [], tracked: [], reviews: [] });
  assertStringIncludes(text, "אין פניות קודמות");
  assertStringIncludes(text, "אין פגישות קודמות");
});

Deno.test("buildDossier falls back to a lead name when there's no profile", () => {
  const text = buildDossier({
    query: "0527654321", profileName: null,
    leads: [lead({ name: "שם מהליד" })], meetings: [], tracked: [], reviews: [],
  });
  assertStringIncludes(text, "שם מהליד");
});

Deno.test("buildDossier escapes HTML in fields", () => {
  const text = buildDossier({
    query: "0527654321", profileName: "<script>x</script>",
    leads: [], meetings: [], tracked: [], reviews: [],
  });
  assertFalse(text.includes("<script>x</script>"));
  assertStringIncludes(text, "&lt;script&gt;");
});

// ── buildReturningLine ───────────────────────────────────────────────────────

Deno.test("buildReturningLine summarises the latest prior lead and meeting", () => {
  const line = buildReturningLine(
    [{ created_at: "2026-05-01T08:00:00Z", status: "won" }, { created_at: "2026-04-01T08:00:00Z", status: "lost" }],
    [{ meeting_date: "2026-05-10", status: "completed" }],
  );
  assertStringIncludes(line, "לקוח חוזר");
  assertStringIncludes(line, "2026-05-01"); // newest lead
  assertStringIncludes(line, "נסגר");
  assertStringIncludes(line, "2026-05-10");
  assertStringIncludes(line, "הסתיימה");
});

Deno.test("buildReturningLine is empty with no prior history", () => {
  assertEquals(buildReturningLine([], []), "");
});

Deno.test("buildReturningLine works with only a prior meeting", () => {
  const line = buildReturningLine([], [{ meeting_date: "2026-05-10", status: "cancelled" }]);
  assertStringIncludes(line, "פגישה קודמת");
  assertStringIncludes(line, "בוטלה");
  assertFalse(line.includes("פנייה קודמת"));
});

// ── parseReschedule ──────────────────────────────────────────────────────────

// "now" = 2026-06-16 (Tuesday) 12:00 Israel; tomorrow = 2026-06-17 (Wed).
const R_NOW = Date.parse("2026-06-16T09:00:00.000Z");

Deno.test("parseReschedule accepts a valid Sun–Thu slot and computes the UTC instant", () => {
  const r = parseReschedule("2026-06-18 14:30", R_NOW); // Thursday
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.meetingDate, "2026-06-18");
    assertEquals(r.slot, "14:30");
    // 14:30 Israel summer (UTC+3) = 11:30Z
    assertEquals(r.startsAt, "2026-06-18T11:30:00.000Z");
  }
});

Deno.test("parseReschedule accepts a valid Friday morning slot", () => {
  const r = parseReschedule("2026-06-19 11:00", R_NOW); // Friday
  assert(r.ok);
  if (r.ok) assertEquals(r.slot, "11:00");
});

Deno.test("parseReschedule rejects Saturday", () => {
  const r = parseReschedule("2026-06-20 14:30", R_NOW); // Saturday
  assertFalse(r.ok);
  if (!r.ok) assertStringIncludes(r.error, "שבת");
});

Deno.test("parseReschedule rejects a Friday afternoon slot", () => {
  const r = parseReschedule("2026-06-19 14:30", R_NOW);
  assertFalse(r.ok);
});

Deno.test("parseReschedule rejects today and the past (must be tomorrow+)", () => {
  assertFalse(parseReschedule("2026-06-16 14:30", R_NOW).ok); // today
  assertFalse(parseReschedule("2026-06-10 14:30", R_NOW).ok); // past
});

Deno.test("parseReschedule rejects more than 30 days ahead", () => {
  assertFalse(parseReschedule("2026-08-01 14:30", R_NOW).ok);
});

Deno.test("parseReschedule rejects off-grid times and out-of-range hours", () => {
  assertFalse(parseReschedule("2026-06-18 14:15", R_NOW).ok); // not :00/:30
  assertFalse(parseReschedule("2026-06-18 08:30", R_NOW).ok); // before 09:00
  assertFalse(parseReschedule("2026-06-18 21:00", R_NOW).ok); // after 20:30
});

Deno.test("parseReschedule rejects malformed input", () => {
  assertFalse(parseReschedule("מחר ב-14:30", R_NOW).ok);
  assertFalse(parseReschedule("2026/06/18 14:30", R_NOW).ok);
  assertFalse(parseReschedule("", R_NOW).ok);
  assertFalse(parseReschedule("2026-13-01 14:30", R_NOW).ok); // bad month
});

Deno.test("parseReschedule accepts the 20:30 Sun–Thu upper boundary", () => {
  assert(parseReschedule("2026-06-18 20:30", R_NOW).ok);
});
