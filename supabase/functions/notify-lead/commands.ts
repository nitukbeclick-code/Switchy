// Team chat commands: /today, /agenda, /week, /leads, /myleads, /meetings,
// /stats, /search, /customer, /hot, /weekly, /book, /help.

import type { Cfg, Lead, MeetingRow, TgInlineKeyboard } from "../_shared/types.ts";
import { esc, NL, sendTelegram, waLink } from "../_shared/telegram.ts";
import { fetchRows, insertRow, logMeetingEvent, patchCount, rpcRows } from "../_shared/db.ts";
import { buildText, keyboardFor, SOURCE_HE, STATUS_EMOJI, STATUS_HE } from "../_shared/leads.ts";
import { formatMinutes, medianMinutes } from "../_shared/digests.ts";
import { buildWeeklyReport } from "../_shared/weekly.ts";
import { buildAgenda, buildDailyDigest, buildDossier, buildStats, buildWeek, type DossierInput } from "../_shared/agenda.ts";
import { buildBoard, type ConsoleBoard, fetchOpenMeetings } from "./console.ts";
import { pipelineCounts, renderLeadCard, renderLeadsPipeline, renderMeetingsBoard } from "./board.ts";
import { parseReschedule } from "../_shared/reschedule.ts";
import { type BusyInterval, createCalendarEvent, gcalConfigured, getFreeBusy, slotIsBusy } from "../_shared/google_calendar.ts";
import { jlog } from "../_shared/log.ts";

type CmdResult = { ok: boolean; command: string; failures?: number };

// Optional, fail-soft AI day-summary of the open meetings — ONE short Hebrew
// line grounded in the REAL board (counts + the soonest pending). Mirrors the
// triage.ts AI pattern: OpenAI first, then Anthropic, returns "" on any miss
// (no key, error, non-200) so the board still renders without it. Truth-only:
// the prompt carries only the real numbers, never invented status.
const SUMMARY_SYS =
  'אתה עוזר לנציג מכירות של חברת השוואת תקשורת ישראלית בשם "Switchy AI". ' +
  "קיבלת נתונים אמיתיים על לוח הפגישות של היום. החזר משפט אחד קצר בעברית (עד 20 מילים) " +
  "שמתעדף מה דחוף עכשיו. אל תמציא נתונים — השתמש רק במה שניתן. בלי מקדימות, רק המשפט.";

function summaryPrompt(board: ConsoleBoard): string {
  const soon = board.pending[0];
  const soonLine = soon ? `הפגישה הממתינה הקרובה: ${soon.name ?? ""} בשעה ${soon.slot ?? ""}.` : "אין פגישות ממתינות.";
  return `פגישות היום: ${board.stats.today}. ממתינות לאישור: ${board.stats.pending}. ` +
    `מאושרות השבוע: ${board.stats.week}. ${soonLine}`;
}

function parseSummary(text: string): string {
  return String(text ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 200);
}

export async function aiMeetingsSummary(cfg: Cfg, board: ConsoleBoard): Promise<string> {
  // Nothing to summarize → no AI call, no fabricated "all clear".
  if (board.stats.today === 0 && board.stats.pending === 0 && board.stats.week === 0) return "";
  try {
    if (cfg.openai) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${cfg.openai}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 80,
          temperature: 0.3,
          messages: [{ role: "system", content: SUMMARY_SYS }, { role: "user", content: summaryPrompt(board) }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        return parseSummary(String(j.choices?.[0]?.message?.content ?? ""));
      }
      jlog({ at: "aiMeetingsSummary", provider: "openai", ok: false, status: r.status });
    } else if (cfg.anthropic) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": cfg.anthropic, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 120,
          system: SUMMARY_SYS,
          messages: [{ role: "user", content: summaryPrompt(board) }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        return parseSummary(String(j.content?.[0]?.text ?? ""));
      }
      jlog({ at: "aiMeetingsSummary", provider: "anthropic", ok: false, status: r.status });
    }
  } catch (e) {
    jlog({ at: "aiMeetingsSummary", ok: false, error: String(e) });
  }
  return "";
}

async function sendLeadCards(cfg: Cfg, leads: Lead[]): Promise<number> {
  let failures = 0;
  // oldest of the batch first so the newest lands closest to the input box
  for (const lead of [...leads].reverse()) {
    const head = `${STATUS_EMOJI[String(lead.status ?? "new")] ?? ""} <b>${esc(STATUS_HE[String(lead.status ?? "new")] ?? lead.status)}</b> · ${String(lead.created_at ?? "").slice(0, 10)}`;
    // status-aware keyboard: closed leads stay frozen even in search results
    const r = await sendTelegram(cfg, head + NL + buildText(lead), keyboardFor(lead));
    if (!r.ok) failures++;
  }
  if (failures > 0) {
    await sendTelegram(cfg, `⚠️ ${failures} כרטיסים לא נשלחו (תקלת טלגרם) — נסו שוב עוד רגע.`);
  }
  return failures;
}

