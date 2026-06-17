// ── Plan price history (synthetic, deterministic) ────────────────────────────
//
// The app doesn't (yet) persist a real per-plan price ledger, so the price
// sparkline draws a *deterministic* synthetic 30-day series derived purely from
// the plan's current price + a stable pseudo-pattern seeded by the planId hash.
//
// Determinism is the whole point: given the same (planId, basePrice) the series
// is byte-for-byte identical on every call, on every device, forever. That is
// what lets the widget render without a network round-trip AND lets the unit
// tests assert exact min/max/current values. There is intentionally **no**
// `Random` and **no** `DateTime.now()` inside the generator — the caller passes
// an `anchor` index so even the timestamps are reproducible in tests.

import 'dart:math' as math;

/// A single point on a plan's price timeline.
class PricePoint {
  final DateTime ts;
  final int price;
  const PricePoint(this.ts, this.price);
}

/// Deterministic price-history generator + small reductions over a series.
///
/// Everything here is pure: no I/O, no globals, no clock. Render its output,
/// don't re-derive it.
class PlanHistory {
  PlanHistory._();

  /// Number of points in a generated series (one per day, ~30 days back).
  static const int days = 30;

  /// A stable, platform-independent 32-bit hash of [planId]. We avoid
  /// `String.hashCode` because it is *not* guaranteed stable across runs/VMs;
  /// this FNV-1a variant always yields the same value for the same string, so
  /// the generated series is reproducible in tests and in production.
  static int seedFor(String planId) {
    var hash = 0x811c9dc5; // FNV offset basis
    for (final unit in planId.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0x7fffffff; // FNV prime, kept positive
    }
    return hash;
  }

  /// Builds a deterministic 30-point series ending at [anchor].
  ///
  /// - [basePrice] is the plan's *current* price; it is the value of the **last**
  ///   point (`anchor`), so the sparkline always lands on today's real figure.
  /// - [planId] seeds a fixed pseudo-pattern (a couple of out-of-phase sine
  ///   waves) so each plan has its own believable shape that never changes.
  /// - [anchor] is the index/day of "today". The i-th point's timestamp is
  ///   `anchor - (days-1-i)` days, expressed against a fixed epoch so tests can
  ///   pin exact `DateTime`s without touching the wall clock.
  ///
  /// The result always has length [days]; prices are clamped to a sane floor of
  /// 1 (a plan never costs ₪0 here) so min/max stay meaningful.
  static List<PricePoint> generate({
    required String planId,
    required int basePrice,
    required int anchor,
  }) {
    final seed = seedFor(planId);
    // Two seeded constants drive amplitude + phase — small, price-relative
    // swings so the line looks like a real promo history, not noise.
    final amplitude = 2 + (seed % 5); // ₪2..₪6 of swing
    final phase = (seed % 360) * (math.pi / 180.0);
    final base = basePrice < 1 ? 1 : basePrice;

    // Fixed epoch — arbitrary but constant, so timestamps are reproducible.
    final epoch = DateTime.utc(2020, 1, 1);

    final points = <PricePoint>[];
    for (var i = 0; i < days; i++) {
      // Distance (in days) of this point *before* the anchor; the last point
      // (i == days-1) is the anchor itself and must equal basePrice exactly.
      final back = days - 1 - i;
      final dayIndex = anchor - back;
      final ts = epoch.add(Duration(days: dayIndex));

      int price;
      if (back == 0) {
        price = base; // today is the real current price, unmodified
      } else {
        // Deterministic offset: a slow sine + a faster sine, both seeded.
        final t = i.toDouble();
        final wave = math.sin(t / 4.0 + phase) * amplitude +
            math.sin(t / 9.0 + phase / 2) * (amplitude / 2);
        price = (base + wave).round();
        if (price < 1) price = 1;
      }
      points.add(PricePoint(ts, price));
    }
    return points;
  }

  /// The lowest price across [series] (0 when empty).
  static int minPrice(List<PricePoint> series) {
    if (series.isEmpty) return 0;
    return series.map((p) => p.price).reduce(math.min);
  }

  /// The highest price across [series] (0 when empty).
  static int maxPrice(List<PricePoint> series) {
    if (series.isEmpty) return 0;
    return series.map((p) => p.price).reduce(math.max);
  }

  /// The most recent (last) price in [series] (0 when empty).
  static int current(List<PricePoint> series) {
    if (series.isEmpty) return 0;
    return series.last.price;
  }
}
