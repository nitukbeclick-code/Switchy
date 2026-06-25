// ────────────────────────────────────────────────────────────────────────────
// Price-history domain — the SINGLE, pure, tested place that decides whether a
// real week-over-week price drop is worth surfacing. Pulled out of the API route
// so the honesty rule is unit-testable without a DB or a browser, and so the
// route + badge can never drift from it.
//
// E-E-A-T / HONESTY: a drop is surfaced ONLY when it is REAL and material:
//   • compares the latest snapshot to the snapshot closest to ~7 days earlier
//     (the "baseline"), within the available history, and
//   • the decrease clears EITHER an absolute floor (≥ ₪5) OR a relative one
//     (≥ 10%).
// Anything that doesn't clear a threshold — including price RISES, flat prices,
// or too-thin history — returns null, and the UI then renders nothing. No
// fabricated drops, no manufactured urgency.
// ────────────────────────────────────────────────────────────────────────────

/** A single price snapshot for a plan (ascending-by-time when in a series). */
export interface PricePoint {
  /** Snapshot price in ILS (₪). */
  price: number;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
}

/** A surfaced, honest week-over-week price drop. All amounts in ILS (₪). */
export interface PriceDrop {
  /** The earlier (baseline) price we compared against. */
  from: number;
  /** The latest price. */
  to: number;
  /** Positive shekel decrease (from − to), rounded to 1 decimal. */
  amount: number;
  /** Percentage decrease, 0–100, rounded to a whole number. */
  pct: number;
  /** ISO timestamp of the baseline snapshot. */
  baselineAt: string;
  /** ISO timestamp of the latest snapshot. */
  latestAt: string;
}

/** Minimum absolute decrease (₪) to surface a drop. */
export const DROP_MIN_ABS = 5;
/** Minimum relative decrease (%) to surface a drop. */
export const DROP_MIN_PCT = 10;

/** The target baseline age, in days, for a "weekly" comparison. */
const WEEK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse an ISO timestamp to epoch ms; NaN when unparseable. */
function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Choose the baseline snapshot to compare the latest price against: the snapshot
 * whose age is closest to ~7 days before the latest one, considering only
 * snapshots STRICTLY OLDER than the latest. Returns null when there's no eligible
 * earlier snapshot.
 */
function pickBaseline(
  sorted: PricePoint[],
  latestMs: number,
): PricePoint | null {
  const targetMs = latestMs - WEEK_DAYS * DAY_MS;
  let best: PricePoint | null = null;
  let bestDist = Infinity;
  for (const p of sorted) {
    const t = ms(p.capturedAt);
    if (!Number.isFinite(t) || t >= latestMs) continue; // must be strictly earlier
    const dist = Math.abs(t - targetMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/**
 * Compute the honest week-over-week drop for a plan's snapshots, or null when
 * there is no REAL qualifying drop. Pure: no I/O, no clock dependence beyond the
 * timestamps in the data.
 *
 * @param points snapshots in any order (we sort defensively).
 */
export function computeWeeklyDrop(points: PricePoint[]): PriceDrop | null {
  // Keep only well-formed points, then sort ascending by capture time.
  const clean = points
    .filter(
      (p) =>
        p &&
        Number.isFinite(p.price) &&
        p.price > 0 &&
        Number.isFinite(ms(p.capturedAt)),
    )
    .slice()
    .sort((a, b) => ms(a.capturedAt) - ms(b.capturedAt));

  if (clean.length < 2) return null; // need at least a baseline + a latest

  const latest = clean[clean.length - 1];
  const latestMs = ms(latest.capturedAt);
  const baseline = pickBaseline(clean, latestMs);
  if (!baseline) return null;

  const from = baseline.price;
  const to = latest.price;
  const amount = from - to;
  if (amount <= 0) return null; // not a drop (rise or flat)

  const pct = (amount / from) * 100;
  // Material? Clear EITHER the absolute OR the relative floor.
  if (amount < DROP_MIN_ABS && pct < DROP_MIN_PCT) return null;

  return {
    from,
    to,
    amount: Math.round(amount * 10) / 10,
    pct: Math.round(pct),
    baselineAt: baseline.capturedAt,
    latestAt: latest.capturedAt,
  };
}

/** Hebrew badge copy for a surfaced drop, e.g. "ירד ₪12 השבוע". */
export function dropBadgeLabel(drop: PriceDrop): string {
  const amount = Number.isInteger(drop.amount)
    ? String(drop.amount)
    : drop.amount.toFixed(1);
  return `ירד ₪${amount} השבוע`;
}
