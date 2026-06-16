import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/price_change_event.dart';

void main() {
  Plan plan({
    required String id,
    required double price,
    String provider = 'סלקום',
    String name = 'מסלול בדיקה',
  }) =>
      Plan(
        id: id,
        cat: 'cellular',
        provider: provider,
        net: provider,
        plan: name,
        price: price.round(),
        priceExact: price,
      );

  group('PriceChangeEvent.isPriceDrop', () {
    PriceChangeEvent event(double oldPrice, double newPrice) => PriceChangeEvent(
          planId: 'p1',
          planName: 'מסלול',
          provider: 'סלקום',
          oldPrice: oldPrice,
          newPrice: newPrice,
        );

    test('is true only when newPrice < oldPrice', () {
      expect(event(100, 80).isPriceDrop, isTrue);
    });

    test('is false at equality', () {
      expect(event(100, 100).isPriceDrop, isFalse);
    });

    test('is false on a price increase', () {
      expect(event(100, 120).isPriceDrop, isFalse);
    });

    test('saving figures track the drop', () {
      final e = event(100, 80);
      expect(e.saving, 20);
      expect(e.savingAnnual, 240);
    });
  });

  group('detectPriceChanges', () {
    test('returns only price-drop events; rises are filtered out', () {
      final dropped = plan(id: 'a', price: 80);
      final risen = plan(id: 'b', price: 120);
      final events = detectPriceChanges(
        oldPlans: [plan(id: 'a', price: 100), plan(id: 'b', price: 100)],
        newPlans: [dropped, risen],
        watchedPlanIds: ['a', 'b'],
      );
      expect(events.length, 1);
      expect(events.single.planId, 'a');
      expect(events.single.oldPrice, 100);
      expect(events.single.newPrice, 80);
    });

    test('an unchanged price yields no event', () {
      final events = detectPriceChanges(
        oldPlans: [plan(id: 'a', price: 100)],
        newPlans: [plan(id: 'a', price: 100)],
        watchedPlanIds: ['a'],
      );
      expect(events, isEmpty);
    });

    test('a plan new in newPlans but absent from oldPlans yields no event', () {
      final events = detectPriceChanges(
        oldPlans: const [],
        newPlans: [plan(id: 'brand-new', price: 50)],
        watchedPlanIds: ['brand-new'],
      );
      expect(events, isEmpty);
    });

    test('a plan removed from newPlans yields no event', () {
      final events = detectPriceChanges(
        oldPlans: [plan(id: 'gone', price: 100)],
        newPlans: const [],
        watchedPlanIds: ['gone'],
      );
      expect(events, isEmpty);
    });

    test('non-watched price drops are excluded', () {
      final events = detectPriceChanges(
        oldPlans: [plan(id: 'a', price: 100), plan(id: 'b', price: 100)],
        newPlans: [plan(id: 'a', price: 70), plan(id: 'b', price: 60)],
        watchedPlanIds: ['a'],
      );
      expect(events.length, 1);
      expect(events.single.planId, 'a');
    });

    test('an empty watch-list returns no events', () {
      final events = detectPriceChanges(
        oldPlans: [plan(id: 'a', price: 100)],
        newPlans: [plan(id: 'a', price: 50)],
        watchedPlanIds: const [],
      );
      expect(events, isEmpty);
    });

    test('carries the new plan name and provider', () {
      final events = detectPriceChanges(
        oldPlans: [plan(id: 'a', price: 100, provider: 'פרטנר', name: 'ישן')],
        newPlans: [plan(id: 'a', price: 80, provider: 'פרטנר', name: 'חדש')],
        watchedPlanIds: ['a'],
      );
      expect(events.single.planName, 'חדש');
      expect(events.single.provider, 'פרטנר');
    });
  });

  group('watchedDrops', () {
    test('detects a drop below baseline and seeds new baselines', () {
      final r = watchedDrops(
        watchedPlans: [plan(id: 'a', price: 80), plan(id: 'b', price: 50)],
        baseline: {'a': 100}, // a: 100→80 drop; b: first observation
      );
      expect(r.drops.length, 1);
      expect(r.drops.single.planId, 'a');
      expect(r.drops.single.oldPrice, 100);
      expect(r.drops.single.newPrice, 80);
      expect(r.recovered, isEmpty);
      expect(r.newBaseline, equals({'a': 80, 'b': 50}));
    });

    test('first observation seeds baseline but never fires a drop', () {
      final r = watchedDrops(
        watchedPlans: [plan(id: 'a', price: 40)],
        baseline: const {},
      );
      expect(r.drops, isEmpty);
      expect(r.newBaseline, equals({'a': 40}));
    });

    test('respects the minSaving threshold', () {
      final small = watchedDrops(
        watchedPlans: [plan(id: 'a', price: 98)],
        baseline: {'a': 100},
        minSaving: 5,
      );
      expect(small.drops, isEmpty); // saving 2 < 5
      final ok = watchedDrops(
        watchedPlans: [plan(id: 'a', price: 98)],
        baseline: {'a': 100},
        minSaving: 2,
      );
      expect(ok.drops.length, 1);
    });

    test('marks recovered when the price rose above baseline', () {
      final r = watchedDrops(
        watchedPlans: [plan(id: 'a', price: 120)],
        baseline: {'a': 100},
      );
      expect(r.drops, isEmpty);
      expect(r.recovered, equals(['a']));
      expect(r.newBaseline, equals({'a': 120}));
    });

    test('equal price → neither a drop nor a recovery', () {
      final r = watchedDrops(
        watchedPlans: [plan(id: 'a', price: 100)],
        baseline: {'a': 100},
      );
      expect(r.drops, isEmpty);
      expect(r.recovered, isEmpty);
    });
  });
}
