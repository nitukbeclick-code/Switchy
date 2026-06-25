// ────────────────────────────────────────────────────────────────────────────
// Wallet / social-proof domain — the SINGLE, pure, tested place that decides
// whether the REAL aggregate of recorded savings is worth surfacing as "social
// proof", and shapes it into the honest payload the UI renders. Pulled out of the
// API route so the honesty rule is unit-testable without a DB or a browser, and
// so the route + <SocialProof> component can never drift from it.
//
// E-E-A-T / HONESTY (ABSOLUTE):
//   • The numbers come ONLY from public.leads.actual_saving via get_savings_stats
//     (see supabase/wallet-stats-2026-06.sql) — the ₪/year a rep actually
//     recorded in the won-flow. Nothing here invents a "X users saved ₪Y".
//   • Below a real publish threshold (SOCIAL_PROOF_MIN_MEMBERS) we publish
//     NOTHING — `summarizeStats` returns `published: false` and the UI renders a
//     neutral fallback (or nothing). A tiny, non-representative sample must never
//     be paraded as proof.
//   • Realized savings are "מבוסס דיווח" (based on what reps reported), never a
//     guaranteed promise — the copy helpers label them that way.
// ────────────────────────────────────────────────────────────────────────────

/**
 * The raw, REAL aggregate as returned by get_savings_stats() — a single row of
 * counts + shekel aggregates over won leads with a genuine positive actual_saving.
 * All money fields are ₪/year. No PII is ever part of this shape.
 */
export interface RawSavingsStats {
  /** # of won leads carrying a real, positive actual_saving. */
  members: number;
  /** Σ actual_saving over those rows (₪/year). */
  totalSaving: number;
  /** Mean actual_saving, rounded (₪/year). */
  avgSaving: number;
  /** Median actual_saving, rounded (₪/year). */
  medianSaving: number;
  /** Single largest recorded actual_saving (₪/year). */
  maxSaving: number;
  /** ISO timestamp of the earliest such lead (how long we've been tracking). */
  firstAt: string | null;
  /** ISO timestamp of the most recent recorded saving. */
  lastAt: string | null;
}

/**
 * The publish decision + the (rounded, honesty-labeled) figures the UI shows.
 * When `published` is false the UI renders NOTHING (or a neutral fallback) — the
 * figures are still echoed so a debug/preview surface can inspect them, but the
 * component MUST gate on `published`.
 */
export interface SavingsSummary {
  /** True ONLY when the real sample clears SOCIAL_PROOF_MIN_MEMBERS. */
  published: boolean;
  /** # of real members backing the proof (0 when none). */
  members: number;
  /** Σ recorded annual saving (₪/year). */
  totalSaving: number;
  /** Mean recorded annual saving, rounded (₪/year). */
  avgSaving: number;
  /** Median recorded annual saving, rounded (₪/year). */
  medianSaving: number;
  /**
   * The headline "typical" annual saving to feature. We deliberately use the
   * MEDIAN (robust to a few outliers) rather than the mean, and clamp it to the
   * mean's ballpark is NOT done — both are real; the UI shows the median as the
   * honest "typical" figure. Falls back to avg only when median is missing.
   */
  typicalSaving: number;
  /** The publish threshold applied, echoed so the UI can label honestly. */
  threshold: number;
}

/**
 * Minimum number of REAL recorded savings before any social-proof figure is
 * shown. Below this, the sample is too small to be representative, so we publish
 * NOTHING rather than over-claim from a handful of rows. This is the honesty
 * gate — keep it conservative.
 */
export const SOCIAL_PROOF_MIN_MEMBERS = 25;

/** A zeroed raw stats object — the safe default when the DB is unavailable. */
export const EMPTY_RAW_STATS: RawSavingsStats = {
  members: 0,
  totalSaving: 0,
  avgSaving: 0,
  medianSaving: 0,
  maxSaving: 0,
  firstAt: null,
  lastAt: null,
};

/** Coerce an unknown to a finite, non-negative integer (else 0). */
function nat(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Coerce an unknown to a trimmed ISO string, or null. */
function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && Number.isFinite(Date.parse(s)) ? s : null;
}

/**
 * Normalise a raw get_savings_stats() row (snake_case from PostgREST, possibly
 * with string-typed bigints) into a clean {@link RawSavingsStats}. Defensive:
 * any missing/garbage field collapses to 0/null. Never throws.
 */
export function normalizeRawStats(row: unknown): RawSavingsStats {
  if (!row || typeof row !== "object") return { ...EMPTY_RAW_STATS };
  const r = row as Record<string, unknown>;
  return {
    members: nat(r.members),
    totalSaving: nat(r.total_saving ?? r.totalSaving),
    avgSaving: nat(r.avg_saving ?? r.avgSaving),
    medianSaving: nat(r.median_saving ?? r.medianSaving),
    maxSaving: nat(r.max_saving ?? r.maxSaving),
    firstAt: isoOrNull(r.first_at ?? r.firstAt),
    lastAt: isoOrNull(r.last_at ?? r.lastAt),
  };
}

/**
 * Decide whether to publish, and shape the honest summary. PURE — no I/O, no
 * clock. Below SOCIAL_PROOF_MIN_MEMBERS the result is `published: false` and the
 * UI must render nothing / a neutral fallback. Above it, every figure shown is a
 * real aggregate of recorded savings.
 *
 * @param raw normalised aggregate (use {@link normalizeRawStats} on a DB row).
 * @param minMembers override the publish threshold (defaults to the honesty gate).
 */
export function summarizeStats(
  raw: RawSavingsStats,
  minMembers: number = SOCIAL_PROOF_MIN_MEMBERS,
): SavingsSummary {
  const members = nat(raw.members);
  const published = members >= minMembers;
  const median = nat(raw.medianSaving);
  const avg = nat(raw.avgSaving);
  return {
    published,
    members,
    totalSaving: nat(raw.totalSaving),
    avgSaving: avg,
    medianSaving: median,
    // Prefer the robust median as the "typical" figure; fall back to the mean
    // only if the median is somehow absent. Both are real — never invented.
    typicalSaving: median > 0 ? median : avg,
    threshold: minMembers,
  };
}

/** Format a shekel integer for display, he-IL grouped, e.g. 1234 → "₪1,234". */
export function ilsStat(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

/**
 * The honest one-line "social proof" headline, built ONLY from real figures.
 * Returns null when there is nothing to publish (the caller renders nothing /
 * a neutral fallback). The copy frames the saving as "מבוסס דיווח" — derived from
 * what reps actually recorded, not a guaranteed promise.
 */
export function socialProofHeadline(summary: SavingsSummary): string | null {
  if (!summary.published || summary.typicalSaving <= 0) return null;
  const members = summary.members.toLocaleString("he-IL");
  return (
    `${members} משקי בית כבר עברו דרכנו וחסכו — חיסכון שנתי טיפוסי של ` +
    `${ilsStat(summary.typicalSaving)} (מבוסס דיווח של נציגים, לא הבטחה).`
  );
}
