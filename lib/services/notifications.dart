import '../app_state.dart';
import '../data.dart';
import '../models.dart';
import 'backend/backend.dart' show MeetingStatus;
import 'meeting_slots.dart' show formatMeetingDateHe, meetingLocalStart;
import 'price_change_event.dart';
import 'recommendation_engine.dart';

/// The kind of actionable alert, used to pick an icon/accent in the UI.
///
/// Note: price-drop alerts use [savings] so existing switch expressions on this
/// enum remain exhaustive. A dedicated [priceDrop] value can be introduced once
/// all call sites are updated.
enum NotifKind { renewal, betterDeal, savings, meeting, info, communityReply, communityLike, priceTarget }

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

  /// Convenience factory for a price-drop alert derived from a [PriceChangeEvent].
  /// Deep-links to the plan's detail screen via [routeName] = 'PlanDetail'.
  factory AppNotification.priceDrop(PriceChangeEvent event) {
    final monthly = event.saving;
    final annual = event.savingAnnual;
    final monthlyStr = monthly == monthly.roundToDouble()
        ? monthly.toInt().toString()
        : monthly.toStringAsFixed(2);
    final annualStr = annual == annual.roundToDouble()
        ? annual.toInt().toString()
        : annual.toStringAsFixed(2);
    final newStr = event.newPrice == event.newPrice.roundToDouble()
        ? event.newPrice.toInt().toString()
        : event.newPrice.toStringAsFixed(2);
    return AppNotification(
      id: 'price_drop_${event.planId}',
      kind: NotifKind.savings, // price drops are a savings opportunity
      title: 'מחיר ירד! ${event.provider}',
      body: '${event.planName} ירד ל-₪$newStr — חיסכון של ₪$monthlyStr לחודש (₪$annualStr בשנה)',
      routeName: 'PlanDetail',
      planId: event.planId,
      priority: 750 + annual.toInt().clamp(0, 250),
    );
  }

  /// Factory for a community reply alert — someone replied to the user's post.
  factory AppNotification.communityReply({
    required String postId,
    required String authorName,
    required String snippet,
  }) => AppNotification(
    id: 'reply_$postId',
    kind: NotifKind.communityReply,
    title: 'תגובה חדשה',
    body: '$authorName הגיב על הפוסט שלך: «$snippet»',
    routeName: 'Community',
    priority: 300,
  );

  /// Factory for a community like alert — the user's post received likes.
  factory AppNotification.communityLike({
    required String postId,
    required int likerCount,
  }) => AppNotification(
    id: 'like_$postId',
    kind: NotifKind.communityLike,
    title: 'הפוסט שלך קיבל לייקים',
    body: 'הפוסט שלך קיבל $likerCount לייקים 🎉',
    routeName: 'Community',
    priority: 200,
  );

  /// Factory for a price-target alert — a watched plan reached the ₪ goal the
  /// user set for it. Deep-links to the plan's detail screen.
  factory AppNotification.priceTarget({
    required String planId,
    required String provider,
    required String planName,
    required int currentPrice,
    required int targetPrice,
  }) => AppNotification(
    id: 'price_target_$planId',
    kind: NotifKind.priceTarget,
    title: '🎯 הגעת ליעד המחיר!',
    body: '$provider · $planName עומד על ₪$currentPrice — היעד שלך היה ₪$targetPrice',
    routeName: 'PlanDetail',
    planId: planId,
    priority: 700,
  );
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

  // 3b) Price-target alerts — a plan reached the ₪ goal the user set for it.
  // Gated on the Price Alerts toggle; skipped when the monthly saving vs the
  // user's current bill is below their minimum-saving threshold (no bill set →
  // always show, since setting a target is an explicit user intent).
  if (s.prefPriceAlerts) {
    for (final entry in s.priceTargets.entries) {
      final plan = planById(entry.key);
      if (plan == null) continue;
      final price = plan.priceValue.round();
      if (price > entry.value) continue; // target not reached yet
      final bill = s.currentBill(plan.cat);
      if (bill > 0 && (bill - price) < s.minSavingAlert) continue; // too small to alert
      out.add(AppNotification.priceTarget(
        planId: plan.id,
        provider: plan.provider,
        planName: plan.plan,
        currentPrice: price,
        targetPrice: entry.value,
      ));
    }
  }

  // 3c) Price-drop alerts — a watched plan whose price fell since we last showed
  // it, detected by PushNotificationService.syncPriceDrops. Gated on Price Alerts.
  if (s.prefPriceAlerts) {
    for (final entry in s.priceDrops.entries) {
      final d = entry.value;
      final oldPrice = (d['oldPrice'] as num).toInt();
      final newPrice = (d['newPrice'] as num).toInt();
      if (newPrice >= oldPrice) continue; // stale (price recovered)
      out.add(AppNotification.priceDrop(PriceChangeEvent(
        planId: entry.key,
        planName: d['planName'] as String,
        provider: d['provider'] as String,
        oldPrice: oldPrice.toDouble(),
        newPrice: newPrice.toDouble(),
      )));
    }
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
