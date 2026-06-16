import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/backend/backend.dart';
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

  test('custom daysBefore + atTime drive the fire date and time-of-day', () {
    final s = AppState()..setRenewalReminders(true);
    final end = now.add(const Duration(days: 60));
    s.addMyPlan(category: 'cellular', provider: 'פרטנר', planName: 'p', monthlyPrice: 50, promoEndDate: iso(end));

    final r = renewalReminderSchedule(
      s,
      daysBefore: 14,
      atTime: (hour: 8, minute: 30),
      now: now,
    ).single;
    final day = DateTime(end.year, end.month, end.day).subtract(const Duration(days: 14));
    expect(r.fireDate, equals(DateTime(day.year, day.month, day.day, 8, 30)));
  });

  test('without atTime the fire date stays date-only (midnight)', () {
    final s = AppState()..setRenewalReminders(true);
    final end = now.add(const Duration(days: 60));
    s.addMyPlan(category: 'cellular', provider: 'X', planName: 'p', monthlyPrice: 50, promoEndDate: iso(end));

    final r = renewalReminderSchedule(s, now: now).single;
    expect(r.fireDate.hour, equals(0));
    expect(r.fireDate.minute, equals(0));
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

  group('meetingReminderSchedule', () {
    // A meeting wall-time start is built from meetingDate ('YYYY-MM-DD') + slot
    // ('HH:MM') via meetingLocalStart — startsAt (UTC) is irrelevant here.
    BookedMeeting meeting({
      MeetingStatus status = MeetingStatus.confirmed,
      String? joinUrl = 'https://zoom.us/j/1',
      String? provider = 'הוט',
      String meetingDate = '2026-06-16',
      String slot = '14:30',
    }) =>
        BookedMeeting(
          id: 'm1',
          status: status,
          provider: provider,
          meetingDate: meetingDate,
          slot: slot,
          startsAt: DateTime.utc(2026, 6, 16, 11, 30),
          joinUrl: joinUrl,
          createdAt: DateTime(2026, 6, 11),
        );

    // The meeting starts 2026-06-16 14:30 wall time.
    final start = DateTime(2026, 6, 16, 14, 30);

    test('empty when no meeting is booked', () {
      final s = AppState();
      expect(s.bookedMeeting, isNull);
      expect(meetingReminderSchedule(s, now: start.subtract(const Duration(hours: 1))), isEmpty);
    });

    test('empty when the meeting is not confirmed', () {
      final s = AppState()..setBookedMeeting(meeting(status: MeetingStatus.pending));
      expect(meetingReminderSchedule(s, now: start.subtract(const Duration(hours: 1))), isEmpty);
    });

    test('empty when the join link is null', () {
      final s = AppState()..setBookedMeeting(meeting(joinUrl: null));
      expect(meetingReminderSchedule(s, now: start.subtract(const Duration(hours: 1))), isEmpty);
    });

    test('empty when the join link is an empty string', () {
      final s = AppState()..setBookedMeeting(meeting(joinUrl: ''));
      expect(meetingReminderSchedule(s, now: start.subtract(const Duration(hours: 1))), isEmpty);
    });

    test('empty when the start time has already passed', () {
      final s = AppState()..setBookedMeeting(meeting());
      expect(meetingReminderSchedule(s, now: start.add(const Duration(minutes: 1))), isEmpty);
      // Exactly at start counts as not-after → no reminders.
      expect(meetingReminderSchedule(s, now: start), isEmpty);
    });

    test('both T-30 and start reminders when well in the future', () {
      final s = AppState()..setBookedMeeting(meeting());
      final out = meetingReminderSchedule(s, now: start.subtract(const Duration(hours: 2)));
      expect(out.length, 2);
      expect(out[0].fireAt, equals(start.subtract(const Duration(minutes: 30))));
      expect(out[1].fireAt, equals(start));
      // Both deep-link the meeting screen.
      expect(out.every((r) => r.payload == 'meeting'), isTrue);
    });

    test('T-30 reminder is included when more than 30 minutes remain', () {
      final s = AppState()..setBookedMeeting(meeting());
      // 31 minutes before start → T-30 is still 1 minute in the future.
      final out = meetingReminderSchedule(s, now: start.subtract(const Duration(minutes: 31)));
      expect(out.length, 2);
      expect(out.first.fireAt, equals(start.subtract(const Duration(minutes: 30))));
    });

    test('T-30 reminder is dropped once 30 minutes or fewer remain', () {
      final s = AppState()..setBookedMeeting(meeting());
      // Exactly 30 minutes before: T-30 == now, which is not after now → dropped.
      final out = meetingReminderSchedule(s, now: start.subtract(const Duration(minutes: 30)));
      expect(out.length, 1);
      expect(out.single.fireAt, equals(start));
      expect(out.single.payload, equals('meeting'));

      // 10 minutes before: still only the start reminder remains.
      final out2 = meetingReminderSchedule(s, now: start.subtract(const Duration(minutes: 10)));
      expect(out2.length, 1);
      expect(out2.single.fireAt, equals(start));
    });

    test('start reminder always fires while the meeting is still in the future', () {
      final s = AppState()..setBookedMeeting(meeting());
      final out = meetingReminderSchedule(s, now: start.subtract(const Duration(seconds: 1)));
      expect(out.map((r) => r.fireAt), contains(start));
    });

    test('a non-empty provider is woven into the Hebrew body', () {
      final s = AppState()..setBookedMeeting(meeting(provider: 'הוט'));
      final out = meetingReminderSchedule(s, now: start.subtract(const Duration(hours: 1)));
      expect(out, hasLength(2));
      expect(out[0].body, contains('בנושא הוט'));
      expect(out[1].body, contains('בנושא הוט'));
    });

    test('an empty or null provider leaves the body without a subject clause', () {
      for (final p in [<String?>['', null], <String?>[null]].expand((e) => e)) {
        final s = AppState()..setBookedMeeting(meeting(provider: p));
        final out = meetingReminderSchedule(s, now: start.subtract(const Duration(hours: 1)));
        expect(out, hasLength(2));
        for (final r in out) {
          expect(r.body, isNot(contains('בנושא')));
        }
      }
    });
  });
}
