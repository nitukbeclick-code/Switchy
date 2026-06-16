import '../models.dart';

/// Represents a detected change in a plan's price between two catalogue
/// snapshots. Only price-drop events (newPrice < oldPrice) are surfaced to the
/// user; price rises are recorded but filtered by [detectPriceChanges].
class PriceChangeEvent {
  const PriceChangeEvent({
    required this.planId,
    required this.planName,
    required this.provider,
    required this.oldPrice,
    required this.newPrice,
  });

  final String planId;
  final String planName;
  final String provider;
  final double oldPrice;
  final double newPrice;

  /// Monthly saving (positive when price dropped).
  double get saving => oldPrice - newPrice;

  /// Annual saving (positive when price dropped).
  double get savingAnnual => saving * 12;

  /// True when the new price is lower than the old price.
  bool get isPriceDrop => newPrice < oldPrice;
}

/// Compares two catalogue snapshots and returns [PriceChangeEvent]s for any
/// plan whose price decreased, restricted to the [watchedPlanIds] set.
///
/// - Plans that no longer exist in [newPlans] are ignored.
/// - Plans that are new in [newPlans] (not in [oldPlans]) are ignored.
/// - Only events where [PriceChangeEvent.isPriceDrop] is true are returned.
List<PriceChangeEvent> detectPriceChanges({
  required List<Plan> oldPlans,
  required List<Plan> newPlans,
  required List<String> watchedPlanIds,
}) {
  if (watchedPlanIds.isEmpty) return const [];

  // Index old plans by id for O(1) look-up.
  final oldById = <String, Plan>{for (final p in oldPlans) p.id: p};
  // Restrict to the watch-list set for fast membership check.
  final watched = watchedPlanIds.toSet();

  final events = <PriceChangeEvent>[];
  for (final newPlan in newPlans) {
    if (!watched.contains(newPlan.id)) continue;
    final old = oldById[newPlan.id];
    if (old == null) continue; // new plan — no baseline to compare
    final event = PriceChangeEvent(
      planId: newPlan.id,
      planName: newPlan.plan,
      provider: newPlan.provider,
      oldPrice: old.priceValue,
      newPrice: newPlan.priceValue,
    );
    if (event.isPriceDrop) events.add(event);
  }
  return events;
}

/// Pure decision for the watched-plan price-drop sync. Compares each watched
/// plan's current price to the user's [baseline] (the last price we showed):
///  - a current price below baseline by at least [minSaving] ₪/month → a drop;
///  - a current price above baseline → "recovered" (clear any stale drop);
///  - [newBaseline] is every priced watched plan's current price (store after).
/// A plan with no baseline yet only seeds the baseline — never a drop, so the
/// first observation never spams the user.
({List<PriceChangeEvent> drops, List<String> recovered, Map<String, int> newBaseline})
    watchedDrops({
  required List<Plan> watchedPlans,
  required Map<String, int> baseline,
  int minSaving = 1,
}) {
  final drops = <PriceChangeEvent>[];
  final recovered = <String>[];
  final newBaseline = <String, int>{};
  for (final p in watchedPlans) {
    final current = p.priceValue.round();
    newBaseline[p.id] = current;
    final base = baseline[p.id];
    if (base == null) continue; // first observation — seed baseline only
    if (current < base && (base - current) >= minSaving) {
      drops.add(PriceChangeEvent(
        planId: p.id,
        planName: p.plan,
        provider: p.provider,
        oldPrice: base.toDouble(),
        newPrice: current.toDouble(),
      ));
    } else if (current > base) {
      recovered.add(p.id);
    }
  }
  return (drops: drops, recovered: recovered, newBaseline: newBaseline);
}
