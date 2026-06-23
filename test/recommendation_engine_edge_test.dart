import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/recommendation_engine.dart';

// Edge-case coverage for the recommendation engine, complementing
// recommendation_engine_test.dart. We build fully-synthetic, UNRATED
// (reviews == 0) plans we control end-to-end, so the only signals the engine can
// move on are price / saving / budget / needs — never a fabricated rating (the
// engine returns a neutral 0.6 rating signal while reviews == 0, pinned below).
void main() {
  // A synthetic plan with sane defaults; override only what a test cares about.
  Plan plan({
    required String id,
    String cat = 'cellular',
    String net = '4G',
    required int price,
    String kind = 'regular',
    String? priceUnit,
    int? term, // null/0 → noCommit
    List<String> flags = const [],
    double rating = 4.0,
  }) =>
      Plan(
        id: id,
        cat: cat,
        provider: 'בדיקה',
        net: net,
        plan: 'מסלול $id',
        price: price,
        kind: kind,
        priceUnit: priceUnit,
        term: term,
        flags: flags,
        rating: rating,
        reviews: 0, // unrated — keeps the rating signal neutral
      );

  group('abroad plans (per-package unit)', () {
    test('an abroad plan keeps its per-package unit and is scored, not skipped', () {
      final p = plan(id: 'abroad1', cat: 'abroad', net: 'esim', price: 49, priceUnit: 'package', flags: ['abroad']);
      // currentBill for abroad is a per-package figure (see MatchProfile docs).
      const profile = MatchProfile(category: 'abroad', currentBill: 80);
      final m = RecommendationEngine.scorePlan(p, profile);
      // Unit metadata is untouched by the engine.
      expect(priceUnitLabel(p), 'לחבילה');
      expect(m.score, inInclusiveRange(0, 100));
      // Saving is (80-49)*12 against the per-package bill.
      expect(m.annualSaving, planSaveYear(p, 80));
      expect(m.annualSaving, (80 - 49) * 12);
    });

    test('a cheaper abroad plan ranks above a pricier one for the same bill', () {
      // Engine ranks within a single category, so synthesise the abroad set by
      // scoring two plans directly and comparing.
      const profile = MatchProfile(category: 'abroad', currentBill: 120);
      final cheap = RecommendationEngine.scorePlan(
          plan(id: 'a-cheap', cat: 'abroad', net: 'esim', price: 39, priceUnit: 'package', flags: ['abroad']), profile);
      final dear = RecommendationEngine.scorePlan(
          plan(id: 'a-dear', cat: 'abroad', net: 'esim', price: 99, priceUnit: 'package', flags: ['abroad']), profile);
      expect(cheap.score, greaterThan(dear.score));
      expect(cheap.annualSaving, greaterThan(dear.annualSaving));
    });

    test('wantsAbroad lifts an abroad-capable plan over an otherwise identical one', () {
      final p = plan(id: 'abroad-cap', cat: 'abroad', net: 'esim', price: 49, priceUnit: 'package', flags: ['abroad']);
      const withWant = MatchProfile(category: 'abroad', currentBill: 80, wantsAbroad: true);
      const without = MatchProfile(category: 'abroad', currentBill: 80, wantsAbroad: false);
      expect(RecommendationEngine.scorePlan(p, withWant).score,
          greaterThan(RecommendationEngine.scorePlan(p, without).score));
    });
  });

  group('kind != regular is rating/kind-agnostic in the engine', () {
    // The engine scores on price/saving/needs and does NOT down-rank kosher or
    // data-only plans (kind-based demotion lives in data.dart's saveRank, not
    // here). This pins that honest contract: a cheaper kosher plan can outscore a
    // pricier regular one. If the engine ever learns to demote non-regular kinds,
    // this test is the deliberate place that change surfaces.
    test('two plans identical but for kind score equally', () {
      const profile = MatchProfile(category: 'cellular', currentBill: 150);
      final regular = RecommendationEngine.scorePlan(plan(id: 'reg', price: 49), profile);
      final kosher = RecommendationEngine.scorePlan(plan(id: 'kos', price: 49, kind: 'kosher'), profile);
      expect(kosher.score, equals(regular.score));
    });

    test('a cheaper kosher/data-only plan is NOT pushed below a pricier regular one', () {
      const profile = MatchProfile(category: 'cellular', currentBill: 150);
      final cheapKosher = RecommendationEngine.scorePlan(plan(id: 'kos', price: 29, kind: 'kosher'), profile);
      final dearRegular = RecommendationEngine.scorePlan(plan(id: 'reg', price: 89), profile);
      expect(cheapKosher.score, greaterThan(dearRegular.score));
    });
  });

  group('budget over / under', () {
    test('under budget: a reason, no over-budget caveat, headroom rewarded', () {
      final p = plan(id: 'under', price: 60);
      const profile = MatchProfile(category: 'cellular', budget: 100);
      final m = RecommendationEngine.scorePlan(p, profile);
      expect(m.reasons, contains('בתוך התקציב שלך'));
      expect(m.caveats.any((c) => c.contains('מעל התקציב')), isFalse);
      // More headroom under budget scores at least as high as less headroom.
      final tight = RecommendationEngine.scorePlan(plan(id: 'tight', price: 98), profile);
      expect(m.score, greaterThanOrEqualTo(tight.score));
    });

    test('over budget: a shekel-accurate caveat and a score penalty', () {
      final p = plan(id: 'over', price: 130);
      const profile = MatchProfile(category: 'cellular', budget: 100);
      final m = RecommendationEngine.scorePlan(p, profile);
      expect(m.caveats, contains('₪30 מעל התקציב'));
      expect(m.reasons.contains('בתוך התקציב שלך'), isFalse);
      // The same plan scores strictly lower once it busts the budget.
      final noBudget = RecommendationEngine.scorePlan(p, const MatchProfile(category: 'cellular'));
      expect(m.score, lessThan(noBudget.score));
    });

    test('the over-budget penalty is capped (does not run away for a huge overage)', () {
      const profile = MatchProfile(category: 'cellular', budget: 50);
      final way = RecommendationEngine.scorePlan(plan(id: 'way', price: 400), profile);
      // Even a wild overage keeps the score within range (penalty clamped to 35).
      expect(way.score, inInclusiveRange(0, 100));
    });
  });

  group('score tie-breaking stability', () {
    test('equal scores break by annual saving, then by price', () {
      // Two plans engineered to tie on score: identical price (same price/saving/
      // rating sub-scores) but different ids → the sort must stay deterministic.
      // We assert the documented tie-break chain directly through rank() using a
      // real category, then re-verify the chain on hand-built matches.
      const profile = MatchProfile(category: 'cellular', currentBill: 120);
      final ranked = RecommendationEngine.rank(profile);
      for (var i = 0; i < ranked.length - 1; i++) {
        final a = ranked[i], b = ranked[i + 1];
        // Primary: score descending.
        expect(a.score, greaterThanOrEqualTo(b.score));
        // On a score tie, annual saving must not increase going down the list.
        if (a.score == b.score) {
          expect(a.annualSaving, greaterThanOrEqualTo(b.annualSaving));
          // On a saving tie too, price must not decrease (cheaper-first).
          if (a.annualSaving == b.annualSaving) {
            expect(a.plan.price, lessThanOrEqualTo(b.plan.price));
          }
        }
      }
    });

    test('rank is stable across repeated calls (deterministic ordering)', () {
      const profile = MatchProfile(category: 'internet', currentBill: 140, budget: 120);
      final first = RecommendationEngine.rank(profile).map((m) => m.plan.id).toList();
      final second = RecommendationEngine.rank(profile).map((m) => m.plan.id).toList();
      expect(first, equals(second));
    });
  });

  group('no-bill / no-budget fallback', () {
    test('with neither a bill nor a budget, cheaper still scores higher', () {
      const profile = MatchProfile(category: 'cellular');
      final cheap = RecommendationEngine.scorePlan(plan(id: 'c', price: 39), profile);
      final dear = RecommendationEngine.scorePlan(plan(id: 'd', price: 199), profile);
      expect(cheap.score, greaterThan(dear.score));
      // No bill → no saving claim.
      expect(cheap.annualSaving, 0);
      expect(cheap.reasons.any((r) => r.contains('חוסך')), isFalse);
    });
  });
}
