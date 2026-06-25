// Lead quality + dedup — PURE, no I/O. The business sells these leads, so a buyer
// needs three things from every captured row: (1) a completeness SCORE so weak,
// half-filled rows can be triaged below rich ones, (2) a stable DEDUP KEY so the
// same person submitting twice (form + WhatsApp, say) collapses to one billable
// lead, and (3) a derived CATEGORY so the "what does this customer want?" column
// is filled instead of blank. None of this touches the network, the DB, or the
// clock — it's all derivable from the Lead row itself, which keeps it trivially
// unit-testable and safe to call from any fail-soft path.
//
// Truth-only: every signal here is read from REAL fields the capture paths
// already wrote (consent timestamps, plan_id, notes) — nothing is fabricated. A
// missing field simply scores lower; it is never invented to inflate quality.

import type { Lead } from "./types.ts";
import { CATEGORIES, normalizeCategory } from "./catalogue.ts";

// ── IL phone normalization → E.164 ───────────────────────────────────────────
// Normalize any Israeli mobile/landline into strict E.164 ("+9725XXXXXXXX").
// This is the dedup-grade form: two spellings of the same number ("052-123 4567",
// "+972521234567", "972521234567", "0521234567") must all collapse to ONE key.
// Returns "" when the input can't be a real IL number, so a junk phone never
// produces a false dedup collision. Mirrors leads.ts normalizeLeadPhone's IL
// shape rules (9–10 national digits, 0-leading) but emits E.164, not national —
// the two are deliberately complementary (national for the DB gate, E.164 for
// cross-source identity).
export function normalizeIlPhone(s: unknown): string {
  const digits = String(s ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  // Fold every accepted spelling to the national 0-leading form first.
  let national = digits;
  if (national.startsWith("972")) national = "0" + national.slice(3);
  else if (!national.startsWith("0")) national = "0" + national; // bare 5XXXXXXXX
  // IL national numbers are 9 (landline 0x…) or 10 (mobile 05x…) digits.
  if (!/^0\d{8,9}$/.test(national)) return "";
  // E.164: drop the national trunk 0, prefix +972.
  return "+972" + national.slice(1);
}

// ── Category derivation ──────────────────────────────────────────────────────
// Recover the desired service category for a lead WITHOUT inventing one. Two
// honest, structured signals, in order of trust:
//   1) plan_id is "<provider>-<cat>-…" in the catalogue, so a leading known
//      category token is a reliable, non-fabricated signal.
//   2) the AI-chat / form capture writes "שירות מבוקש: <category>" into notes;
//      the free text after it is run through the same normalizeCategory the
//      catalogue uses (Hebrew/English cues → a canonical category).
// Returns a canonical English category ("cellular" | "internet" | "tv" |
// "triple" | "abroad") or "" when neither signal is present.
export function deriveCategory(lead: Lead): string {
  // 1) plan_id token — split on the same separators the catalogue ids use and
  // take the first token that is a known category.
  const planCat = String(lead.plan_id ?? "")
    .toLowerCase()
    .split(/[-_ ]/)
    .find((t) => (CATEGORIES as readonly string[]).includes(t));
  if (planCat) return planCat;

  // 2) explicit "שירות מבוקש: <free text>" tag the capture path wrote, else the
  // whole notes blob as a last resort — normalizeCategory only matches on real
  // category cues, so a notes blob with none yields "" (no fabricated guess).
  const notes = String(lead.notes ?? "");
  const tagged = notes.match(/שירות מבוקש:\s*([^\n|]{1,40})/);
  const fromTag = tagged ? normalizeCategory(tagged[1]) : "";
  if (fromTag) return fromTag;

  return notes ? normalizeCategory(notes) : "";
}

// ── Completeness score (0–100) ───────────────────────────────────────────────
// A buyer-facing quality score driven ONLY by which real fields are present and
// valid. The weights reflect what makes a lead actually workable for a rep:
//   • a valid phone is the single most valuable signal (you can't sell a lead
//     you can't call) — it dominates the score;
//   • consent (terms + privacy timestamps) is what makes the lead LEGAL to act
//     on (§30A / Privacy), so it is weighted heavily too — an unconsented lead
//     is near-worthless regardless of how complete it looks;
//   • email, a known provider, and a derivable category each add workable
//     context;
//   • a real name and some free-text notes round it out.
// Total of the weights is 100, so the score is already a percentage. The result
// is clamped to [0,100] and rounded, so it's safe to drop straight into a sheet
// cell or a sort.
const WEIGHTS = {
  phone: 30, // can we even call them?
  consent: 25, // is it legal to act on?
  email: 12, // a second reachable channel
  provider: 10, // current/desired provider known
  category: 10, // we know what they want
  name: 8, // a real human name
  notes: 5, // some context for the rep
} as const;

export function scoreLead(lead: Lead): number {
  let score = 0;

  // Phone — only a normalizable IL number counts (junk strings score 0 here).
  if (normalizeIlPhone(lead.phone)) score += WEIGHTS.phone;

  // Consent — both terms + privacy timestamps present means the §30A/Privacy
  // gate was satisfied at capture. The leads table doesn't surface these as
  // columns on the Lead type used here, so read them defensively off the row:
  // a non-empty terms_accepted_at AND privacy_accepted_at is the legal proof.
  const row = lead as unknown as Record<string, unknown>;
  const consented = !!String(row.terms_accepted_at ?? "").trim() &&
    !!String(row.privacy_accepted_at ?? "").trim();
  if (consented) score += WEIGHTS.consent;

  // Email — a syntactically plausible address (one @ with a dotted domain).
  const email = String(lead.email ?? "").trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) score += WEIGHTS.email;

  // Provider — any non-empty current/desired provider hint.
  if (String(lead.provider ?? "").trim()) score += WEIGHTS.provider;

  // Category — derivable (non-fabricated) desired service.
  if (deriveCategory(lead)) score += WEIGHTS.category;

  // Name — at least a 2-char real name (mirrors buildAiLeadRow's floor).
  if (String(lead.name ?? "").trim().length >= 2) score += WEIGHTS.name;

  // Notes — any free-text context for the rep.
  if (String(lead.notes ?? "").trim()) score += WEIGHTS.notes;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Dedup key ────────────────────────────────────────────────────────────────
// A stable identity for de-duplicating leads a buyer would otherwise pay for
// twice. Two submissions are "the same lead" when they're the same PERSON asking
// about the same SERVICE, so the key is the E.164 phone ⊕ the derived category:
//   "+972521234567|cellular"
// Phone is the person; category is the intent (the same person can legitimately
// be two distinct leads — a cellular lead and a TV lead — so category is part of
// the key, not just the phone). When the phone can't be normalized we fall back
// to a name-based person token so a phoneless row still dedupes against its own
// resubmission rather than colliding with every other phoneless lead. When even
// that is empty the key is "" — the caller should treat an empty key as
// "un-dedupable" (always keep) rather than collapsing all blanks together.
export function dedupKey(lead: Lead): string {
  const phone = normalizeIlPhone(lead.phone);
  const person = phone ||
    String(lead.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!person) return "";
  const category = deriveCategory(lead); // "" when unknown — still a valid axis
  return `${person}|${category}`;
}
