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
