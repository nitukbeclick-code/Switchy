// Booker-email tests (confirmation + T-24h reminder) — the send seam the
// renewal-reminders follow-up cron consumes, plus the pre-migration safety of
// the claim PATCH. Run from supabase/functions/:  deno task test
//
// Fetch-stub style mirrors email_retry_test.ts (queued responders, captured
// calls, realFetch restore).

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { MeetingRow } from "../_shared/types.ts";
import {
  buildMeetingUserConfirmationHtml, buildMeetingUserReminderHtml,
  MEETING_CONFIRMATION_SUBJECT, MEETING_EMAIL_FROM_NAME, MEETING_REMINDER_SUBJECT,
  sendMeetingConfirmationEmail, sendMeetingUserReminderEmail,
} from "../_shared/meeting_user_emails.ts";
import { patchCount } from "../_shared/db.ts";

// Order-independence guard (same as email_retry_test.ts): keep observability's
// error capture dark so the stubbed fetch counts stay exact.
Deno.env.delete("SUPABASE_URL");
Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

const MEETING: MeetingRow = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "דנה כהן",
  phone: "050-1234567",
  email: "dana@example.com",
  provider: "פרטנר",
  meeting_date: "2026-06-16",
  slot: "14:30",
  starts_at: "2026-06-16T11:30:00.000Z", // 14:30 Israel (summer, UTC+3)
  status: "confirmed",
  join_url: "https://zoom.us/j/123",
  created_at: "2026-06-10T08:00:00.000Z",
};

// ── HTML builders — TRUTH-ONLY: only row data, transactional copy ────────────

Deno.test("confirmation email is RTL Hebrew with the real slot, provider, link and נתראה!", () => {
  const html = buildMeetingUserConfirmationHtml(MEETING);
  assertStringIncludes(html, 'dir="rtl"');
  assertStringIncludes(html, "דנה כהן");
  assertStringIncludes(html, "14:30"); // Israel wall-clock, not 11:30 UTC
  assertStringIncludes(html, "פרטנר");
  assertStringIncludes(html, 'href="https://zoom.us/j/123"');
  assertStringIncludes(html, "נתראה!");
  // strictly transactional — no unsubscribe link, no marketing CTA to the site
  assertFalse(html.includes("הסרה מרשימת התפוצה"));
});

Deno.test("confirmation email escapes user-controlled fields", () => {
  const html = buildMeetingUserConfirmationHtml({ ...MEETING, name: "<img src=x onerror=alert(1)>" });
  assertFalse(html.includes("<img src=x"));
  assertStringIncludes(html, "&lt;img");
});

Deno.test("reminder email carries the same real details + link, short and transactional", () => {
  const html = buildMeetingUserReminderHtml(MEETING);
  assertStringIncludes(html, "תזכורת");
  assertStringIncludes(html, "14:30");
  assertStringIncludes(html, 'href="https://zoom.us/j/123"');
  assertStringIncludes(html, "נתראה!");
  assertFalse(html.includes("הסרה מרשימת התפוצה"));
});

Deno.test("reminder email without a join_url points at the confirmation mail instead of a dead button", () => {
  const html = buildMeetingUserReminderHtml({ ...MEETING, join_url: null });
  assertFalse(html.includes("zoom.us"));
  assertStringIncludes(html, "במייל האישור");
});

// ── send seam (consumer stub) — sender identical to the OTP mail ─────────────

const realFetch = globalThis.fetch;

type Capture = { url: string; body: Record<string, unknown> };

function stubFetch(
  responders: Array<(c: Capture, i: number) => Response>,
): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const i = calls.length;
    calls.push({ url, body });
    return Promise.resolve(responders[Math.min(i, responders.length - 1)]({ url, body }, i));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

const CFG = { resend: "re_test_key", resendFrom: "חוסך <hello@switchy-ai.com>" };

function resendOk(): Response {
  return new Response(JSON.stringify({ id: "email_123" }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

Deno.test("sendMeetingConfirmationEmail posts once as 'Switchy AI' (same sender as the OTP mail) to the booker", async () => {
  const s = stubFetch([() => resendOk()]);
  try {
    const r = await sendMeetingConfirmationEmail(CFG, MEETING);
    assertEquals(r.ok, true);
    assertEquals(s.calls.length, 1);
    assertEquals(s.calls[0].url, "https://api.resend.com/emails");
    // display name overridden exactly like meeting-book's OTP send — the
    // legacy "חוסך" secret must not leak into the transactional sender
    assertEquals(s.calls[0].body.from, `${MEETING_EMAIL_FROM_NAME} <hello@switchy-ai.com>`);
    assertEquals(s.calls[0].body.to, ["dana@example.com"]);
    assertEquals(s.calls[0].body.subject, MEETING_CONFIRMATION_SUBJECT);
    assertStringIncludes(String(s.calls[0].body.html), "https://zoom.us/j/123");
  } finally {
    s.restore();
  }
});

Deno.test("sendMeetingUserReminderEmail posts the reminder subject with the same sender", async () => {
  const s = stubFetch([() => resendOk()]);
  try {
    const r = await sendMeetingUserReminderEmail(CFG, MEETING);
    assertEquals(r.ok, true);
    assertEquals(s.calls.length, 1);
    assertEquals(s.calls[0].body.from, `${MEETING_EMAIL_FROM_NAME} <hello@switchy-ai.com>`);
    assertEquals(s.calls[0].body.subject, MEETING_REMINDER_SUBJECT);
  } finally {
    s.restore();
  }
});

Deno.test("no email address → { ok:false }, zero network calls (fail-soft)", async () => {
  const s = stubFetch([() => resendOk()]);
  try {
    assertEquals((await sendMeetingConfirmationEmail(CFG, { ...MEETING, email: null })).ok, false);
    assertEquals((await sendMeetingUserReminderEmail(CFG, { ...MEETING, email: null })).ok, false);
    assertEquals(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

// ── pre-migration seam — the cron must NOT break before the SQL is applied ───
// The consumer claims each stamp with
//   PATCH /rest/v1/meetings?...&confirmation_emailed_at=is.null
// Before supabase/meetings-user-emails-2026-07.sql exists in prod, PostgREST
// answers 400 (unknown column). patchCount must swallow that as 0 claimed rows
// (→ the send is skipped), never throw into the cron.

Deno.test("patchCount returns 0 (no throw) when PostgREST 400s on a not-yet-migrated column", async () => {
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");
  const s = stubFetch([
    () =>
      new Response(JSON.stringify({ code: "42703", message: 'column meetings.confirmation_emailed_at does not exist' }), {
        status: 400, headers: { "Content-Type": "application/json" },
      }),
  ]);
  try {
    const n = await patchCount(
      "/rest/v1/meetings?id=eq.11111111-2222-3333-4444-555555555555&status=eq.confirmed&confirmation_emailed_at=is.null",
      { confirmation_emailed_at: new Date().toISOString() },
    );
    assertEquals(n, 0); // 0 claimed → the consumer skips the send, no crash
    assert(s.calls.length >= 1);
  } finally {
    s.restore();
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
});
