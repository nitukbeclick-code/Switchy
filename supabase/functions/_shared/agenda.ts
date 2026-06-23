// Daily/weekly agenda + this-week funnel stats + customer-360 dossier +
// reschedule parsing + returning-customer line. All pure — unit-tested in
// supabase/functions/tests/. Data fetching stays in the commands/cron layer.

import type { Lead, MeetingRow } from "./types.ts";
import { esc, NL, waLink } from "./telegram.ts";
import { SOURCE_HE, STATUS_EMOJI, STATUS_HE } from "./leads.ts";
import { MEETING_STATUS_EMOJI, MEETING_STATUS_HE } from "./meetings.ts";

const IL_TZ = "Asia/Jerusalem";

// "YYYY-MM-DD" Israel calendar day for an instant (en-CA → comparable string).
export function israelDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IL_TZ }).format(new Date(ms));
}

// "14:30" Israel wall-clock time.
function ilTime(ms: number): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: IL_TZ, hour: "2-digit", minute: "2-digit" })
    .format(new Date(ms));
}

// "יום שלישי 16.6" Israel weekday + date.
function ilDayLabel(ms: number): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: IL_TZ, weekday: "long", day: "numeric", month: "numeric" })
    .format(new Date(ms));
}

function startsMs(m: MeetingRow): number {
  return Date.parse(String(m.starts_at ?? ""));
}

// ── /today (and /agenda alias) ───────────────────────────────────────────────
// Confirmed meetings today (with times), pending meetings awaiting confirm
// today, and leads still uncontacted (status=new) — one tidy briefing.
export type AgendaInput = {
  confirmed: MeetingRow[];   // confirmed meetings (any day; we trim to today)
  pending: MeetingRow[];     // pending meetings (any day; we trim to today)
  uncontacted: Lead[];       // status=new leads still awaiting first contact
};

export function buildAgenda(rows: AgendaInput, nowMs: number): string {
  const today = israelDay(nowMs);
  const onToday = (m: MeetingRow) => {
    const t = startsMs(m);
    return Number.isFinite(t) && israelDay(t) === today;
  };
  const byTime = (a: MeetingRow, b: MeetingRow) => startsMs(a) - startsMs(b);
  const confirmed = rows.confirmed.filter(onToday).sort(byTime);
  const pending = rows.pending.filter(onToday).sort(byTime);
  const uncontacted = rows.uncontacted.filter((l) => String(l.status ?? "new") === "new");

  const lines: string[] = [`🗓️ <b>סדר היום — חוסך</b> · ${esc(ilDayLabel(nowMs))}`];

  lines.push("", "✅ <b>פגישות מאושרות היום:</b>");
  if (confirmed.length === 0) {
    lines.push("<i>אין פגישות מאושרות להיום.</i>");
  } else {
    for (const m of confirmed) {
      lines.push(`• ${esc(ilTime(startsMs(m)))} — ${esc(m.name ?? "")}` +
        (m.provider ? ` (${esc(m.provider)})` : "") +
        (m.join_url ? ` · <a href="${esc(m.join_url)}">קישור</a>` : ""));
    }
  }

  if (pending.length > 0) {
    lines.push("", "🕐 <b>פגישות שממתינות לאישור היום:</b>");
    for (const m of pending) {
      lines.push(`• ${esc(ilTime(startsMs(m)))} — ${esc(m.name ?? "")}` +
        (m.provider ? ` (${esc(m.provider)})` : ""));
    }
  }

  if (uncontacted.length > 0) {
    lines.push("", `🆕 <b>${uncontacted.length} לידים שעדיין לא טופלו:</b>`);
    for (const l of uncontacted.slice(0, 10)) {
      const wa = waLink(l.phone);
      lines.push(`• ${esc(l.name ?? "ללא שם")} — ${esc(l.phone ?? "")}` +
        (wa ? ` <a href="${wa}">WhatsApp</a>` : "") +
        (l.provider ? ` · ${esc(l.provider)}` : ""));
    }
    if (uncontacted.length > 10) lines.push(`<i>…ועוד ${uncontacted.length - 10}. שלחו /leads לכרטיסים.</i>`);
  }

  if (confirmed.length === 0 && pending.length === 0 && uncontacted.length === 0) {
    lines.push("", "🎉 הכול נקי — אין פגישות פתוחות ואין לידים שממתינים לטיפול.");
  }
  return lines.join(NL);
}

