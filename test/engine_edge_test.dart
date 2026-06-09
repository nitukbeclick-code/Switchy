import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/recommendation_engine.dart';

/// Edge-case coverage for the recommendation engine that the main
/// recommendation_engine_test.dart does not already assert: the additive
/// over-budget *score penalty* (distinct from the caveat), the flexibility
/// *priority* (not just the wantsNoCommit bonus), abroad-category scoring, and
/// the 'מחיר מבצע' promo caveat. Pure logic — no widgets, no AppState.
void main() {
  group('budget penalty', () {
    test('an over-budget plan scores strictly lower than with no budget ceiling', () {
      // The priciest cellular plan, with a budget well under its price, must be
      // dragged down by the additive `score -= (over*40)` penalty.
      final pricey = plansByCat('cellular').reduce((a, b) => a.price > b.price ? a : b);
      final overBudget = MatchProfile(
        category: 'cellular',
        currentBill: 200,
        budget: (pricey.price * 0.5).round(),
      );
      const noCeiling = MatchProfile(category: 'cellular', currentBill: 200);

      final withPenalty = RecommendationEngine.scorePlan(pricey, overBudget).score;
      final without = RecommendationEngine.scorePlan(pricey, noCeiling).score;
      expect(withPenalty, lessThan(without));
    });

    test('deeper over-budget overrun never pushes the score below 0', () {
      final pricey = plansByCat('cellular').reduce((a, b) => a.price > b.price ? a : b);
      // Absurdly low budget — the penalty is clamped, score floored at 0.
      final m = RecommendationEngine.scorePlan(
        pricey,
        const MatchProfile(category: 'cellular', currentBill: 200, budget: 1),
      );
      expect(m.score, inInclusiveRange(0, 100));
    });
  });

  group('flexibility priority', () {
    test('flexibility priority rewards a no-commit plan more than price priority does', () {
      final noCommit = plansByCat('cellular').where((p) => p.noCommit).firstOrNull;
      final committed = plansByCat('cellular').where((p) => !p.noCommit).firstOrNull;
      if (noCommit == null || committed == null) return; // nothing to compare

      double gap(MatchPriority pr) =>
          RecommendationEngine.scorePlan(
                  noCommit, MatchProfile(category: 'cellular', currentBill: 120, priority: pr))
              .score -
          RecommendationEngine.scorePlan(
                  committed, MatchProfile(category: 'cellular', currentBill: 120, priority: pr))
              .score;

      // The flex sub-score (1.0 vs 0.45) carries far more weight under
      // flexibility than under price, so the no-commit advantage widens.
      expect(gap(MatchPriority.flexibility), greaterThan(gap(MatchPriority.price)));
    });
  });

  group('abroad scoring', () {
    test('ranks abroad plans, every score within 0..100, best-first', () {
      const profile = MatchProfile(
        category: 'abroad',
        currentBill: 50,
        budget: 60,
        priority: MatchPriority.price,
      );
      final ranked = RecommendationEngine.rank(profile);
      expect(ranked, isNotEmpty);
      for (var i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i].score, greaterThanOrEqualTo(ranked[i + 1].score));
      }
      for (final m in ranked) {
        expect(m.score, inInclusiveRange(0, 100));
      }
    });

    test('an abroad-capable plan does not earn the "כולל גלישה בחו״ל" reason in the abroad category', () {
      final abroadPlan = plansByCat('abroad').where((p) => p.hasAbroad).firstOrNull;
      if (abroadPlan == null) return;
      const profile = MatchProfile(category: 'abroad', currentBill: 50);
      final m = RecommendationEngine.scorePlan(abroadPlan, profile);
      // The reason is suppressed inside the abroad category (it'd be redundant).
      expect(m.reasons.any((r) => r.contains('כולל גלישה בחו')), isFalse);
    });
  });

  group('promo caveat', () {
    test('a promo plan carries the "מחיר מבצע" caveat naming the after-price', () {
      // Synthesize a plan with a clear promo so we test the engine, not the
      // catalogue: price now < price later.
      const promo = Plan(
        id: 'test_promo',
        cat: 'cellular',
        provider: 'בדיקה',
        net: '5g',
        plan: 'מבצע',
        price: 30,
        after: 70,
      );
      expect(promo.hasPromo, isTrue);
      final m = RecommendationEngine.scorePlan(promo, const MatchProfile(category: 'cellular'));
      expect(m.caveats.any((c) => c.contains('מחיר מבצע')), isTrue);
      expect(m.caveats.any((c) => c.contains('70')), isTrue);
    });

    test('a non-promo plan has no "מחיר מבצע" caveat', () {
      const flat = Plan(
        id: 'test_flat',
        cat: 'cellular',
        provider: 'בדיקה',
        net: '5g',
        plan: 'קבוע',
        price: 50,
        after: null,
      );
      expect(flat.hasPromo, isFalse);
      final m = RecommendationEngine.scorePlan(flat, const MatchProfile(category: 'cellular'));
      expect(m.caveats.any((c) => c.contains('מחיר מבצע')), isFalse);
    });
  });

  group('score bounds across profiles', () {
    test('every score stays within 0..100 for varied budgets and priorities', () {
      for (final cat in ['cellular', 'internet', 'tv', 'triple', 'abroad']) {
        for (final pr in MatchPriority.values) {
          for (final budget in [0, 10, 9999]) {
            final ranked = RecommendationEngine.rank(
                MatchProfile(category: cat, currentBill: 130, budget: budget, priority: pr));
            for (final m in ranked) {
              expect(m.score, inInclusiveRange(0, 100));
            }
          }
        }
      }
    });
  });
}
