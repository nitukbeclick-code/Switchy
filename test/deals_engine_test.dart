import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/pages/deals/deals_engine.dart';

/// Tests for the pure [DealsEngine] — the honest price-drop diff behind the
/// real-time deals feed. No widgets, no I/O: we hand it raw [PriceSnapshot]
/// lists and assert on the ranked [PriceDrop]s. A real catalogue plan id is used
/// so the catalogue-grounding (drop dropped when planById==null) is exercised.
void main() {
  // A real plan id from the catalogue so DealsEngine.dropsFrom keeps the drop
  // (it discards drops whose plan id is no longer in the catalogue).
  final realPlanId = allPlans.first.id;
  final realPlan = allPlans.first;

  PriceSnapshot snap(String id, double price, DateTime at,
          {String? cat, String? provider}) =>
      PriceSnapshot(
        planId: id,
        category: cat ?? realPlan.cat,
        provider: provider ?? realPlan.provider,
        price: price,
        capturedAt: at,
      );

  final base = DateTime(2026, 6, 1);

  group('DealsEngine.dropsFrom', () {
    test('surfaces a genuine drop with the real old→new prices', () {
      final drops = DealsEngine.dropsFrom([
        snap(realPlanId, 50, base),
        snap(realPlanId, 40, base.add(const Duration(days: 1))),
      ]);
      expect(drops, hasLength(1));
      final d = drops.single;
      expect(d.oldPrice, 50);
      expect(d.newPrice, 40);
      expect(d.dropAmount, 10);
      expect(d.dropPctRounded, 20);
      expect(d.annualSaving, 120); // 10 * 12
      expect(d.plan, isNotNull);
      expect(d.plan!.id, realPlanId);
    });

    test('ignores a price RISE (only drops are deals)', () {
      final drops = DealsEngine.dropsFrom([
        snap(realPlanId, 40, base),
        snap(realPlanId, 55, base.add(const Duration(days: 1))),
      ]);
      expect(drops, isEmpty);
    });

    test('ignores sub-threshold rounding wiggle (₪0.50 on a ₪50 plan)', () {
      final drops = DealsEngine.dropsFrom([
        snap(realPlanId, 50, base),
        snap(realPlanId, 49.5, base.add(const Duration(days: 1))),
      ]);
      expect(drops, isEmpty);
    });

    test('a single snapshot never fabricates a drop', () {
      final drops = DealsEngine.dropsFrom([snap(realPlanId, 40, base)]);
      expect(drops, isEmpty);
    });

    test('drops a deal whose plan is no longer in the catalogue', () {
      final drops = DealsEngine.dropsFrom([
        snap('no-such-plan-id', 50, base),
        snap('no-such-plan-id', 30, base.add(const Duration(days: 1))),
      ]);
      expect(drops, isEmpty);
    });

    test('compares latest against the most-recent DIFFERING earlier snapshot', () {
      // A flat run at 40 then a real earlier 50 — the drop is 50→40, not 40→40.
      final drops = DealsEngine.dropsFrom([
        snap(realPlanId, 50, base),
        snap(realPlanId, 40, base.add(const Duration(days: 1))),
        snap(realPlanId, 40, base.add(const Duration(days: 2))),
      ]);
      expect(drops, hasLength(1));
      expect(drops.single.oldPrice, 50);
      expect(drops.single.newPrice, 40);
    });

    test('ranks the biggest relative drop first', () {
      final other = allPlans.firstWhere((p) => p.id != realPlanId);
      final drops = DealsEngine.dropsFrom([
        // realPlan: 50→45 = 10%
        snap(realPlanId, 50, base),
        snap(realPlanId, 45, base.add(const Duration(days: 1))),
        // other: 100→60 = 40%
        snap(other.id, 100, base, cat: other.cat, provider: other.provider),
        snap(other.id, 60, base.add(const Duration(days: 1)),
            cat: other.cat, provider: other.provider),
      ]);
      expect(drops, hasLength(2));
      expect(drops.first.planId, other.id); // 40% beats 10%
    });

    test('empty input yields no drops', () {
      expect(DealsEngine.dropsFrom(const []), isEmpty);
    });
  });
}
