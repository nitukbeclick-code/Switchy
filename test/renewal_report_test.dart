import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/renewal_report.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  TrackedPlan tracked({required String cat, required int price}) => TrackedPlan(
        id: 't1',
        category: cat,
        provider: 'סלקום',
        planName: 'המסלול שלי',
        monthlyPrice: price,
      );

  group('RenewalReport.profileFor', () {
    test('anchors the bill-to-beat to the tracked monthly price', () {
      final s = AppState();
      final p = RenewalReport.profileFor(tracked(cat: 'cellular', price: 175), s);
      expect(p.category, 'cellular');
      expect(p.currentBill, 175);
      expect(p.budget, 0); // no ceiling at renewal — show the whole market
    });
  });

  group('RenewalReport.alternatives', () {
    test('returns ranked plans, all in the tracked category, capped by limit', () {
      final s = AppState();
      final list = RenewalReport.alternatives(tracked(cat: 'cellular', price: 120), s, limit: 8);
      expect(list, isNotEmpty);
      expect(list.length, lessThanOrEqualTo(8));
      expect(list.every((m) => m.plan.cat == 'cellular'), isTrue);
      // Ranked best-first by score.
      for (var i = 0; i < list.length - 1; i++) {
        expect(list[i].score, greaterThanOrEqualTo(list[i + 1].score));
      }
    });
  });

  group('RenewalReport.bestSaver / maxAnnualSaving', () {
    test('a high current price surfaces a positive-saving alternative', () {
      final s = AppState();
      final tp = tracked(cat: 'cellular', price: 200);
      final saver = RenewalReport.bestSaver(tp, s);
      expect(saver, isNotNull);
      expect(saver!.annualSaving, greaterThan(0));
      expect(saver.plan.price, lessThan(200));
      expect(RenewalReport.maxAnnualSaving(tp, s), equals(saver.annualSaving));
    });

    test('an already-rock-bottom price yields no saver', () {
      final s = AppState();
      // Cheaper than any real cellular plan, so nothing can beat it.
      final tp = tracked(cat: 'cellular', price: 1);
      expect(RenewalReport.bestSaver(tp, s), isNull);
      expect(RenewalReport.maxAnnualSaving(tp, s), equals(0));
    });
  });
}
