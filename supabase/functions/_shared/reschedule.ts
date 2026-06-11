// Pure parser for rescheduling a meeting from the bot. The rep replies with
// 'YYYY-MM-DD HH:MM' (Israel wall-clock); we validate against the same schedule
// rules the SQL meetings_guard enforces (Sun–Thu 09:00–20:30, Fri 09:00–12:30,
// no Saturday, at least tomorrow, at most 30 days ahead — all Asia/Jerusalem)
// and recompute the authoritative starts_at the same way the trigger does
// (naive Israel wall-clock → UTC instant). Unit-tested.

const IL_TZ = "Asia/Jerusalem";

export type RescheduleResult =
  | { ok: true; meetingDate: string; slot: string; startsAt: string }
  | { ok: false; error: string };

// Israel calendar day for an instant, "YYYY-MM-DD".
function ilDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IL_TZ }).format(new Date(ms));
}

// Add `days` to an Israel calendar day string, returning a new "YYYY-MM-DD".
// Anchored at noon UTC so a ±3h tz shift can never roll the date.
function addDaysIl(day: string, days: number): string {
  const base = Date.parse(`${day}T12:00:00Z`);
  return ilDay(base + days * 86_400_000);
}

// ISO weekday for a YYYY-MM-DD: 1=Mon … 7=Sun (mirrors Postgres isodow).
// Computed from the date as a pure calendar value (no tz: a date has no tz).
function isoDow(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  // UTC midnight is safe here — we only read getUTCDay (0=Sun..6=Sat).
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

// The naive Israel wall-clock → UTC instant, mirroring the SQL:
//   (date || ' ' || slot)::timestamp at time zone 'Asia/Jerusalem'
// Israel is UTC+2 (IST) in winter and UTC+3 (IDT) in summer. We resolve the
// correct offset by probing: format the candidate UTC instant back into Israel
// time and adjust until the wall clock matches. DST-safe without a tz library.
function israelWallToUtc(day: string, slot: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  const [hh, mm] = slot.split(":").map(Number);
  const wantWall = `${day} ${slot}`;
  // try both plausible offsets (+2, +3); pick the one that round-trips.
  for (const offset of [2, 3]) {
    const utcMs = Date.UTC(y, mo - 1, d, hh - offset, mm, 0);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: IL_TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(utcMs));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    let h = get("hour");
    if (h === "24") h = "00";
    const gotWall = `${get("year")}-${get("month")}-${get("day")} ${h}:${get("minute")}`;
    if (gotWall === wantWall) return new Date(utcMs).toISOString();
  }
  // Fallback (should not happen for valid slots): assume +2.
  return new Date(Date.UTC(y, mo - 1, d, hh - 2, mm, 0)).toISOString();
}

const BAD = "פורמט לא תקין — השיבו עם <code>YYYY-MM-DD HH:MM</code>, למשל <code>2026-06-18 14:30</code>";

export function parseReschedule(text: string, nowMs: number): RescheduleResult {
  const m = String(text ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return { ok: false, error: BAD };
  const [, ys, mos, ds, hhs, mms] = m;
  const day = `${ys}-${mos}-${ds}`;
  const slot = `${hhs}:${mms}`;
  const year = Number(ys), month = Number(mos), date = Number(ds);
  const hh = Number(hhs), mm = Number(mms);
  if (month < 1 || month > 12 || date < 1 || date > 31 || hh > 23 || mm > 59) {
    return { ok: false, error: BAD };
  }
  // reject impossible calendar dates (e.g. 2026-02-30) — Date normalises an
  // overflow day to the next month, so a round-trip mismatch flags it.
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) {
    return { ok: false, error: "תאריך לא קיים בלוח השנה" };
  }

  // at least tomorrow, at most 30 days ahead (Israel calendar)
  const today = ilDay(nowMs);
  const minDay = addDaysIl(today, 1);
  const maxDay = addDaysIl(today, 30);
  if (day < minDay) return { ok: false, error: "צריך לקבוע לפחות יום מראש" };
  if (day > maxDay) return { ok: false, error: "אי אפשר לקבוע יותר מ-30 יום קדימה" };

  const dow = isoDow(day);
  if (dow === 6) return { ok: false, error: "אין פגישות בשבת" };

  if (dow === 5) {
    // Friday: 09:00–12:30 on the 30-min grid
    if (!/^(09|1[0-2]):(00|30)$/.test(slot) || slot > "12:30") {
      return { ok: false, error: "בשישי אפשר רק 09:00–12:30 (בכפולות של חצי שעה)" };
    }
  } else {
    // Sun–Thu: 09:00–20:30 on the 30-min grid
    if (!/^(09|1[0-9]|20):(00|30)$/.test(slot)) {
      return { ok: false, error: "השעה חייבת להיות בין 09:00 ל-20:30 בכפולות של חצי שעה" };
    }
  }

  return { ok: true, meetingDate: day, slot, startsAt: israelWallToUtc(day, slot) };
}
