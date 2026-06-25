// Pure, deno-testable helpers for the email-verified self-serve Zoom booking
// flow (meeting-book/index.ts). Everything here is side-effect-free and free of
// Deno env / network so it can be unit-tested directly.
//
// SECURITY NOTES:
//   • Codes are 6-digit numeric, drawn from crypto.getRandomValues (NOT Math.random).
//   • Only the SHA-256 hash of a code is ever stored / compared.
//   • Code comparison is constant-time (timingSafeEqualHex) so a timing side
//     channel can't be used to brute-force the hash byte-by-byte.
//   • validBookingSlot MIRRORS the public.meetings_guard schedule rules EXACTLY
//     (meetings-2026-06.sql lines ~139-161) so the edge function can reject a
//     bad slot before the insert — the DB trigger remains the authority.

// ── OTP code generation + hashing ────────────────────────────────────────────

// A cryptographically-random 6-digit code (000000–999999), zero-padded. Uses
// rejection sampling over a 32-bit draw so every value in [0, 1_000_000) is
// equiprobable (no modulo bias).
export function genCode(): string {
  const buf = new Uint32Array(1);
  // 2^32 = 4294967296; the largest multiple of 1_000_000 that fits is
  // 4294000000. Draws at or above it are rejected to keep the distribution flat.
  const limit = 4_294_000_000;
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % 1_000_000).padStart(6, "0");
}

// SHA-256 of the code, lowercase hex. The stored/compared representation — the
// plaintext code never touches the database or the logs.
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two hex strings (e.g. two SHA-256 digests). Length
// mismatch fails fast; otherwise every char is XOR-folded so the running time
// does not depend on WHERE the first difference is. Both inputs are expected to
// be the same fixed-width hex (64 chars for SHA-256).
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Email shape ──────────────────────────────────────────────────────────────

// Trim + lowercase. Email local-parts are technically case-sensitive but in
// practice never are; lowercasing lets the per-address rate limit and the
// verified-email gate treat "User@x.com" and "user@x.com" as one identity
// (matching the SQL index on lower(email)).
export function normalizeEmail(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

// Pragmatic RFC-ish gate (mirrors site-subscribe's EMAIL_RE intent): one @, a
// dotted domain, no whitespace, length-bounded to the meetings_guard cap (254).
// Anchored + single-line so a newline can't smuggle a second address through.
export function isValidEmail(s: unknown): boolean {
  const e = normalizeEmail(s);
  if (e.length < 3 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ── Schedule validation — mirrors public.meetings_guard EXACTLY ──────────────

export type SlotCheck = { ok: true } | { ok: false; error: string };

// The Israel-local calendar date for a given UTC instant. Uses the en-CA locale
// (YYYY-MM-DD output) under the Asia/Jerusalem zone — the JS equivalent of
// `(now() at time zone 'Asia/Jerusalem')::date`, DST-correct via the ICU tz db.
function israelToday(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

// ISO weekday (1=Mon … 7=Sun), matching Postgres extract(isodow). Computed from
// the date components only (no tz), so a 'YYYY-MM-DD' is interpreted as a plain
// calendar date exactly like the trigger's `extract(isodow from new.meeting_date)`.
function isoDow(y: number, m: number, d: number): number {
  // Date.UTC avoids any local-tz drift; getUTCDay → 0=Sun..6=Sat.
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js; // remap Sunday 0 → 7 to match isodow
}

// Add `days` to an ISO calendar date string, returning a new 'YYYY-MM-DD'.
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Validate a booking's date + slot against the SAME rules the DB trigger
// enforces, so the edge function can reject early with a friendly message. This
// is a PRE-CHECK, not the authority — meetings_guard still runs on insert.
//
// Rules (meetings-2026-06.sql §3, lines ~139-161):
//   • Israel wall-clock is the only clock.
//   • meeting_date in [il_today + 1, il_today + 30].
//   • Saturday (isodow 6) → rejected.
//   • Friday (isodow 5)   → slot matches ^(09|1[0-2]):(00|30)$ AND slot <= '12:30'.
//   • Sun–Thu             → slot matches ^(09|1[0-9]|20):(00|30)$.
export function validBookingSlot(meeting_date: string, slot: string, nowMs: number): SlotCheck {
  const date = String(meeting_date ?? "").trim();
  const s = String(slot ?? "").trim();

  // shape: a plain YYYY-MM-DD calendar date (the trigger casts to ::date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "invalid date" };
  const [y, m, d] = date.split("-").map(Number);
  // reject impossible dates (e.g. 2026-02-30) — Date normalizes silently, so
  // round-trip the components to confirm they survived unchanged.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return { ok: false, error: "invalid date" };
  }

  const today = israelToday(nowMs);
  if (date < addDays(today, 1)) {
    return { ok: false, error: "meeting must be booked at least one day ahead" };
  }
  if (date > addDays(today, 30)) {
    return { ok: false, error: "meeting too far ahead" };
  }

  const dow = isoDow(y, m, d); // 1=Mon … 7=Sun
  if (dow === 6) return { ok: false, error: "no meetings on Saturday" };

  if (dow === 5) {
    // Friday: mornings only, 09:00–12:30
    if (!/^(09|1[0-2]):(00|30)$/.test(s) || s > "12:30") {
      return { ok: false, error: "invalid slot for Friday" };
    }
  } else {
    // Sunday–Thursday: 09:00–20:30
    if (!/^(09|1[0-9]|20):(00|30)$/.test(s)) {
      return { ok: false, error: "invalid slot" };
    }
  }

  return { ok: true };
}
