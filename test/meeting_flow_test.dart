import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';
import 'package:chosech/services/backend/supabase_backend.dart';
import 'package:chosech/services/reminder_schedule.dart';

const _input = MeetingInput(
  name: 'ישראל ישראלי',
  phone: '0500000000',
  provider: 'הוט',
  meetingDate: '2026-06-16',
  slot: '14:30',
  source: 'plan',
);

BookedMeeting _meeting({MeetingStatus status = MeetingStatus.pending, String? joinUrl}) =>
    BookedMeeting(
      id: 'm1',
      status: status,
      provider: 'הוט',
      meetingDate: '2026-06-16',
      slot: '14:30',
      startsAt: DateTime.utc(2026, 6, 16, 11, 30),
      joinUrl: joinUrl,
      createdAt: DateTime(2026, 6, 11),
    );

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('LocalBackend meetings (demo flow)', () {
    test('requestMeeting stores the input and fetchLatestMeeting returns it', () async {
      final b = LocalBackend();
      await b.requestMeeting(_input);
      expect(b.submittedMeetings, hasLength(1));
      expect(b.submittedMeetings.single.slot, '14:30');

      final latest = await b.fetchLatestMeeting();
      expect(latest, isNotNull);
      expect(latest!.status, MeetingStatus.pending);
      expect(latest.provider, 'הוט');
      expect(latest.meetingDate, '2026-06-16');
    });

    test('email-OTP gate: request returns true, verify accepts a code, rejects empty', () async {
      final b = LocalBackend();
      // request-code: any non-empty address "sends" (offline no-op) → (ok, sent)
      // both true; an empty address is not ok and not sent.
      final reqOk = await b.requestMeetingEmailCode('user@example.com', name: 'ישראל');
      expect(reqOk.ok, isTrue);
      expect(reqOk.sent, isTrue);
      final reqEmpty = await b.requestMeetingEmailCode('  ');
      expect(reqEmpty.ok, isFalse);
      expect(reqEmpty.sent, isFalse);
      // verify-code: any non-empty code checks out offline; empty is rejected
      // with a friendly Hebrew reason.
      final ok = await b.verifyMeetingEmailCode('user@example.com', '123456');
      expect(ok.ok, isTrue);
      expect(ok.error, isNull);
      final bad = await b.verifyMeetingEmailCode('user@example.com', '   ');
      expect(bad.ok, isFalse);
      expect(bad.error, isNotNull);
    });

    test('demo stream confirms the meeting with a placeholder Zoom link', () async {
      final b = LocalBackend()..demoConfirmDelay = Duration.zero;
      final events = <BookedMeeting>[];
      final sub = b.meetingStream().listen(events.add);
      await b.requestMeeting(_input);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await sub.cancel();

      expect(events, hasLength(1));
      expect(events.single.status, MeetingStatus.confirmed);
      expect(events.single.joinUrl, isNotEmpty);
      expect((await b.fetchLatestMeeting())!.status, MeetingStatus.confirmed);
    });
  });

  group('AppState meeting persistence', () {
    test('setBookedMeeting persists and reloads across instances', () async {
      final s = AppState();
      await s.initializePersistedState();
      s.setBookedMeeting(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      // Let the debounced flush run.
      await Future<void>.delayed(Duration.zero);

      AppState.reset();
      final s2 = AppState();
      await s2.initializePersistedState();
      final m = s2.bookedMeeting;
      expect(m, isNotNull);
      expect(m!.id, 'm1');
      expect(m.status, MeetingStatus.confirmed);
      expect(m.joinUrl, 'https://zoom.us/j/1');
      expect(m.slot, '14:30');
    });

    test('updateMeetingStatus + clearBookedMeeting round-trip', () async {
      final s = AppState();
      await s.initializePersistedState();
      s.setBookedMeeting(_meeting());
      s.updateMeetingStatus(MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/2');
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom.us/j/2');

      s.clearBookedMeeting();
      await Future<void>.delayed(Duration.zero);
      expect(s.bookedMeeting, isNull);

      AppState.reset();
      final s2 = AppState();
      await s2.initializePersistedState();
      expect(s2.bookedMeeting, isNull);
    });
  });

  group('SupabaseBackend cross-surface meeting fetch composition', () {
    // The live fetch matches user_id OR the AUTHENTICATED email so a meeting
    // booked on the web (user_id NULL) shows up in the app after the owner
    // applies the email RLS policy. These cover the pure composition helpers;
    // LocalBackend (demo flow) is untouched and covered above.
    const uid = '2c9e1a34-0000-4000-8000-000000000001';

    test('meetingEmailFilterValue normalizes like meeting-book (trim+lowercase)', () {
      expect(SupabaseBackend.meetingEmailFilterValue('  User@Example.COM '),
          'user@example.com');
      expect(SupabaseBackend.meetingEmailFilterValue('a.b+tag@c.co.il'),
          'a.b+tag@c.co.il');
    });

    test('meetingEmailFilterValue: no authenticated email → null (anonymous keeps uid-only fetch)', () {
      expect(SupabaseBackend.meetingEmailFilterValue(null), isNull);
      expect(SupabaseBackend.meetingEmailFilterValue(''), isNull);
      expect(SupabaseBackend.meetingEmailFilterValue('   '), isNull);
    });

    test('meetingEmailFilterValue rejects values unsafe inside a quoted PostgREST token', () {
      // Never build a broken/injectable or= filter — such an address just
      // degrades to today's uid-only behavior.
      expect(SupabaseBackend.meetingEmailFilterValue('a"b@c.com'), isNull);
      expect(SupabaseBackend.meetingEmailFilterValue('a\\b@c.com'), isNull);
      expect(SupabaseBackend.meetingEmailFilterValue('a,b@c.com'), isNull);
      expect(SupabaseBackend.meetingEmailFilterValue('a(b@c.com'), isNull);
      expect(SupabaseBackend.meetingEmailFilterValue('a)b@c.com'), isNull);
    });

    test('meetingOrFilter composes uid OR double-quoted email', () {
      expect(
        SupabaseBackend.meetingOrFilter(uid, 'user@example.com'),
        'user_id.eq.$uid,email.eq."user@example.com"',
      );
    });

    test('shouldEmitMeetingEvent drops the twin event from the second channel', () {
      final sig = <String, String>{};
      final m = _meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1');
      // Same UPDATE arriving on the user_id channel then the email channel:
      expect(SupabaseBackend.shouldEmitMeetingEvent(sig, m), isTrue);
      expect(SupabaseBackend.shouldEmitMeetingEvent(sig, m), isFalse);
    });

    test('shouldEmitMeetingEvent passes real changes (status flip, join_url)', () {
      final sig = <String, String>{};
      expect(SupabaseBackend.shouldEmitMeetingEvent(sig, _meeting()), isTrue);
      expect(
          SupabaseBackend.shouldEmitMeetingEvent(
              sig, _meeting(status: MeetingStatus.confirmed)),
          isTrue);
      expect(
          SupabaseBackend.shouldEmitMeetingEvent(
              sig,
              _meeting(
                  status: MeetingStatus.confirmed,
                  joinUrl: 'https://zoom.us/j/1')),
          isTrue);
      // …and still dedupes once the content settles.
      expect(
          SupabaseBackend.shouldEmitMeetingEvent(
              sig,
              _meeting(
                  status: MeetingStatus.confirmed,
                  joinUrl: 'https://zoom.us/j/1')),
          isFalse);
    });

    test('meetingEventSignature tracks distinct meetings independently', () {
      final sig = <String, String>{};
      final m1 = _meeting(status: MeetingStatus.confirmed);
      final m2 = BookedMeeting(
        id: 'm2',
        status: MeetingStatus.confirmed,
        provider: 'הוט',
        meetingDate: '2026-06-16',
        slot: '14:30',
        startsAt: DateTime.utc(2026, 6, 16, 11, 30),
        createdAt: DateTime(2026, 6, 11),
      );
      // Identical content under different ids must both pass (per-id dedupe).
      expect(SupabaseBackend.meetingEventSignature(m1),
          SupabaseBackend.meetingEventSignature(m2));
      expect(SupabaseBackend.shouldEmitMeetingEvent(sig, m1), isTrue);
      expect(SupabaseBackend.shouldEmitMeetingEvent(sig, m2), isTrue);
    });
  });

  group('meetingReminderSchedule', () {
    test('empty unless confirmed with a join link', () {
      final s = AppState();
      s.setBookedMeeting(_meeting()); // pending
      expect(meetingReminderSchedule(s, now: DateTime(2026, 6, 15)), isEmpty);

      s.updateMeetingStatus(MeetingStatus.confirmed); // confirmed but no link
      expect(meetingReminderSchedule(s, now: DateTime(2026, 6, 15)), isEmpty);
    });

    test('confirmed future meeting yields T-30 and T-0 reminders', () {
      final s = AppState();
      s.setBookedMeeting(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      final reminders = meetingReminderSchedule(s, now: DateTime(2026, 6, 15));
      expect(reminders, hasLength(2));
      expect(reminders[0].fireAt, DateTime(2026, 6, 16, 14, 0));
      expect(reminders[0].title, contains('30 דקות'));
      expect(reminders[1].fireAt, DateTime(2026, 6, 16, 14, 30));
      expect(reminders.every((r) => r.payload == 'meeting'), isTrue);
    });

    test('drops T-30 when already inside the 30-minute window', () {
      final s = AppState();
      s.setBookedMeeting(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      final reminders = meetingReminderSchedule(s, now: DateTime(2026, 6, 16, 14, 10));
      expect(reminders, hasLength(1));
      expect(reminders.single.fireAt, DateTime(2026, 6, 16, 14, 30));
    });

    test('empty once the meeting has started', () {
      final s = AppState();
      s.setBookedMeeting(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      expect(meetingReminderSchedule(s, now: DateTime(2026, 6, 16, 14, 31)), isEmpty);
    });
  });
}
