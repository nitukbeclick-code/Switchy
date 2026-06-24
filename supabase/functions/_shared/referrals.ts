// ─────────────────────────────────────────────────────────────────────────────
// _shared/referrals.ts — the referral-code store. The agent's generate_referral_code
// tool delegates here so a code is a REAL, persisted, attributable token — not a
// fabricated string. Pure builder (buildReferralRow / makeReferralCode) is unit-
// testable with no network; the service-role write (issueReferralCode) inserts the
// row via _shared/db.ts, exactly mirroring the _shared/leads.ts capture pattern.
//
// TRUTH-ONLY / E-E-A-T:
//   • The code is generated locally and stored, so it can be looked up + attributed
//     later (referrer → referee). No code is "promised" that doesn't exist.
//   • NO advertised monetary reward. Israeli law (§30A spam, consumer-protection)
//     and our honesty bar mean we don't dangle "get ₪X" unless the owner actually
//     defines a reward program. The default framing is share-the-tool ("עזרו לחבר
//     לחסוך"), value-based, not cash-based. A reward, if ever defined, is a server
//     config the owner sets — never invented by the agent.
//   • Attribution only: the row records WHO generated it (channel + contact/
//     conversation) so a future signup can be credited. No PII beyond the contact
//     handle the conversation already has.
// ─────────────────────────────────────────────────────────────────────────────

import { insertRow } from "./db.ts";

// Unambiguous alphabet: no 0/O, 1/I/L — so a human can read a code aloud / type it
// without confusion. Uppercase only (codes are case-insensitive on lookup).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_BODY_LEN = 6; // 30^6 ≈ 729M combinations — collision-safe at our volume
const CODE_PREFIX = "SW"; // Switchy/חוסך brand prefix, e.g. "SW-7KQ4M9"

// A cryptographically-random referral code, e.g. "SW-7KQ4M9". Uses Web Crypto
// (available in Deno + edge) so codes are unguessable, not sequential. The `rng`
// seam lets tests inject deterministic bytes.
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

// Normalize a code for storage/lookup: trim, uppercase, strip stray spaces.
// Keeps the single hyphen between prefix and body.
export function normalizeReferralCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export type ReferralChannel = "whatsapp" | "site" | "app";

export type ReferralInput = {
  channel: ReferralChannel;
  // Who is sharing — used only for attribution/audit. All optional; a code can be
  // issued even for an anonymous site visitor (attribution is then conversation-only).
  contact?: unknown; // phone (whatsapp) / null — the referrer's handle, clipped
  conversationId?: unknown; // unified-session id, for attribution
  name?: unknown; // referrer display name, if known (clipped)
};

export type ReferralRow = {
  code: string;
  channel: ReferralChannel;
  referrer_contact: string | null;
  referrer_name: string | null;
  conversation_id: string | null;
  source: "agent";
  // NO reward column is set by the agent — reward (if any) is owner-defined config.
};

function clip(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

// Build the referral row honestly: a real code + attribution. Never throws; the
// `code`/`now` seams let tests pin the output. Unlike leads, there's no consent
// gate — issuing a SHARE code is not marketing TO anyone (the referrer chooses to
// share it). The code only becomes a contact event if/when a referee redeems it.
export function buildReferralRow(
  input: ReferralInput,
  code: string = makeReferralCode(),
): ReferralRow {
  return {
    code: normalizeReferralCode(code),
    channel: input.channel,
    referrer_contact: clip(input.contact, 40) || null,
    referrer_name: clip(input.name, 80) || null,
    conversation_id: clip(input.conversationId, 80) || null,
    source: "agent",
  };
}

// Service-role issue: build + INSERT the referral row. Returns the issued code on
// success, or null on a write failure (the agent then apologises / offers WhatsApp).
// Fail-soft: never throws. A unique index on `code` makes a (vanishingly rare)
// collision an insert failure → null → the caller can retry with a fresh code.
export async function issueReferralCode(input: ReferralInput): Promise<string | null> {
  const row = buildReferralRow(input);
  const ok = await insertRow("referral_codes", row);
  return ok ? row.code : null;
}
