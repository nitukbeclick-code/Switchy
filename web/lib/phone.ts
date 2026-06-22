// ────────────────────────────────────────────────────────────────────────────
// Israeli phone parsing — the SINGLE source of truth shared by the client
// <LeadForm> (validation) and the server /api/lead route (normalization). Keeping
// both on one helper guarantees the form can never (a) wrongly reject a number the
// server would accept, nor (b) accept one the server will reject at submit.
//
// Pure + dependency-free so it is safe to import from a "use client" component
// AND a Node server route, and trivially unit-testable.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw Israeli phone into canonical local form (`0XXXXXXXX[X]`), or
 * `null` when it isn't a valid Israeli mobile/landline number.
 *
 * Rules: strip everything except digits and a leading `+`, fold a leading
 * `+972` / `972` country code to a leading `0`, then require exactly 9–10 digits
 * starting with `0` (i.e. `0` followed by 8–9 more digits).
 */
export function normalizeIsraeliPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const local = digits.replace(/^\+?972/, "0");
  return /^0\d{8,9}$/.test(local) ? local : null;
}

/** True when `raw` is a valid Israeli phone (see {@link normalizeIsraeliPhone}). */
export function isValidIsraeliPhone(raw: string): boolean {
  return normalizeIsraeliPhone(raw) !== null;
}
