// Telegram callback + reply handling for meeting cards: confirm (auto-Zoom or
// manual link-ask fallback), no-rep / cancel, atomic claiming, history.
// Mirrors callbacks.ts; callback_data namespace: meet:<id>:<action>.

import type { Cfg, MeetingRow, TgCallbackQuery, TgMessage } from "../_shared/types.ts";
import { esc, NL, sendTelegram, tgApi } from "../_shared/telegram.ts";
import { fetchRows, logMeetingEvent, patchCount } from "../_shared/db.ts";
import { tgDisplayName } from "../_shared/leads.ts";
import {
  buildMeetingCustomerEmailHtml, formatMeetingTimeline, formatMeetingWhen, frozenMeetingKeyboard,
  linkAskMarkup, linkAskText, MEETING_STATUS_HE, type MeetingEvent, meetingKeyboardFor, parseZoomLink,
  rescheduleAskMarkup, rescheduleAskText,
} from "../_shared/meetings.ts";
import { parseReschedule } from "../_shared/reschedule.ts";
import { createZoomMeeting, deleteZoomMeeting, zoomConfigured } from "../_shared/zoom.ts";
import {
  createCalendarEvent, deleteCalendarEvent, gcalConfigured, updateCalendarEventStart,
} from "../_shared/google_calendar.ts";
import { sendCustomerEmail } from "../_shared/email.ts";
import { allowed } from "./callbacks.ts";

type HandlerResult = Record<string, unknown>;

const CUSTOMER_SUBJECT = "אישור פגישת וידאו — חוסך";

// Re-render the card keyboard from current DB state. Status-aware: a meeting
// closed by a concurrent press stays frozen — a late claim can't resurrect
// live buttons.
async function refreshMeetingKeyboard(cfg: Cfg, msg: TgMessage | undefined, meetingId: string): Promise<void> {
  if (!msg || msg.chat?.id == null) return;
  const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=*`);
  if (!rows || rows.length === 0) return;
  await tgApi(cfg, "editMessageReplyMarkup", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    reply_markup: meetingKeyboardFor(rows[0]),
  });
}

async function freezeCard(cfg: Cfg, msg: TgMessage | undefined, meetingId: string, label: string): Promise<void> {
  if (!msg || msg.chat?.id == null) return;
  await tgApi(cfg, "editMessageReplyMarkup", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    reply_markup: frozenMeetingKeyboard({ id: meetingId }, label),
  });
}

// Email the customer their confirmed meeting (join link included). Fail-soft:
// the meeting is already confirmed in the DB; a failed email is reported to
// the team so they can deliver the link by hand.
async function emailCustomer(cfg: Cfg, meeting: MeetingRow): Promise<boolean> {
  if (!meeting.email) return false;
  const r = await sendCustomerEmail(cfg, String(meeting.email), CUSTOMER_SUBJECT, buildMeetingCustomerEmailHtml(meeting));
  return r.ok;
}

function deliveryLine(meeting: MeetingRow, emailed: boolean): string {
  if (!meeting.email) return "⚠️ אין אימייל ללקוח — שלחו את הקישור בוואטסאפ";
  return emailed ? "📧 הקישור נשלח ללקוח במייל" : "⚠️ שליחת המייל ללקוח נכשלה — שלחו את הקישור ידנית";
}

// Best-effort: create a Google Calendar event for a confirmed meeting and stash
// the event id on the row so reschedule/cancel can patch/delete it. Mirrors the
// Zoom integration's fail-soft contract — never throws, never blocks the confirm.
// Returns "skipped" when Calendar isn't configured / no start time, "ok" on a
// created event, "failed" when the create call returned null so the caller can
// warn the rep to add it by hand.
type GcalSyncResult = "ok" | "failed" | "skipped";
async function createGcalEventFor(cfg: Cfg, meeting: MeetingRow, joinUrl: string): Promise<GcalSyncResult> {
  if (!gcalConfigured(cfg)) return "skipped";
  const startIso = String(meeting.starts_at ?? "");
  if (!startIso) return "skipped";
  const name = meeting.name ?? "";
  const provider = meeting.provider ?? "";
  const summary = `חוסך — פגישת ייעוץ ${provider} עם ${name}`.replace(/\s+/g, " ").trim();
  const description =
    `שם: ${name}\nטלפון: ${meeting.phone ?? ""}\nספק: ${provider}\nקישור Zoom: ${joinUrl}`;
  const ev = await createCalendarEvent(cfg, { summary, description, startIso });
  if (!ev?.id) return "failed";
  if (!meeting.id) return "ok";
  // persist best-effort — a failed patch leaves the event live but un-tracked,
  // which is harmless (it just won't be auto-moved/deleted later).
  await patchCount(`/rest/v1/meetings?id=eq.${meeting.id}`, { gcal_event_id: ev.id });
  return "ok";
}

// Best-effort: delete the calendar event tied to a meeting (if any). Fail-soft.
async function deleteGcalEventFor(cfg: Cfg, meetingId: string): Promise<void> {
  if (!gcalConfigured(cfg)) return;
  const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=gcal_event_id`);
  const id = rows?.[0]?.gcal_event_id;
  if (id) await deleteCalendarEvent(cfg, id);
}

