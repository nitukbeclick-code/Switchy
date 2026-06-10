import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;
import '../router.dart';
import 'reminder_schedule.dart';

/// Mobile/desktop push delivery via `flutter_local_notifications`. Only active on
/// iOS/Android; on desktop the calls are inert. Schedules renewal reminders at
/// 09:00 local on each plan's computed fire date, and deep-links into that
/// plan's renewal report when the user taps the notification.
final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
bool _tzReady = false;

const _channelId = 'renewal_reminders';
const _channelName = 'תזכורות חידוש';
const _channelDesc = 'התראה לפני שמבצע במסלול שלך מסתיים';

bool get _isMobile =>
    defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.android;

void _ensureTz() {
  if (_tzReady) return;
  tzdata.initializeTimeZones();
  tz.setLocalLocation(tz.getLocation('Asia/Jerusalem')); // Israel-only product
  _tzReady = true;
}

Future<void> initPush() async {
  if (!_isMobile) return;
  _ensureTz();
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  const ios = DarwinInitializationSettings(
    requestAlertPermission: false,
    requestBadgePermission: false,
    requestSoundPermission: false,
  );
  await _plugin.initialize(
    settings: const InitializationSettings(android: android, iOS: ios),
    onDidReceiveNotificationResponse: _onTap,
  );
}

void _onTap(NotificationResponse response) {
  final id = response.payload;
  if (id == null || id.isEmpty) return;
  // Land the user on the tracked plan's renewal report.
  appRouterInstance?.goNamed('RenewalReport', pathParameters: {'trackedId': id});
}

Future<bool> requestPush() async {
  if (!_isMobile) return false;
  final android =
      _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
  if (android != null) {
    return (await android.requestNotificationsPermission()) ?? false;
  }
  final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
  return (await ios?.requestPermissions(alert: true, badge: true, sound: true)) ?? false;
}

Future<void> cancelAllPush() async {
  if (!_isMobile) return;
  await _plugin.cancelAll();
}

Future<void> scheduleReminders(List<ScheduledReminder> reminders) async {
  if (!_isMobile) return;
  _ensureTz();
  await _plugin.cancelAll(); // reschedule from scratch — the list is the source of truth
  const details = NotificationDetails(
    android: AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: _channelDesc,
      importance: Importance.high,
      priority: Priority.high,
    ),
    iOS: DarwinNotificationDetails(),
  );
  final now = tz.TZDateTime.now(tz.local);
  for (var i = 0; i < reminders.length; i++) {
    final r = reminders[i];
    // Fire at 09:00 local on the reminder's date; if that moment already passed
    // (reminder is due today), nudge it a few seconds out so it still delivers.
    var when = tz.TZDateTime(tz.local, r.fireDate.year, r.fireDate.month, r.fireDate.day, 9);
    if (!when.isAfter(now)) when = now.add(const Duration(seconds: 5));
    await _plugin.zonedSchedule(
      id: i,
      title: r.title,
      body: r.body,
      scheduledDate: when,
      notificationDetails: details,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: r.plan.id,
    );
  }
}
