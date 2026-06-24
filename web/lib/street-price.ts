// ────────────────────────────────────────────────────────────────────────────
// Street-price domain — "מחיר הרחוב": the WEB-side, PURE, tested helpers behind
// the public transparency view (web/app/street-prices/**) and the
// <StreetPriceChart>. The HEAVY lifting (the heuristic pre-screen, the
// reporter fingerprint, the insert, the DISTINCT-reporter threshold) lives in the
// supabase `street-price` Edge Function + the get_street_price() RPC
// (supabase/street-prices-2026-06.sql) — those are the single source of truth for
// what counts and what publishes. This module ONLY:
//   • normalises the RPC's aggregate row into a clean shape the chart renders,
//   • holds the SAME publish threshold (STREET_PRICE_MIN_REPORTS) for honest
//     "X more reports needed" copy (pinned to the DB/Edge constant by a test),
//   • validates a SUBMISSION the page is about to POST (client-side guard; the
//     authoritative screen is the Edge function's), and
//   • owns the mandatory provenance copy.
//
// PURE: no fs, no network, no React. Mirrors the price-history / wallet-stats
// pattern (a threshold gate + a clean shape the UI renders).
//
// E-E-A-T / HONESTY (ABSOLUTE — this is a price-comparison app, truth-only):
//   • The aggregate is built ONLY from genuine, APPROVED user reports (the RPC
//     returns price figures ONLY above the threshold; below it every figure is
//     null). Nothing is invented: no synthetic counts, no extrapolated "typical".
//   • Below STREET_PRICE_MIN_REPORTS we render NOTHING — `normalizeAggregate`
//     returns `published: false` and the chart shows the honest empty state. A
//     handful of reports is not a representative "street price".
//   • Every surfaced figure is labeled "מבוסס דיווחי משתמשים, לא מחירון רשמי" —
//     reported reality, NOT an official tariff and NOT a promise.
//   • The median is the headline (robust to outliers); the band is min–max of the
//     real reports for full transparency.
// ────────────────────────────────────────────────────────────────────────────

import { CATEGORY_HE } from "./categories";

/** Categories a street-price report may be filed under (mirrors the catalogue). */
export const STREET_PRICE_CATEGORIES = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
] as const;

export type StreetPriceCategory = (typeof STREET_PRICE_CATEGORIES)[number];

/** True when `v` is one of the supported street-price categories. */
export function isStreetPriceCategory(v: unknown): v is StreetPriceCategory {
  return (
    typeof v === "string" &&
    (STREET_PRICE_CATEGORIES as readonly string[]).includes(v)
  );
}

/**
 * Minimum number of REAL (distinct-reporter, approved) reports before any
 * aggregate is published. MUST stay equal to the DB's
 * get_street_price() v_min_reports and the Edge fn's STREET_PRICE_MIN_REPORTS
 * (supabase/functions/street-price/lib.ts) — the DB is the source of truth for
 * what the aggregate returns; this constant only drives the "X more reports
 * needed" copy. A test pins the value.
 */
export const STREET_PRICE_MIN_REPORTS = 5;

/**
 * Plausible monthly-bill band for a CLIENT-SIDE submit guard, in ₪. The
 * authoritative bounds + nuanced screen live in the Edge fn (MIN_REPORTED_PRICE /
 * MAX_REPORTED_PRICE + the catalogue-ratio screen); these mirror its absolute
 * floor/ceiling so the page can reject obvious junk before a round-trip.
 */
export const SUBMIT_PRICE_MIN = 5;
export const SUBMIT_PRICE_MAX = 100000;

// ── The aggregate the chart renders ───────────────────────────────────────────
/**
 * One published street-price aggregate for a category — the honest shape
 * <StreetPriceChart> renders. When `published` is false the chart renders the
 * empty state; the price figures are all 0 in that case (the RPC returns nulls
 * below threshold and we normalise them to 0 + published:false).
 */
export interface StreetPriceAggregate {
  /** Category bucket. */
  category: StreetPriceCategory;
  /** Hebrew category label. */
  categoryHe: string;
  /** True ONLY when `count` clears {@link STREET_PRICE_MIN_REPORTS}. */
  published: boolean;
  /** # of distinct-reporter approved reports backing this slice. */
  count: number;
  /** Headline median monthly price (₪). 0 when unpublished. */
  median: number;
  /** Mean monthly price (₪). 0 when unpublished. */
  avg: number;
  /** Hard minimum reported (₪). 0 when unpublished. */
  min: number;
  /** Hard maximum reported (₪). 0 when unpublished. */
  max: number;
  /** The publish threshold applied, echoed so the UI labels honestly. */
  threshold: number;
}

