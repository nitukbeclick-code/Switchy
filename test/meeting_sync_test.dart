import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/meeting_sync.dart';

/// Tests for [MeetingSync]'s pure reconciliation logic — `apply` (Realtime row
/// update) and `adopt` (fetched-row reconciliation). Both mutate the [AppState]
/// singleton; neither needs a backend or a live Realtime channel, so they're
/// exercised directly against a seeded AppState.
///
/// `start`/`refresh`/`stop` are subscription plumbing over [appBackend] and are
/// covered by the meeting demo-flow tests; the subtle, drift-prone rules live in
/// `apply`/`adopt` (id-guarding stale rows, never downgrading a confirmed
/// meeting from a racing fetch, re-adopting an open booking on a fresh device).
///
/// [PushNotificationService.instance.syncAll], which these call, is a no-op in
/// tests: it short-circuits until `init()` runs (never called here / no-op on
/// the test platform), so there is no plugin to mock.
BookedMeeting _meeting({
  String id = 'm1',
  MeetingStatus status = MeetingStatus.pending,
  String? joinUrl,
}) =>
    BookedMeeting(
      id: id,
      status: status,
      provider: 'הוט',
      meetingDate: '2026-06-16',
      slot: '14:30',
      startsAt: DateTime.utc(2026, 6, 16, 11, 30),
      joinUrl: joinUrl,
      createdAt: DateTime(2026, 6, 11),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('apply (Realtime row update)', () {
    test('updates the current booking when ids match', () {
      final s = AppState();
      s.setBookedMeeting(_meeting()); // pending, no link
      MeetingSync.apply(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom.us/j/1');
    });

    test('ignores updates to a different (old) row id', () {
      final s = AppState();
      s.setBookedMeeting(_meeting(id: 'current'));
      // An update for an OLD row (e.g. the cron expiring a stale request) must
      // never touch the current booking — the channel filters on user_id only.
      MeetingSync.apply(_meeting(id: 'stale', status: MeetingStatus.expired));
      expect(s.bookedMeeting!.id, 'current');
      expect(s.bookedMeeting!.status, MeetingStatus.pending);
    });

    test('does nothing when there is no current booking', () {
      final s = AppState();
      expect(s.bookedMeeting, isNull);
      MeetingSync.apply(_meeting(status: MeetingStatus.confirmed));
      expect(s.bookedMeeting, isNull);
    });
  });

  group('adopt (fetched-row reconciliation)', () {
    test('re-adopts an open server booking when local state is empty', () {
      final s = AppState();
      expect(s.bookedMeeting, isNull);
      MeetingSync.adopt(_meeting(status: MeetingStatus.pending));
      expect(s.bookedMeeting, isNotNull);
      expect(s.bookedMeeting!.id, 'm1');
      expect(s.bookedMeeting!.status, MeetingStatus.pending);
    });

    test('adopts a confirmed server booking when local state is empty', () {
      final s = AppState();
      MeetingSync.adopt(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom.us/j/1');
    });

    test('does NOT adopt a terminal server booking into empty local state', () {
      final s = AppState();
      for (final st in [MeetingStatus.cancelled, MeetingStatus.expired, MeetingStatus.completed, MeetingStatus.noRep]) {
        MeetingSync.adopt(_meeting(status: st));
        expect(s.bookedMeeting, isNull, reason: 'must not adopt a $st booking');
      }
    });

    test('ignores a fetched row for a different booking id', () {
      final s = AppState();
      s.setBookedMeeting(_meeting(id: 'current'));
      MeetingSync.adopt(_meeting(id: 'other', status: MeetingStatus.confirmed, joinUrl: 'x'));
      expect(s.bookedMeeting!.id, 'current');
      expect(s.bookedMeeting!.status, MeetingStatus.pending);
    });

    test('never downgrades a confirmed meeting from a stale pending fetch', () {
      final s = AppState();
      s.setBookedMeeting(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      // A stale fetch racing a fresher realtime confirm must be ignored.
      MeetingSync.adopt(_meeting(status: MeetingStatus.pending));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom.us/j/1');
    });

    test('applies a forward status change (pending → confirmed) for the same id', () {
      final s = AppState();
      s.setBookedMeeting(_meeting(status: MeetingStatus.pending));
      MeetingSync.adopt(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/9'));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom.us/j/9');
    });

    test('is a no-op when the fetched row equals the current state', () {
      final s = AppState();
      final m = _meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1');
      s.setBookedMeeting(m);
      MeetingSync.adopt(_meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom.us/j/1');
    });
  });
}
