import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/meeting_slots.dart';

void main() {
  group('bookableMeetingDates', () {
    test('includes TODAY while a same-day slot still clears +4h', () {
      // Sunday 08:00 → +4h = 12:00, so today still has slots (12:00…20:30).
      final morning = DateTime(2026, 6, 14, 8, 0); // Sunday morning
      final dates = bookableMeetingDates(now: morning);
      expect(dates.first, DateTime(2026, 6, 14)); // today (Sunday)
    });

    test('rolls to the next day once today has no slot ≥ now + 4h', () {
      // Sunday 23:59 → +4h is past the last slot (20:30) → first is Monday.
      final lateNight = DateTime(2026, 6, 14, 23, 59); // Sunday night
      final dates = bookableMeetingDates(now: lateNight);
      expect(dates.first, DateTime(2026, 6, 15)); // Monday
      for (final d in dates) {
        expect(d.isAfter(DateTime(2026, 6, 14)), isTrue);
      }
    });

    test('boundary: today included when exactly one slot remains at +4h', () {
      // Sunday 16:30 → +4h = 20:30, which is exactly the last slot → today in.
      final dates = bookableMeetingDates(now: DateTime(2026, 6, 14, 16, 30));
      expect(dates.first, DateTime(2026, 6, 14)); // today
      expect(meetingSlotsFor(DateTime(2026, 6, 14), now: DateTime(2026, 6, 14, 16, 30)),
          ['20:30']);
    });

    test('never contains a Saturday', () {
      final dates = bookableMeetingDates(now: DateTime(2026, 6, 11), count: 30);
      expect(dates.any((d) => d.weekday == DateTime.saturday), isFalse);
    });

    test('contains Fridays (Friday-morning meetings are offered)', () {
      final dates = bookableMeetingDates(now: DateTime(2026, 6, 11), count: 14);
      expect(dates.any((d) => d.weekday == DateTime.friday), isTrue);
    });

    test('returns exactly the requested number of bookable days', () {
      expect(bookableMeetingDates(now: DateTime(2026, 6, 11)).length, 14);
      expect(bookableMeetingDates(now: DateTime(2026, 6, 11), count: 5).length, 5);
    });

    test('skips Saturday: late Friday rolls to Sunday (no Sat slot)', () {
      // 2026-06-12 23:00 is a Friday night → Saturday has no slots → Sunday.
      final dates = bookableMeetingDates(now: DateTime(2026, 6, 12, 23, 0));
      expect(dates.first, DateTime(2026, 6, 14));
      expect(dates.first.weekday, DateTime.sunday);
    });
  });

  group('meetingSlotsFor', () {
    test('Sunday–Thursday run 09:00–20:30 (24 slots) on a future day', () {
      final sunday = DateTime(2026, 6, 14);
      // now is days earlier so the +4h same-day filter does not apply.
      final slots = meetingSlotsFor(sunday, now: DateTime(2026, 6, 11, 9, 0));
      expect(slots.length, 24);
      expect(slots.first, '09:00');
      expect(slots.last, '20:30');
    });

    test('Friday is mornings-only 09:00–12:30 (8 slots) on a future day', () {
      final friday = DateTime(2026, 6, 12);
      final slots = meetingSlotsFor(friday, now: DateTime(2026, 6, 9, 9, 0));
      expect(slots.length, 8);
      expect(slots.first, '09:00');
      expect(slots.last, '12:30');
    });

    test('Saturday has no slots', () {
      expect(meetingSlotsFor(DateTime(2026, 6, 13)), isEmpty);
    });

    test('today: only slots ≥ now + 4h survive', () {
      // Sunday 09:10 → +4h = 13:10 → first surviving slot is 13:30.
      final today = DateTime(2026, 6, 14);
      final slots = meetingSlotsFor(today, now: DateTime(2026, 6, 14, 9, 10));
      expect(slots.first, '13:30');
      expect(slots.last, '20:30');
      expect(slots.contains('13:00'), isFalse);
    });

    test('today: empty once +4h passes the last slot', () {
      final today = DateTime(2026, 6, 14);
      expect(meetingSlotsFor(today, now: DateTime(2026, 6, 14, 17, 0)), isEmpty);
    });

    test('all slots sit on the 30-minute grid', () {
      for (final s in meetingSlotsFor(DateTime(2026, 6, 14), now: DateTime(2026, 6, 11))) {
        expect(RegExp(r'^\d{2}:(00|30)$').hasMatch(s), isTrue, reason: s);
      }
    });
  });

  group('meetingProviders', () {
    test('is exactly the 7 allowed providers in contract order', () {
      expect(meetingProviders, [
        'HOT',
        'yes',
        'פרטנר',
        'סלקום',
        'STING TV',
        'בזק',
        'הוט מובייל',
      ]);
    });
  });

  group('meetingLocalStart / formatting', () {
    test('combines date + slot into a wall-time DateTime', () {
      final dt = meetingLocalStart('2026-06-16', '14:30');
      expect(dt, DateTime(2026, 6, 16, 14, 30));
    });

    test('formatMeetingDateHe renders the Hebrew day letter', () {
      expect(formatMeetingDateHe(DateTime(2026, 6, 16)), 'יום ג׳ · 16.6'); // Tuesday
      expect(formatMeetingDateHe(DateTime(2026, 6, 14)), 'יום א׳ · 14.6'); // Sunday
    });

    test('meetingDateIso pads correctly', () {
      expect(meetingDateIso(DateTime(2026, 6, 1)), '2026-06-01');
    });
  });
}
