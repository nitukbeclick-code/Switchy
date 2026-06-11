import 'dart:async';

import '../app_state.dart';
import 'backend/backend.dart';
import 'backend/local_backend.dart' show appBackend;
import 'push_notification_service.dart';

/// App-level mirror of the user's booked video meeting.
///
/// The rep usually confirms minutes-to-hours after the request, while the user
/// is anywhere in the app (or away) — so the Realtime subscription must live at
/// app scope, not inside the meeting screen. [start] is called from `main.dart`
/// after the persisted state loads, and again (idempotently) by the meeting
/// screen so a fresh booking is always covered.
class MeetingSync {
  MeetingSync._();

  static StreamSubscription<BookedMeeting>? _sub;

  /// (Re)subscribe to the backend's meeting stream and hydrate once from the
  /// server. Safe to call repeatedly — the previous subscription is replaced.
  /// The old cancel is deliberately NOT awaited: we are replacing the listener,
  /// not draining it, and awaiting a subscription created in another zone can
  /// hang (e.g. across flutter_test fake-async zones).
  static Future<void> start() async {
    unawaited(_sub?.cancel());
    _sub = appBackend.meetingStream().listen(apply);
    await refresh();
  }

  /// One-shot server hydrate (cold start / screen open / after an
  /// "already pending" rejection re-adopts the server's open booking).
  static Future<void> refresh() async {
    try {
      final latest = await appBackend.fetchLatestMeeting();
      if (latest != null) adopt(latest);
    } catch (_) {/* offline — the persisted state is the fallback */}
  }

  /// Realtime row update. Guarded by id: the channel filters on user_id only,
  /// so updates to OLD rows (e.g. the cron expiring a stale request after the
  /// user re-booked) also arrive — they must never touch the current booking.
  static void apply(BookedMeeting m) {
    final s = AppState();
    if (s.bookedMeeting?.id != m.id) return;
    s.updateMeetingStatus(m.status, joinUrl: m.joinUrl);
    PushNotificationService.instance.syncAll(s);
  }

  /// Fetched-row reconciliation. Re-adopts an open server booking when local
  /// state was cleared (new device / reinstall), and never downgrades a
  /// realtime-confirmed meeting from a stale in-flight fetch.
  static void adopt(BookedMeeting latest) {
    final s = AppState();
    final cur = s.bookedMeeting;
    if (cur == null) {
      if (latest.status == MeetingStatus.pending || latest.status == MeetingStatus.confirmed) {
        s.setBookedMeeting(latest);
        PushNotificationService.instance.syncAll(s);
      }
      return;
    }
    if (cur.id != latest.id) return;
    if (cur.status == MeetingStatus.confirmed && latest.status == MeetingStatus.pending) {
      return; // stale fetch racing a fresher realtime event
    }
    if (cur.status != latest.status || cur.joinUrl != latest.joinUrl) {
      s.updateMeetingStatus(latest.status, joinUrl: latest.joinUrl);
      PushNotificationService.instance.syncAll(s);
    }
  }

  static Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }
}