// Honest failure: a broken query must not read as "no results".
async function reportQueryFailure(cfg: Cfg, cmd: string): Promise<CmdResult> {
  await sendTelegram(cfg, "⚠️ השאילתה נכשלה — נסו שוב בעוד רגע.");
  return { ok: false, command: cmd };
}

// Render a leads pipeline: the counts header (renderLeadsPipeline, optionally
// with a custom title line prepended) + one live lead card per lead (each via
// renderLeadCard, reusing the EXISTING lead:<id>:… keyboard). Shared by /leads
// (the whole open funnel) and /myleads (the rep's claimed slice) so the two can
// never drift on layout or card behaviour. Pure rendering over a vetted list.
async function sendLeadsPipeline(cfg: Cfg, cmd: string, leads: Lead[], title?: string): Promise<CmdResult> {
  const pipeline = { counts: pipelineCounts(leads), recent: leads };
  const head = renderLeadsPipeline(pipeline);
  // Optional title line (e.g. "🙋 הלידים שלי") above the shared counts header.
  const headText = title ? `${title}${NL}${NL}${head.text}` : head.text;
  await sendTelegram(cfg, headText, head.reply_markup);
  if (leads.length === 0) return { ok: true, command: cmd };
  // oldest of the batch first so the newest card lands closest to the input box
  let failures = 0;
  for (const lead of [...leads].reverse()) {
    const card = renderLeadCard(lead);
    const r = await sendTelegram(cfg, card.text, card.reply_markup);
    if (!r.ok) failures++;
  }
  if (failures > 0) {
    await sendTelegram(cfg, `⚠️ ${failures} כרטיסים לא נשלחו (תקלת טלגרם) — נסו שוב עוד רגע.`);
  }
  return { ok: true, command: cmd, failures };
}

const enc = encodeURIComponent;