// ── /digest — the on-demand daily executive brief ───────────────────────────
// A count-led companion to buildAgenda: a one-glance band of the day's numbers,
// the next confirmed meetings with times, and the leads that need a call now —
// with the oldest-waiting lead surfaced + an SLA-overdue flag (status=new and
// created more than 2h ago, the same 2h first-nudge threshold the follow-up
// planner uses). Closes with the §7b/§30A rep reminder. Pure over (rows, now).
export function buildDailyDigest(rows: AgendaInput, nowMs: number): string {
  const today = israelDay(nowMs);
  const onToday = (m: MeetingRow) => {
    const t = startsMs(m);
    return Number.isFinite(t) && israelDay(t) === today;
  };
  const byTime = (a: MeetingRow, b: MeetingRow) => startsMs(a) - startsMs(b);
  const confirmed = rows.confirmed.filter(onToday).sort(byTime);
  const pending = rows.pending.filter(onToday).sort(byTime);
  const uncontacted = rows.uncontacted
    .filter((l) => String(l.status ?? "new") === "new")
    .sort((a, b) => Date.parse(String(a.created_at ?? "")) - Date.parse(String(b.created_at ?? "")));

  // SLA-overdue: a new lead waiting more than 2h is the rep's most urgent number.
  const TWO_H = 2 * 3_600_000;
  const overdue = uncontacted.filter((l) => {
    const created = Date.parse(String(l.created_at ?? ""));
    return Number.isFinite(created) && nowMs - created >= TWO_H;
  });

  const lines: string[] = [
    `📋 <b>דייג'סט יומי — חוסך</b> · ${esc(ilDayLabel(nowMs))}`,
    "",
    `📅 ${confirmed.length} פגישות מאושרות · 🕐 ${pending.length} ממתינות לאישור · 🆕 ${uncontacted.length} לידים פתוחים` +
      (overdue.length > 0 ? ` · 🔴 ${overdue.length} מעבר ל-SLA` : ""),
  ];

  if (confirmed.length > 0) {
    lines.push("", "✅ <b>הפגישות של היום:</b>");
    for (const m of confirmed.slice(0, 6)) {
      lines.push(`• ${esc(ilTime(startsMs(m)))} — ${esc(m.name ?? "")}` +
        (m.provider ? ` (${esc(m.provider)})` : "") +
        (m.join_url ? ` · <a href="${esc(m.join_url)}">קישור</a>` : ""));
    }
    if (confirmed.length > 6) lines.push(`<i>…ועוד ${confirmed.length - 6}. שלחו /today לפירוט.</i>`);
  }

  if (pending.length > 0) {
    lines.push("", `🕐 <b>${pending.length} פגישות ממתינות לאישור</b> — שלחו /meetings לאשר.`);
  }

  if (uncontacted.length > 0) {
    const oldest = uncontacted[0];
    const wa = waLink(oldest.phone);
    lines.push("", `🆕 <b>הליד שממתין הכי הרבה:</b> ${esc(oldest.name ?? "ללא שם")} — ${esc(oldest.phone ?? "")}` +
      (wa ? ` <a href="${wa}">WhatsApp</a>` : ""));
    if (uncontacted.length > 1) lines.push(`<i>ועוד ${uncontacted.length - 1} לידים פתוחים. שלחו /leads לכרטיסים.</i>`);
  }

  if (confirmed.length === 0 && pending.length === 0 && uncontacted.length === 0) {
    lines.push("", "🎉 הכול נקי — אין פגישות פתוחות ואין לידים שממתינים לטיפול.");
  }

  lines.push("", "⚖️ <i>תזכורת: גלו עמלה/שיוך בהמלצה (§7b) · אישור ללקוח לפני פולואו-אפ שיווקי (§30A).</i>");
  return lines.join(NL);
}

// True when the agenda has nothing actionable — the morning push skips it.
export function agendaIsEmpty(rows: AgendaInput, nowMs: number): boolean {
  const today = israelDay(nowMs);
  const onToday = (m: MeetingRow) => {
    const t = startsMs(m);
    return Number.isFinite(t) && israelDay(t) === today;
  };
  const c = rows.confirmed.filter(onToday).length;
  const p = rows.pending.filter(onToday).length;
  const u = rows.uncontacted.filter((l) => String(l.status ?? "new") === "new").length;
  return c + p + u === 0;
}

