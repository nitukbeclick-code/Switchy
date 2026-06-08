import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/recommendation_engine.dart';

void main() {
  group('priorityFromId', () {
    test('maps known ids', () {
      expect(priorityFromId('price'), MatchPriority.price);
      expect(priorityFromId('speed'), MatchPriority.speed);
      expect(priorityFromId('coverage'), MatchPriority.coverage);
      expect(priorityFromId('service'), MatchPriority.service);
      expect(priorityFromId('flexibility'), MatchPriority.flexibility);
      expect(priorityFromId('nocommit'), MatchPriority.flexibility);
    });
    test('falls back to price for unknown', () {
      expect(priorityFromId('whatever'), MatchPriority.price);
    });
  });

  group('rank', () {
    test('returns a non-empty, score-descending ranking for cellular', () {
      const profile = MatchProfile(category: 'cellular', currentBill: 119, budget: 90);
      final ranked = RecommendationEngine.rank(profile);
      expect(ranked, isNotEmpty);
      for (var i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i].score, greaterThanOrEqualTo(ranked[i + 1].score));
      }
    });

    test('every score is within 0..100', () {
      for (final cat in ['cellular', 'internet', 'tv', 'triple', 'abroad']) {
        final ranked = RecommendationEngine.rank(MatchProfile(category: cat, currentBill: 120));
        for (final m in ranked) {
          expect(m.score, inInclusiveRange(0, 100));
          expect(m.scorePct, inInclusiveRange(0, 100));
        }
      }
    });

    test('respects the limit', () {
      const profile = MatchProfile(category: 'cellular', currentBill: 119);
      final top3 = RecommendationEngine.rank(profile, limit: 3);
      expect(top3.length, lessThanOrEqualTo(3));
    });

    test('unknown category yields an empty ranking and null best match', () {
      const profile = MatchProfile(category: 'does_not_exist');
      expect(RecommendationEngine.rank(profile), isEmpty);
      expect(RecommendationEngine.bestMatch(profile), isNull);
    });

    test('bestMatch equals the first ranked entry', () {
      const profile = MatchProfile(category: 'internet', currentBill: 140, budget: 120);
      final best = RecommendationEngine.bestMatch(profile);
      final first = RecommendationEngine.rank(profile, limit: 1).first;
      expect(best, isNotNull);
      expect(best!.plan.id, equals(first.plan.id));
    });
  });

  group('scorePlan', () {
    test('annualSaving matches planSaveYear when a bill is set, 0 when unknown', () {
      final plan = plansByCat('cellular').first;
      const withBill = MatchProfile(category: 'cellular', currentBill: 150);
      const noBill = MatchProfile(category: 'cellular', currentBill: 0);
      expect(RecommendationEngine.scorePlan(plan, withBill).annualSaving,
          equals(planSaveYear(plan, 150)));
      expect(RecommendationEngine.scorePlan(plan, noBill).annualSaving, equals(0));
    });

    test('a saving produces a Hebrew saving reason', () {
      // Pick the cheapest cellular plan so a saving exists against a high bill.
      final cheap = plansByCat('cellular').reduce((a, b) => a.price < b.price ? a : b);
      const profile = MatchProfile(category: 'cellular', currentBill: 200);
      final m = RecommendationEngine.scorePlan(cheap, profile);
      expect(m.annualSaving, greaterThan(0));
      expect(m.reasons.any((r) => r.contains('חוסך') && r.contains('בשנה')), isTrue);
    });

    test('an over-budget plan is flagged with a caveat', () {
      final pricey = plansByCat('cellular').reduce((a, b) => a.price > b.price ? a : b);
      final profile = MatchProfile(category: 'cellular', budget: pricey.price - 10);
      final m = RecommendationEngine.scorePlan(pricey, profile);
      expect(m.caveats.any((c) => c.contains('מעל התקציב')), isTrue);
    });

    test('a no-commitment plan earns the flexibility reason', () {
      final flexible = plansByCat('cellular').where((p) => p.noCommit).toList();
      if (flexible.isNotEmpty) {
        const profile = MatchProfile(category: 'cellular', currentBill: 100);
        final m = RecommendationEngine.scorePlan(flexible.first, profile);
        expect(m.reasons.any((r) => r.contains('ללא התחייבות')), isTrue);
      }
    });

    test('label bands reflect the score', () {
      const p = MatchProfile(category: 'cellular', currentBill: 119);
      for (final m in RecommendationEngine.rank(p)) {
        if (m.score >= 85) {
          expect(m.label, 'התאמה מושלמת');
        } else if (m.score >= 70) {
          expect(m.label, 'התאמה מצוינת');
        } else if (m.score >= 55) {
          expect(m.label, 'התאמה טובה');
        } else {
          expect(m.label, 'התאמה סבירה');
        }
      }
    });
  });

  group('priority weighting', () {
    test('service priority rewards a higher-rated plan more than price priority does', () {
      final plans = plansByCat('cellular');
      final cheap = plans.reduce((a, b) => a.price < b.price ? a : b);
      final topRated = plans.reduce((a, b) => a.rating >= b.rating ? a : b);
      // Only meaningful if these are genuinely different plans.
      if (cheap.id != topRated.id && topRated.rating > cheap.rating) {
        const priceProfile = MatchProfile(category: 'cellular', currentBill: 150, priority: MatchPriority.price);
        const serviceProfile = MatchProfile(category: 'cellular', currentBill: 150, priority: MatchPriority.service);

        double gap(Plan a, Plan b, MatchProfile prof) =>
            RecommendationEngine.scorePlan(b, prof).score -
            RecommendationEngine.scorePlan(a, prof).score;

        final priceGap = gap(cheap, topRated, priceProfile);
        final serviceGap = gap(cheap, topRated, serviceProfile);
        // Under "service", the rating advantage should weigh more heavily.
        expect(serviceGap, greaterThan(priceGap));
      }
    });
  });
}
