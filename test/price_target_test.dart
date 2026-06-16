import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/price_target.dart';

void main() {
  group('PriceTarget.isHit', () {
    test('target == price → hit (inclusive boundary)', () {
      expect(PriceTarget.isHit(currentPrice: 40, targetPrice: 40), isTrue);
    });

    test('target > price → hit (price fell below goal)', () {
      expect(PriceTarget.isHit(currentPrice: 35, targetPrice: 40), isTrue);
    });

    test('target < price → not hit (price still above goal)', () {
      expect(PriceTarget.isHit(currentPrice: 45, targetPrice: 40), isFalse);
    });
  });

  group('PriceTarget.hitPlanIds', () {
    test('returns only ids whose current price reached the target', () {
      final targets = {
        'a': 40, // current 30 → hit
        'b': 50, // current 50 → hit (boundary)
        'c': 60, // current 70 → miss
      };
      final prices = {'a': 30, 'b': 50, 'c': 70};

      final hits = PriceTarget.hitPlanIds(
        targets: targets,
        currentPriceOf: (id) => prices[id]!,
      );

      expect(hits, equals(['a', 'b']));
    });

    test('empty targets → empty result, never calls resolver', () {
      var calls = 0;
      final hits = PriceTarget.hitPlanIds(
        targets: const {},
        currentPriceOf: (id) {
          calls++;
          return 0;
        },
      );
      expect(hits, isEmpty);
      expect(calls, equals(0));
    });

    test('no target met → empty result', () {
      final hits = PriceTarget.hitPlanIds(
        targets: {'a': 20, 'b': 25},
        currentPriceOf: (_) => 100,
      );
      expect(hits, isEmpty);
    });
  });

  group('PriceTarget.windowDays', () {
    test('daily=1, weekly=7, immediate(+unknown) effectively never', () {
      expect(PriceTarget.windowDays('daily'), equals(1));
      expect(PriceTarget.windowDays('weekly'), equals(7));
      expect(PriceTarget.windowDays('immediate'), greaterThan(1000000));
      expect(PriceTarget.windowDays('whatever'), greaterThan(1000000));
    });
  });

  group('PriceTarget.dueForPush', () {
    final now = DateTime(2026, 6, 16, 9);
    final targets = {'a': 40, 'b': 60}; // a hit (price 30), b miss (price 70)
    int priceOf(String id) => id == 'a' ? 30 : 70;

    test('only currently-hit targets are ever due', () {
      final due = PriceTarget.dueForPush(
        targets: targets,
        currentPriceOf: priceOf,
        lastNotifiedIso: const {},
        frequency: 'immediate',
        now: now,
      );
      expect(due, equals(['a']));
    });

    test('immediate: once notified, never due again', () {
      final due = PriceTarget.dueForPush(
        targets: targets,
        currentPriceOf: priceOf,
        lastNotifiedIso: {'a': now.subtract(const Duration(days: 365)).toIso8601String()},
        frequency: 'immediate',
        now: now,
      );
      expect(due, isEmpty);
    });

    test('daily: due again once a day has passed, not before', () {
      final yesterday = now.subtract(const Duration(days: 1, hours: 1));
      final dueAfter = PriceTarget.dueForPush(
        targets: targets, currentPriceOf: priceOf,
        lastNotifiedIso: {'a': yesterday.toIso8601String()},
        frequency: 'daily', now: now,
      );
      expect(dueAfter, equals(['a']));

      final dueWithin = PriceTarget.dueForPush(
        targets: targets, currentPriceOf: priceOf,
        lastNotifiedIso: {'a': now.subtract(const Duration(hours: 5)).toIso8601String()},
        frequency: 'daily', now: now,
      );
      expect(dueWithin, isEmpty);
    });

    test('weekly: suppressed within 7 days, due after', () {
      final within = PriceTarget.dueForPush(
        targets: targets, currentPriceOf: priceOf,
        lastNotifiedIso: {'a': now.subtract(const Duration(days: 3)).toIso8601String()},
        frequency: 'weekly', now: now,
      );
      expect(within, isEmpty);

      final after = PriceTarget.dueForPush(
        targets: targets, currentPriceOf: priceOf,
        lastNotifiedIso: {'a': now.subtract(const Duration(days: 8)).toIso8601String()},
        frequency: 'weekly', now: now,
      );
      expect(after, equals(['a']));
    });
  });
}
