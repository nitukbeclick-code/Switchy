import '../app_state.dart';
import '../data.dart';
import '../models.dart';
import 'backend/backend.dart' show MeetingStatus;
import 'meeting_slots.dart' show formatMeetingDateHe, meetingLocalStart;
import 'recommendation_engine.dart';

/// The kind of actionable alert, used to pick an icon/accent in the UI.
enum NotifKind { renewal, betterDeal, savings, meeting, info }

/// A computed, actionable notification. These are derived on the fly from app
/// state (tracked plans, watchlist, bills) rather than stored as events, so they
/// always reflect the latest data. [id] is a stable key used for dismissal.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    this.routeName,
    this.pathParameters,
    this.planId,
    this.category,
    this.priority = 0,
  });

  final String id;
  final NotifKind kind;
  final String title;
  final String body;
  final String? routeName; // go_router route name to open on tap
  final Map<String, String>? pathParameters; // path params for [routeName]
  final String? planId; // when set, tap should open this plan's detail
  final String? category; // when set, set this category before navigating
  final int priority; // higher sorts first
}

/// Builds the list of actionable notifications for [s], newest/most-urgent
/// first, excluding any the user has dismissed. Pure function over app state.
List<AppNotification> computeNotifications(AppState s) {
  final out = <AppNotification>[];

  // 1) Renewal alerts — a tracked plan whose promo ends within 30 days.
  for (final p in s.myPlans) {
    final d = p.daysUntilRenewal;
    if (d == null || d > 30) continue;
    final expired = d <= 0;
    out.add(AppNotification(
      id: 'renewal_${p.id}',
      kind: NotifKind.renewal,
      title: expired
          ? 'המבצע ב${p.provider} הסתיים'
          : 'המבצע ב${p.provider} מסתיים בעוד $d ימים',
      body: 'טבלת השוואה מלאה מחכה לך — ${p.planName}',
      routeName: 'RenewalReport',
      pathParameters: {'trackedId': p.id},
      category: p.category,
      priority: expired ? 1000 : 1000 - d,
    ));
  }

  // 2) Better-deal alerts — a watched plan the engine can clearly beat.
  for (final id in s.watchedPlans) {
    final watched = planById(id);
    if (watched == null) continue;
    final better = _betterDeal(s, watched);
    if (better == null) continue;
    out.add(AppNotification(
      id: 'better_$id',
      kind: NotifKind.betterDeal,
      title: 'מצאנו מסלול טוב יותר מ${watched.provider}',
      body: better.annualSaving > 0
          ? '${better.plan.provider} — חוסך ₪${better.annualSaving}/שנה (${better.scorePct}% התאמה)'
          : '${better.plan.provider} — ${better.scorePct}% התאמה',
      routeName: 'PlanDetail',
      planId: better.plan.id,
      priority: 500 + better.scorePct,
    ));
  }

  // 3) A single top-savings insight across the user's active categories — only
  // once the user has entered a real bill, so we never quote a specific saving
  // figure based on the seed defaults.
  PlanMatch? topSaving;
  if (s.billsPersonalized) {
    for (final c in categories) {
      final bill = s.currentBill(c.id);
      if (bill <= 0) continue;
      final m = RecommendationEngine.bestMatch(MatchProfile.fromAppState(s, c.id));
      if (m == null || m.annualSaving <= 0) continue;
      if (topSaving == null || m.annualSaving > topSaving.annualSaving) topSaving = m;
    }
  }
  if (topSaving != null && topSaving.annualSaving >= 300) {
    out.add(AppNotification(
      id: 'savings_${topSaving.plan.id}',
      kind: NotifKind.savings,
      title: 'יש לך חיסכון של ₪${topSaving.annualSaving} בשנה',
      body: '${topSaving.plan.provider} — ${topSaving.plan.plan}',
      routeName: 'PlanDetail',
      planId: topSaving.plan.id,
      category: topSaving.plan.cat,
      priority: 200,
    ));
  }

  // 4) Video-meeting status — the user's booked Zoom meeting with a rep.
  final meeting = s.bookedMeeting;
  if (meeting != null) {
    final start = meetingLocalStart(meeting.meetingDate, meeting.slot);
    final now = DateTime.now();
    final dateHe = '${formatMeetingDateHe(start)} בשעה ${meeting.slot}';
    final provider =
        meeting.provider == null || meeting.provider!.isEmpty ? '' : ' · ${meeting.provider}';
    switch (meeting.status) {
      case MeetingStatus.confirmed:
        if (start.add(const Duration(minutes: 30)).isAfter(now)) {
          final isToday = start.year == now.year && start.month == now.month && start.day == now.day;
          out.add(AppNotification(
            id: 'meeting_confirmed_${meeting.id}',
            kind: NotifKind.meeting,
            title: 'פגישת הוידאו אושרה',
            body: '$dateHe$provider. הקישור זמין במסך הפגישה.',
            routeName: 'Meeting',
            priority: isToday ? 1200 : 900,
          ));
        }
      case MeetingStatus.pending:
        if (start.isAfter(now)) {
          out.add(AppNotification(
            id: 'meeting_pending_${meeting.id}',
            kind: NotifKind.meeting,
            title: 'בקשת פגישת הוידאו נשלחה',
            body: '$dateHe$provider. נעדכן כשנציג יאשר את המועד.',
            routeName: 'Meeting',
            priority: 400,
          ));
        }
      case MeetingStatus.noRep:
        out.add(AppNotification(
          id: 'meeting_norep_${meeting.id}',
          kind: NotifKind.meeting,
          title: 'לא נמצא נציג זמין למועד שביקשתם',
          body: 'בחרו מועד חדש ונשמח לקיים את הפגישה.',
          routeName: 'Meeting',
          priority: 800,
        ));
      case MeetingStatus.expired:
        out.add(AppNotification(
          id: 'meeting_expired_${meeting.id}',
          kind: NotifKind.meeting,
          title: 'מועד הפגישה חלף ללא אישור',
          body: 'ניתן לקבוע מועד חדש במסך הפגישה.',
          routeName: 'Meeting',
          priority: 800,
        ));
      case MeetingStatus.cancelled || MeetingStatus.completed:
        break; // terminal, nothing actionable
    }
  }

  out.removeWhere((n) => s.isNotificationDismissed(n.id));
  out.sort((a, b) => b.priority.compareTo(a.priority));
  return out;
}

/// Count of actionable, non-dismissed notifications (for the bell badge).
int notificationCount(AppState s) => computeNotifications(s).length;

/// The best alternative to [watched] in its category, or null if none is clearly
/// better (score margin > 4 and either cheaper or with a positive saving).
PlanMatch? _betterDeal(AppState s, Plan watched) {
  final profile = MatchProfile.fromAppState(s, watched.cat);
  final watchedScore = RecommendationEngine.scorePlan(watched, profile).score;
  for (final m in RecommendationEngine.rank(profile)) {
    if (m.plan.id == watched.id) continue;
    if (m.score > watchedScore + 4 && (m.plan.price < watched.price || m.annualSaving > 0)) {
      return m;
    }
  }
  return null;
}
