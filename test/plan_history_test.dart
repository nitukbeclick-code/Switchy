import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/plan_history.dart';

void main() {
  group('PlanHistory.generate', () {
    test('always returns exactly 30 points', () {
      final series = PlanHistory.generate(
        planId: 'cell-001',
        basePrice: 49,
        anchor: 100,
      );
      expect(series.length, 30);
      expect(series.length, PlanHistory.days);
    });

    test('is deterministic for the same inputs', () {
      final a = PlanHistory.generate(planId: 'abc', basePrice: 60, anchor: 0);
      final b = PlanHistory.generate(planId: 'abc', basePrice: 60, anchor: 0);
      expect(a.map((p) => p.price).toList(), b.map((p) => p.price).toList());
      expect(a.map((p) => p.ts).toList(), b.map((p) => p.ts).toList());
    });

    test('last point equals the current base price', () {
      final series = PlanHistory.generate(
        planId: 'plan-xyz',
        basePrice: 89,
        anchor: 42,
      );
      expect(series.last.price, 89);
      expect(PlanHistory.current(series), 89);
    });

    test('different plan ids produce different shapes', () {
      final a = PlanHistory.generate(planId: 'one', basePrice: 50, anchor: 10);
      final b = PlanHistory.generate(planId: 'two', basePrice: 50, anchor: 10);
      expect(a.map((p) => p.price).toList(),
          isNot(equals(b.map((p) => p.price).toList())));
    });

    test('prices never drop below the ₪1 floor', () {
      final series = PlanHistory.generate(
        planId: 'cheap',
        basePrice: 1,
        anchor: 5,
      );
      expect(series.every((p) => p.price >= 1), isTrue);
    });

    test('timestamps are reproducible and span 30 ascending days', () {
      final series = PlanHistory.generate(
        planId: 'ts-check',
        basePrice: 70,
        anchor: 100,
      );
      // Strictly ascending, one day apart.
      for (var i = 1; i < series.length; i++) {
        expect(
          series[i].ts.difference(series[i - 1].ts),
          const Duration(days: 1),
        );
      }
      // Anchor day is the last timestamp; epoch is 2020-01-01 UTC.
      final epoch = DateTime.utc(2020, 1, 1);
      expect(series.last.ts, epoch.add(const Duration(days: 100)));
      expect(series.first.ts, epoch.add(const Duration(days: 71)));
    });
  });

  group('PlanHistory reductions on a known series', () {
    final known = <PricePoint>[
      PricePoint(DateTime.utc(2020, 1, 1), 50),
      PricePoint(DateTime.utc(2020, 1, 2), 47),
      PricePoint(DateTime.utc(2020, 1, 3), 58),
      PricePoint(DateTime.utc(2020, 1, 4), 52),
      PricePoint(DateTime.utc(2020, 1, 5), 49),
    ];

    test('minPrice picks the lowest value', () {
      expect(PlanHistory.minPrice(known), 47);
    });

    test('maxPrice picks the highest value', () {
      expect(PlanHistory.maxPrice(known), 58);
    });

    test('current returns the last value', () {
      expect(PlanHistory.current(known), 49);
    });

    test('empty series reductions are zero', () {
      const empty = <PricePoint>[];
      expect(PlanHistory.minPrice(empty), 0);
      expect(PlanHistory.maxPrice(empty), 0);
      expect(PlanHistory.current(empty), 0);
    });
  });
}
