import { describe, it, expect } from "vitest";
import {
  computeWeeklyDrop,
  dropBadgeLabel,
  DROP_MIN_ABS,
  DROP_MIN_PCT,
  type PricePoint,
} from "@/lib/price-history";

// ────────────────────────────────────────────────────────────────────────────
// lib/price-history.ts — the HONESTY gate for surfacing a price drop. The rule:
// a drop is returned ONLY when a real week-over-week decrease clears EITHER the
// absolute floor (≥ ₪5) OR the relative one (≥ 10%); price rises, flat prices,
// and thin history all return null (so the UI renders nothing). These tests pin
// every branch of that rule with synthetic-but-realistic snapshot series.
// ────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

/** Build a snapshot N days before `ref` (default: now). */
function pt(price: number, daysAgo: number, ref = Date.now()): PricePoint {
  return { price, capturedAt: new Date(ref - daysAgo * DAY).toISOString() };
}

describe("computeWeeklyDrop — thresholds", () => {
  it("returns null when there is fewer than two snapshots", () => {
    expect(computeWeeklyDrop([])).toBeNull();
    expect(computeWeeklyDrop([pt(99, 0)])).toBeNull();
  });

  it("surfaces a drop clearing the absolute floor (≥ ₪5)", () => {
    // 120 → 113 = ₪7 (clears ₪5) but only 5.8% (below 10%).
    const drop = computeWeeklyDrop([pt(120, 7), pt(113, 0)]);
    expect(drop).not.toBeNull();
    expect(drop!.from).toBe(120);
    expect(drop!.to).toBe(113);
    expect(drop!.amount).toBe(7);
    expect(drop!.pct).toBe(6); // rounded 5.83%
  });

  it("surfaces a drop clearing the relative floor (≥ 10%) even if under ₪5", () => {
    // 30 → 27 = ₪3 (below ₪5) but 10% (clears the relative floor).
    const drop = computeWeeklyDrop([pt(30, 7), pt(27, 0)]);
    expect(drop).not.toBeNull();
    expect(drop!.amount).toBe(3);
    expect(drop!.pct).toBe(10);
  });

  it("returns null for a drop that clears NEITHER floor", () => {
    // 50 → 47 = ₪3 (below ₪5) and 6% (below 10%).
    expect(computeWeeklyDrop([pt(50, 7), pt(47, 0)])).toBeNull();
  });

  it("returns null for a price RISE", () => {
    expect(computeWeeklyDrop([pt(80, 7), pt(95, 0)])).toBeNull();
  });

  it("returns null when the price is flat", () => {
    expect(computeWeeklyDrop([pt(60, 7), pt(60, 0)])).toBeNull();
  });
});

describe("computeWeeklyDrop — baseline selection", () => {
  it("compares the latest snapshot to the one closest to ~7 days earlier", () => {
    // Latest 100; candidates at 6d (110) and 9d (130). 6d is closer to the
    // 7-day target, so baseline = 110, drop = ₪10 (10%).
    const drop = computeWeeklyDrop([pt(130, 9), pt(110, 6), pt(100, 0)]);
    expect(drop).not.toBeNull();
    expect(drop!.from).toBe(110);
    expect(drop!.amount).toBe(10);
  });

  it("ignores snapshots not strictly older than the latest", () => {
    // Only one snapshot exists before 'now' → no eligible baseline.
    expect(computeWeeklyDrop([pt(100, 0)])).toBeNull();
  });

  it("is order-independent (sorts defensively)", () => {
    const series = [pt(100, 0), pt(120, 7), pt(118, 3)];
    const a = computeWeeklyDrop(series);
    const b = computeWeeklyDrop([...series].reverse());
    expect(a).toEqual(b);
    expect(a!.from).toBe(120); // 7d baseline, latest 100 → ₪20 (16.7%)
    expect(a!.to).toBe(100);
  });
});

describe("computeWeeklyDrop — bad data is ignored, never fabricated", () => {
  it("drops non-finite / non-positive prices and unparseable timestamps", () => {
    const dirty: PricePoint[] = [
      { price: Number.NaN, capturedAt: new Date(Date.now() - 7 * DAY).toISOString() },
      { price: 0, capturedAt: new Date(Date.now() - 6 * DAY).toISOString() },
      { price: 120, capturedAt: "not-a-date" },
      pt(120, 7),
      pt(100, 0),
    ];
    const drop = computeWeeklyDrop(dirty);
    expect(drop).not.toBeNull();
    expect(drop!.from).toBe(120);
    expect(drop!.to).toBe(100);
  });
});

describe("dropBadgeLabel + exported thresholds", () => {
  it("renders the Hebrew weekly-drop copy with the shekel amount", () => {
    const drop = computeWeeklyDrop([pt(120, 7), pt(100, 0)])!;
    expect(dropBadgeLabel(drop)).toBe("ירד ₪20 השבוע");
  });

  it("keeps one decimal for fractional amounts", () => {
    const drop = computeWeeklyDrop([pt(100, 7), pt(92.5, 0)])!;
    expect(dropBadgeLabel(drop)).toBe("ירד ₪7.5 השבוע");
  });

  it("exposes the canonical thresholds", () => {
    expect(DROP_MIN_ABS).toBe(5);
    expect(DROP_MIN_PCT).toBe(10);
  });
});
