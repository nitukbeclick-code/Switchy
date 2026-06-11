// Meeting (Zoom booking) message formatting + inline keyboards. Pure functions
// — unit-tested in supabase/functions/tests/. callback_data namespace: meet:

import type { MeetingRow, TgInlineKeyboard } from "./types.ts";
import { esc, NL, waLink } from "./telegram.ts";

export const MEETING_STATUS_HE: Record<string, string> = {
  pending: "ממתין לאישור", confirmed: "מאושרת", no_rep: "אין נציג פנוי",
  cancelled: "בוטלה", expired: "פג תוקף", completed: "הסתיימה",
};
export const MEETING_STATUS_EMOJI: Record<string, string> = {
  pending: "🕐", confirmed: "✅", no_rep: "🚫", cancelled: "❌", expired: "⌛", completed: "🏁",
};

// "יום שלישי, 16.6, 14:30" — the slot as Israel wall-clock time. Falls back to
// the raw date+slot when starts_at is missing/unparseable.
export function formatMeetingWhen(m: MeetingRow): string {
  const t = Date.parse(String(m.starts_at ?? ""));
  if (!Number.isFinite(t)) return `${m.meeting_date ?? "—"} ${m.slot ?? ""}`.trim();
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(t));
}

// "14:30" — Israel wall-clock time only (digest rows).
export function formatMeetingTime(m: MeetingRow): string {
  const t = Date.parse(String(m.starts_at ?? ""));
  if (!Number.isFinite(t)) return String(m.slot ?? "—");
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit",
  }).format(new Date(t));
}

export function buildMeetingText(m: MeetingRow): string {
  const wa = waLink(m.phone);
  const lines: (string | null)[] = [
    "🎥 <b>בקשת פגישת וידאו — חוסך</b>",
    "",
    `👤 <b>שם:</b> ${esc(m.name)}`,
    `📞 <b>טלפון:</b> ${esc(m.phone)}` + (wa ? ` — <a href="${wa}">WhatsApp</a>` : ""),
    m.email ? `📧 <b>אימייל:</b> ${esc(m.email)}` : null,
    m.provider ? `📦 <b>ספק מבוקש:</b> ${esc(m.provider)}${m.plan_id ? ` · מסלול ${esc(m.plan_id)}` : ""}` : null,
    `📅 <b>מועד:</b> ${esc(formatMeetingWhen(m))} (30 דק׳, שעון ישראל)`,
    m.claimed_by ? `🙋 <b>בטיפול:</b> ${esc(m.claimed_by)}` : null,
    // 700 pre-escape chars keeps the card under Telegram's 4096-char limit
    // even at full entity expansion (same budget as the lead card)
    m.notes ? `📋 <b>הקשר:</b> ${esc(String(m.notes).slice(0, 700))}` : null,
  ];
  return lines.filter((x) => x !== null).join(NL);
}

// Live keyboard for a pending meeting. Every callback_data carries the meeting
// id so replies and late presses can resolve the meeting from the markup.
export function meetingKeyboard(m: MeetingRow): TgInlineKeyboard | undefined {
  if (!m.id) return undefined;
  const id = String(m.id);
  const claimBtn = m.claimed_by
    ? { text: `👤 בטיפול: ${m.claimed_by}`.slice(0, 60), callback_data: `meet:${id}:claimed` }
    : { text: "🙋 אני על זה", callback_data: `meet:${id}:claim` };
  return {
    inline_keyboard: [
      [{ text: "✅ אשר ושלח קישור Zoom", callback_data: `meet:${id}:confirm` }],
      [
        { text: "🚫 אין נציג פנוי", callback_data: `meet:${id}:norep` },
        { text: "❌ ביטול", callback_data: `meet:${id}:cancel` },
      ],
      [claimBtn, { text: "📜 היסטוריה", callback_data: `meet:${id}:history` }],
      [{ text: "🔄 שינוי מועד", callback_data: `meet:${id}:reschedule` }],
    ],
  };
}

