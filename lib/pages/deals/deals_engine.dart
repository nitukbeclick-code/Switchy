import '../../models.dart';
import '../../data.dart';
import '../../services/backend/backend.dart';

/// A real, catalogue-grounded price drop: a plan whose latest snapshot in
/// `plan_price_history` is meaningfully cheaper than a recent earlier snapshot.
///
/// Honest by construction — every field comes from two real snapshot rows of the
/// SAME plan; nothing is estimated. [oldPrice] → [newPrice] is the actual move,
/// [plan] is the live catalogue row (null when the snapshot's plan id is no
/// longer in the catalogue — such drops are dropped, never rendered against a
/// guessed plan).
class PriceDrop {
  const PriceDrop({
    required this.planId,
    required this.category,
    required this.provider,
    required this.oldPrice,
    required this.newPrice,
    required this.capturedAt,
    required this.plan,
  });

  final String planId;
  final String category;
  final String provider;
  final double oldPrice;
  final double newPrice;
  final DateTime capturedAt;

  /// The live catalogue plan this drop is for, when it still exists.
  final Plan? plan;

  /// Absolute monthly drop in ₪ (always > 0 for a [PriceDrop]).
  double get dropAmount => oldPrice - newPrice;

  /// Drop as a fraction of the old price (0..1). 0 when [oldPrice] is 0.
  double get dropPct => oldPrice <= 0 ? 0 : dropAmount / oldPrice;

  /// Whole-percent drop for display (e.g. 18 for an 18% cut).
  int get dropPctRounded => (dropPct * 100).round();

  /// Estimated annual saving vs. the old price — the honest "₪X/year" headline.
  int get annualSaving => (dropAmount * 12).round();
}

/// Pure engine that turns raw `plan_price_history` snapshots into a ranked list
/// of honest price drops. No Flutter, no I/O, no AppState — fed the exact list
/// [Backend.fetchPriceSnapshots] returns, so it unit-tests without a widget.
///
/// Honesty contract:
///  * A drop is only emitted when a plan has ≥2 snapshots and the latest is
///    cheaper than an earlier one by at least [minDropAmount] AND [minDropPct]
///    (so a ₪0.50 rounding wiggle never reads as a "deal").
///  * The two snapshots compared are the plan's newest and the most recent
///    earlier snapshot whose price differs — we never invent a baseline.
///  * Drops for plans no longer in the catalogue ([planById] == null) are
///    dropped rather than shown against a fabricated plan.
class DealsEngine {
  const DealsEngine._();

  /// Minimum absolute monthly drop (₪) to count as a deal — filters rounding
  /// noise and trivial ₪1 nudges.
  static const double minDropAmount = 2.0;

  /// Minimum relative drop (fraction) to count — a ₪2 cut on a ₪400 plan isn't
  /// a "deal", a ₪2 cut on a ₪20 plan is.
  static const double minDropPct = 0.03;

  /// Compute the ranked price drops from [snapshots] (any order). Newest drop
  /// per plan wins; the result is sorted by [PriceDrop.dropPct] descending
  /// (biggest relative cut first), then by [PriceDrop.dropAmount].
  static List<PriceDrop> dropsFrom(List<PriceSnapshot> snapshots) {
    // Group by plan id, newest snapshot first.
    final byPlan = <String, List<PriceSnapshot>>{};
    for (final s in snapshots) {
      if (s.planId.isEmpty || s.price <= 0) continue;
      (byPlan[s.planId] ??= []).add(s);
    }

    final drops = <PriceDrop>[];
    for (final entry in byPlan.entries) {
      final list = entry.value
        ..sort((a, b) => b.capturedAt.compareTo(a.capturedAt));
      if (list.length < 2) continue;
      final latest = list.first;

      // The baseline is the most recent EARLIER snapshot whose price differs —
      // so a flat run of equal snapshots doesn't hide a real earlier move, and a
      // single unchanged snapshot doesn't fabricate a drop.
      PriceSnapshot? baseline;
      for (var i = 1; i < list.length; i++) {
        if (list[i].price != latest.price) {
          baseline = list[i];
          break;
        }
      }
      if (baseline == null) continue;
      if (baseline.price <= latest.price) continue; // a rise / no drop

      final dropAmount = baseline.price - latest.price;
      final dropPct = dropAmount / baseline.price;
      if (dropAmount < minDropAmount || dropPct < minDropPct) continue;

      final plan = planById(latest.planId);
      if (plan == null) continue; // never render against a guessed plan

      drops.add(PriceDrop(
        planId: latest.planId,
        category: latest.category,
        provider: latest.provider,
        oldPrice: baseline.price,
        newPrice: latest.price,
        capturedAt: latest.capturedAt,
        plan: plan,
      ));
    }

    drops.sort((a, b) {
      final byPct = b.dropPct.compareTo(a.dropPct);
      if (byPct != 0) return byPct;
      return b.dropAmount.compareTo(a.dropAmount);
    });
    return drops;
  }
}
