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

/// Web stub — no OS-level immediate notifications in the browser.
Future<void> showNow({
  required int id,
  required String title,
  required String body,
  String? payload,
  String channelId = 'price_alerts',
  String channelName = 'התראות מחיר',
  String channelDesc = 'התראות על ירידת מחירים ומבצעים',
}) async {}
