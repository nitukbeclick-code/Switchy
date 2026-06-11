import '../app_state.dart';
import '../models.dart';
import 'backend/backend.dart' show MeetingStatus;
import 'meeting_slots.dart' show meetingLocalStart;

/// A concrete renewal reminder the app has committed to surface: which tracked
/// plan, the exact date it should fire (~[daysBefore] before the promo ends),
/// and the Hebrew copy to show.
class ScheduledReminder {
  const ScheduledReminder({
    required this.plan,
    required this.fireDate,
    required this.title,
    required this.body,
  });

  final TrackedPlan plan;
  final DateTime fireDate; // date-only (midnight)
  final String title;
  final String body;
}

/// The exact date a single plan's renewal reminder should fire, or null if it
/// has no promo date or the promo has already ended. Fires [daysBefore] before
/// the promo ends, clamped forward to today if that date has already passed.
DateTime? reminderFireDate(TrackedPlan plan, {int daysBefore = 21, DateTime? now}) {
  final end = plan.promoEnd;
  if (end == null) return null;
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final endDay = DateTime(end.year, end.month, end.day);
  if (!endDay.isAfter(today)) return null;
  final fire = endDay.subtract(Duration(days: daysBefore));
  return fire.isBefore(today) ? today : fire;
}

/// The renewal reminders to fire for the user's tracked plans, soonest first.
///
/// Pure and testable — no plugins, no scheduling side-effects. A real OS
/// scheduler (or the in-app notification center) consumes this list. Returns
/// empty unless the user has opted in via [AppState.renewalReminders].
///
/// A reminder fires [daysBefore] days before the promo ends; if that ideal date
/// has already passed but the promo is still in the future, it fires today so
/// the user isn't left without a heads-up. Plans with no promo date, or whose
/// promo has already ended, are skipped.
List<ScheduledReminder> renewalReminderSchedule(
  AppState s, {
  int daysBefore = 21,
  DateTime? now,
}) {
  if (!s.renewalReminders) return const [];

  final out = <ScheduledReminder>[];
  for (final p in s.myPlans) {
    final fire = reminderFireDate(p, daysBefore: daysBefore, now: now);
    if (fire == null) continue; // no promo date, or promo already ended

    out.add(ScheduledReminder(
      plan: p,
      fireDate: fire,
      title: 'המבצע ב${p.provider} מסתיים בקרוב',
      body: 'הזמן להשוות מחדש — ${p.planName}. נכין לך טבלת השוואה מעודכנת.',
    ));
  }

  out.sort((a, b) => a.fireDate.compareTo(b.fireDate));
  return out;
}

/// The next reminder that will fire, or null if none is scheduled.
ScheduledReminder? nextReminder(AppState s, {int daysBefore = 21, DateTime? now}) {
  final all = renewalReminderSchedule(s, daysBefore: daysBefore, now: now);
  return all.isEmpty ? null : all.first;
}

// ── Video-meeting push reminders ─────────────────────────────────────────────

/// An exact-moment push for a confirmed Zoom meeting (unlike the date-only
/// [ScheduledReminder]). [payload] deep-links the tap (the meeting screen).
class MeetingPushReminder {
  const MeetingPushReminder({
    required this.fireAt,
    required this.title,
    required this.body,
    required this.payload,
  });

  final DateTime fireAt; // exact instant, device-local wall time
  final String title;
  final String body;
  final String payload;
}

/// Push reminders for the user's booked video meeting: T-30 minutes and at
/// start. Pure — empty unless the meeting is CONFIRMED with a join link and
/// still in the future; entries whose moment already passed are dropped.
List<MeetingPushReminder> meetingReminderSchedule(AppState s, {DateTime? now}) {
  final m = s.bookedMeeting;
  if (m == null ||
      m.status != MeetingStatus.confirmed ||
      (m.joinUrl == null || m.joinUrl!.isEmpty)) {
    return const [];
  }
  final n = now ?? DateTime.now();
  // The user's clock is Israel wall time (Israel-only product) — schedule on
  // the wall-time start, same convention as the renewal reminders.
  final start = meetingLocalStart(m.meetingDate, m.slot);
  if (!start.isAfter(n)) return const [];

  final provider = m.provider == null || m.provider!.isEmpty ? '' : ' בנושא ${m.provider}';
  final out = <MeetingPushReminder>[];
  final t30 = start.subtract(const Duration(minutes: 30));
  if (t30.isAfter(n)) {
    out.add(MeetingPushReminder(
      fireAt: t30,
      title: 'הפגישה מתחילה בעוד 30 דקות',
      body: 'פגישת וידאו עם נציג$provider. הקישור זמין באפליקציה.',
      payload: 'meeting',
    ));
  }
  out.add(MeetingPushReminder(
    fireAt: start,
    title: 'הפגישה מתחילה כעת',
    body: 'הצטרפו לפגישת הוידאו$provider דרך האפליקציה.',
    payload: 'meeting',
  ));
  return out;
}
