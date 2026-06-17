/// Price-target alerts — the pure detection layer for "tell me when this plan
/// reaches my ₪ goal".
///
/// The user sets a per-plan target (a ₪ price) via
/// [AppState.setPriceTarget]; this class answers the only question the
/// notification layer needs: *which targets are currently met?* It deliberately
/// mirrors the shape of `price_change_event.dart` (pure, dependency-light,
/// snapshot-in → ids-out) so the two detections compose without either one
/// re-implementing the other — `price_change_event` compares two snapshots over
/// the *watch* set; this one compares the *current* price against a *target*.
///
/// Keep this free of Flutter / AppState imports so it stays unit-testable.
class PriceTarget {
  const PriceTarget._();

  /// A target is "hit" once the current price has fallen to (or below) the goal.
  /// Boundary is inclusive: reaching the exact target counts as a hit.
  static bool isHit({required int currentPrice, required int targetPrice}) =>
      currentPrice <= targetPrice;

  /// Filters [targets] (plan id → ₪ goal) down to the ids whose *current* price
  /// — resolved on demand via [currentPriceOf] — has reached the goal.
  ///
  /// Pure and order-preserving over [targets]'s iteration order. A plan whose
  /// price can't be resolved should be handled by the caller's
  /// [currentPriceOf] (e.g. return a large sentinel so it never counts as hit).
  static List<String> hitPlanIds({
    required Map<String, int> targets,
    required int Function(String planId) currentPriceOf,
  }) {
    final hits = <String>[];
    for (final entry in targets.entries) {
      if (isHit(
        currentPrice: currentPriceOf(entry.key),
        targetPrice: entry.value,
      )) {
        hits.add(entry.key);
      }
    }
    return hits;
  }

  /// Days the OS-push cadence suppresses re-notifying a *still-met* target.
  /// 'immediate' pushes once at first hit then never again (a continuously-met
  /// target shouldn't re-fire on every app open); 'daily'/'weekly' re-push on
  /// that cadence while the target stays met.
  static int windowDays(String frequency) => switch (frequency) {
        'daily' => 1,
        'weekly' => 7,
        _ => 1 << 30, // 'immediate' (and any unknown): effectively once
      };

  /// Which met targets are due for an OS push *now*, honouring [frequency] via
  /// [lastNotifiedIso] (planId -> ISO timestamp of the last push). A target is
  /// due when it is currently hit AND wasn't pushed within its cadence window.
  /// Pure — returns the plan ids to push; the caller fires + records them.
  static List<String> dueForPush({
    required Map<String, int> targets,
    required int Function(String planId) currentPriceOf,
    required Map<String, String> lastNotifiedIso,
    required String frequency,
    required DateTime now,
  }) {
    final window = windowDays(frequency);
    final due = <String>[];
    for (final entry in targets.entries) {
      if (!isHit(currentPrice: currentPriceOf(entry.key), targetPrice: entry.value)) {
        continue;
      }
      final lastIso = lastNotifiedIso[entry.key];
      if (lastIso != null) {
        final last = DateTime.tryParse(lastIso);
        if (last != null && now.difference(last).inDays < window) continue;
      }
      due.add(entry.key);
    }
    return due;
  }
}
