import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/recommendation_engine.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
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

  group('placeholder ratings do not move ranking', () {
    // Every catalogue plan has reviews == 0, so its `rating` field is a
    // fabricated placeholder. The engine must treat it as neutral: a higher
    // placeholder rating may NOT differentiate ranking today.

    test('all catalogue plans are unrated (reviews == 0) — guards the premise', () {
      for (final cat in ['cellular', 'internet', 'tv', 'triple', 'abroad']) {
        for (final p in plansByCat(cat)) {
          expect(p.reviews, 0,
              reason: 'a real review would make `rating` a live signal and '
                  'these honesty assertions would need revisiting');
        }
      }
    });

    // A synthetic, unrated (reviews == 0) cellular plan we fully control.
    Plan cellular({required int price, required double rating}) => Plan(
          id: 'syn_${price}_${rating.toString().replaceAll('.', '')}',
          cat: 'cellular',
          provider: 'בדיקה',
          net: '4G',
          plan: 'מסלול בדיקה',
          price: price,
          rating: rating,
          reviews: 0,
        );

    test('two identical plans differing only in placeholder rating rank equally', () {
      const profile = MatchProfile(category: 'cellular', currentBill: 150);
      // Identical everything but the fabricated rating.
      final low = RecommendationEngine.scorePlan(cellular(price: 59, rating: 3.0), profile);
      final high = RecommendationEngine.scorePlan(cellular(price: 59, rating: 5.0), profile);
      expect(high.score, equals(low.score));
      // …and under every priority — rating is neutral regardless of weighting.
      for (final pr in MatchPriority.values) {
        final prof = MatchProfile(category: 'cellular', currentBill: 150, priority: pr);
        expect(
          RecommendationEngine.scorePlan(cellular(price: 59, rating: 5.0), prof).score,
          equals(RecommendationEngine.scorePlan(cellular(price: 59, rating: 3.0), prof).score),
          reason: 'placeholder rating must not move score under $pr',
        );
      }
    });

    test('a cheaper plan still outranks a higher-rated pricier one', () {
      // Even under "service" — the priority that historically leaned on rating.
      const profile = MatchProfile(
          category: 'cellular', currentBill: 200, priority: MatchPriority.service);
      final cheap = RecommendationEngine.scorePlan(cellular(price: 39, rating: 3.0), profile);
      final pricy = RecommendationEngine.scorePlan(cellular(price: 99, rating: 5.0), profile);
      // The fabricated rating must not let the pricier plan win.
      expect(cheap.score, greaterThan(pricy.score));
    });
  });

  group('needs bonuses', () {
    test('wants5G: 5G plan scores higher with wants5G=true than wants5G=false', () {
      final fivegPlan = plansByCat('cellular').where((p) => p.is5G).firstOrNull;
      if (fivegPlan != null) {
        const profileWith = MatchProfile(
          category: 'cellular',
          currentBill: 120,
          wants5G: true,
        );
        const profileWithout = MatchProfile(
          category: 'cellular',
          currentBill: 120,
          wants5G: false,
        );
        final scoreWith = RecommendationEngine.scorePlan(fivegPlan, profileWith).score;
        final scoreWithout = RecommendationEngine.scorePlan(fivegPlan, profileWithout).score;
        expect(scoreWith, greaterThan(scoreWithout));
      }
    });

    test('wantsNoCommit: no-commit plan scores higher with wantsNoCommit=true than false', () {
      final noCommitPlan = plansByCat('cellular').where((p) => p.noCommit).firstOrNull;
      if (noCommitPlan != null) {
        const profileWith = MatchProfile(
          category: 'cellular',
          currentBill: 120,
          wantsNoCommit: true,
        );
        const profileWithout = MatchProfile(
          category: 'cellular',
          currentBill: 120,
          wantsNoCommit: false,
        );
        final scoreWith = RecommendationEngine.scorePlan(noCommitPlan, profileWith).score;
        final scoreWithout = RecommendationEngine.scorePlan(noCommitPlan, profileWithout).score;
        expect(scoreWith, greaterThan(scoreWithout));
      }
    });

    test('wantsAbroad: abroad-capable plan scores higher with wantsAbroad=true than false', () {
      Plan? abroadPlan;
      for (final cat in ['cellular', 'internet', 'tv', 'triple', 'abroad']) {
        abroadPlan = plansByCat(cat).where((p) => p.hasAbroad).firstOrNull;
        if (abroadPlan != null) break;
      }
      if (abroadPlan != null) {
        final cat = abroadPlan.cat;
        final profileWith = MatchProfile(
          category: cat,
          currentBill: 120,
          wantsAbroad: true,
        );
        final profileWithout = MatchProfile(
          category: cat,
          currentBill: 120,
          wantsAbroad: false,
        );
        final scoreWith = RecommendationEngine.scorePlan(abroadPlan, profileWith).score;
        final scoreWithout = RecommendationEngine.scorePlan(abroadPlan, profileWithout).score;
        expect(scoreWith, greaterThan(scoreWithout));
      }
    });

    test('wants5G does not change score for a non-5G plan', () {
      final nonFivegPlan = plansByCat('cellular').where((p) => !p.is5G).firstOrNull;
      if (nonFivegPlan != null) {
        const profileWith = MatchProfile(
          category: 'cellular',
          currentBill: 120,
          wants5G: true,
        );
        const profileWithout = MatchProfile(
          category: 'cellular',
          currentBill: 120,
          wants5G: false,
        );
        final scoreWith = RecommendationEngine.scorePlan(nonFivegPlan, profileWith).score;
        final scoreWithout = RecommendationEngine.scorePlan(nonFivegPlan, profileWithout).score;
        expect(scoreWith, equals(scoreWithout));
      }
    });
  });

  group('MatchProfile.fromAppState — quiz-budget gating', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      AppState.reset();
    });

    test('budget applies only when the quiz category matches the plan category', () {
      final s = AppState();
      s.setQuizCompleted(true);
      s.setQuizCat('cellular');
      s.setQuizBudget(75);

      // Same category as the completed quiz: budget carries through.
      final cellular = MatchProfile.fromAppState(s, 'cellular');
      expect(cellular.budget, 75);

      // A different category: the quiz budget must NOT leak across categories.
      final internet = MatchProfile.fromAppState(s, 'internet');
      expect(internet.budget, 0);
    });

    test('an incomplete quiz never contributes a budget', () {
      final s = AppState();
      s.setQuizCat('cellular');
      s.setQuizBudget(75);
      // quizCompleted is still false.
      final p = MatchProfile.fromAppState(s, 'cellular');
      expect(p.budget, 0);
    });

    test('carries currentBill, priority and needs straight through', () {
      final s = AppState();
      s.setCurrentBill('cellular', 130);
      s.setQuizPriority('speed');
      s.setQuizLines(3);
      s.setQuizNeeds(wants5G: true, wantsAbroad: true, wantsNoCommit: true);

      final p = MatchProfile.fromAppState(s, 'cellular');
      expect(p.category, 'cellular');
      expect(p.currentBill, 130);
      expect(p.priority, MatchPriority.speed);
      expect(p.lines, 3);
      expect(p.wants5G, isTrue);
      expect(p.wantsAbroad, isTrue);
      expect(p.wantsNoCommit, isTrue);
    });
  });

  group('empty / missing category', () {
    test('every catalogue category ranks without throwing; unknown is empty', () {
      // Guard: real categories produce a ranking, and the unknown one returns
      // an empty list rather than throwing.
      for (final cat in ['cellular', 'internet', 'tv', 'triple', 'abroad']) {
        expect(plansByCat(cat), isNotEmpty, reason: '$cat should exist');
        expect(() => RecommendationEngine.rank(MatchProfile(category: cat)),
            returnsNormally);
      }
      final empty = RecommendationEngine.rank(const MatchProfile(category: 'ghost_cat'));
      expect(empty, isEmpty);
    });

    test('an empty category returns empty rank and a null best match — no throw', () {
      const profile = MatchProfile(category: 'ghost_cat', currentBill: 120, budget: 80);
      expect(() => RecommendationEngine.rank(profile, limit: 5), returnsNormally);
      expect(RecommendationEngine.rank(profile, limit: 5), isEmpty);
      expect(RecommendationEngine.bestMatch(profile), isNull);
    });
  });

  group('PlanMatch.label band cutoffs', () {
    // A synthetic plan whose score we drive purely via its price (no bill, no
    // budget, no bonuses) lets us land scores on either side of each cutoff.
    PlanMatch matchAt(double score) => PlanMatch(
          plan: Plan(
            id: 'lbl_${score.toStringAsFixed(0)}',
            cat: 'cellular',
            provider: 'בדיקה',
            net: '4G',
            plan: 'מסלול בדיקה',
            price: 50,
          ),
          score: score,
          annualSaving: 0,
          reasons: const [],
          caveats: const [],
        );

    test('boundary scores map to the right Hebrew label', () {
      // perfect: score >= 85
      expect(matchAt(85).label, 'התאמה מושלמת');
      expect(matchAt(100).label, 'התאמה מושלמת');
      // excellent: 70 <= score < 85
      expect(matchAt(84.9).label, 'התאמה מצוינת');
      expect(matchAt(70).label, 'התאמה מצוינת');
      // good: 55 <= score < 70
      expect(matchAt(69.9).label, 'התאמה טובה');
      expect(matchAt(55).label, 'התאמה טובה');
      // fair: score < 55
      expect(matchAt(54.9).label, 'התאמה סבירה');
      expect(matchAt(0).label, 'התאמה סבירה');
    });
  });

  group('caveat generation', () {
    // A synthetic plan we fully control, so each caveat trigger is isolated.
    // noCommit is derived from term (term null/0 == no commitment).
    Plan cellular({
      int price = 60,
      int? after,
      int? term,
    }) =>
        Plan(
          id: 'cav_${price}_${after ?? 0}_${term ?? 0}',
          cat: 'cellular',
          provider: 'בדיקה',
          net: '4G',
          plan: 'מסלול בדיקה',
          price: price,
          after: after,
          term: term,
        );

    test('exceeding the budget yields the over-budget caveat with the exact gap', () {
      final plan = cellular(price: 100);
      const profile = MatchProfile(category: 'cellular', budget: 70);
      final m = RecommendationEngine.scorePlan(plan, profile);
      // plan.price (100) - budget (70) == 30.
      expect(m.caveats, contains('₪30 מעל התקציב'));
    });

    test('a promo price yields the "rises later" caveat', () {
      final plan = cellular(price: 40, after: 80);
      const profile = MatchProfile(category: 'cellular');
      final m = RecommendationEngine.scorePlan(plan, profile);
      expect(m.caveats, contains('מחיר מבצע — עולה ל-₪80 בהמשך'));
    });

    test('a committed plan yields the commitment-term caveat', () {
      final plan = cellular(term: 12);
      const profile = MatchProfile(category: 'cellular');
      final m = RecommendationEngine.scorePlan(plan, profile);
      expect(m.caveats, contains('התחייבות ל-12 חודשים'));
    });

    test('a no-commit plan within budget produces none of those caveats', () {
      // No term => noCommit; price under budget; no promo (after omitted).
      final plan = cellular(price: 50);
      const profile = MatchProfile(category: 'cellular', budget: 90);
      final m = RecommendationEngine.scorePlan(plan, profile);
      expect(m.caveats.any((c) => c.contains('מעל התקציב')), isFalse);
      expect(m.caveats.any((c) => c.contains('התחייבות')), isFalse);
      expect(m.caveats.any((c) => c.contains('מחיר מבצע')), isFalse);
    });
  });
}
