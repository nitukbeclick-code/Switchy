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

// Canonicalize an email for RATE-LIMIT KEYING ONLY (never for sending — we still
// SEND to the raw normalized address). Collapses provider-equivalent aliases that
// all deliver to one inbox, so a per-address cap can't be defeated by alias
// rotation to email-bomb a single victim:
//   • Gmail/Googlemail: a "+tag" suffix and ANY '.' in the local-part are ignored
//     by Google, and googlemail.com is an alias of gmail.com. So
//     victim+1@gmail.com, v.i.c.t.i.m@gmail.com, victim@googlemail.com all
//     canonicalize to victim@gmail.com.
//   • Every other provider: only the conventional "+tag" sub-addressing is
//     stripped (dots are significant elsewhere, so they're preserved).
// Pure + dependency-free. Splits at the LAST '@' (the local-part may not contain
// an unescaped '@' for any address we accept, but the last-@ split is the safe
// convention). Malformed input (no '@', empty local/domain) falls back to the
// plain normalizeEmail so callers always get a stable, non-throwing string.
export function canonicalizeEmail(raw: unknown): string {
  const e = normalizeEmail(raw);
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return e; // no '@', empty local, or empty domain

  let local = e.slice(0, at);
  let domain = e.slice(at + 1);

  // "+tag" sub-addressing: drop everything from the first '+' in the local-part.
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Google ignores dots in the local-part and treats googlemail as gmail.
    local = local.split(".").join("");
    domain = "gmail.com";
  }

  return `${local}@${domain}`;
}

// ── Zoom-meeting provider capability gate ────────────────────────────────────
// SINGLE SOURCE OF TRUTH at runtime is public.provider_capabilities
// (supports_zoom_meeting). This const is the OFFLINE FALLBACK ONLY — used when
// the table query errors (transient DB blip / env missing) so a legit booking is
// not blocked. The const MUST stay in sync with the seeded rows in
// supabase/provider-capabilities-2026-06.sql (the 10 Zoom-supported providers,
// exact catalogue ids, Hebrew-first). Every OTHER provider (019 מובייל, Xphone,
// רמי לוי, וואלה מובייל, גילת, CCC, WeCom, Airalo eSIM, electricity, …) is NOT
// supported and must be rejected.
export const ZOOM_SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set<string>([
  "פרטנר",
  "yes",
  "STING TV",
  "HOT",
  "NextTV",
  "סלקום",
  "גולן טלקום",
  "בזק",
  "פלאפון",
  "הוט מובייל",
]);

