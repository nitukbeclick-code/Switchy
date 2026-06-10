import '../app_state.dart';
import '../data.dart';
import '../models.dart' show Plan;
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

  /// Only the categories where there is a real, positive saving opportunity,
  /// largest first — the slices that make up the potential-saving donut. Pure;
  /// derived entirely from [categories], so it never invents a figure.
  List<CategorySaving> get opportunities {
    final list = categories.where((c) => c.hasOpportunity).toList()
      ..sort((a, b) => b.annualSaving.compareTo(a.annualSaving));
    return list;
  }
}

/// Fallback annual saving credited when a lead is submitted for a plan whose
/// computed yearly saving is not positive (e.g. the user hasn't entered a real
/// bill yet, so [planSaveYear] returns 0). It is a deliberately modest, generic
/// "you probably saved something" estimate — roughly ₪45/month — used only to
/// give the lead-submission flow a non-zero figure to celebrate.
const int kDefaultLeadSavingFallback = 540;

/// The annual ₪ saving to credit a user's running total when they submit a lead
/// for [plan] against their [bill] for that category. Uses the real computed
/// [planSaveYear] when it is positive; otherwise falls back to
/// [kDefaultLeadSavingFallback]. Pure — no AppState, no persistence.
int savingsCreditedOnLead(Plan? plan, int bill) {
  final save = plan != null ? planSaveYear(plan, bill) : 0;
  return save > 0 ? save : kDefaultLeadSavingFallback;
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
