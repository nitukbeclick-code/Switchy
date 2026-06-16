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
}
