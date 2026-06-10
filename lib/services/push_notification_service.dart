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

  /// (Re)schedule every renewal reminder from the pure [renewalReminderSchedule].
  /// Cancels all when the user has opted out. Idempotent — safe to call on every
  /// startup, opt-in toggle, or tracked-plan change.
  Future<void> syncRenewalReminders(AppState state) async {
    if (!_ready) return;
    if (!state.renewalReminders) {
      await impl.cancelAllPush();
      return;
    }
    await impl.scheduleReminders(renewalReminderSchedule(state));
  }
}