// ── /week ────────────────────────────────────────────────────────────────────
// The next 7 Israel-days of confirmed meetings, grouped by day.
export function buildWeek(meetings: MeetingRow[], nowMs: number): string {
  const today = israelDay(nowMs);
  const horizon = israelDay(nowMs + 7 * 86_400_000);
  const inWindow = meetings
    .filter((m) => String(m.status ?? "") === "confirmed")
    .filter((m) => {
      const t = startsMs(m);
      if (!Number.isFinite(t)) return false;
      const d = israelDay(t);
      return d >= today && d <= horizon;
    })
    .sort((a, b) => startsMs(a) - startsMs(b));

  if (inWindow.length === 0) {
    return `📆 <b>השבוע הקרוב — חוסך</b>${NL}${NL}אין פגישות מאושרות ב-7 הימים הקרובים.`;
  }
  const lines: string[] = [`📆 <b>השבוע הקרוב — חוסך</b> (${inWindow.length} פגישות מאושרות)`, ""];
  let curDay = "";
  for (const m of inWindow) {
    const t = startsMs(m);
    const d = israelDay(t);
    if (d !== curDay) {
      curDay = d;
      lines.push(`<b>${esc(ilDayLabel(t))}</b>`);
    }
    lines.push(`  • ${esc(ilTime(t))} — ${esc(m.name ?? "")}` + (m.provider ? ` (${esc(m.provider)})` : ""));
  }
  return lines.join(NL);
}

// ── /stats — this-week funnel ────────────────────────────────────────────────
export type StatsInput = {
  weekLeads: Lead[];        // leads created in the last 7 days
  weekMeetings: MeetingRow[]; // meetings created in the last 7 days
};

export function buildStats(input: StatsInput): string {
  const ls = input.weekLeads;
  const total = ls.length;
  const newL = ls.filter((l) => String(l.status ?? "new") === "new").length;
  const contacted = ls.filter((l) => l.contacted_at).length;
  const won = ls.filter((l) => String(l.status ?? "") === "won").length;
  const lost = ls.filter((l) => String(l.status ?? "") === "lost").length;
  const conv = total > 0 ? Math.round((won / total) * 100) : 0;

  const ms = input.weekMeetings;
  const booked = ms.length;
  const mConfirmed = ms.filter((m) => ["confirmed", "completed"].includes(String(m.status ?? ""))).length;
  const mCompleted = ms.filter((m) => String(m.status ?? "") === "completed").length;

  return [
    "📊 <b>המשפך השבועי — חוסך</b> (7 ימים אחרונים)",
    "",
    `🔔 לידים חדשים: <b>${total}</b>`,
    `   🆕 ${newL} ממתינים · 📞 ${contacted} נוצר קשר · 🏆 ${won} נסגרו · ❌ ${lost} לא רלוונטי`,
    `🎯 שיעור סגירה: <b>${conv}%</b>`,
    "",
    `🎥 פגישות שנקבעו: <b>${booked}</b>`,
    `   ✅ ${mConfirmed} אושרו · 🏁 ${mCompleted} הסתיימו`,
  ].join(NL);
}

// ── /customer <phone> — customer 360 dossier ─────────────────────────────────
export type DossierInput = {
  query: string;                 // the phone the rep typed
  profileName?: string | null;   // profiles.name (when the phone maps to a user)
  leads: Lead[];                 // every past lead for this phone/user
  meetings: MeetingRow[];        // every past meeting for this phone/user
  tracked: { category?: string; provider?: string; plan_name?: string; monthly_price?: number; promo_end_date?: string | null }[];
  reviews: { provider?: string; overall?: number; body?: string }[];
};

