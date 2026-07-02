// Booker-facing meeting emails: the confirmation (details + Zoom link) and the
// T-24h reminder. TRANSACTIONAL service mail for a meeting the user explicitly
// booked with a verified email — NOT marketing (§30A): no offers, no upsell,
// no unsubscribe link; every fact rendered comes straight off the meetings row
// (real date/slot/provider/join_url — nothing fabricated).
//
// Sender identity is IDENTICAL to the OTP mail (meeting-book): the "Switchy AI"
// display name over the resend_from address, so the whole booking conversation
// (code → confirmation → reminder) arrives from one recognizable sender and
// lands in Primary, not Promotions.
//
// Consumed by renewal-reminders (mode:"follow-up" — the hourly cron safety net,
// see planMeetingFollowUps) and by notify-lead's confirm flow. Sends are
// fail-soft via sendCustomerEmail (retry-once on 5xx only, never throws).

import type { Cfg, MeetingRow } from "./types.ts";
import { escAttr, escHtml, renderEmail, sendCustomerEmail } from "./email.ts";
import { formatMeetingWhen } from "./meetings.ts";

export const MEETING_CONFIRMATION_SUBJECT = "אישור פגישת וידאו — Switchy AI";
export const MEETING_REMINDER_SUBJECT = "תזכורת לפגישת הווידאו שלכם — Switchy AI";

// The exact display name the OTP mail uses (meeting-book → sendCustomerEmail
// with { fromName: "Switchy AI" }) — keep them byte-identical.
export const MEETING_EMAIL_FROM_NAME = "Switchy AI";

// "פגישת ייעוץ בנושא פרטנר" / "פגישת ייעוץ" — provider only when real.
function meetingTopicHtml(m: MeetingRow): string {
  return m.provider ? ` בנושא <b>${escHtml(m.provider)}</b>` : "";
}

// Plain-browser fallback line under the CTA — some clients block button links.
function linkFallbackHtml(joinUrl: string): string {
  return `אם הכפתור אינו נפתח, העתיקו את הקישור לדפדפן: ` +
    `<a href="${escAttr(joinUrl)}">${escHtml(joinUrl)}</a>`;
}

// Confirmation: the meeting is booked and confirmed — date, slot (Israel
// wall-clock via formatMeetingWhen), provider, the Zoom join link, נתראה!
export function buildMeetingUserConfirmationHtml(m: MeetingRow): string {
  const hello = m.name ? `שלום ${escHtml(m.name)},` : "שלום,";
  const when = formatMeetingWhen(m); // starts_at (IL tz) with date+slot fallback
  const join = String(m.join_url ?? "");
  return renderEmail({
    preheader: "פגישת הווידאו שלכם אושרה — קישור ה-Zoom מצורף.",
    heading: "פגישת הווידאו שלכם אושרה",
    bodyHtml: [
      hello,
      `פגישת הייעוץ שלכם עם נציג Switchy AI${meetingTopicHtml(m)} נקבעה ל<b>${escHtml(when)}</b> (30 דקות, שעון ישראל).`,
      "קישור ההצטרפות לפגישת ה-Zoom נמצא בכפתור למטה. מומלץ להצטרף דקה-שתיים לפני המועד.",
      ...(join ? [linkFallbackHtml(join)] : []),
      "אם המועד אינו מתאים — השיבו למייל זה ונתאם מועד חדש.",
      "נתראה!<br>צוות Switchy AI",
    ],
    ...(join ? { cta: { label: "הצטרפות לפגישת ה-Zoom", url: join } } : {}),
    footerReason: "קיבלתם את המייל הזה כי קבעתם פגישת ייעוץ ב-Switchy AI עם כתובת מייל זו — זהו אישור השירות שביקשתם.",
  });
}

// T-24h reminder: short — the same real details + the same link, nothing else.
export function buildMeetingUserReminderHtml(m: MeetingRow): string {
  const hello = m.name ? `שלום ${escHtml(m.name)},` : "שלום,";
  const when = formatMeetingWhen(m);
  const join = String(m.join_url ?? "");
  return renderEmail({
    preheader: "תזכורת: פגישת הווידאו שלכם עם Switchy AI מתקרבת.",
    heading: "תזכורת לפגישת הווידאו שלכם",
    bodyHtml: [
      hello,
      `תזכורת: פגישת הייעוץ שלכם עם נציג Switchy AI${meetingTopicHtml(m)} תתקיים ב<b>${escHtml(when)}</b> (30 דקות, שעון ישראל).`,
      ...(join
        ? ["קישור ההצטרפות — בכפתור למטה. מומלץ להצטרף דקה-שתיים לפני המועד.", linkFallbackHtml(join)]
        : ["קישור ההצטרפות נשלח אליכם במייל האישור."]),
      "נתראה!<br>צוות Switchy AI",
    ],
    ...(join ? { cta: { label: "הצטרפות לפגישת ה-Zoom", url: join } } : {}),
    footerReason: "קיבלתם את המייל הזה כי קבעתם פגישת ייעוץ ב-Switchy AI עם כתובת מייל זו — זוהי תזכורת לשירות שביקשתם.",
  });
}

// One send seam per kind — same plumbing (retry-once, never throws), same
// "Switchy AI" sender as the OTP mail. { ok:false } when there's no address.
export async function sendMeetingConfirmationEmail(
  cfg: Pick<Cfg, "resend" | "resendFrom">,
  m: MeetingRow,
): Promise<{ ok: boolean; error?: string }> {
  if (!m.email) return { ok: false, error: "no email" };
  return await sendCustomerEmail(
    cfg, String(m.email), MEETING_CONFIRMATION_SUBJECT,
    buildMeetingUserConfirmationHtml(m), { fromName: MEETING_EMAIL_FROM_NAME },
  );
}

export async function sendMeetingUserReminderEmail(
  cfg: Pick<Cfg, "resend" | "resendFrom">,
  m: MeetingRow,
): Promise<{ ok: boolean; error?: string }> {
  if (!m.email) return { ok: false, error: "no email" };
  return await sendCustomerEmail(
    cfg, String(m.email), MEETING_REMINDER_SUBJECT,
    buildMeetingUserReminderHtml(m), { fromName: MEETING_EMAIL_FROM_NAME },
  );
}
