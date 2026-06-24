// Unit tests for the meeting (Zoom booking) pure logic. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Cfg, MeetingRow } from "../_shared/types.ts";
import {
  buildMeetingCustomerEmailHtml, buildMeetingText, formatMeetingTime, formatMeetingWhen,
  frozenMeetingKeyboard, isLinkAskMarkup, isRescheduleAskMarkup, linkAskMarkup, linkAskText,
  meetingKeyboard, meetingKeyboardFor, parseZoomLink, rescheduleAskMarkup, rescheduleAskText,
} from "../_shared/meetings.ts";
import { planMeetingFollowUps } from "../_shared/meeting_followup.ts";
import { buildZoomMeetingBody, zoomConfigured } from "../_shared/zoom.ts";

const MEETING: MeetingRow = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "דנה כהן",
  phone: "050-1234567",
  email: "dana@example.com",
  provider: "פרטנר",
  plan_id: "partner-5g-100",
  meeting_date: "2026-06-16",
  slot: "14:30",
  starts_at: "2026-06-16T11:30:00.000Z", // 14:30 Israel (summer, UTC+3)
  status: "pending",
  source: "form",
  created_at: "2026-06-10T08:00:00.000Z",
};

// ── meeting card formatting ──────────────────────────────────────────────────

Deno.test("buildMeetingText renders name, phone, WhatsApp link, provider and Israel slot time", () => {
  const text = buildMeetingText(MEETING);
  assertStringIncludes(text, "🎥");
  assertStringIncludes(text, "דנה כהן");
  assertStringIncludes(text, "050-1234567");
  assertStringIncludes(text, "https://wa.me/972501234567");
  assertStringIncludes(text, "פרטנר");
  assertStringIncludes(text, "14:30"); // Asia/Jerusalem wall-clock, not 11:30 UTC
  assertStringIncludes(text, "30 דק׳");
});

Deno.test("buildMeetingText escapes HTML and truncates oversized notes", () => {
  const text = buildMeetingText({ ...MEETING, name: "<script>alert(1)</script>", notes: "א".repeat(3000) });
  assertFalse(text.includes("<script>"));
  assertStringIncludes(text, "&lt;script&gt;");
  assert(text.length < 4096);
});

Deno.test("formatMeetingWhen falls back to date+slot when starts_at is missing", () => {
  assertEquals(formatMeetingWhen({ ...MEETING, starts_at: undefined }), "2026-06-16 14:30");
  assertStringIncludes(formatMeetingWhen(MEETING), "14:30");
  assertEquals(formatMeetingTime({ ...MEETING, starts_at: "not-a-date" }), "14:30"); // slot fallback
  assertEquals(formatMeetingTime(MEETING), "14:30");
});

// ── keyboards ────────────────────────────────────────────────────────────────

Deno.test("meetingKeyboard carries the meet: namespace actions", () => {
  const kb = meetingKeyboard(MEETING);
  assert(kb);
  const flat = kb.inline_keyboard.flat();
  assert(flat.some((b) => b.callback_data === `meet:${MEETING.id}:confirm`));
  assert(flat.some((b) => b.callback_data === `meet:${MEETING.id}:norep`));
  assert(flat.some((b) => b.callback_data === `meet:${MEETING.id}:cancel`));
  assert(flat.some((b) => b.callback_data === `meet:${MEETING.id}:claim`));
  assert(flat.some((b) => b.callback_data === `meet:${MEETING.id}:history`));
});

Deno.test("meetingKeyboard shows the owner instead of claim once claimed", () => {
  const kb = meetingKeyboard({ ...MEETING, claimed_by: "איתן לוי" });
  const flat = kb!.inline_keyboard.flat();
  assertFalse(flat.some((b) => b.callback_data === `meet:${MEETING.id}:claim`));
  assert(flat.some((b) => b.callback_data === `meet:${MEETING.id}:claimed` && b.text.includes("איתן")));
});

Deno.test("meetingKeyboard returns undefined without an id", () => {
  assertEquals(meetingKeyboard({ ...MEETING, id: undefined }), undefined);
});

Deno.test("frozenMeetingKeyboard is a single noop stamp", () => {
  const kb = frozenMeetingKeyboard(MEETING, "✅ מאושרת — דנה");
  assertEquals(kb.inline_keyboard.length, 1);
  assertEquals(kb.inline_keyboard[0].length, 1);
  assertEquals(kb.inline_keyboard[0][0].callback_data, `meet:${MEETING.id}:noop`);
  assertStringIncludes(kb.inline_keyboard[0][0].text, "מאושרת");
});

