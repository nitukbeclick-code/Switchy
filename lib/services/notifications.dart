import '../app_state.dart';
import '../data.dart';
import '../models.dart';
import 'backend/backend.dart' show MeetingStatus, CommunityNotification;
import 'backend/local_backend.dart' show appBackend;
import 'meeting_slots.dart' show formatMeetingDateHe, meetingLocalStart;
import 'recommendation_engine.dart';

/// The kind of actionable alert, used to pick an icon/accent in the UI.
enum NotifKind { renewal, betterDeal, savings, meeting, community, info }

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
    this.unread = false,
    this.createdAt,
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
  final bool unread; // community notifs: show an unread dot until read
  final DateTime? createdAt; // community notifs: drive relative-time display
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

/// Fetches stored community notifications (someone replied to / mentioned the
/// user) from the backend and maps them to [AppNotification]s, newest first.
///
/// Unlike [computeNotifications] these are *events* persisted server-side, so
/// this path is async. Each deep-links to the community feed (the `/community`
/// route takes no path params today, so we don't attach the post id — once a
/// per-post route exists, set [AppNotification.pathParameters] to `{'postId':…}`
/// and the post id is already carried in [CommunityNotification.postId]).
/// Failures degrade to an empty list so the notification center still renders
/// its computed alerts.
Future<List<AppNotification>> fetchCommunityNotifications() async {
  final List<CommunityNotification> rows;
  try {
    rows = await appBackend.fetchCommunityNotifications();
  } catch (_) {
    return const [];
  }
  final out = <AppNotification>[];
  for (final n in rows) {
    final title = _communityNotifTitle(n);
    if (title == null) continue; // skip kinds we don't surface (e.g. 'flag')
    out.add(AppNotification(
      id: 'community_${n.id}',
      kind: NotifKind.community,
      title: title,
      body: _communityNotifBody(n),
      routeName: 'Community',
      unread: n.readAt == null,
      createdAt: n.createdAt,
      priority: 600, // above better-deal/savings, below renewal/meeting-today
    ));
  }
  return out;
}

/// Hebrew headline for a community notification, or null for kinds the center
/// doesn't surface to the post's author.
String? _communityNotifTitle(CommunityNotification n) {
  final actor = (n.actor == null || n.actor!.isEmpty) ? 'מישהו' : n.actor!;
  return switch (n.kind) {
    'reply' => '$actor הגיב/ה לפוסט שלך',
    'mention' => '$actor הזכיר/ה אותך בקהילה',
    _ => null,
  };
}

String _communityNotifBody(CommunityNotification n) => switch (n.kind) {
      'mention' => 'הקש/י כדי לראות את האזכור בקהילה',
      _ => 'הקש/י כדי לראות את התגובה בקהילה',
    };

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
