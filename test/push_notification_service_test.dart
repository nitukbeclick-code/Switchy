import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/push_notification_service.dart';

/// Tests for the small amount of pure logic in [PushNotificationService].
///
/// The service is mostly a facade: it computes the (pure) renewal + meeting
/// schedules — exhaustively covered in `reminder_schedule_test.dart` — and hands
/// them to the conditional native impl (`push_native.dart`), which is a no-op on
/// web/tests and a platform-channel wrapper elsewhere (not unit-testable, by
/// design). What we CAN pin without a plugin is the readiness gate: until
/// `init()` runs, every sync must short-circuit to a quiet no-op so a startup
/// `syncAll` (called before init on some paths) can never throw or hit a channel.
///
/// `init()`/`requestPermission()` are deliberately NOT exercised — they call the
/// flutter_local_notifications platform channel, which has no test binding here.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  final svc = PushNotificationService.instance;

  test('exposes a single shared instance', () {
    expect(PushNotificationService.instance, same(svc));
  });

  group('syncAll before init() is a quiet no-op', () {
    // The singleton is never init()'d in tests, so `_ready` is false and every
    // sync returns before touching the native impl — no throw, no channel call.
    test('completes with no plans and no opt-in', () async {
      final s = AppState();
      s.resetAllBills();
      await expectLater(svc.syncAll(s), completes);
    });

    test('completes even with opted-in renewal reminders and a tracked plan', () async {
      final s = AppState()..setRenewalReminders(true);
      s.addMyPlan(
        category: 'cellular',
        provider: 'פרטנר',
        planName: 'p',
        monthlyPrice: 50,
        promoEndDate: '2026-12-31',
      );
      // A non-empty schedule would normally be handed to the native scheduler;
      // before init() it must still short-circuit quietly.
      await expectLater(svc.syncAll(s), completes);
    });
  });

  test('syncRenewalReminders is a back-compat alias that also no-ops before init', () async {
    final s = AppState()..setRenewalReminders(true);
    await expectLater(svc.syncRenewalReminders(s), completes);
  });
}