// A bare phone token in the team chat (e.g. "0501234567" or "+972501234567").
// 9–15 digits, optional leading +, separators allowed. Returns the digits.
export function baresPhone(text: string): string | null {
  const t = text.trim();
  if (!/^\+?[0-9][0-9\-\s]{7,15}$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

// Today's agenda: confirmed + pending meetings (±24h, trimmed to the Israel day
// by buildAgenda) and uncontacted (status=new) leads. Returns null on a failed
// query so the caller can say "try again" instead of "nothing today".
async function fetchAgenda(): Promise<{ confirmed: MeetingRow[]; pending: MeetingRow[]; uncontacted: Lead[] } | null> {
  const winStart = enc(new Date(Date.now() - 24 * 3_600_000).toISOString());
  const winEnd = enc(new Date(Date.now() + 36 * 3_600_000).toISOString());
  const [confirmed, pending, uncontacted] = await Promise.all([
    fetchRows<MeetingRow>(`/rest/v1/meetings?select=*&status=eq.confirmed&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=30`),
    fetchRows<MeetingRow>(`/rest/v1/meetings?select=*&status=eq.pending&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=30`),
    fetchRows<Lead>(`/rest/v1/leads?select=*&status=eq.new&order=created_at.asc&limit=30`),
  ]);
  if (confirmed === null || pending === null || uncontacted === null) return null;
  return { confirmed, pending, uncontacted };
}

// Compose a customer-360 dossier from existing tables (no new SQL): resolve the
// phone to lead/meeting rows + (when those carry a user_id) the profile name,
// tracked plans and reviews. Returns null on a failed query.
export async function fetchDossier(phoneDigits: string): Promise<DossierInput | null> {
  const [leads, meetings] = await Promise.all([
    rpcRows<Lead>("search_leads", { q: phoneDigits }),
    // meetings have no search RPC — match on the normalized phone column
    fetchRows<MeetingRow>(`/rest/v1/meetings?select=*&phone=ilike.*${enc(phoneDigits.slice(-9))}*&order=created_at.desc&limit=50`),
  ]);
  if (leads === null || meetings === null) return null;
  // a user_id anchors the profile / tracked plans / reviews lookups
  const userId = leads.map((l) => l.user_id).find(Boolean) ?? meetings.map((m) => m.user_id).find(Boolean) ?? null;
  let profileName: string | null = null;
  let tracked: DossierInput["tracked"] = [];
  let reviews: DossierInput["reviews"] = [];
  if (userId) {
    const [prof, trk, rev] = await Promise.all([
      fetchRows<{ name?: string | null }>(`/rest/v1/profiles?select=name&id=eq.${enc(String(userId))}`),
      fetchRows<{ category?: string; provider?: string; plan_name?: string; monthly_price?: number; promo_end_date?: string | null }>(
        `/rest/v1/tracked_plans?select=category,provider,plan_name,monthly_price,promo_end_date&user_id=eq.${enc(String(userId))}&order=created_at.desc&limit=20`),
      fetchRows<{ provider?: string; overall?: number; body?: string }>(
        `/rest/v1/provider_reviews?select=provider,overall,body&user_id=eq.${enc(String(userId))}&order=created_at.desc&limit=20`),
    ]);
    profileName = prof?.[0]?.name ?? null;
    tracked = trk ?? [];
    reviews = rev ?? [];
  }
  return { query: phoneDigits, profileName, leads, meetings, tracked, reviews };
}

async function sendDossier(cfg: Cfg, phoneDigits: string): Promise<CmdResult> {
  const d = await fetchDossier(phoneDigits);
  if (d === null) return await reportQueryFailure(cfg, "/customer");
  if (d.leads.length === 0 && d.meetings.length === 0) {
    await sendTelegram(cfg, `🗂️ לא נמצא לקוח עם הטלפון <code>${esc(phoneDigits)}</code>.`);
    return { ok: true, command: "/customer" };
  }
  await sendTelegram(cfg, buildDossier(d));
  return { ok: true, command: "/customer" };
}

// ─────────────────────────────────────────────────────────────────────────────
// REP-BOOK-A-MEETING (cockpit parity with the customer flow). A rep runs /book,
// taps one of the next few valid slots, and we create a REAL Google Calendar
// event + persist a confirmed meetings row so it shows on the board/digest.
//
// Slot schedule rules are NOT re-derived here: every candidate is validated
// through the EXISTING parseReschedule (the single source of truth — Sun–Thu
// 09:00–20:30, Fri 09:00–12:30, NEVER Saturday, ≥ tomorrow, ≤ 30 days, DST-safe
// starts_at). We only *enumerate* "YYYY-MM-DD HH:MM" candidates and let the
// shared parser accept/reject + compute the authoritative starts_at.
//
// CALLBACK-DATA CONTRACT (own namespace so no other regex swallows it):
//   slot pick = "book:<YYYY-MM-DD>:<HH:MM>"   (e.g. book:2026-06-18:14:30)
// The pick handler lives in callbacks.ts; the slot rendering + booking write
// (applyBookSlot) live here so commands.ts owns the booking logic end-to-end.
// ─────────────────────────────────────────────────────────────────────────────

// A bookable slot: the Israel wall-clock day/time + the authoritative UTC instant
// parseReschedule derived (single source), plus whether free/busy says it's taken.
export interface BookSlot {
  day: string; // YYYY-MM-DD (Israel)
  slot: string; // HH:MM (Israel wall-clock)
  startsAt: string; // UTC ISO instant (from parseReschedule)
  busy: boolean; // greyed out when a calendar event already overlaps
}

// Israel calendar day for an instant, "YYYY-MM-DD" (mirrors reschedule.ts/console).
function ilDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ms));
}

// The half-hour candidate grid we OFFER, per weekday. parseReschedule is still the
// gate — these are just the times we try. A small, sensible spread (late-morning →
// evening on weekdays; the short Friday window) so a rep gets a handful of options
// without scrolling. Sun–Thu and Friday differ exactly as the parser requires.
const WEEKDAY_SLOTS = ["10:00", "11:00", "12:00", "14:00", "16:00", "18:00"];
const FRIDAY_SLOTS = ["09:30", "10:30", "11:30"];

