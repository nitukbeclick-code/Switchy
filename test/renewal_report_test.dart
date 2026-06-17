import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/recommendation_engine.dart';
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

  group('RenewalReport.profileFor — forwards quiz signals', () {
    test('forwards quizLines from app state', () {
      final s = AppState();
      s.setQuizLines(4);
      final p = RenewalReport.profileFor(tracked(cat: 'cellular', price: 120), s);
      expect(p.lines, 4);
    });

    test('honors wants5G / wantsNoCommit / wantsAbroad needs', () {
      final s = AppState();
      s.setQuizNeeds(wants5G: true, wantsAbroad: true, wantsNoCommit: true);
      final p = RenewalReport.profileFor(tracked(cat: 'cellular', price: 120), s);
      expect(p.wants5G, isTrue);
      expect(p.wantsNoCommit, isTrue);
      expect(p.wantsAbroad, isTrue);
    });

    test('forwards the quiz priority into the profile', () {
      final s = AppState();
      s.setQuizPriority('speed');
      final p = RenewalReport.profileFor(tracked(cat: 'cellular', price: 120), s);
      // 'speed' maps to MatchPriority.speed via priorityFromId.
      expect(p.priority, MatchPriority.speed);
    });

    test('the tracked category drives the profile category', () {
      final s = AppState();
      final p = RenewalReport.profileFor(tracked(cat: 'internet', price: 99), s);
      expect(p.category, 'internet');
      expect(p.currentBill, 99);
    });
  });

  group('RenewalReport.alternatives — limit is an upper bound', () {
    test('respects a small limit', () {
      final s = AppState();
      final tp = tracked(cat: 'cellular', price: 120);
      final list = RenewalReport.alternatives(tp, s, limit: 3);
      expect(list.length, lessThanOrEqualTo(3));
      expect(list, isNotEmpty);
    });

    test('a limit of 1 returns at most the single best match', () {
      final s = AppState();
      final tp = tracked(cat: 'cellular', price: 120);
      final list = RenewalReport.alternatives(tp, s, limit: 1);
      expect(list.length, lessThanOrEqualTo(1));
    });

    test('a limit larger than the catalogue returns everything, unclamped', () {
      final s = AppState();
      final tp = tracked(cat: 'cellular', price: 120);
      final all = RenewalReport.alternatives(tp, s); // no limit
      final huge = RenewalReport.alternatives(tp, s, limit: 100000);
      expect(huge.length, all.length);
    });

    test('an empty/unknown category yields an empty list', () {
      final s = AppState();
      final tp = tracked(cat: 'no_such_category', price: 120);
      expect(RenewalReport.alternatives(tp, s), isEmpty);
      expect(RenewalReport.bestSaver(tp, s), isNull);
      expect(RenewalReport.maxAnnualSaving(tp, s), 0);
    });
  });

  group('RenewalReport.bestSaver / maxAnnualSaving — consistency', () {
    test('bestSaver is the first positive-saving alternative in rank order', () {
      final s = AppState();
      final tp = tracked(cat: 'cellular', price: 200);
      final list = RenewalReport.alternatives(tp, s);
      final saver = RenewalReport.bestSaver(tp, s);
      expect(saver, isNotNull);
      // It must be the earliest ranked entry whose annual saving is positive.
      final firstPositive =
          list.firstWhere((m) => m.annualSaving > 0, orElse: () => list.first);
      expect(saver!.plan.id, firstPositive.plan.id);
    });

    test('maxAnnualSaving equals the bestSaver annual saving (or 0)', () {
      final s = AppState();
      for (final price in [200, 120, 60, 1]) {
        final tp = tracked(cat: 'cellular', price: price);
        final saver = RenewalReport.bestSaver(tp, s);
        expect(RenewalReport.maxAnnualSaving(tp, s), saver?.annualSaving ?? 0,
            reason: 'maxAnnualSaving must mirror bestSaver at price $price');
      }
    });

    test('every alternative saving is measured against the tracked price', () {
      final s = AppState();
      final tp = tracked(cat: 'cellular', price: 200);
      for (final m in RenewalReport.alternatives(tp, s)) {
        if (m.annualSaving > 0) {
          // A positive saving implies the plan is cheaper than the tracked bill.
          expect(m.plan.price, lessThan(200));
        }
      }
    });
  });
}