export async function handleMeetingCallback(cfg: Cfg, cb: TgCallbackQuery): Promise<HandlerResult> {
  const answer = (text?: string) =>
    tgApi(cfg, "answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) });

  if (!allowed(cfg, cb.from?.id)) {
    await answer("אין הרשאה לפעולה זו");
    return { ok: false, skipped: "user not allowed" };
  }

  const data = String(cb.data ?? "");
  const msg = cb.message;
  const chatId = msg?.chat?.id;
  // Honor presses only from the configured team chat — same fail-close gate as
  // the lead callbacks.
  if (!cfg.tgChat || String(chatId ?? "") !== cfg.tgChat) {
    await answer();
    return { ok: false, skipped: "wrong chat" };
  }

  const m = data.match(/^meet:([0-9a-fA-F-]{36}):(confirm|norep|cancel|claim|claimed|linkask|reschedule|noop|history)$/);
  if (!m) {
    await answer();
    return { ok: true, skipped: "unrecognized callback" };
  }
  const [, meetingId, action] = m;
  const who = tgDisplayName(cb.from);

  if (action === "noop") {
    await answer();
    return { ok: true };
  }

  if (action === "linkask") {
    // the button is just a fingerprint for the reply flow — explain it
    await answer("השיבו (reply) להודעה זו עם קישור Zoom — https://zoom.us/...");
    return { ok: true };
  }

  if (action === "reschedule") {
    // only a live (pending) or confirmed meeting can be moved — terminal
    // statuses (cancelled/expired/no_rep/completed) have nothing to reschedule
    const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=status,name`);
    if (rows === null) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    const st = String(rows[0]?.status ?? "");
    if (st !== "pending" && st !== "confirmed") {
      await answer("אי אפשר לשנות מועד לפגישה שאינה פעילה");
      return { ok: false, skipped: "not reschedulable" };
    }
    await answer("השיבו עם מועד חדש");
    await sendTelegram(cfg, rescheduleAskText(rows[0] ?? { id: meetingId }), rescheduleAskMarkup(meetingId));
    return { ok: true, pending: "reschedule" };
  }

  if (action === "history") {
    const [meetRows, evs] = await Promise.all([
      fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=*`),
      fetchRows<MeetingEvent>(`/rest/v1/meeting_events?meeting_id=eq.${meetingId}&order=created_at.asc&limit=30`),
    ]);
    if (meetRows === null || evs === null) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    if (!meetRows[0]) {
      await answer("הפגישה לא נמצאה");
      return { ok: false };
    }
    await answer();
    await sendTelegram(cfg, formatMeetingTimeline(meetRows[0], evs));
    return { ok: true };
  }

  if (action === "claimed") {
    const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=claimed_by`);
    if (rows === null) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    await answer(rows[0]?.claimed_by ? `בטיפול אצל ${rows[0].claimed_by}` : "פנוי לטיפול");
    return { ok: true };
  }

  if (action === "claim") {
    // claimed_by_tg_id=is.null makes the claim atomic — the second presser
    // matches zero rows
    const n = await patchCount(`/rest/v1/meetings?id=eq.${meetingId}&claimed_by_tg_id=is.null`, {
      claimed_by: (who || "נציג").slice(0, 60),
      claimed_by_tg_id: cb.from?.id ?? null,
      claimed_at: new Date().toISOString(),
    });
    if (n === 0) {
      const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=claimed_by`);
      const owner = rows?.[0]?.claimed_by;
      await answer(owner ? `כבר בטיפול אצל ${owner}` : "התפיסה נכשלה — נסו שוב");
      // lost the claim race — re-render so the card shows the actual owner
      await refreshMeetingKeyboard(cfg, msg, meetingId);
      return { ok: false, skipped: "already claimed" };
    }
    await logMeetingEvent({ meeting_id: meetingId, event: "claim", actor_tg_id: cb.from?.id ?? null, actor_name: who });
    await answer("נתפס על ידך 🙋");
    await refreshMeetingKeyboard(cfg, msg, meetingId);
    return { ok: true };
  }

  if (action === "norep" || action === "cancel") {
    const newStatus = action === "norep" ? "no_rep" : "cancelled";
    // status=eq.pending makes the transition atomic — a meeting already
    // confirmed/closed by a concurrent press matches zero rows
    const n = await patchCount(`/rest/v1/meetings?id=eq.${meetingId}&status=eq.pending`, { status: newStatus });
    if (n === 0) {
      await answer("כבר טופל");
      // the meeting was closed by a concurrent press — freeze this stale card
      await refreshMeetingKeyboard(cfg, msg, meetingId);
      return { ok: false, skipped: "not pending" };
    }
    // best-effort: drop any calendar event we may have created for this meeting
    // (a pending meeting normally has none, but a re-opened/edge case might).
    await deleteGcalEventFor(cfg, meetingId);
    await logMeetingEvent({
      meeting_id: meetingId, event: "status_change", old_status: "pending", new_status: newStatus,
      actor_tg_id: cb.from?.id ?? null, actor_name: who,
    });
    await answer(`עודכן: ${MEETING_STATUS_HE[newStatus]}`);
    await freezeCard(cfg, msg, meetingId,
      `${newStatus === "no_rep" ? "🚫" : "❌"} ${MEETING_STATUS_HE[newStatus]}${who ? " — " + who : ""}`);
    return { ok: true };
  }

  // confirm — the heavy path: create the Zoom meeting (when configured), stamp
  // the row atomically, email the customer, freeze the card.
  const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=*`);
  if (rows === null) {
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  const meeting = rows[0];
  if (!meeting) {
    await answer("הפגישה לא נמצאה");
    return { ok: false };
  }
  if (String(meeting.status ?? "pending") !== "pending") {
    await answer("כבר טופל");
    // stale card pressed after the meeting closed — freeze its buttons
    await refreshMeetingKeyboard(cfg, msg, meetingId);
    return { ok: true, skipped: "not pending" };
  }

  if (!zoomConfigured(cfg)) {
    // No Zoom credentials — fall back to the manual reply flow. Status stays
    // pending until a valid link arrives.
    await answer("Zoom לא מוגדר — שלחו קישור ידנית");
    await sendTelegram(cfg, linkAskText(meeting), linkAskMarkup(meetingId));
    return { ok: true, pending: "manual link" };
  }

  const zoom = await createZoomMeeting(cfg, {
    topic: `חוסך — פגישת ייעוץ ${meeting.provider ?? ""} עם ${meeting.name ?? ""}`.replace(/\s+/g, " ").trim(),
    startsAtIso: String(meeting.starts_at ?? ""),
  });
  if (!zoom) {
    await answer("יצירת פגישת Zoom נכשלה — שלחו קישור ידנית");
    await sendTelegram(cfg, linkAskText(meeting), linkAskMarkup(meetingId));
    return { ok: false, pending: "manual link" };
  }

  const n = await patchCount(`/rest/v1/meetings?id=eq.${meetingId}&status=eq.pending`, {
    status: "confirmed",
    join_url: zoom.join_url,
    zoom_meeting_id: zoom.id,
    confirmed_at: new Date().toISOString(),
  });
  if (n === 0) {
    // lost the confirm race — don't leave an orphan meeting on the Zoom account
    await deleteZoomMeeting(cfg, zoom.id);
    await answer("כבר טופל");
    await refreshMeetingKeyboard(cfg, msg, meetingId);
    return { ok: false, skipped: "lost confirm race" };
  }
  await logMeetingEvent({
    meeting_id: meetingId, event: "status_change", old_status: "pending", new_status: "confirmed",
    actor_tg_id: cb.from?.id ?? null, actor_name: who,
  });
  await logMeetingEvent({
    meeting_id: meetingId, event: "link_set", note: zoom.join_url.slice(0, 500),
    actor_tg_id: cb.from?.id ?? null, actor_name: who,
  });
  // best-effort Google Calendar event (mirrors Zoom): never let it break the
  // confirm. Persist the returned id so reschedule/cancel can patch/delete it.
  const gcal = await createGcalEventFor(cfg, meeting, zoom.join_url);
  await answer("הפגישה אושרה ✅");
  await freezeCard(cfg, msg, meetingId, `✅ ${MEETING_STATUS_HE.confirmed}${who ? " — " + who : ""}`);
  const confirmed: MeetingRow = { ...meeting, status: "confirmed", join_url: zoom.join_url };
  const emailed = await emailCustomer(cfg, confirmed);
  // a failed calendar create doesn't block the confirm, but the rep should know
  // the event won't appear on the team calendar so they can add it by hand.
  const gcalWarn = gcal === "failed" ? `${NL}⚠️ סנכרון יומן נכשל` : "";
  await sendTelegram(
    cfg,
    `🎥 <b>הפגישה עם ${esc(meeting.name ?? "")} אושרה</b> — ${esc(formatMeetingWhen(meeting))}${NL}` +
      `🔗 ${esc(zoom.join_url)}${NL}${deliveryLine(confirmed, emailed)}${gcalWarn}`,
  );
  return { ok: true, confirmed: true, emailed };
}

// A reply to the link-ask prompt: validate the Zoom link, confirm the meeting
// atomically, email the customer. Called from handleTeamMessage (callbacks.ts)
// after the caller's chat/allowlist gates have already passed.
export async function handleMeetingLinkReply(cfg: Cfg, msg: TgMessage, meetingId: string, text: string): Promise<HandlerResult> {
  const link = parseZoomLink(text);
  if (!link) {
    await sendTelegram(cfg, "לא זיהיתי קישור Zoom תקין — השיבו עם קישור https://zoom.us/...");
    return { ok: false, skipped: "invalid zoom link" };
  }
  const who = tgDisplayName(msg.from);
  const n = await patchCount(`/rest/v1/meetings?id=eq.${meetingId}&status=eq.pending`, {
    status: "confirmed",
    join_url: link,
    confirmed_at: new Date().toISOString(),
  });
  if (n === 0) {
    await sendTelegram(cfg, "הפגישה כבר טופלה (אושרה או בוטלה) — הקישור לא נרשם.");
    // the prompt's button must not keep advertising "waiting for a link"
    await refreshMeetingKeyboard(cfg, msg.reply_to_message, meetingId);
    return { ok: false, skipped: "not pending" };
  }
  await logMeetingEvent({
    meeting_id: meetingId, event: "status_change", old_status: "pending", new_status: "confirmed",
    actor_tg_id: msg.from?.id ?? null, actor_name: who,
  });
  await logMeetingEvent({
    meeting_id: meetingId, event: "link_set", note: link.slice(0, 500),
    actor_tg_id: msg.from?.id ?? null, actor_name: who,
  });
  // freeze the link-ask prompt (the replied-to message) — the original card's
  // message id isn't reachable from the reply context, but its live buttons
  // now hit the not-pending refresh above on any late press
  await freezeCard(cfg, msg.reply_to_message, meetingId,
    `✅ ${MEETING_STATUS_HE.confirmed}${who ? " — " + who : ""}`);
  // fetch AFTER the patch so the email renders the join link we just stored
  const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=*`);
  const meeting = rows?.[0];
  // best-effort calendar event for the manually-confirmed meeting too
  const gcal = meeting ? await createGcalEventFor(cfg, meeting, link) : "skipped";
  const emailed = meeting ? await emailCustomer(cfg, meeting) : false;
  const gcalWarn = gcal === "failed" ? `${NL}⚠️ סנכרון יומן נכשל` : "";
  await sendTelegram(
    cfg,
    (emailed ? "✅ הקישור נשלח ללקוח" : `✅ הקישור נרשם — ${deliveryLine(meeting ?? {}, emailed)}`) + gcalWarn,
  );
  return { ok: true, emailed };
}

