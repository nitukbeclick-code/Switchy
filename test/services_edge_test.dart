import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/savings_summary.dart';
import 'package:chosech/services/reminder_schedule.dart';
import 'package:chosech/services/search.dart';

/// Edge cases for the pure services that the per-service tests don't already
/// cover: the savings summary with a single bill driving the whole total, the
/// standalone [reminderFireDate] date arithmetic (exact daysBefore, past/none,
/// today-boundary), and search matching on a feature/spec term.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('savings_summary edge cases', () {
    test('no bills → total 0 and topOpportunity null', () {
      final s = AppState();
      s.resetAllBills();
      final summary = computeSavings(s);
      expect(summary.totalAnnualPotential, 0);
      expect(summary.topOpportunity, isNull);
      expect(summary.hasAnyBill, isFalse);
    });

    test('a single bill drives the entire total, and it is that category', () {
      final s = AppState();
      s.resetAllBills();
      s.setCurrentBill('cellular', 220);
      final summary = computeSavings(s);

      final cell = summary.categories.firstWhere((c) => c.categoryId == 'cellular');
      // The only opportunity is cellular, so the total equals its saving exactly.
      expect(summary.totalAnnualPotential, equals(cell.annualSaving));
      expect(cell.annualSaving, greaterThan(0));
      expect(summary.topOpportunity, isNotNull);
      expect(summary.topOpportunity!.categoryId, equals('cellular'));
    });

    test('summary always covers every catalogue category', () {
      final s = AppState();
      final ids = computeSavings(s).categories.map((c) => c.categoryId).toSet();
      expect(ids, equals(categories.map((c) => c.id).toSet()));
    });
  });

  group('reminderFireDate', () {
    final now = DateTime(2026, 6, 9);
    String iso(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    TrackedPlan withEnd(String? end) => TrackedPlan(
          id: 't',
          category: 'cellular',
          provider: 'בדיקה',
          planName: 'p',
          monthlyPrice: 50,
          promoEndDate: end,
        );

    test('fires exactly daysBefore before the promo end', () {
      final end = now.add(const Duration(days: 90));
      final fire = reminderFireDate(withEnd(iso(end)), daysBefore: 21, now: now);
      expect(fire, equals(DateTime(end.year, end.month, end.day).subtract(const Duration(days: 21))));
    });

    test('null when there is no promo date', () {
      expect(reminderFireDate(withEnd(null), now: now), isNull);
    });

    test('null when the promo has already ended (past)', () {
      final past = now.subtract(const Duration(days: 1));
      expect(reminderFireDate(withEnd(iso(past)), now: now), isNull);
    });

    test('null when the promo ends today (end is not after today)', () {
      expect(reminderFireDate(withEnd(iso(now)), now: now), isNull);
    });

    test('clamps to today when the ideal date is in the past but promo is still future', () {
      // Ends in 5 days → 21-before is in the past → clamp forward to today.
      final fire = reminderFireDate(withEnd(iso(now.add(const Duration(days: 5)))), now: now);
      expect(fire, equals(now));
    });

    test('promo ending tomorrow with daysBefore 0 fires tomorrow', () {
      final tomorrow = now.add(const Duration(days: 1));
      final fire = reminderFireDate(withEnd(iso(tomorrow)), daysBefore: 0, now: now);
      expect(fire, equals(DateTime(tomorrow.year, tomorrow.month, tomorrow.day)));
    });
  });

  group('search by feature / spec term', () {
    test('a spec value term ("מהירות" speeds) matches internet plans', () {
      // Internet plans carry a 'מהירות' spec key (e.g. 'עד 1000/100').
      final r = searchEverything('מהירות', planLimit: 999);
      expect(r.plans, isNotEmpty);
      expect(r.plans.any((p) => p.cat == 'internet'), isTrue);
    });

    test('a feature substring shared by abroad plans matches', () {
      // Pick a real feature word from the catalogue and confirm it surfaces.
      final withGlisha = allPlans.where((p) => p.feats.any((f) => f.contains('גלישה'))).toList();
      expect(withGlisha, isNotEmpty, reason: 'expected some plans to mention גלישה');
      final r = searchEverything('גלישה', planLimit: 999);
      expect(r.plans, isNotEmpty);
      // Every catalogued plan with that feature should be in the results.
      for (final p in withGlisha) {
        expect(r.plans.any((m) => m.id == p.id), isTrue);
      }
    });

    test('a spec key itself is searchable', () {
      // Confirm a known spec key surfaces its plans (keys are matched too).
      final keyPlans = allPlans.where((p) => p.specs.keys.any((k) => k.contains('ערוצים'))).toList();
      if (keyPlans.isEmpty) return;
      final r = searchEverything('ערוצים', planLimit: 999);
      expect(r.plans.any((m) => keyPlans.any((k) => k.id == m.id)), isTrue);
    });
  });
}
