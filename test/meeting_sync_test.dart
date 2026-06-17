import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/meeting_sync.dart';

// Pins the app-scope meeting reconciliation logic: the id-guard on realtime
// updates and the fetched-row adoption rules (re-adopt open bookings, never
// downgrade a confirmed meeting from a stale fetch). PushNotificationService
// .syncAll is a no-op here (it short-circuits on `!_ready` without init).

BookedMeeting _m({
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
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('MeetingSync.apply — realtime row update (id-guarded)', () {
    test('ignores an update addressed to a different meeting id', () {
      final s = AppState()..setBookedMeeting(_m(id: 'current'));
      MeetingSync.apply(_m(id: 'stale-old-row', status: MeetingStatus.expired));
      expect(s.bookedMeeting!.id, 'current');
      expect(s.bookedMeeting!.status, MeetingStatus.pending);
    });

    test('applies status + joinUrl for the current meeting id', () {
      final s = AppState()..setBookedMeeting(_m(id: 'current'));
      MeetingSync.apply(_m(id: 'current', status: MeetingStatus.confirmed, joinUrl: 'https://zoom/x'));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom/x');
    });
  });

  group('MeetingSync.adopt — fetched-row reconciliation', () {
    test('adopts an open (pending) server booking when local is empty', () {
      final s = AppState();
      expect(s.bookedMeeting, isNull);
      MeetingSync.adopt(_m(id: 'srv', status: MeetingStatus.pending));
      expect(s.bookedMeeting?.id, 'srv');
    });

    test('adopts a confirmed server booking when local is empty', () {
      final s = AppState();
      MeetingSync.adopt(_m(id: 'srv', status: MeetingStatus.confirmed, joinUrl: 'https://zoom/y'));
      expect(s.bookedMeeting?.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting?.joinUrl, 'https://zoom/y');
    });

    test('does NOT adopt a closed (cancelled/expired) booking when local is empty', () {
      final s = AppState();
      MeetingSync.adopt(_m(id: 'a', status: MeetingStatus.cancelled));
      expect(s.bookedMeeting, isNull);
      MeetingSync.adopt(_m(id: 'b', status: MeetingStatus.expired));
      expect(s.bookedMeeting, isNull);
    });

    test('never downgrades a confirmed meeting from a stale pending fetch', () {
      final s = AppState()
        ..setBookedMeeting(_m(id: 'm1', status: MeetingStatus.confirmed, joinUrl: 'https://zoom/z'));
      MeetingSync.adopt(_m(id: 'm1', status: MeetingStatus.pending));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom/z');
    });

    test('ignores a fetched row with a different id than the current booking', () {
      final s = AppState()..setBookedMeeting(_m(id: 'm1', status: MeetingStatus.pending));
      MeetingSync.adopt(_m(id: 'OTHER', status: MeetingStatus.confirmed));
      expect(s.bookedMeeting!.id, 'm1');
      expect(s.bookedMeeting!.status, MeetingStatus.pending);
    });

    test('applies a forward status/joinUrl change for the matching id', () {
      final s = AppState()..setBookedMeeting(_m(id: 'm1', status: MeetingStatus.pending));
      MeetingSync.adopt(_m(id: 'm1', status: MeetingStatus.confirmed, joinUrl: 'https://zoom/w'));
      expect(s.bookedMeeting!.status, MeetingStatus.confirmed);
      expect(s.bookedMeeting!.joinUrl, 'https://zoom/w');
    });
  });
}