// ISO weekday for a YYYY-MM-DD: 1=Mon … 7=Sun (mirrors reschedule.ts isoDow). A
// pure calendar value (a date has no tz). dow===6 is Saturday → never offered.
function bookIsoDow(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

// Generate up to `limit` valid future slots (default 6), starting from tomorrow
// (the earliest parseReschedule allows). PURE over nowMs: walks Israel days
// forward, skips Saturday, and validates each candidate through parseReschedule —
// so a slot only survives if the shared schedule rules accept it. `busy` is filled
// later from free/busy (defaults false here). Never offers a past or Saturday slot.
export function generateBookSlots(nowMs: number, limit = 6): BookSlot[] {
  const out: BookSlot[] = [];
  const today = ilDay(nowMs);
  // Scan a generous horizon of Israel days; parseReschedule caps it at +30 days.
  for (let dayOffset = 1; dayOffset <= 32 && out.length < limit; dayOffset++) {
    const base = Date.parse(`${today}T12:00:00Z`) + dayOffset * 86_400_000;
    const day = ilDay(base);
    const dow = bookIsoDow(day);
    if (dow === 6) continue; // NEVER Saturday
    const candidates = dow === 5 ? FRIDAY_SLOTS : WEEKDAY_SLOTS;
    for (const slot of candidates) {
      if (out.length >= limit) break;
      // The single source of truth: accepts/rejects + derives the real starts_at.
      const parsed = parseReschedule(`${day} ${slot}`, nowMs);
      if (!parsed.ok) continue;
      out.push({ day: parsed.meetingDate, slot: parsed.slot, startsAt: parsed.startsAt, busy: false });
    }
  }
  return out;
}

// Overlay free/busy onto generated slots: mark a slot busy when a calendar event
// overlaps its 30-min window. Fail-soft — when `busy` is null (free/busy or token
// unavailable) we mark NOTHING busy, so every slot stays offerable. PURE.
export function applyBusyToSlots(slots: BookSlot[], busy: BusyInterval[] | null): BookSlot[] {
  if (!busy) return slots; // unknown → offer them all (never block on calendar)
  return slots.map((s) => ({ ...s, busy: slotIsBusy(s.startsAt, 30, busy) }));
}

// "יום ג׳ · 18.6 · 14:30" — a compact Hebrew slot label for the picker button.
function bookSlotLabel(s: BookSlot): string {
  const t = Date.parse(s.startsAt);
  if (!Number.isFinite(t)) return `${s.day} ${s.slot}`;
  const when = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(t));
  return when;
}

// The slot-picker keyboard. One button per slot; a busy slot is greyed (a ⛔ mark
// + a noop callback so it can't be tapped). callback_data = "book:<day>:<slot>".
// Pure rendering — no I/O.
export function bookSlotsKeyboard(slots: BookSlot[]): TgInlineKeyboard {
  const rows: TgInlineKeyboard["inline_keyboard"] = slots.map((s) =>
    s.busy
      ? [{ text: `⛔ ${bookSlotLabel(s)} (תפוס)`.slice(0, 60), callback_data: "book:busy:noop" }]
      : [{ text: `🗓️ ${bookSlotLabel(s)}`.slice(0, 60), callback_data: `book:${s.day}:${s.slot}` }]
  );
  return { inline_keyboard: rows };
}

// Build the /book picker message: generate slots, overlay free/busy (fail-soft),
// and render the keyboard. Returns the text + markup (and the slots, for tests).
// When the calendar is dark (no Google keys) free/busy returns null → all slots
// offered, exactly as required. When EVERY slot is busy, we still surface them
// (greyed) plus an honest note rather than an empty board.
export async function buildBookPicker(cfg: Cfg, nowMs: number): Promise<{ text: string; markup: TgInlineKeyboard; slots: BookSlot[] }> {
  const base = generateBookSlots(nowMs);
  let busy: BusyInterval[] | null = null;
  if (base.length > 0) {
    // Query free/busy over the span the slots cover (first start → last end).
    const fromIso = base[0].startsAt;
    const toMs = Date.parse(base[base.length - 1].startsAt) + 30 * 60_000;
    busy = await getFreeBusy(cfg, fromIso, new Date(toMs).toISOString());
  }
  const slots = applyBusyToSlots(base, busy);
  const anyFree = slots.some((s) => !s.busy);
  const lines = [
    "🗓️ <b>קביעת פגישת ייעוץ — Switchy AI</b>",
    "",
    "בחרו מועד פנוי מהרשימה; ניצור פגישת Zoom/יומן אמיתית ונרשום אותה ללוח.",
    busy === null ? "<i>(לוח Google לא מחובר — כל המועדים מוצגים)</i>" : null,
    !anyFree ? "<i>כל המועדים הקרובים תפוסים ביומן — בחרו מועד אחר עם 🔄 שינוי מועד מאוחר יותר.</i>" : null,
  ].filter((x): x is string => x !== null);
  return { text: lines.join(NL), markup: bookSlotsKeyboard(slots), slots };
}

