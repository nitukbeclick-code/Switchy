import '../app_state.dart';
import '../data.dart';
import 'recommendation_engine.dart';

/// The saving opportunity in a single category: what the user pays today and
/// the plan we'd recommend instead.
class CategorySaving {
  const CategorySaving({
    required this.categoryId,
    required this.currentBill,
    required this.best,
  });

  final String categoryId;
  final int currentBill;
  final PlanMatch? best; // our recommended plan for this category, if a bill is set

  int get annualSaving => best?.annualSaving ?? 0;
  bool get hasBill => currentBill > 0;
  bool get hasOpportunity => hasBill && annualSaving > 0;
}

/// A whole-app view of the user's saving potential, aggregated across every
/// category from their current bills and our recommendation engine. Pure and
/// testable — no UI, no navigation.
class SavingsSummary {
  const SavingsSummary({required this.categories});
  final List<CategorySaving> categories;

  /// Total annual ₪ the user could save by switching to our recommended plan
  /// in every category where they've entered a bill.
  int get totalAnnualPotential =>
      categories.fold(0, (s, c) => s + c.annualSaving);

  /// The single category with the largest saving, or null if there is none.
  CategorySaving? get topOpportunity {
    CategorySaving? best;
    for (final c in categories) {
      if (c.annualSaving <= 0) continue;
      if (best == null || c.annualSaving > best.annualSaving) best = c;
    }
    return best;
  }

  bool get hasAnyBill => categories.any((c) => c.hasBill);
  int get opportunityCount => categories.where((c) => c.hasOpportunity).length;
}

/// Compute the savings summary for [s] across all categories.
SavingsSummary computeSavings(AppState s) {
  final out = <CategorySaving>[];
  for (final c in categories) {
    final bill = s.currentBill(c.id);
    PlanMatch? best;
    if (bill > 0) {
      best = RecommendationEngine.bestMatch(MatchProfile(
        category: c.id,
        currentBill: bill,
        priority: priorityFromId(s.quizPriority),
        lines: s.quizLines,
        wants5G: s.wants5G,
        wantsAbroad: s.wantsAbroad,
        wantsNoCommit: s.wantsNoCommit,
      ));
    }
    out.add(CategorySaving(categoryId: c.id, currentBill: bill, best: best));
  }
  return SavingsSummary(categories: out);
}
