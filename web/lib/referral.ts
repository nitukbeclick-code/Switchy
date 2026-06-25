// ────────────────────────────────────────────────────────────────────────────
// lib/referral.ts — the WEB referral-code helpers. PURE + dependency-light so
// every piece (code format, normalization, the persisted row shape, the share
// copy/link) is unit-testable with no network. Mirrors the agent's
// supabase/functions/_shared/referrals.ts EXACTLY for the code format (SW-XXXXXX,
// same unambiguous alphabet, same length) so a code minted on the site is
// indistinguishable from one the WhatsApp/app agent issues — one referral
// namespace, one attribution table (public.referral_codes).
//
// TRUTH-ONLY / E-E-A-T (ABSOLUTE):
//   • A code is a REAL, persisted, attributable token — never a fabricated string.
//     The /api/referral route inserts the row via service-role so a future signup
//     can be credited to the referrer (referee redeems → leads.referrer_code).
//   • NO advertised monetary reward. Israeli Spam-Law §30A + consumer-protection +
//     our honesty bar: we do NOT dangle "get ₪X". The framing is share-the-tool
//     ("עזרו לחבר לחסוך") — value-based, never cash-based. A reward, if EVER
//     defined, is owner config — never invented here or by any surface.
//   • Sharing a code is NOT marketing TO anyone: the referrer chooses to share it.
//     It only becomes a contact event if/when a referee redeems it, at which point
//     the normal consent + suppression gates apply to that NEW lead.
//
// This file holds only PURE builders. The service-role write lives in
// app/api/referral/route.ts (mirrors /api/lead), so this module never imports
// supabase and is safe to use on the client (the share copy/link builders run in
// <ReferralCard>).
// ────────────────────────────────────────────────────────────────────────────

// Canonical site origin (no trailing slash). MIRRORS lib/schema.SITE_URL — kept
// inline here so this CLIENT-imported module (used by <ReferralCard>) does NOT
// pull in lib/schema → lib/data, which reads the bundled catalogue via node:fs and
// would break the client bundle. If the canonical origin ever changes, update both.
const SITE_URL = "https://app.switchy-ai.com";

// ── Code format — MUST stay byte-for-byte aligned with _shared/referrals.ts ────
// Unambiguous alphabet: no 0/O, 1/I/L — a human can read a code aloud / type it
// without confusion. Uppercase only (codes are case-insensitive on lookup).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_BODY_LEN = 6; // 30^6 ≈ 729M combinations — collision-safe at our volume
const CODE_PREFIX = "SW"; // Switchy AI brand prefix, e.g. "SW-7KQ4M9"

/** The canonical SW-XXXXXX shape (UPPERCASE body, unambiguous alphabet). */
export const REFERRAL_CODE_RE = /^SW-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * A cryptographically-random referral code, e.g. "SW-7KQ4M9". Uses Web Crypto
 * (available in the browser, Node 18+, and edge) so codes are unguessable, not
 * sequential. The `rng` seam lets tests inject deterministic bytes. Mirrors
 * _shared/referrals.ts makeReferralCode so site- and agent-minted codes share one
 * format.
 */