Deno.test("meetingKeyboardFor keeps pending live and freezes everything else", () => {
  const live = meetingKeyboardFor(MEETING)!;
  assert(live.inline_keyboard.flat().some((b) => b.callback_data === `meet:${MEETING.id}:confirm`));
  const frozen = meetingKeyboardFor({ ...MEETING, status: "confirmed", claimed_by: "דנה" })!;
  const flat = frozen.inline_keyboard.flat();
  assertFalse(flat.some((b) => b.callback_data === `meet:${MEETING.id}:confirm`));
  assert(flat.some((b) => b.callback_data === `meet:${MEETING.id}:noop` && b.text.includes("מאושרת")));
});

// ── link-ask reply flow ──────────────────────────────────────────────────────

Deno.test("linkAsk markup round-trips the meeting id", () => {
  const id = String(MEETING.id);
  assertEquals(isLinkAskMarkup(linkAskMarkup(id)), id);
  // a regular meeting card is NOT a link-ask prompt
  assertEquals(isLinkAskMarkup(meetingKeyboard(MEETING)), null);
  assertEquals(isLinkAskMarkup(undefined), null);
  assertStringIncludes(linkAskText(MEETING), "דנה כהן");
});

// ── reschedule flow ──────────────────────────────────────────────────────────

Deno.test("meetingKeyboard carries a reschedule button on the live card", () => {
  const kb = meetingKeyboard(MEETING)!;
  assert(kb.inline_keyboard.flat().some((b) => b.callback_data === `meet:${MEETING.id}:reschedule`));
});

Deno.test("frozenMeetingKeyboard keeps a reschedule button only for confirmed meetings", () => {
  const confirmed = frozenMeetingKeyboard({ ...MEETING, status: "confirmed" }, "✅ מאושרת");
  assert(confirmed.inline_keyboard.flat().some((b) => b.callback_data === `meet:${MEETING.id}:reschedule`));
  // cancelled / other terminal states do not get a reschedule button
  const cancelled = frozenMeetingKeyboard({ ...MEETING, status: "cancelled" }, "❌ בוטלה");
  assertFalse(cancelled.inline_keyboard.flat().some((b) => b.callback_data === `meet:${MEETING.id}:reschedule`));
});

Deno.test("rescheduleAsk markup round-trips the meeting id and is distinct from the live card", () => {
  const id = String(MEETING.id);
  assertEquals(isRescheduleAskMarkup(rescheduleAskMarkup(id)), id);
  // the live multi-button card is NOT a reschedule-ask prompt (sole-button rule)
  assertEquals(isRescheduleAskMarkup(meetingKeyboard(MEETING)), null);
  assertEquals(isRescheduleAskMarkup(linkAskMarkup(id)), null);
  assertEquals(isRescheduleAskMarkup(undefined), null);
  assertStringIncludes(rescheduleAskText(MEETING), "דנה כהן");
});

Deno.test("parseZoomLink accepts only real https Zoom URLs", () => {
  assertEquals(parseZoomLink("https://zoom.us/j/123"), "https://zoom.us/j/123");
  assertEquals(parseZoomLink("https://us02web.zoom.us/j/x?pwd=y"), "https://us02web.zoom.us/j/x?pwd=y");
  // extracts the first link out of surrounding chat text
  assertEquals(parseZoomLink("הנה הקישור https://zoom.us/j/9 תודה"), "https://zoom.us/j/9");
  assertEquals(parseZoomLink("http://zoom.us/j/123"), null);            // not https
  assertEquals(parseZoomLink("https://evil.com/zoom.us/j/1"), null);    // wrong host
  assertEquals(parseZoomLink("https://zoom.us.evil.com/j/1"), null);    // suffix spoof
  assertEquals(parseZoomLink("נתקשר מחר ב-14:30"), null);               // free text
  assertEquals(parseZoomLink(""), null);
  // quotes stop the match — the link lands inside an href="…" attribute
  assertEquals(parseZoomLink('https://zoom.us/j/1"onerror=alert(1)'), "https://zoom.us/j/1");
});

// ── follow-up planner ────────────────────────────────────────────────────────

const NOW = Date.parse("2026-06-16T08:00:00.000Z");
const meet = (over: Partial<MeetingRow>): MeetingRow => ({ ...MEETING, ...over });
const atOffset = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

Deno.test("planMeetingFollowUps reminds inside the 2h window, inclusive at the boundary", () => {
  // exactly 2h out — included
  assertEquals(planMeetingFollowUps([meet({ starts_at: atOffset(2) })], NOW), [
    { meeting: meet({ starts_at: atOffset(2) }), kind: "rep_reminder" },
  ]);
  // 2h01m out — not yet
  assertEquals(planMeetingFollowUps([meet({ starts_at: new Date(NOW + 2 * 3_600_000 + 60_000).toISOString() })], NOW).length, 0);
  // already reminded — skip
  assertEquals(planMeetingFollowUps([meet({ starts_at: atOffset(1), reminded_rep_at: atOffset(-1) })], NOW).length, 0);
});