// Frozen stamp after a final status — a single noop button (like the leads
// frozen keyboard, without undo: meeting transitions are terminal here).
// Confirmed meetings additionally keep a reschedule button: a confirmed slot is
// the one a rep most often needs to move, so it must not be frozen out.
export function frozenMeetingKeyboard(m: MeetingRow, statusLabel: string): TgInlineKeyboard {
  const id = String(m.id ?? "");
  const rows: TgInlineKeyboard["inline_keyboard"] = [[{ text: statusLabel.slice(0, 60), callback_data: `meet:${id}:noop` }]];
  if (String(m.status ?? "") === "confirmed" && id) {
    rows.push([{ text: "🔄 שינוי מועד", callback_data: `meet:${id}:reschedule` }]);
  }
  return { inline_keyboard: rows };
}

// The reschedule-ask prompt: the rep replies with a new 'YYYY-MM-DD HH:MM'.
// The meet:<id>:reschedule callback_data is the prompt's fingerprint (mirrors
// the link-ask flow), so a reply can resolve the meeting from the markup.
export function rescheduleAskText(m: MeetingRow): string {
  return `🔄 השיבו (reply) להודעה זו עם מועד חדש לפגישה עם ${esc(m.name ?? "הלקוח")} — בפורמט <code>YYYY-MM-DD HH:MM</code> (שעון ישראל), למשל <code>2026-06-18 14:30</code>.`;
}

export function rescheduleAskMarkup(meetingId: string): TgInlineKeyboard {
  return { inline_keyboard: [[{ text: "🔄 ממתין למועד חדש", callback_data: `meet:${meetingId}:reschedule` }]] };
}

// Returns the meeting id when the replied-to message is the reschedule-ask
// prompt (mirrors isLinkAskMarkup). Distinguished from the live card's
// reschedule button: that button is on a confirmed/frozen card, the prompt is
// its OWN message whose only button is this one — both resolve to the same id,
// which is all the reply handler needs.
export function isRescheduleAskMarkup(markup?: { inline_keyboard?: { callback_data?: string }[][] }): string | null {
  const rows = markup?.inline_keyboard ?? [];
  // a reschedule-ask prompt is a single-button message; the live confirmed card
  // carries other meet: buttons alongside it, so require it to be the sole row.
  if (rows.length === 1 && rows[0].length === 1) {
    const mm = String(rows[0][0].callback_data ?? "").match(/^meet:([0-9a-fA-F-]{36}):reschedule$/);
    if (mm) return mm[1];
  }
  return null;
}

// Status-aware keyboard: only pending meetings get live buttons; anything else
// is frozen so a /meetings listing can't re-fire confirm on a closed meeting.
export function meetingKeyboardFor(m: MeetingRow): TgInlineKeyboard | undefined {
  const status = String(m.status ?? "pending");
  if (status === "pending") return meetingKeyboard(m);
  if (!m.id) return undefined;
  const label = `${MEETING_STATUS_EMOJI[status] ?? "✅"} ${MEETING_STATUS_HE[status] ?? status}` +
    (m.claimed_by ? ` — ${m.claimed_by}` : "");
  return frozenMeetingKeyboard(m, label);
}

// The manual-link fallback prompt (Zoom unconfigured or API down): the rep
// replies to this message with the meeting link.
export function linkAskText(m: MeetingRow): string {
  return `🔗 השיבו (reply) להודעה זו עם קישור ה-Zoom לפגישה עם ${esc(m.name ?? "הלקוח")}`;
}

export function linkAskMarkup(meetingId: string): TgInlineKeyboard {
  return { inline_keyboard: [[{ text: "🔗 ממתין לקישור Zoom", callback_data: `meet:${meetingId}:linkask` }]] };
}

// Returns the meeting id when the replied-to message is the link-ask prompt
// (the meet:<id>:linkask markup is the prompt's fingerprint — mirrors how the
// won-flow detects its prompt via isWonAskMarkup).
export function isLinkAskMarkup(markup?: { inline_keyboard?: { callback_data?: string }[][] }): string | null {
  for (const row of markup?.inline_keyboard ?? []) {
    for (const btn of row) {
      const m = String(btn.callback_data ?? "").match(/^meet:([0-9a-fA-F-]{36}):linkask$/);
      if (m) return m[1];
    }
  }
  return null;
}

