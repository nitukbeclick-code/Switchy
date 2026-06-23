import 'reminder_schedule.dart';

/// Web stub — there is no OS-level local-notification surface in the browser, so
/// every entry point is a no-op. Mirrors the contract of `push_native_io.dart`.
Future<void> initPush() async {}

Future<bool> requestPush() async => false;

Future<void> scheduleReminders(List<ScheduledReminder> reminders) async {}

Future<void> scheduleAll(
  List<ScheduledReminder> reminders,
  List<MeetingPushReminder> meetings,
) async {}

Future<void> cancelAllPush() async {}

Future<void> showNow({required String title, required String body}) async {}