Deno.test("planMeetingFollowUps expires pending meetings whose slot passed", () => {
  const plan = planMeetingFollowUps([meet({ starts_at: atOffset(-1) })], NOW);
  assertEquals(plan.length, 1);
  assertEquals(plan[0].kind, "expire");
  // even if a reminder already went out, a passed slot still expires
  assertEquals(planMeetingFollowUps([meet({ starts_at: atOffset(-1), reminded_rep_at: atOffset(-2) })], NOW)[0].kind, "expire");
});

Deno.test("planMeetingFollowUps ignores non-pending and unparseable rows", () => {
  assertEquals(planMeetingFollowUps([meet({ status: "confirmed", starts_at: atOffset(-1) })], NOW).length, 0);
  assertEquals(planMeetingFollowUps([meet({ status: "cancelled", starts_at: atOffset(1) })], NOW).length, 0);
  assertEquals(planMeetingFollowUps([meet({ starts_at: undefined })], NOW).length, 0);
});

// ── Zoom ─────────────────────────────────────────────────────────────────────

Deno.test("buildZoomMeetingBody is a 30-minute Israel-time meeting with a waiting room", () => {
  const body = buildZoomMeetingBody({ topic: "Switchy AI — פגישת ייעוץ", startsAtIso: "2026-06-16T11:30:00.000Z" });
  assertEquals(body, {
    topic: "Switchy AI — פגישת ייעוץ",
    type: 2,
    start_time: "2026-06-16T11:30:00Z",
    duration: 30,
    timezone: "Asia/Jerusalem",
    settings: { waiting_room: true, join_before_host: false },
  });
});

Deno.test("buildZoomMeetingBody normalizes start_time to Zoom's yyyy-MM-ddTHH:mm:ssZ", () => {
  // PostgREST emits '+00:00'-offset timestamps — Zoom wants the 'Z' form
  assertEquals(
    buildZoomMeetingBody({ topic: "x", startsAtIso: "2026-06-16T11:30:00+00:00" }).start_time,
    "2026-06-16T11:30:00Z",
  );
  // non-UTC offsets convert to the same UTC instant
  assertEquals(
    buildZoomMeetingBody({ topic: "x", startsAtIso: "2026-06-16T14:30:00+03:00" }).start_time,
    "2026-06-16T11:30:00Z",
  );
  // unparseable input passes through untouched — callers already fail-soft
  assertEquals(buildZoomMeetingBody({ topic: "x", startsAtIso: "not-a-date" }).start_time, "not-a-date");
});

Deno.test("zoomConfigured requires all three S2S credentials", () => {
  const cfgWith = (over: Partial<Cfg>): Cfg => ({
    tgToken: "t", tgChat: "-100123", resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "", webhookSecret: "s",
    zoomAccountId: "acc", zoomClientId: "cid", zoomClientSecret: "sec", zoomHostEmail: "",
    googleServiceAccount: "", googleCalendarId: "", googleSpreadsheetId: "",
    allowedUserIds: [42], src: {},
    ...over,
  });
  assert(zoomConfigured(cfgWith({})));
  assertFalse(zoomConfigured(cfgWith({ zoomAccountId: "" })));
  assertFalse(zoomConfigured(cfgWith({ zoomClientId: "" })));
  assertFalse(zoomConfigured(cfgWith({ zoomClientSecret: "" })));
});

// ── customer email ───────────────────────────────────────────────────────────

Deno.test("buildMeetingCustomerEmailHtml is RTL Hebrew with the join link", () => {
  const html = buildMeetingCustomerEmailHtml({ ...MEETING, status: "confirmed", join_url: "https://zoom.us/j/123" });
  assertStringIncludes(html, 'dir="rtl"');
  assertStringIncludes(html, "דנה כהן");
  assertStringIncludes(html, "14:30");
  assertStringIncludes(html, 'href="https://zoom.us/j/123"');
  assertStringIncludes(html, "פרטנר");
});

Deno.test("buildMeetingCustomerEmailHtml escapes user-controlled fields", () => {
  const html = buildMeetingCustomerEmailHtml({ ...MEETING, name: '<img src=x onerror=alert(1)>', join_url: "https://zoom.us/j/1" });
  assertFalse(html.includes("<img src=x"));
  assertStringIncludes(html, "&lt;img");
});
