import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/meeting_slots.dart';

void main() {
  group('bookableMeetingDates', () {
    test('starts tomorrow, never today — even at 23:59', () {
      final lateNight = DateTime(2026, 6, 14, 23, 59); // Sunday night
      final dates = bookableMeetingDates(now: lateNight);
      expect(dates.first, DateTime(2026, 6, 15)); // Monday
      for (final d in dates) {
        expect(d.isAfter(DateTime(2026, 6, 14)), isTrue);
      }
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

    test('skips Saturday when tomorrow is Saturday', () {
      // 2026-06-12 is a Friday → tomorrow is Saturday → first bookable is Sunday.
      final dates = bookableMeetingDates(now: DateTime(2026, 6, 12));
      expect(dates.first, DateTime(2026, 6, 14));
      expect(dates.first.weekday, DateTime.sunday);
    });
  });

  group('meetingSlotsFor', () {
    test('Sunday–Thursday run 09:00–20:30 (24 slots)', () {
      final sunday = DateTime(2026, 6, 14);
      final slots = meetingSlotsFor(sunday);
      expect(slots.length, 24);
      expect(slots.first, '09:00');
      expect(slots.last, '20:30');
    });

    test('Friday is mornings-only 09:00–12:30 (8 slots)', () {
      final friday = DateTime(2026, 6, 12);
      final slots = meetingSlotsFor(friday);
      expect(slots.length, 8);
      expect(slots.first, '09:00');
      expect(slots.last, '12:30');
    });

    test('Saturday has no slots', () {
      expect(meetingSlotsFor(DateTime(2026, 6, 13)), isEmpty);
    });

    test('all slots sit on the 30-minute grid', () {
      for (final s in meetingSlotsFor(DateTime(2026, 6, 14))) {
        expect(RegExp(r'^\d{2}:(00|30)$').hasMatch(s), isTrue, reason: s);
      }
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