// The outcome of booking one slot. Fail-soft data — the caller (callbacks.ts)
// surfaces it as a toast + confirmation message.
//   ok:false + error → a user-facing Hebrew reason (invalid slot, DB write failed)
//   ok:true + meetingId + startsAt + gcalSynced → booked; meeting persisted
export interface BookResult {
  ok: boolean;
  error?: string;
  meetingId?: string | null;
  startsAt?: string;
  day?: string;
  slot?: string;
  gcalSynced?: boolean;
}

// A guard-valid, per-booking-unique placeholder phone. meetings_guard REQUIRES a
// phone matching ^[+0-9][0-9\-\s]{7,14}$ and enforces "one open meeting per phone",
// so a rep booking (which has no customer phone yet) needs a unique valid token to
// pass the gate and never collide with another rep booking. Derived from the
// epoch-ms tail → a 12-digit all-numeric string ("0" + the last 11 ms digits),
// which always satisfies the guard regex and is effectively unique per second.
function repBookingPhone(nowMs: number): string {
  return "0" + String(nowMs).slice(-11).padStart(11, "0");
}

// Book ONE slot a rep picked. RESPECTS the live meetings_guard: rather than forging
// a confirmed row (the BEFORE-INSERT guard pins status→'pending', recomputes
// starts_at, and would reject an empty phone), we use the SAME two-step the rest of
// the bot uses — INSERT a pending row through the guard (so the schedule/Saturday/
// DST rules ALL re-enforce server-side), then service-role PATCH it to confirmed
// (the ungated transition path applyMeetingAct uses). A REAL Google Calendar event
// is created best-effort and its id stashed on the row.
//
// PURE of auth: the caller MUST authorize the rep first (callbacks.ts enforces the
// allowlist + team-chat gate before invoking this). `actor` is the rep's display
// name for the audit trail. Never throws — any DB/guard miss returns ok:false.
export async function applyBookSlot(
  cfg: Cfg,
  day: string,
  slot: string,
  actor = "נציג",
): Promise<BookResult> {
  const nowMs = Date.now();
  // Re-validate against the SHARED schedule rules (Sun–Thu/Fri hours, no Saturday,
  // ≥ tomorrow, ≤ 30 days) and recompute the DST-safe starts_at. A stale/forged
  // callback (e.g. a slot that just rolled into the past) is rejected here BEFORE
  // we touch the DB — and the SQL guard re-checks the same rules on insert.
  const parsed = parseReschedule(`${day} ${slot}`, nowMs);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const phone = repBookingPhone(nowMs);
  // 1) INSERT through meetings_guard → lands a PENDING row (the guard owns
  //    starts_at + validates the schedule again). name ≥ 2 chars (guard rule).
  const repName = (actor || "נציג").slice(0, 80);
  const inserted = await insertRow("meetings", {
    name: repName.length >= 2 ? repName : "נציג",
    phone,
    meeting_date: parsed.meetingDate,
    slot: parsed.slot,
    source: "rep_book",
  });
  if (!inserted) return { ok: false, error: "שגיאת מסד נתונים — נסו שוב בעוד רגע" };

  // Resolve the row the guard just wrote (by its unique phone) so we can confirm it.
  const rows = await fetchRows<MeetingRow>(
    `/rest/v1/meetings?phone=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=1&select=id,starts_at`,
  );
  const meetingId = rows?.[0]?.id ? String(rows[0].id) : null;
  // Trust the guard's server-computed starts_at when present (single source).
  const startsAt = String(rows?.[0]?.starts_at ?? parsed.startsAt);
  if (!meetingId) {
    // The insert reported ok but we can't see the row — don't claim success.
    return { ok: false, error: "שגיאת מסד נתונים — נסו שוב בעוד רגע" };
  }

  // 2) REAL Google Calendar event (best-effort — fail-soft when Calendar is dark /
  //    the create fails; the row is the source of truth, the event a convenience).
  let gcalEventId: string | null = null;
  if (gcalConfigured(cfg)) {
    const ev = await createCalendarEvent(cfg, {
      summary: `Switchy AI — פגישת ייעוץ (${actor})`,
      description: `פגישת ייעוץ שנקבעה ידנית על ידי ${actor} מתוך צ׳אט הצוות.`,
      startIso: startsAt,
    });
    gcalEventId = ev?.id ?? null;
  }

  // 3) PATCH pending→confirmed via the SAME service-role path the board uses (the
  //    BEFORE-INSERT guard does not apply to UPDATEs). Atomic on status=pending so
  //    a concurrent press can't double-confirm. Stash the rep + calendar event id.
  const n = await patchCount(
    `/rest/v1/meetings?id=eq.${meetingId}&status=eq.pending`,
    {
      status: "confirmed",
      claimed_by: actor.slice(0, 60),
      confirmed_at: new Date().toISOString(),
      ...(gcalEventId ? { gcal_event_id: gcalEventId } : {}),
    },
  );
  if (n === 0) {
    // The pending row existed a moment ago, so a zero-row confirm is a DB failure.
    return { ok: false, error: "שגיאת מסד נתונים — נסו שוב בעוד רגע", meetingId };
  }

  return {
    ok: true,
    meetingId,
    day: parsed.meetingDate,
    slot: parsed.slot,
    startsAt,
    gcalSynced: Boolean(gcalEventId),
  };
}

