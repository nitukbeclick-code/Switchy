// ────────────────────────────────────────────────────────────────────────────
// date-range.ts — a tiny rolling-window predicate for the CRM quick-view chips.
// "day" quick-views are rolling windows (last N×24h), not calendar days, so the
// filter is timezone-free and matches whatever crm-api returned. Pure over
// (iso, days, nowMs) so it's unit-testable without a clock.
// ────────────────────────────────────────────────────────────────────────────

/** The quick-view windows offered above the leads table. `all` = no filter. */
export type DateRange = "all" | "1d" | "7d" | "30d";

const RANGE_DAYS: Record<Exclude<DateRange, "all">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

/**
 * True when `iso` falls within the last `range` window relative to `nowMs`.
 * `all` always passes. An absent/unparseable timestamp fails every bounded
 * window (it can't be proven recent) — honest over guessed.
 */
export function withinRange(iso: string | null | undefined, range: DateRange, nowMs: number): boolean {
  if (range === "all") return true;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= RANGE_DAYS[range] * 86_400_000 && t <= nowMs;
}
