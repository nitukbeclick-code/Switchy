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

const _dealChannelId = 'price_drops';
const _dealChannelName = 'ירידות מחיר';
const _dealChannelDesc = 'התראה כשמסלול שעניין אותך יורד במחיר';

/// Meeting notification ids live above this offset so they never collide with
/// the renewal reminders (indexed 0..n).
const _meetingIdBase = 1000;

/// Price-drop notifications live above the meeting band so an immediate "show
/// now" alert never overwrites a scheduled renewal/meeting reminder.
const _dealIdBase = 2000;
int _dealSeq = 0;

/// Payload prefix that routes a tapped price-drop notification to the Deals feed.
const _dealPayloadPrefix = 'deal';

const _leadChannelId = 'lead_updates';
const _leadChannelName = 'עדכוני מעבר';
const _leadChannelDesc = 'עדכון על התקדמות המעבר שלך';

/// Lead-update ("switch progress") notifications live above the price-drop band
/// so an immediate lead alert never overwrites a deal/renewal/meeting one.
const _trackerIdBase = 3000;
int _trackerSeq = 0;

/// Payload that routes a tapped lead-update notification to the Tracker tab.
const _trackerPayload = 'tracker';

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
  // Meeting reminders land on the meeting screen; lead updates land on the
  // Tracker tab; price drops land on the deals feed; renewal reminders
  // deep-link into the tracked plan's renewal report.
  if (id == 'meeting') {
    appRouterInstance?.goNamed('Meeting');
    return;
  }
  if (id == _trackerPayload) {
    appRouterInstance?.goNamed('Tracker');
    return;
  }
  if (id == _dealPayloadPrefix || id.startsWith('$_dealPayloadPrefix:')) {
    appRouterInstance?.goNamed('Deals');
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

/// Show an immediate (un-scheduled) notification — used for live price drops
/// and lead ("switch progress") updates, which arrive in real time rather than
/// on a known date. [payload] picks the channel, id band and tap destination:
/// the default `'deal'` keeps existing callers on the price-drop channel
/// (routing to the Deals feed via [_onTap]); `'tracker'` uses the lead-updates
/// channel and routes to the Tracker tab. No-op off mobile. Does NOT cancel
/// anything, so it never disturbs the scheduled renewal/meeting reminders.
Future<void> showNow({
  required String title,
  required String body,
  String payload = _dealPayloadPrefix,
}) async {
  if (!_isMobile) return;
  _ensureTz();
  final isLead = payload == _trackerPayload;
  final details = NotificationDetails(
    android: isLead
        ? const AndroidNotificationDetails(
            _leadChannelId,
            _leadChannelName,
            channelDescription: _leadChannelDesc,
            importance: Importance.high,
            priority: Priority.high,
          )
        : const AndroidNotificationDetails(
            _dealChannelId,
            _dealChannelName,
            channelDescription: _dealChannelDesc,
            importance: Importance.high,
            priority: Priority.high,
          ),
    iOS: const DarwinNotificationDetails(),
  );
  await _plugin.show(
    id: isLead ? _trackerIdBase + (_trackerSeq++) : _dealIdBase + (_dealSeq++),
    title: title,
    body: body,
    notificationDetails: details,
    payload: payload,
  );
}