export function buildDossier(d: DossierInput): string {
  const name = (d.profileName && String(d.profileName).trim()) ||
    d.leads.map((l) => l.name).find((n) => n && String(n).trim()) ||
    d.meetings.map((m) => m.name).find((n) => n && String(n).trim()) || "";
  const wa = waLink(d.query);

  const lines: string[] = [
    `🗂️ <b>תיק לקוח — ${esc(name || d.query)}</b>`,
    `📞 ${esc(d.query)}` + (wa ? ` — <a href="${wa}">WhatsApp</a>` : ""),
  ];

  // past leads, newest first
  lines.push("", `🔔 <b>פניות (${d.leads.length}):</b>`);
  if (d.leads.length === 0) {
    lines.push("<i>אין פניות קודמות.</i>");
  } else {
    const sorted = [...d.leads].sort((a, b) =>
      Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")));
    for (const l of sorted.slice(0, 10)) {
      const st = String(l.status ?? "new");
      lines.push(`• ${String(l.created_at ?? "").slice(0, 10)} — ${STATUS_EMOJI[st] ?? ""} ${esc(STATUS_HE[st] ?? st)}` +
        (l.provider ? ` · ${esc(l.provider)}` : "") +
        (l.source ? ` · ${esc(SOURCE_HE[String(l.source)] ?? l.source)}` : "") +
        (l.actual_saving ? ` · 💰₪${esc(l.actual_saving)}` : ""));
    }
  }

  // past meetings, newest first
  lines.push("", `🎥 <b>פגישות (${d.meetings.length}):</b>`);
  if (d.meetings.length === 0) {
    lines.push("<i>אין פגישות קודמות.</i>");
  } else {
    const sorted = [...d.meetings].sort((a, b) =>
      Date.parse(String(b.starts_at ?? b.created_at ?? "")) - Date.parse(String(a.starts_at ?? a.created_at ?? "")));
    for (const m of sorted.slice(0, 10)) {
      const st = String(m.status ?? "pending");
      const day = String(m.meeting_date ?? String(m.starts_at ?? "").slice(0, 10));
      lines.push(`• ${esc(day)} — ${MEETING_STATUS_EMOJI[st] ?? ""} ${esc(MEETING_STATUS_HE[st] ?? st)}` +
        (m.provider ? ` · ${esc(m.provider)}` : ""));
    }
  }

  // tracked plans
  if (d.tracked.length > 0) {
    lines.push("", `📦 <b>מסלולים במעקב (${d.tracked.length}):</b>`);
    for (const t of d.tracked) {
      lines.push(`• ${esc(t.provider ?? "")} · ${esc(t.plan_name ?? "")} — ₪${esc(t.monthly_price ?? "?")}/חודש` +
        (t.promo_end_date ? ` · מתחדש ${esc(t.promo_end_date)}` : ""));
    }
  }

  // reviews
  if (d.reviews.length > 0) {
    lines.push("", `⭐ <b>ביקורות שכתב (${d.reviews.length}):</b>`);
    for (const r of d.reviews) {
      const stars = "★".repeat(Math.max(0, Math.min(5, Number(r.overall ?? 0))));
      lines.push(`• ${esc(r.provider ?? "")} — ${stars} (${esc(r.overall ?? "?")}/5)` +
        (r.body ? `: ${esc(String(r.body).slice(0, 120))}` : ""));
    }
  }

  return lines.join(NL);
}

// ── returning-customer line (lead OR meeting cards) ──────────────────────────
// One compact line summarising the most recent prior interaction (lead or
// meeting) for this phone. '' when there's no prior history.
export type PriorLead = { created_at?: string; status?: string };
export type PriorMeeting = { meeting_date?: string; starts_at?: string; created_at?: string; status?: string };

export function buildReturningLine(priorLeads: PriorLead[], priorMeetings: PriorMeeting[]): string {
  const parts: string[] = [];
  if (priorLeads.length > 0) {
    const latest = [...priorLeads].sort((a, b) =>
      Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")))[0];
    const st = String(latest.status ?? "new");
    parts.push(`פנייה קודמת ${String(latest.created_at ?? "").slice(0, 10)} (${STATUS_HE[st] ?? st})`);
  }
  if (priorMeetings.length > 0) {
    const latest = [...priorMeetings].sort((a, b) =>
      Date.parse(String(b.starts_at ?? b.created_at ?? "")) - Date.parse(String(a.starts_at ?? a.created_at ?? "")))[0];
    const st = String(latest.status ?? "pending");
    const day = String(latest.meeting_date ?? String(latest.starts_at ?? "").slice(0, 10));
    parts.push(`פגישה קודמת ${day} (${MEETING_STATUS_HE[st] ?? st})`);
  }
  if (parts.length === 0) return "";
  return `🔁 <b>לקוח חוזר</b> — ${parts.join(" · ")}${NL}${NL}`;
}
