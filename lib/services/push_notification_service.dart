import '../app_state.dart';
import '../data.dart' show planById, allPlans;
import '../models.dart' show Plan;
import 'notifications.dart';
import 'price_change_event.dart';
import 'price_target.dart';
import 'reminder_schedule.dart';
import 'backend/local_backend.dart' show appBackend;
import 'push_native.dart' as impl;

/// App-facing push facade. Platform-agnostic: it computes the (pure) renewal
/// schedule and hands it to the conditional native impl (`push_native.dart`),
/// which is a no-op on web. Login/opt-in is optional — scheduling only happens
/// when the user has turned on renewal reminders ([AppState.renewalReminders]).
class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  bool _ready = false;

  /// Initialize the plugin + timezone DB. Safe (no-op) on web. Call once at startup.
  Future<void> init() async {
    await impl.initPush();
    _ready = true;
  }

  /// Ask the OS for notification permission (Android 13+ / iOS). Returns whether
  /// it was granted. No-op/false on web.
  Future<bool> requestPermission() => impl.requestPush();

  /// (Re)schedule EVERYTHING from the pure schedules in one pass: renewal
  /// reminders (when opted in) + video-meeting reminders. One pass because the
  /// native impl reschedules from scratch (cancelAll) — separate calls would
  /// wipe each other's notifications. Idempotent; safe on every startup,
  /// opt-in toggle, tracked-plan change or meeting update.
  Future<void> syncAll(AppState state) async {
    if (!_ready) return;
    final renewals = state.renewalReminders
        ? renewalReminderSchedule(
            state,
            daysBefore: state.renewalDaysAhead,
            atTime: _parseHHmm(state.renewalReminderTime),
          )
        : const <ScheduledReminder>[];
    final meetings = meetingReminderSchedule(state);
    if (renewals.isEmpty && meetings.isEmpty) {
      await impl.cancelAllPush();
      return;
    }
    await impl.scheduleAll(renewals, meetings);
  }

  /// Back-compat alias — existing call sites sync everything now.
  Future<void> syncRenewalReminders(AppState state) => syncAll(state);

  /// Parse a 'HH:mm' reminder-time preference into an (hour, minute) record, or
  /// null when blank/malformed (callers then keep the date-only default).
  ({int hour, int minute})? _parseHHmm(String? s) {
    if (s == null) return null;
    final parts = s.split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return (hour: h, minute: m);
  }

  /// Fire an OS push for any price target that has been reached, honouring the
  /// Price Alerts toggle, the minimum-saving threshold and the alert-frequency
  /// cadence. Records what it pushed so a still-met target isn't re-pushed
  /// within its window. No-op on web (impl.showNow is a no-op there). Safe to
  /// call on startup and whenever a target is set.
  Future<void> syncPriceAlerts(AppState state, {DateTime? now}) async {
    if (!state.prefPriceAlerts) return;
    final n = now ?? DateTime.now();
    final due = PriceTarget.dueForPush(
      targets: state.priceTargets,
      currentPriceOf: (id) => planById(id)?.priceValue.round() ?? (1 << 30),
      lastNotifiedIso: state.priceAlertNotified,
      frequency: state.alertFrequency,
      now: n,
    );
    if (due.isEmpty) return;
    if (!_ready) await init();
    for (final id in due) {
      final plan = planById(id);
      if (plan == null) continue;
      final price = plan.priceValue.round();
      final bill = state.currentBill(plan.cat);
      if (bill > 0 && (bill - price) < state.minSavingAlert) continue; // too small
      final target = state.priceTargetFor(id) ?? price;
      await impl.showNow(
        id: 'price_target_$id'.hashCode & 0x7fffffff,
        title: '🎯 הגעת ליעד המחיר!',
        body: '${plan.provider} · ${plan.plan} עומד על ₪$price — היעד שלך היה ₪$target',
        payload: id,
      );
      state.markPriceAlertNotified(id, n.toIso8601String());
    }
  }

  /// Detect price drops for the user's watched plans: record each on AppState
  /// (so the notification center surfaces it) and fire a one-shot OS push.
  /// Compares the current catalogue (real prices when the backend serves them,
  /// else the static catalogue) against the last-seen baseline, then refreshes
  /// the baseline. Gated on the Price Alerts toggle. [catalogue] can be injected
  /// (tests); otherwise it's fetched. No-op push on web.
  Future<void> syncPriceDrops(AppState state, {List<Plan>? catalogue}) async {
    if (!state.prefPriceAlerts) return;
    final all = catalogue ?? await _currentCatalogue();
    final byId = {for (final p in all) p.id: p};
    final watched =
        state.watchedPlans.map((id) => byId[id]).whereType<Plan>().toList();
    if (watched.isEmpty) return;

    final baseline = <String, int>{};
    for (final id in state.watchedPlans) {
      final b = state.lastSeenPrice(id);
      if (b != null) baseline[id] = b;
    }

    final result = watchedDrops(
      watchedPlans: watched,
      baseline: baseline,
      minSaving: state.minSavingAlert,
    );

    for (final id in result.recovered) {
      state.clearPriceDrop(id);
    }
    for (final e in result.drops) {
      state.recordPriceDrop(
        planId: e.planId,
        planName: e.planName,
        provider: e.provider,
        oldPrice: e.oldPrice.round(),
        newPrice: e.newPrice.round(),
      );
      await notifyPriceDrop(
        planId: e.planId,
        planName: e.planName,
        provider: e.provider,
        oldPrice: e.oldPrice,
        newPrice: e.newPrice,
        appState: state,
      );
    }
    state.recordSeenPrices(result.newBaseline);
  }

  /// The live catalogue: real prices from the backend when available, else the
  /// bundled static catalogue (so detection still has data offline).
  Future<List<Plan>> _currentCatalogue() async {
    try {
      final fetched = await appBackend.fetchPlans();
      if (fetched.isNotEmpty) return fetched;
    } catch (_) {}
    return allPlans;
  }

  /// Show an immediate local notification when a watched plan's price drops.
  ///
  /// Calculates the monthly and annual saving from [oldPrice] vs [newPrice] and
  /// fires a one-shot notification. Safe to call without a prior [init] — it
  /// will self-initialise if needed. The notification id is derived from
  /// [planId] so repeated calls for the same plan don't stack.
  Future<void> notifyPriceDrop({
    required String planId,
    required String planName,
    required String provider,
    required double oldPrice,
    required double newPrice,
    required AppState appState,
  }) async {
    if (!appState.prefPriceAlerts) return;
    if (!_ready) await init();
    final monthly = (oldPrice - newPrice).abs();
    final annual = monthly * 12;
    final monthlyStr = monthly == monthly.roundToDouble()
        ? monthly.toInt().toString()
        : monthly.toStringAsFixed(2);
    final annualStr = annual == annual.roundToDouble()
        ? annual.toInt().toString()
        : annual.toStringAsFixed(2);
    final oldStr = oldPrice == oldPrice.roundToDouble()
        ? oldPrice.toInt().toString()
        : oldPrice.toStringAsFixed(2);
    final newStr = newPrice == newPrice.roundToDouble()
        ? newPrice.toInt().toString()
        : newPrice.toStringAsFixed(2);
    await impl.showNow(
      id: planId.hashCode & 0x7fffffff, // keep positive for notification id
      title: '📉 מחיר ירד! $provider',
      body:
          'תוכנית $planName ירדה מ-₪$oldStr ל-₪$newStr — חיסכון של ₪$monthlyStr לחודש (₪$annualStr בשנה)!',
      payload: planId,
    );
  }

  /// Show an immediate local notification when someone replies to the user's
  /// community post, if the user has community notifications enabled.
  Future<void> notifyCommunityReply({
    required AppState appState,
    required String postId,
    required String authorName,
    required String snippet,
  }) async {
    if (!appState.prefCommunityNotifs) return;
    if (!_ready) await init();
    final notif = AppNotification.communityReply(
      postId: postId,
      authorName: authorName,
      snippet: snippet,
    );
    await impl.showNow(
      id: postId.hashCode & 0x7fffffff,
      title: notif.title,
      body: notif.body,
      payload: postId,
    );
  }

  /// Show an immediate local notification when the user's community post
  /// receives likes, if the user has community notifications enabled.
  Future<void> notifyCommunityLike({
    required AppState appState,
    required String postId,
    required int likerCount,
  }) async {
    if (!appState.prefCommunityNotifs) return;
    if (!_ready) await init();
    final notif = AppNotification.communityLike(
      postId: postId,
      likerCount: likerCount,
    );
    await impl.showNow(
      id: 'like_$postId'.hashCode & 0x7fffffff,
      title: notif.title,
      body: notif.body,
      payload: postId,
    );
  }

  /// Show an immediate local notification when the status of one of the user's
  /// support requests / leads changes, if the user has request updates enabled.
  ///
  /// The notification id is derived from [requestId] so repeated updates for the
  /// same request don't stack. [requestId] is also used as the deep-link payload.
  Future<void> notifyRequestUpdate({
    required String title,
    required String body,
    required AppState appState,
    String? requestId,
  }) async {
    if (!appState.prefRequestUpdates) return;
    if (!_ready) await init();
    final payload = requestId ?? title;
    await impl.showNow(
      id: payload.hashCode & 0x7fffffff, // keep positive for notification id
      title: title,
      body: body,
      payload: payload,
    );
  }

  /// Show an immediate local notification for a time-limited flash deal.
  ///
  /// [savingsPercent] is the percentage saving vs the market average.
  Future<void> notifyFlashDeal({
    required String planName,
    required String provider,
    required double price,
    required double savingsPercent,
  }) async {
    if (!_ready) await init();
    final priceStr = price == price.roundToDouble()
        ? price.toInt().toString()
        : price.toStringAsFixed(2);
    // Use a stable id derived from the plan name + provider so concurrent flash
    // deals for different providers don't collide.
    final id = '$planName:$provider'.hashCode & 0x7fffffff;
    await impl.showNow(
      id: id,
      title: '🔥 מבצע חם! $provider',
      body:
          '$planName — ₪$priceStr בלבד! חיסכון של ${savingsPercent.toStringAsFixed(0)}% מהממוצע. מהרו, המבצע לזמן מוגבל!',
    );
  }
}
