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

const _meetingChannelId = 'meeting_reminders';
const _meetingChannelName = 'תזכורות פגישה';
const _meetingChannelDesc = 'תזכורת לפני פגישת וידאו עם נציג';

/// Meeting notification ids live above this offset so they never collide with
/// the renewal reminders (indexed 0..n).
const _meetingIdBase = 1000;

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
  // Meeting reminders land on the meeting screen; renewal reminders deep-link
  // into the tracked plan's renewal report.
  if (id == 'meeting') {
    appRouterInstance?.goNamed('Meeting');
    return;
  }
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

Future<void> scheduleReminders(List<ScheduledReminder> reminders) =>
    scheduleAll(reminders, const []);

/// Show an immediate (not scheduled) local notification. Used for price-drop
/// and flash-deal alerts that are triggered programmatically at runtime.
/// [id] should be stable per logical event so repeat calls don't stack.
Future<void> showNow({
  required int id,
  required String title,
  required String body,
  String? payload,
  String channelId = 'price_alerts',
  String channelName = 'התראות מחיר',
  String channelDesc = 'התראות על ירידת מחירים ומבצעים',
}) async {
  if (!_isMobile) return;
  if (!_tzReady) _ensureTz(); // harmless if already ready
  final details = NotificationDetails(
    android: AndroidNotificationDetails(
      channelId,
      channelName,
      channelDescription: channelDesc,
      importance: Importance.high,
      priority: Priority.high,
    ),
    iOS: const DarwinNotificationDetails(),
  );
  await _plugin.show(
    id: id,
    title: title,
    body: body,
    notificationDetails: details,
    payload: payload ?? '',
  );
}

/// Reschedule the WHOLE notification surface from scratch — renewals at 09:00
/// on their fire dates, meeting reminders at their exact instants. One entry
/// point so the cancelAll can't wipe a sibling schedule.
Future<void> scheduleAll(
  List<ScheduledReminder> reminders,
  List<MeetingPushReminder> meetings,
) async {
  if (!_isMobile) return;
  _ensureTz();
  await _plugin.cancelAll(); // reschedule from scratch — the lists are the source of truth
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

  const meetingDetails = NotificationDetails(
    android: AndroidNotificationDetails(
      _meetingChannelId,
      _meetingChannelName,
      channelDescription: _meetingChannelDesc,
      importance: Importance.max,
      priority: Priority.high,
    ),
    iOS: DarwinNotificationDetails(),
  );
  for (var i = 0; i < meetings.length; i++) {
    final m = meetings[i];
    final when = tz.TZDateTime(tz.local, m.fireAt.year, m.fireAt.month, m.fireAt.day,
        m.fireAt.hour, m.fireAt.minute);
    if (!when.isAfter(now)) continue; // pure schedule already filters; belt & braces
    await _plugin.zonedSchedule(
      id: _meetingIdBase + i,
      title: m.title,
      body: m.body,
      scheduledDate: when,
      notificationDetails: meetingDetails,
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      payload: m.payload,
    );
  }
}