// Accept only real Zoom URLs (https, zoom.us or a *.zoom.us subdomain) — a
// typo or a random link must never be mailed to the customer as their meeting.
// Quotes/angle brackets stop the match: the link is interpolated into an
// href="…" attribute, and esc() does not escape quotes.
export function parseZoomLink(text: string): string | null {
  const m = String(text ?? "").match(/https:\/\/(?:[a-zA-Z0-9-]+\.)*zoom\.us\/[^\s"'<>]+/);
  return m ? m[0] : null;
}

export type MeetingEvent = {
  event?: string;
  old_status?: string | null;
  new_status?: string | null;
  actor_name?: string | null;
  note?: string | null;
  created_at?: string;
};

// Meeting timeline for the 📜 button — the audit trail, readable.
export function formatMeetingTimeline(m: MeetingRow, events: MeetingEvent[]): string {
  const fmtTime = (iso?: string): string => {
    const t = Date.parse(String(iso ?? ""));
    if (!Number.isFinite(t)) return "—";
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(new Date(t));
  };
  const status = String(m.status ?? "pending");
  const lines: string[] = [
    `📜 <b>היסטוריית הפגישה — ${esc(m.name)}</b> (${MEETING_STATUS_EMOJI[status] ?? ""} ${MEETING_STATUS_HE[status] ?? status})`,
    "",
    `🎥 ${fmtTime(m.created_at)} — הבקשה התקבלה (${esc(formatMeetingWhen(m))})`,
  ];
  const sorted = [...events].sort((a, b) =>
    Date.parse(String(a.created_at ?? "")) - Date.parse(String(b.created_at ?? "")));
  for (const ev of sorted.slice(-15)) {
    const who = esc(ev.actor_name ?? "");
    const at = fmtTime(ev.created_at);
    switch (String(ev.event ?? "")) {
      case "claim":
        lines.push(`🙋 ${at} — ${who} בטיפול`);
        break;
      case "status_change": {
        const oldHe = MEETING_STATUS_HE[String(ev.old_status ?? "")] ?? String(ev.old_status ?? "");
        const newHe = MEETING_STATUS_HE[String(ev.new_status ?? "")] ?? String(ev.new_status ?? "");
        lines.push(`${MEETING_STATUS_EMOJI[String(ev.new_status ?? "")] ?? "✅"} ${at} — ${who}: ${esc(oldHe)} ← ${esc(newHe)}`);
        break;
      }
      case "link_set":
        lines.push(`🔗 ${at} — ${who} קבע קישור Zoom`);
        break;
      case "reschedule":
        lines.push(`🔄 ${at} — ${who} שינה מועד ל${esc(ev.note ?? "")}`);
        break;
      case "reminder":
        lines.push(`⏳ ${at} — נשלחה תזכורת לנציגים`);
        break;
      default:
        lines.push(`• ${at} — ${esc(ev.event ?? "")}`);
    }
  }
  if (events.length === 0) lines.push("<i>אין עדיין פעולות על הפגישה הזו.</i>");
  return lines.join(NL);
}

// Customer-facing confirmation email — formal Hebrew, RTL, no emoji.
// Subject used by the caller: אישור פגישת וידאו — חוסך
export function buildMeetingCustomerEmailHtml(m: MeetingRow): string {
  const when = formatMeetingWhen(m);
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0B0F14">`
    + `<h2 style="color:#111827">פגישת הווידאו שלכם אושרה</h2>`
    + `<p>שלום ${esc(m.name ?? "")},</p>`
    + `<p>פגישת הייעוץ שלכם עם נציג חוסך נקבעה ל<b>${esc(when)}</b> (30 דקות, שעון ישראל)`
    + (m.provider ? ` בנושא <b>${esc(m.provider)}</b>` : "")
    + `.</p>`
    + (m.join_url
      ? `<p style="margin:24px 0"><a href="${esc(m.join_url)}" style="background:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block">הצטרפות לפגישת ה-Zoom</a></p>`
        + `<p style="font-size:13px;color:#222A35">אם הכפתור אינו נפתח, העתיקו את הקישור לדפדפן: <a href="${esc(m.join_url)}">${esc(m.join_url)}</a></p>`
      : "")
    + `<p>מומלץ להצטרף דקה-שתיים לפני המועד. אם המועד אינו מתאים, השיבו למייל זה ונתאם מועד חדש.</p>`
    + `<p>בברכה,<br>צוות חוסך</p>`
    + `</div>`;
}
