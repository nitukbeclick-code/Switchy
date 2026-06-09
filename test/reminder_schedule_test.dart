import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/reminder_schedule.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  // A fixed "today" so the date math is deterministic.
  final now = DateTime(2026, 6, 9);
  String iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  test('no reminders until the user opts in', () {
    final s = AppState();
    s.addMyPlan(category: 'cellular', provider: 'סלקום', planName: 'p', monthlyPrice: 40, promoEndDate: iso(now.add(const Duration(days: 60))));
    expect(s.renewalReminders, isFalse);
    expect(renewalReminderSchedule(s, now: now), isEmpty);

    s.setRenewalReminders(true);
    expect(renewalReminderSchedule(s, now: now), isNotEmpty);
  });

  test('fires exactly daysBefore the promo ends', () {
    final s = AppState()..setRenewalReminders(true);
    final end = now.add(const Duration(days: 60));
    s.addMyPlan(category: 'cellular', provider: 'פרטנר', planName: 'p', monthlyPrice: 50, promoEndDate: iso(end));

    final r = renewalReminderSchedule(s, now: now).single;
    expect(r.fireDate, equals(DateTime(end.year, end.month, end.day).subtract(const Duration(days: 21))));
    expect(r.title, contains('פרטנר'));
  });

  test('if the ideal reminder date already passed, it fires today (promo still future)', () {
    final s = AppState()..setRenewalReminders(true);
    // Promo ends in 10 days → 21-days-before is in the past → clamp to today.
    s.addMyPlan(category: 'cellular', provider: 'גולן טלקום', planName: 'p', monthlyPrice: 39, promoEndDate: iso(now.add(const Duration(days: 10))));

    final r = renewalReminderSchedule(s, now: now).single;
    expect(r.fireDate, equals(now));
  });

  test('skips plans with no promo date or an already-ended promo', () {
    final s = AppState()..setRenewalReminders(true);
    s.addMyPlan(category: 'cellular', provider: 'A', planName: 'no-date', monthlyPrice: 30); // no promo date
    s.addMyPlan(category: 'tv', provider: 'B', planName: 'ended', monthlyPrice: 80, promoEndDate: iso(now.subtract(const Duration(days: 3))));
    expect(renewalReminderSchedule(s, now: now), isEmpty);
  });

  test('sorted soonest-first and nextReminder returns the head', () {
    final s = AppState()..setRenewalReminders(true);
    s.addMyPlan(category: 'internet', provider: 'late', planName: 'a', monthlyPrice: 99, promoEndDate: iso(now.add(const Duration(days: 120))));
    s.addMyPlan(category: 'cellular', provider: 'soon', planName: 'b', monthlyPrice: 39, promoEndDate: iso(now.add(const Duration(days: 40))));

    final list = renewalReminderSchedule(s, now: now);
    expect(list.length, 2);
    expect(list.first.fireDate.isBefore(list[1].fireDate) || list.first.fireDate == list[1].fireDate, isTrue);
    expect(nextReminder(s, now: now)!.plan.provider, equals('soon'));
  });
}
