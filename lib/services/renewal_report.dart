import '../app_state.dart';
import '../models.dart';
import 'recommendation_engine.dart';

/// Builds the "fresh full comparison table" a customer sees when their promo is
/// about to end: every current alternative in their plan's category, ranked,
/// with the annual saving each delivers against what they pay today. Pure and
/// testable — no UI, no navigation.
class RenewalReport {
  RenewalReport._();

  /// A match profile anchored to the tracked plan: the user's *current* price
  /// becomes the bill to beat, so every saving is measured against it. No
  /// budget ceiling — at renewal we want to show the whole market.
  static MatchProfile profileFor(TrackedPlan tp, AppState s) => MatchProfile(
        category: tp.category,
        currentBill: tp.monthlyPrice,
        priority: priorityFromId(s.quizPriority),
        lines: s.quizLines,
        wants5G: s.wants5G,
        wantsAbroad: s.wantsAbroad,
        wantsNoCommit: s.wantsNoCommit,
      );

  /// Ranked alternatives in the tracked plan's category, best match first.
  static List<PlanMatch> alternatives(TrackedPlan tp, AppState s, {int? limit}) =>
      RecommendationEngine.rank(profileFor(tp, s), limit: limit);

  /// The best alternative that actually saves money, or null if nothing beats
  /// the current price.
  static PlanMatch? bestSaver(TrackedPlan tp, AppState s) {
    for (final m in alternatives(tp, s)) {
      if (m.annualSaving > 0) return m;
    }
    return null;
  }

  /// The largest annual saving available (0 if nothing is cheaper).
  static int maxAnnualSaving(TrackedPlan tp, AppState s) =>
      bestSaver(tp, s)?.annualSaving ?? 0;
}