// A reply to the reschedule-ask prompt: validate the new slot (same rules as
// the SQL meetings_guard), PATCH meeting_date/slot/starts_at, log the
// reschedule, re-render the card and notify the customer by email. Called from
// handleTeamMessage (callbacks.ts) after its chat/allowlist gates have passed.
export async function handleMeetingRescheduleReply(cfg: Cfg, msg: TgMessage, meetingId: string, text: string): Promise<HandlerResult> {
  const parsed = parseReschedule(text, Date.now());
  if (!parsed.ok) {
    await sendTelegram(cfg, `🔄 ${parsed.error}`);
    return { ok: false, skipped: "invalid reschedule" };
  }
  const who = tgDisplayName(msg.from);
  // only move an active meeting — a cancel/expire racing this reply wins
  const n = await patchCount(
    `/rest/v1/meetings?id=eq.${meetingId}&status=in.(pending,confirmed)`,
    { meeting_date: parsed.meetingDate, slot: parsed.slot, starts_at: parsed.startsAt },
  );
  if (n === 0) {
    await sendTelegram(cfg, "הפגישה כבר אינה פעילה (בוטלה או פגה) — המועד לא עודכן.");
    await refreshMeetingKeyboard(cfg, msg.reply_to_message, meetingId);
    return { ok: false, skipped: "not active" };
  }
  await logMeetingEvent({
    meeting_id: meetingId, event: "reschedule",
    note: `${parsed.meetingDate} ${parsed.slot}`,
    actor_tg_id: msg.from?.id ?? null, actor_name: who,
  });
  // fetch AFTER the patch so the card + email render the new time
  const rows = await fetchRows<MeetingRow>(`/rest/v1/meetings?id=eq.${meetingId}&select=*`);
  const meeting = rows?.[0];
  // best-effort: move the calendar event to the new start (fail-soft).
  if (gcalConfigured(cfg) && meeting?.gcal_event_id) {
    await updateCalendarEventStart(cfg, meeting.gcal_event_id, parsed.startsAt);
  }
  await sendTelegram(
    cfg,
    `🔄 <b>הפגישה עם ${esc(meeting?.name ?? "")} נדחתה</b> ל${esc(formatMeetingWhen(meeting ?? { meeting_date: parsed.meetingDate, slot: parsed.slot }))}.`,
    meeting ? meetingKeyboardFor(meeting) : undefined,
  );
  // notify the customer (email only — same as confirm) when there's an address
  const emailed = meeting ? await emailCustomer(cfg, meeting) : false;
  if (meeting?.email) {
    await sendTelegram(cfg, emailed ? "📧 הלקוח עודכן במייל על המועד החדש" : "⚠️ עדכון המייל ללקוח נכשל — עדכנו ידנית");
  }
  return { ok: true, emailed };
}