// Log the rep booking to the meetings audit trail (best-effort). Mirrors the
// console/board write path's logMeetingEvent usage. Skipped silently when the id
// is missing — never blocks the booking.
export async function auditBookedMeeting(meetingId: string | null | undefined, actor: string, when: string): Promise<void> {
  if (!meetingId) return;
  await logMeetingEvent({ meeting_id: meetingId, event: "status_change", old_status: "pending", new_status: "confirmed", actor_name: actor, note: `rep_book ${when}` });
}

// `fromId` is the pressing rep's Telegram user id — threaded from the team
// message so /myleads can filter to the leads THIS rep owns (claimed). It's
// optional so the bare-phone /customer shortcut (and any other caller) stays
// compatible; only /myleads reads it, and it fails soft when it's absent.
export async function handleCommand(cfg: Cfg, cmd: string, args: string, fromId?: number): Promise<CmdResult> {
  if (cmd === "/today" || cmd === "/agenda") {
    const data = await fetchAgenda();
    if (data === null) return await reportQueryFailure(cfg, cmd);
    await sendTelegram(cfg, buildAgenda(data, Date.now()));
    return { ok: true, command: cmd };
  }

  if (cmd === "/digest") {
    // The count-led executive brief over the same agenda data as /today.
    const data = await fetchAgenda();
    if (data === null) return await reportQueryFailure(cfg, cmd);
    await sendTelegram(cfg, buildDailyDigest(data, Date.now()));
    return { ok: true, command: cmd };
  }

  if (cmd === "/week") {
    const winStart = enc(new Date(Date.now() - 24 * 3_600_000).toISOString());
    const winEnd = enc(new Date(Date.now() + 8 * 86_400_000).toISOString());
    const meetings = await fetchRows<MeetingRow>(
      `/rest/v1/meetings?select=*&status=eq.confirmed&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=100`,
    );
    if (meetings === null) return await reportQueryFailure(cfg, cmd);
    await sendTelegram(cfg, buildWeek(meetings, Date.now()));
    return { ok: true, command: cmd };
  }

  if (cmd === "/customer") {
    const digits = baresPhone(args.trim());
    if (!digits) {
      await sendTelegram(cfg, "🗂️ שימוש: <code>/customer 0501234567</code> (או פשוט שלחו מספר טלפון)");
      return { ok: true, command: cmd };
    }
    return await sendDossier(cfg, digits);
  }

  if (cmd === "/leads") {
    // Pull the recent active funnel (new + contacted), then render the native
    // CRM pipeline: a counts header (renderLeadsPipeline) + one live lead card
    // per recent lead (renderLeadCard reuses the EXISTING lead:<id>:… keyboard).
    const open = await fetchRows<Lead>("/rest/v1/leads?status=in.(new,contacted)&order=created_at.desc&limit=5&select=*");
    if (open === null) return await reportQueryFailure(cfg, cmd);
    return await sendLeadsPipeline(cfg, cmd, open);
  }

  if (cmd === "/myleads") {
    // The per-rep view: ONLY the active leads THIS rep owns (claimed via 🙋).
    // Ownership is the claimed_by_tg_id the claim callback already stamps, so
    // we reuse it — no new field. Without a known rep id (e.g. a caller that
    // can't supply one) we can't honestly scope "mine", so say so rather than
    // leaking the whole funnel. Same pipeline renderer as /leads.
    if (!fromId) {
      await sendTelegram(cfg, "🙋 לא זוהה נציג — נסו שוב מתוך צ׳אט הצוות.");
      return { ok: true, command: cmd };
    }
    const mine = await fetchRows<Lead>(
      `/rest/v1/leads?status=in.(new,contacted)&claimed_by_tg_id=eq.${enc(String(fromId))}&order=created_at.desc&limit=10&select=*`,
    );
    if (mine === null) return await reportQueryFailure(cfg, cmd);
    if (mine.length === 0) {
      await sendTelegram(cfg, "🙋 <b>הלידים שלי — Switchy AI</b>" + NL + NL + "אין כרגע לידים פתוחים בטיפולך 🎉 (תפסו ליד עם 🙋 כדי שיופיע כאן).");
      return { ok: true, command: cmd };
    }
    return await sendLeadsPipeline(cfg, cmd, mine, "🙋 <b>הלידים שלי — Switchy AI</b>");
  }

  if (cmd === "/meetings") {
    // The in-chat meetings board: the SAME open-meetings query the Mini App
    // console uses → buildBoard → renderMeetingsBoard, a one-message tap-to-act
    // board (today tab) with mtg:<id>:… action rows + a board:* tab-switch row.
    // fetchOpenMeetings is fail-soft ([] on a DB miss) and the board renders an
    // honest empty state — no fabricated "no meetings" header.
    const board = buildBoard(await fetchOpenMeetings(), Date.now());
    // Optional, fail-soft AI day-summary grounded in the REAL board (no key /
    // error ⇒ "" ⇒ the board still renders without it). Truth-only.
    const summary = await aiMeetingsSummary(cfg, board);
    const msg = renderMeetingsBoard(board, summary);
    const r = await sendTelegram(cfg, msg.text, msg.reply_markup);
    return { ok: true, command: cmd, failures: r.ok ? 0 : 1 };
  }

  if (cmd === "/search") {
    const q = args.trim();
    if (q.length < 2) {
      await sendTelegram(cfg, "🔎 שימוש: <code>/search שם או טלפון</code>");
      return { ok: true, command: cmd };
    }
    const hits = await rpcRows<Lead>("search_leads", { q });
    if (hits === null) return await reportQueryFailure(cfg, cmd);
    if (hits.length === 0) {
      await sendTelegram(cfg, `🔎 לא נמצאו לידים עבור "${esc(q)}"`);
      return { ok: true, command: cmd };
    }
    await sendTelegram(cfg, `🔎 <b>${hits.length} תוצאות</b> עבור "${esc(q)}":`);
    const failures = await sendLeadCards(cfg, hits);
    return { ok: true, command: cmd, failures };
  }

  if (cmd === "/stats") {
    const sevenAgo = enc(new Date(Date.now() - 7 * 86_400_000).toISOString());
    const [rows, contacted, weekLeads, weekMeetings] = await Promise.all([
      fetchRows<Record<string, unknown>>("/rest/v1/leads_by_source?select=*"),
      fetchRows<Lead>("/rest/v1/leads?contacted_at=not.is.null&select=created_at,contacted_at&order=created_at.desc&limit=200"),
      fetchRows<Lead>(`/rest/v1/leads?select=status,created_at,contacted_at,actual_saving&created_at=gte.${sevenAgo}&limit=1000`),
      fetchRows<MeetingRow>(`/rest/v1/meetings?select=status,created_at&created_at=gte.${sevenAgo}&limit=1000`),
    ]);
    if (rows === null) return await reportQueryFailure(cfg, cmd);
    if (rows.length === 0) {
      await sendTelegram(cfg, "📊 אין עדיין לידים במערכת.");
      return { ok: true, command: cmd };
    }
    // this-week funnel first (the most actionable view)
    await sendTelegram(cfg, buildStats({ weekLeads: weekLeads ?? [], weekMeetings: weekMeetings ?? [] }));
    const tot = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const med = medianMinutes(contacted ?? []);
    const lines = [
      "📊 <b>סטטיסטיקת לידים — Switchy AI (כל הזמנים)</b>",
      "",
      `סה"כ: <b>${tot("total")}</b> | 🆕 ${tot("new_leads")} | 📞 ${tot("contacted")} | 🏆 ${tot("won")} | ❌ ${tot("lost")}`,
      med !== null ? `⚡ מהירות תגובה חציונית: <b>${formatMinutes(med)}</b>` : null,
      "",
      "<b>לפי מקור:</b>",
      ...rows.map((r) => {
        const label = SOURCE_HE[String(r.source ?? "")] ?? String(r.source ?? "");
        return `• ${esc(label)} — ${r.total} (${r.new_leads} חדשים, ${r.won} נסגרו)`;
      }),
    ].filter((x): x is string => x !== null);
    await sendTelegram(cfg, lines.join(NL));
    return { ok: true, command: cmd };
  }

  if (cmd === "/hot") {
    const hot = await rpcRows<Record<string, unknown>>("get_hot_browsers", {});
    if (hot === null) return await reportQueryFailure(cfg, cmd);
    if (hot.length === 0) {
      await sendTelegram(cfg, "🌡️ אין כרגע גולשים חמים (משתמשים מחוברים שצפו במסלולים בלי להשאיר פנייה).");
      return { ok: true, command: cmd };
    }
    const lines = [
      `🌡️ <b>${hot.length} גולשים חמים</b> — צפו במסלולים בשבוע האחרון ולא השאירו פנייה:`,
      "",
      ...hot.map((h) => {
        const wa = waLink(h.phone);
        return `• <b>${esc(h.name)}</b> — ${h.views} צפיות, בעיקר ${esc(h.top_provider)}` +
          (wa ? ` — <a href="${wa}">WhatsApp</a>` : "");
      }),
    ];
    await sendTelegram(cfg, lines.join(NL));
    return { ok: true, command: cmd };
  }

  if (cmd === "/weekly") {
    await sendTelegram(cfg, await buildWeeklyReport());
    return { ok: true, command: cmd };
  }

  if (cmd === "/book") {
    // Rep-initiated booking: show the next few valid slots (Israel hours, never
    // Saturday — via the shared parseReschedule), greying out ones the calendar
    // says are taken (fail-soft when Google is dark). A tap → book:<day>:<slot>
    // → applyBookSlot (callbacks.ts) creates the event + confirmed meetings row.
    const picker = await buildBookPicker(cfg, Date.now());
    const r = await sendTelegram(cfg, picker.text, picker.markup);
    return { ok: true, command: cmd, failures: r.ok ? 0 : 1 };
  }

  // /help and anything unrecognized
  await sendTelegram(cfg, [
    "🤖 <b>הנציג הדיגיטלי של Switchy AI</b>",
    "",
    "/today — סדר היום: פגישות מאושרות וממתינות + לידים שלא טופלו",
    "/agenda — כינוי ל-/today",
    "/digest — דייג'סט יומי קצר: המספרים של היום + מה דחוף עכשיו",
    "/week — הפגישות המאושרות ב-7 הימים הקרובים, לפי יום",
    "/leads — צינור הלידים: ספירת חדש/בטיפול/נסגר + הכרטיסים האחרונים עם כפתורי סטטוס",
    "/myleads — הלידים שתפסתם (🙋): רק הלידים הפתוחים בטיפולכם",
    "/meetings — לוח הפגישות: היום/ממתינות/השבוע בהודעה אחת, עם כפתורי אישור/דחייה/ביטול",
    "/book — קביעת פגישת ייעוץ: בחירת מועד פנוי מהרשימה (שעות ישראל, ללא שבת) ויצירת פגישה אמיתית ביומן",
    "/search <code>שם או טלפון</code> — איתור ליד ישן",
    "/customer <code>טלפון</code> — תיק לקוח מלא (אפשר גם לשלוח מספר טלפון)",
    "/stats — המשפך השבועי + המשפך לפי מקור + מהירות תגובה",
    "/hot — גולשים שצפו במסלולים ולא השאירו פנייה",
    "/weekly — הדוח העסקי השבועי, עכשיו",
    "/help — ההודעה הזו",
    "",
    "<i>טיפים: כפתור 🙋 תופס בעלות על ליד; ⏰ דחה דוחה את התזכורת בכשעתיים; תשובה (reply) להודעת ליד נשמרת כהערה; אחרי 🏆 השיבו עם סכום החיסכון; כפתור 🔄 על כרטיס פגישה מאפשר לשנות מועד.</i>",
  ].join(NL));
  return { ok: true, command: cmd };
}

export const BOT_COMMANDS = [
  { command: "today", description: "סדר היום — פגישות ולידים פתוחים" },
  { command: "agenda", description: "כינוי ל-/today" },
  { command: "digest", description: "דייג'סט יומי — המספרים של היום ומה דחוף" },
  { command: "week", description: "פגישות מאושרות ב-7 הימים הקרובים" },
  { command: "leads", description: "לידים פתוחים עם כפתורי סטטוס" },
  { command: "myleads", description: "הלידים שתפסתם (בטיפולכם)" },
  { command: "meetings", description: "פגישות וידאו קרובות" },
  { command: "book", description: "קביעת פגישה — בחירת מועד פנוי" },
  { command: "search", description: "חיפוש ליד לפי שם או טלפון" },
  { command: "customer", description: "תיק לקוח מלא לפי טלפון" },
  { command: "stats", description: "המשפך השבועי ומהירות תגובה" },
  { command: "hot", description: "גולשים חמים בלי פנייה" },
  { command: "weekly", description: "הדוח השבועי עכשיו" },
  { command: "help", description: "עזרה" },
];