// Decide whether `provider` may be offered a Zoom booking, given the DB answer.
// `dbSupports` is the table's supports_zoom_meeting flag:
//   • true  → supported (the row says so) — allow.
//   • false → explicitly NOT supported (row exists & false, or no row ⇒ caller
//             passes false by the read-side default) — reject.
//   • null  → the table query ERRORED (couldn't read) — FALL BACK to the const
//             set so a transient DB issue doesn't block a legit booking, while the
//             table stays authoritative whenever it's readable.
// Pure: the I/O (reading the table) is the caller's job.
export function providerSupportsZoom(provider: unknown, dbSupports: boolean | null): boolean {
  const p = String(provider ?? "").trim();
  if (!p) return false;
  if (dbSupports === null) return ZOOM_SUPPORTED_PROVIDERS.has(p); // DB unreadable → const fallback
  return dbSupports === true;
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

// ── OTP send rate-limit (DURABLE, DB-backed) ─────────────────────────────────
// The in-memory rateLimit() in _shared/ratelimit.ts is process-local — on
// Supabase Edge it only throttles a single HOT isolate, so a flood spread across
// isolates (or one that survives a cold-start) can still email-bomb a victim and
// run up real send cost. This evaluator is the DURABLE second layer: index.ts
// feeds it the created_at timestamps of recent public.meeting_email_otps rows
// (which record EVERY actually-sent code and are shared across all isolates via
// Postgres) and it decides whether another send is allowed. Pure + clock-injected
// so it unit-tests with no DB and no timers.

export interface OtpRateLimits {
  cooldownMs: number; // min gap between two sends to the SAME address
  emailWindowMs: number; // sliding window for the per-address burst cap
  emailMax: number; // max sends to one address within emailWindowMs
  emailDayMs: number; // long window (≈24h) for the per-address daily cap
  emailDayMax: number; // max sends to one address within emailDayMs
  ipWindowMs: number; // sliding window for the per-IP cap
  ipMax: number; // max sends from one IP within ipWindowMs (across all addresses)
}

// Conservative defaults. A real visitor needs 1–2 codes; these are generous
// enough never to bite a legitimate booking, yet tight enough to make bombing
// pointless — and to bound BOTH send cost and table growth, since a denied send
// neither emails nor inserts a row.
export const DEFAULT_OTP_RATE_LIMITS: OtpRateLimits = {
  cooldownMs: 45_000, // 45s between resends to one address
  emailWindowMs: 15 * 60_000, // 15 min
  emailMax: 4, // ≤4 codes / 15 min / address
  emailDayMs: 24 * 60 * 60_000, // 24 h
  emailDayMax: 12, // ≤12 codes / day / address
  ipWindowMs: 60 * 60_000, // 60 min
  ipMax: 15, // ≤15 codes / hour / IP (across all addresses — stops +tag/dot bombing)
};

export type OtpRateDecision = { allowed: true } | { allowed: false; reason: string };

// Decide whether another OTP email may be sent. `emailTimestamps` are the
// created_at (epoch ms) of recent sends to THIS address; `ipTimestamps` the same
// for THIS IP (empty when the IP is unknown — the per-IP rule then can't apply,
// by design). Both are order-independent. The denial `reason` is for logging
// only — it is NEVER surfaced to the caller (the handler stays outcome-blind).
export function evaluateOtpRateLimit(args: {
  now: number;
  emailTimestamps: number[];
  ipTimestamps: number[];
  limits?: OtpRateLimits;
}): OtpRateDecision {
  const { now, emailTimestamps, ipTimestamps } = args;
  const L = args.limits ?? DEFAULT_OTP_RATE_LIMITS;

  // Cooldown: reject a resend that arrives sooner than cooldownMs after the most
  // recent send to this address (the previous code is still valid for 15 min).
  let newest = -Infinity;
  for (const t of emailTimestamps) {
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  if (newest > -Infinity && now - newest < L.cooldownMs) {
    return { allowed: false, reason: "cooldown" };
  }

  const countSince = (arr: number[], windowMs: number): number => {
    const floor = now - windowMs;
    let c = 0;
    for (const t of arr) if (Number.isFinite(t) && t > floor) c++;
    return c;
  };

  if (countSince(emailTimestamps, L.emailWindowMs) >= L.emailMax) {
    return { allowed: false, reason: "email-window" };
  }
  if (countSince(emailTimestamps, L.emailDayMs) >= L.emailDayMax) {
    return { allowed: false, reason: "email-day" };
  }
  // Per-IP cap only applies when we actually know the IP; it is the main defense
  // against bombing one mailbox via plus-tag / dot aliases (each alias is a new
  // "address" but shares the attacker's IP).
  if (ipTimestamps.length && countSince(ipTimestamps, L.ipWindowMs) >= L.ipMax) {
    return { allowed: false, reason: "ip-window" };
  }
  return { allowed: true };
}

// ── OTP verification over the FULL set of live codes ──────────────────────────
// "Request a new code" (resend) mints a FRESH row while the previous code is
// still valid, so an address can hold several unexpired codes at once. The verify
// gate must therefore check the entered code against EVERY unexpired, unconsumed
// row — not just the newest — or a user who enters the code from an earlier email
// is wrongly told "invalid" (the production bug this fixes: SHA-256("926748")
// matched the 2nd-newest row, but only the newest was checked). Brute force stays
// bounded by the SUM of attempts across the live codes. Pure + clock-injected.

export interface OtpCandidate {
  id: string;
  code_hash: string; // sha-256 hex of the issued code
  expires_at: string; // ISO instant the code stops being valid
  attempts: number; // failed verify attempts already charged to this row
}

export type OtpVerifyOutcome =
  | { status: "no-live" } // nothing unexpired to check → generic invalid/expired
  | { status: "too-many" } // attempt budget across live codes exhausted
  | { status: "mismatch"; chargeId: string; nextAttempts: number } // wrong code
  | { status: "match"; matchedId: string }; // code matched a live row

/**
 * Decide an OTP verification against ALL unconsumed rows for an address. The
 * caller does the I/O: fetch the unconsumed rows (newest first), hash the entered
 * code, then apply the side effects this returns — on "mismatch" set the charged
 * row's attempts to `nextAttempts`; on "match" stamp `matchedId` verified.
 *
 * Pure: `now` and `maxAttempts` are injected; matching is constant-time per
 * candidate (timingSafeEqualHex).
 */
export function evaluateOtpVerify(
  rows: readonly OtpCandidate[],
  enteredHash: string,
  now: number,
  maxAttempts: number,
): OtpVerifyOutcome {
  // Newest-first; drop expired so a stale code can never verify.
  const live = rows.filter((r) => Date.parse(r.expires_at) > now);
  if (!live.length) return { status: "no-live" };

  // Bound brute force across every live code for the address.
  const totalAttempts = live.reduce((s, r) => s + (r.attempts ?? 0), 0);
  if (totalAttempts >= maxAttempts) return { status: "too-many" };

  // Accept a match against ANY live code (the fix); else charge the newest row.
  for (const r of live) {
    if (timingSafeEqualHex(enteredHash, r.code_hash)) {
      return { status: "match", matchedId: r.id };
    }
  }
  return { status: "mismatch", chargeId: live[0].id, nextAttempts: (live[0].attempts ?? 0) + 1 };
}