/** Coerce an unknown to a finite, non-negative integer (else 0). */
function nat(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Normalise ONE get_street_price()-style aggregate row (per category) into the
 * clean {@link StreetPriceAggregate} the chart renders. Defensive: a row whose
 * price figures are null (the RPC's below-threshold signal) — or whose count is
 * below the threshold — collapses to `published: false` with zeroed figures, so
 * the chart can never render a misleading sub-threshold band. Never throws.
 *
 * The RPC returns snake_case (`report_count`/`median_price`/…); we also accept the
 * camelCase forms so the same normaliser works in tests with hand-built rows.
 *
 * @param category the category this row is for.
 * @param row the raw aggregate (or null/undefined → unpublished).
 * @param minReports override the publish threshold (defaults to the honesty gate).
 */
export function normalizeAggregate(
  category: StreetPriceCategory,
  row: unknown,
  minReports: number = STREET_PRICE_MIN_REPORTS,
): StreetPriceAggregate {
  const categoryHe = CATEGORY_HE[category] ?? category;
  const threshold = Math.max(1, minReports);
  const empty: StreetPriceAggregate = {
    category,
    categoryHe,
    published: false,
    count: 0,
    median: 0,
    avg: 0,
    min: 0,
    max: 0,
    threshold,
  };
  if (!row || typeof row !== "object") return empty;

  const r = row as Record<string, unknown>;
  const count = nat(r.report_count ?? r.count ?? r.n);
  const median = nat(r.median_price ?? r.typical_price ?? r.median);
  const avg = nat(r.avg_price ?? r.avg);
  const min = nat(r.min_price ?? r.min);
  const max = nat(r.max_price ?? r.max);

  // Publish ONLY when the count clears the threshold AND the RPC actually returned
  // a real median (it nulls every price below threshold → median normalises to 0).
  const published = count >= threshold && median > 0;
  if (!published) return { ...empty, count };

  return {
    category,
    categoryHe,
    published: true,
    count,
    median,
    avg,
    min,
    max,
    threshold,
  };
}

// ── Submission guard (client-side; Edge fn is authoritative) ──────────────────
/** A clean, validated submission the page is about to POST. */
export interface StreetPriceSubmission {
  category: StreetPriceCategory;
  provider: string;
  reported_price: number;
  plan_id?: string;
}

/** The verdict of the client-side submit guard. */
export type SubmitValidation =
  | { ok: true; submission: StreetPriceSubmission }
  | { ok: false; error: string };

/** Coerce a value to a positive integer price, or undefined. */
export function parsePrice(v: unknown): number | undefined {
  const n =
    typeof v === "string" ? Number(String(v).replace(/[^\d.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.round(n)
    : undefined;
}

/** Normalise a free-text provider name (trim + collapse inner whitespace). */
export function normalizeProvider(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

/**
 * Client-side guard run BEFORE POSTing a report. Mirrors the Edge fn's parseReport
 * absolute checks so the user gets instant, honest feedback on obvious junk; the
 * Edge function still re-validates + runs the nuanced catalogue-ratio screen (it
 * is the authoritative gate). NEVER fabricates a provider/category.
 */
export function validateSubmission(input: {
  category: unknown;
  provider: unknown;
  reported_price: unknown;
  plan_id?: unknown;
}): SubmitValidation {
  if (!isStreetPriceCategory(input.category)) {
    return {
      ok: false,
      error: "בחרו שירות: סלולר, אינטרנט, טלוויזיה, חבילה משולבת או חו״ל.",
    };
  }
  const provider = normalizeProvider(input.provider);
  if (!provider) {
    return { ok: false, error: "בחרו את הספק שאליו מתייחס הדיווח." };
  }
  const price = parsePrice(input.reported_price);
  if (price === undefined) {
    return { ok: false, error: "הזינו את הסכום החודשי בשקלים." };
  }
  if (price < SUBMIT_PRICE_MIN || price > SUBMIT_PRICE_MAX) {
    return {
      ok: false,
      error: `הסכום חורג מהטווח הסביר (₪${SUBMIT_PRICE_MIN}–₪${SUBMIT_PRICE_MAX}). בדקו ונסו שוב.`,
    };
  }
  const planId =
    typeof input.plan_id === "string" ? input.plan_id.trim().slice(0, 120) : "";
  return {
    ok: true,
    submission: {
      category: input.category,
      provider,
      reported_price: price,
      ...(planId ? { plan_id: planId } : {}),
    },
  };
}

// ── Honest copy ──────────────────────────────────────────────────────────────
/** The mandatory provenance label shown wherever a street-price figure appears. */
export const STREET_PRICE_DISCLAIMER = "מבוסס דיווחי משתמשים, לא מחירון רשמי";

/**
 * How many MORE reports are needed before a category's aggregate publishes — for
 * honest UI copy. Never negative. Mirrors the Edge fn's reportsNeeded().
 */
export function reportsNeeded(currentCount: number): number {
  const have = Number.isFinite(currentCount)
    ? Math.max(0, Math.floor(currentCount))
    : 0;
  return Math.max(0, STREET_PRICE_MIN_REPORTS - have);
}

/**
 * The honest "below threshold" line for a category with too-few reports. Returns
 * the Hebrew copy the UI shows instead of a (misleading) tiny-sample chart.
 */
export function belowThresholdNote(agg: StreetPriceAggregate): string {
  const need = reportsNeeded(agg.count);
  if (agg.count <= 0) {
    return (
      `עדיין אין מספיק דיווחים כדי להציג מחיר רחוב אמין ב${agg.categoryHe} ` +
      `(צריך לפחות ${agg.threshold}). היו הראשונים לדווח כמה אתם משלמים.`
    );
  }
  return (
    `יש ${agg.count} דיווחים ב${agg.categoryHe} — צריך עוד ${need} כדי להציג ` +
    `מחיר רחוב אמין. דווחו כמה אתם משלמים כדי לעזור לכולם.`
  );
}

/** Format an ILS integer for display, he-IL grouped, e.g. 89 → "₪89". */
export function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}
