import '../app_state.dart';
import 'reminder_schedule.dart';
import 'push_native.dart' as impl;

/// App-facing push facade. Platform-agnostic: it computes the (pure) renewal
/// schedule and hands it to the conditional native impl (`push_native.dart`),
/// which is a no-op on web. Login/opt-in is optional — scheduling only happens
/// when the user has turned on renewal reminders ([AppState.renewalReminders]).
class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  bool _ready = false;

  /// Initialize the plugin + timezone DB. Safe (no-op) on web. Call once at startup.
  Future<void> init() async {
    await impl.initPush();
    _ready = true;
  }

  /// Ask the OS for notification permission (Android 13+ / iOS). Returns whether
  /// it was granted. No-op/false on web.
  Future<bool> requestPermission() => impl.requestPush();

  /// (Re)schedule EVERYTHING from the pure schedules in one pass: renewal
  /// reminders (when opted in) + video-meeting reminders. One pass because the
  /// native impl reschedules from scratch (cancelAll) — separate calls would
  /// wipe each other's notifications. Idempotent; safe on every startup,
  /// opt-in toggle, tracked-plan change or meeting update.
  Future<void> syncAll(AppState state) async {
    if (!_ready) return;
    final renewals =
        state.renewalReminders ? renewalReminderSchedule(state) : const <ScheduledReminder>[];
    final meetings = meetingReminderSchedule(state);
    if (renewals.isEmpty && meetings.isEmpty) {
      await impl.cancelAllPush();
      return;
    }
    await impl.scheduleAll(renewals, meetings);
  }

  /// Back-compat alias — existing call sites sync everything now.
  Future<void> syncRenewalReminders(AppState state) => syncAll(state);
}
