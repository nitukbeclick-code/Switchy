// ────────────────────────────────────────────────────────────────────────────
// Booking slot generator — PURE, deterministic given `now`. Produces the exact
// set of selectable day+time options the /book page offers, MIRRORING the
// server's public.meetings_guard schedule rules EXACTLY (the same rules the
// meeting-book edge function pre-checks via supabase/functions/meeting-book/lib.ts
// → validBookingSlot, which itself mirrors meetings-2026-06.sql §3):
//
//   • Israel wall-clock (Asia/Jerusalem) is the ONLY clock.
//   • Selectable days run from tomorrow (il_today + 1) through il_today + 30.
//   • Saturday (isodow 6) is excluded entirely.
//   • Friday (isodow 5): mornings only, 09:00–12:30.
//   • Sunday–Thursday (isodow 1–4, 7): 09:00–20:30.
//   • All times sit on a 30-minute grid ("09:00", "09:30", … ).
//
// Keeping this client-side generator in lockstep with the server guard means the
// UI can never offer a slot the backend would reject (and never hides a slot the
// backend would accept). The server remains the authority — this only narrows the
// picker to valid choices up front.
//
// No filesystem / node imports → safe to import from a "use client" component.
// ────────────────────────────────────────────────────────────────────────────

/** One selectable booking day: its ISO date, a Hebrew label, and its valid times. */
export interface BookingDay {
  /** Plain calendar date 'YYYY-MM-DD' (the value POSTed as `meeting_date`). */
  date: string;
  /** Hebrew day label, e.g. "יום ראשון, 28.6". */
  label: string;
  /** Valid 30-minute slot times for this day, ascending (e.g. "09:00"). */
  slots: string[];
}

/** Window bounds (inclusive), mirroring the guard's [il_today+1, il_today+30]. */
const MIN_DAYS_AHEAD = 1;
const MAX_DAYS_AHEAD = 30;

/** Hebrew weekday names, indexed by isodow (1=Mon … 7=Sun). [0] is unused. */
const HE_WEEKDAY_BY_ISODOW: readonly string[] = [
  "",
  "יום שני", // 1
  "יום שלישי", // 2
  "יום רביעי", // 3
  "יום חמישי", // 4
  "יום שישי", // 5
  "יום שבת", // 6 (excluded; kept for completeness)
  "יום ראשון", // 7
];

/**
 * The Israel-local calendar date for a given UTC instant, as 'YYYY-MM-DD'. Uses
 * the en-CA locale (which formats as YYYY-MM-DD) under Asia/Jerusalem — the JS
 * equivalent of `(now() at time zone 'Asia/Jerusalem')::date`, DST-correct via the
 * ICU tz database. Mirrors israelToday() in meeting-book/lib.ts.
 */
function israelToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * ISO weekday (1=Mon … 7=Sun) for a plain calendar date — matches Postgres
 * `extract(isodow from …)`. Computed from the date components via Date.UTC so a
 * 'YYYY-MM-DD' is treated as a tz-free calendar date (no local-zone drift),
 * exactly like the trigger. Mirrors isoDow() in meeting-book/lib.ts.
 */
function isoDow(y: number, m: number, d: number): number {
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js; // remap Sunday 0 → 7 to match isodow
}

/** Add `days` to an ISO calendar date string, returning a new 'YYYY-MM-DD'. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Build the ascending 30-minute slot grid for a given ISO weekday.
 *   • Friday (5): 09:00 … 12:30 (mornings only).
 *   • Sunday–Thursday (1–4, 7): 09:00 … 20:30.
 *   • Saturday (6): none.
 * The bounds match the regex/comparison rules in validBookingSlot exactly.
 */
function slotsForDow(dow: number): string[] {
  if (dow === 6) return []; // Saturday — no meetings
  const endHour = dow === 5 ? 12 : 20; // Friday capped at 12:30, else 20:30
  const out: string[] = [];
  for (let h = 9; h <= endHour; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
}

/** The Hebrew day label, e.g. "יום ראשון, 28.6" (no leading zeros on day/month). */
function hebrewDayLabel(y: number, m: number, d: number, dow: number): string {
  const weekday = HE_WEEKDAY_BY_ISODOW[dow] ?? "";
  return `${weekday}, ${d}.${m}`;
}

/**
 * Every selectable booking day (with its valid 30-minute times), from tomorrow
 * through 30 days ahead in Israel wall-clock, EXCLUDING Saturday. Deterministic
 * given `now`. Days are returned in ascending date order; each day's `slots` are
 * ascending too. A day with no valid slots (only Saturday, which is skipped) is
 * never included, so callers can render the result directly.
 */
export function availableSlots(now: Date): BookingDay[] {
  const today = israelToday(now);
  const days: BookingDay[] = [];

  for (let offset = MIN_DAYS_AHEAD; offset <= MAX_DAYS_AHEAD; offset++) {
    const date = addDays(today, offset);
    const [y, m, d] = date.split("-").map(Number);
    const dow = isoDow(y, m, d);
    const slots = slotsForDow(dow);
    if (slots.length === 0) continue; // Saturday → skip the whole day
    days.push({ date, label: hebrewDayLabel(y, m, d, dow), slots });
  }

  return days;
}