export function makeReferralCode(
  rng: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const bytes = rng(CODE_BODY_LEN);
  let body = "";
  for (let i = 0; i < CODE_BODY_LEN; i++) {
    body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${CODE_PREFIX}-${body}`;
}

/**
 * Normalize a code for storage/lookup: trim, uppercase, strip stray whitespace.
 * Keeps the single hyphen between prefix and body. Mirrors _shared/referrals.ts.
 */
export function normalizeReferralCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** True when `raw`, once normalized, is a well-formed SW-XXXXXX code. */
export function isReferralCode(raw: unknown): boolean {
  return REFERRAL_CODE_RE.test(normalizeReferralCode(raw));
}

// ── The persisted row shape (web channel) ─────────────────────────────────────
// The site is an anonymous surface: there is no referrer handle to attribute to,
// so referrer_contact/referrer_name stay null and attribution is conversation-
// only (a short, non-PII session token the client generates per visit). This
// mirrors _shared/referrals.ts ReferralRow / buildReferralRow with channel "site".

export type ReferralRow = {
  code: string;
  channel: "site";
  referrer_contact: string | null;
  referrer_name: string | null;
  conversation_id: string | null;
  source: "site";
  // NO reward column — reward (if any) is owner-defined config, never set here.
};

export type ReferralInput = {
  /** A short, non-PII per-visit token for attribution. Optional. */
  conversationId?: unknown;
};

function clip(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

// ── The /api/referral response shape (shared, client-safe) ────────────────────
// Declared here (not in the route) so <ReferralCard> can import the TYPE without
// pulling the route's server-only @supabase/supabase-js (and its node:fs) into the
// client bundle. The route re-exports this as its response contract.
export interface ReferralResponse {
  ok: boolean;
  /** The shareable SW-XXXXXX code. */
  code: string;
  /** The absolute invite link (homepage + ?ref=CODE). */
  link: string;
  /** A ready-to-share, share-the-tool message (NO reward promise). */
  shareText: string;
  /**
   * True when the code was written to public.referral_codes (attribution ON).
   * False when the server degraded to a real-but-unpersisted code (no key / DB
   * error) — the code still works to share; it's simply not yet credited.
   */
  persisted: boolean;
}

/**
 * Build the referral row honestly: a real code + (optional) conversation-only
 * attribution. Never throws; the `code` seam lets tests pin the output. There is
 * no consent gate — issuing a SHARE code is not marketing TO anyone.
 */
export function buildReferralRow(
  input: ReferralInput = {},
  code: string = makeReferralCode(),
): ReferralRow {
  return {
    code: normalizeReferralCode(code),
    channel: "site",
    referrer_contact: null, // anonymous site visitor — no handle to attribute
    referrer_name: null,
    conversation_id: clip(input.conversationId, 80) || null,
    source: "site",
  };
}

// ── Share copy + link (share-the-tool framing — NO fabricated reward) ──────────

/**
 * The shareable invite URL for a code. Points at the public homepage with a
 * `?ref=CODE` param so a referee landing from the link can be attributed when
 * they later leave details (the lead form reads `ref` → leads.referrer_code).
 * Absolute, on the canonical SITE_URL, so it is shareable anywhere.
 */
export function referralLink(code: string): string {
  const c = normalizeReferralCode(code);
  return `${SITE_URL}/?ref=${encodeURIComponent(c)}`;
}

/**
 * The default share message. Share-the-tool, value-based — it invites a friend to
 * use a FREE comparison tool, with NO promise of money. The code + link are
 * appended so the recipient can be attributed. Plain text so it works in WhatsApp,
 * SMS, email, and the native share sheet alike.
 */
export function referralShareText(code: string): string {
  const c = normalizeReferralCode(code);
  return (
    `מצאתי כלי חינמי שעוזר להשוות מסלולי תקשורת בישראל ולחסוך — שווה לבדוק 🙂\n` +
    `${referralLink(c)}\n` +
    `קוד ההזמנה שלי: ${c}`
  );
}

/**
 * Read a referral code out of a URL query string (e.g. the `ref` param a referee
 * arrives with). Returns the normalized code only when it is well-formed, else
 * null — so a junk/spoofed `?ref=` value is never attributed. Accepts a raw query
 * string ("?ref=SW-..." or "ref=SW-...") or a full URL.
 */
export function referralCodeFromQuery(input: unknown): string | null {
  const raw = String(input ?? "");
  if (!raw) return null;
  let qs = raw;
  const qIdx = raw.indexOf("?");
  if (qIdx >= 0) qs = raw.slice(qIdx + 1);
  let value: string | null = null;
  try {
    value = new URLSearchParams(qs).get("ref");
  } catch {
    return null;
  }
  if (!value) return null;
  const code = normalizeReferralCode(value);
  return isReferralCode(code) ? code : null;
}
