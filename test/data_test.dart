import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';

void main() {
  // ── planSaveYear ────────────────────────────────────────────────────────────

  group('planSaveYear', () {
    test('calculates annual saving correctly', () {
      // Plan at ₪35, bill ₪119 → (119-35)*12 = 1008
      final plan = planById('cel_partner_prince')!;
      expect(planSaveYear(plan, 119), equals(1008));
    });

    test('clamps to 0 when plan price exceeds bill', () {
      // Plan at ₪179, bill ₪99 → (99-179)*12 = -960, clamps to 0
      final plan = planById('net_bezeq_5g')!; // price=179
      expect(planSaveYear(plan, 99), equals(0));
    });

    test('returns 0 when plan price equals bill', () {
      // Plan at ₪109, bill ₪109 → 0
      final plan = planById('net_bezeq_300f')!; // price=109
      expect(planSaveYear(plan, 109), equals(0));
    });

    test('large saving is not artificially capped', () {
      // Plan at ₪15, bill ₪2000 → (2000-15)*12 = 23820
      final plan = planById('cel_rami_kosher_zol')!; // price=15
      expect(planSaveYear(plan, 2000), equals(23820));
    });
  });

  // ── planById ────────────────────────────────────────────────────────────────

  group('planById', () {
    test('returns a plan for a valid id', () {
      final plan = planById('cel_golan_400');
      expect(plan, isNotNull);
      expect(plan!.id, equals('cel_golan_400'));
      expect(plan.cat, equals('cellular'));
      expect(plan.provider, equals('גולן טלקום'));
    });

    test('returns null for an unknown id', () {
      expect(planById('does_not_exist'), isNull);
    });
  });

  // ── plansByCat ──────────────────────────────────────────────────────────────

  group('plansByCat', () {
    test('returns only plans for the requested category', () {
      final cellular = plansByCat('cellular');
      expect(cellular, isNotEmpty);
      expect(cellular.every((p) => p.cat == 'cellular'), isTrue);
    });

    test('covers all five categories', () {
      for (final cat in ['cellular', 'internet', 'tv', 'triple', 'abroad']) {
        expect(plansByCat(cat), isNotEmpty, reason: 'category $cat should have plans');
      }
    });

    test('returns empty list for unknown category', () {
      expect(plansByCat('unknown_cat'), isEmpty);
    });

    test('internet plans do not appear in cellular results', () {
      final cellular = plansByCat('cellular');
      expect(cellular.any((p) => p.cat == 'internet'), isFalse);
    });
  });

  // ── hotDeal ─────────────────────────────────────────────────────────────────

  group('hotDeal', () {
    test('returns a plan when a saving exists', () {
      // Bill ₪119 should beat at least one cellular plan
      final deal = hotDeal(119, cat: 'cellular');
      expect(deal, isNotNull);
    });

    test('returned plan maximises annual saving', () {
      const bill = 119;
      final deal = hotDeal(bill, cat: 'cellular');
      expect(deal, isNotNull);

      // Verify no other cellular plan has a bigger saving
      final cellular = plansByCat('cellular');
      for (final p in cellular) {
        expect(planSaveYear(p, bill), lessThanOrEqualTo(planSaveYear(deal!, bill)));
      }
    });

    test('returns null when no plan is cheaper than bill=0', () {
      // Every plan costs > 0 so no saving exists at bill=0
      final deal = hotDeal(0, cat: 'cellular');
      expect(deal, isNull);
    });

    test('works for internet category', () {
      final deal = hotDeal(200, cat: 'internet');
      expect(deal, isNotNull);
      expect(deal!.cat, equals('internet'));
    });
  });

  // ── filteredPlans ────────────────────────────────────────────────────────────

  group('filteredPlans', () {
    test('returns all cellular plans with no restrictions', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.cat == 'cellular'), isTrue);
    });

    test('filters by 5G flag', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: ['5g'],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.is5G), isTrue);
    });

    test('filters by nocommit flag', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: ['nocommit'],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.noCommit), isTrue);
    });

    test('budget filter excludes plans above threshold', () {
      const maxBudget = 40;
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: '',
        budget: maxBudget,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.price <= maxBudget), isTrue);
    });

    test('query filter matches provider name', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: 'גולן',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.provider.contains('גולן') || p.plan.contains('גולן') || p.feats.any((f) => f.contains('גולן'))), isTrue);
    });

    test('sort by price produces ascending order', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: '',
        budget: 0,
      );
      for (var i = 0; i < plans.length - 1; i++) {
        expect(plans[i].price, lessThanOrEqualTo(plans[i + 1].price));
      }
    });

    test('sort by save with currentBill produces descending saving order', () {
      const bill = 119;
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'save',
        filters: [],
        query: '',
        budget: 0,
        currentBill: bill,
      );
      for (var i = 0; i < plans.length - 1; i++) {
        expect(
          planSaveYear(plans[i], bill),
          greaterThanOrEqualTo(planSaveYear(plans[i + 1], bill)),
        );
      }
    });

    test('query that matches nothing returns empty list', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: 'xyzzy_no_match_12345',
        budget: 0,
      );
      expect(plans, isEmpty);
    });

    test('abroad category returns only abroad plans', () {
      final plans = filteredPlans(
        cat: 'abroad',
        sort: 'price',
        filters: [],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.cat == 'abroad'), isTrue);
    });
  });

  // ── Plan model helpers ───────────────────────────────────────────────────────

  group('Plan model', () {
    test('noCommit is true when term is null', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 30);
      expect(p.noCommit, isTrue);
    });

    test('noCommit is false when term > 0', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 30, term: 12);
      expect(p.noCommit, isFalse);
    });

    test('is5G reflects flags list', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '5G', plan: 'pl', price: 40, flags: ['5g']);
      expect(p.is5G, isTrue);
    });

    test('hasAbroad reflects flags list', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 35, flags: ['abroad']);
      expect(p.hasAbroad, isTrue);
    });
  });
}
