import 'dart:async';

import '../app_state.dart';
import 'backend/local_backend.dart' show appBackend;
import 'push_notification_service.dart';

/// The notification a lead-step transition earned — title + body only.
/// The copy is fixed, approved Hebrew grounded in the REAL status transition;
/// nothing here fabricates a timestamp, an SLA or a presence claim.
class LeadStepNotice {
  const LeadStepNotice({required this.title, required this.body});
  final String title;
  final String body;
}

/// PURE decision: should this lead-step transition notify the user, and with
/// what copy? Top-level and side-effect-free so it unit-tests without Flutter.
///
/// Rules:
/// * [optIn] ([AppState.prefRequestUpdates]) gates EVERYTHING — off ⇒ null.
/// * Forward progress notifies once per step: requires [newStep] > [prevStep],
///   [newStep] > [lastNotified] (the persisted dedupe across restarts), and
///   [prevStep] > 0 — a cold hydrate (prev == 0) NEVER announces old news.
/// * A terminal 'lost' lead ([newStep] == -1) fires once per session
///   ([wasLost] false→true), regardless of [lastNotified].
/// * Only steps with approved copy (2, 4, lost) return a notice; any other
///   step is null — we never invent copy for an unmapped step.
LeadStepNotice? decideLeadStepNotice({
  required int prevStep,
  required int newStep,
  required bool optIn,
  required int lastNotified,
  required bool wasLost,
}) {
  if (!optIn) return null;
  if (newStep == -1) {
    if (wasLost) return null; // already announced this session
    return const LeadStepNotice(
      title: 'הפנייה נסגרה',
      body: 'הטיפול בפנייה הסתיים — אפשר תמיד להתחיל חיפוש חדש',
    );
  }
  if (prevStep <= 0) return null; // cold hydrate — never announce old news
  if (newStep <= prevStep) return null; // backwards / repeat — not progress
  if (newStep <= lastNotified) return null; // already notified (persisted)
  switch (newStep) {
    case 2:
      return const LeadStepNotice(
        title: 'המסלול אושר! שלב 2 מתוך 4',
        body: 'צוות הליווי אישר את הבקשה — מדריך הניתוק הוא השלב הבא',
      );
    case 4:
      return const LeadStepNotice(
        title: 'המעבר הושלם! שלב 4 מתוך 4',
        body: 'ברוכים הבאים לחבילה החדשה',
      );
    default:
      return null; // no approved copy for this step — stay silent
  }
}

/// App-level mirror of the user's lead (switch-request) pipeline step.
///
/// The rep advances the lead from the CRM while the user is anywhere in the
/// app (or away) — so, exactly like [MeetingSync], the Realtime subscription
/// must live at app scope, not inside the tracker screen. [start] is called
/// from `main.dart` after the persisted state loads.
class LeadStepSync {
  LeadStepSync._();

  static StreamSubscription<int>? _sub;

  /// (Re)subscribe to the backend's lead-step stream and hydrate once from the
  /// server. Safe to call repeatedly — the previous subscription is replaced.
  /// The old cancel is deliberately NOT awaited: we are replacing the listener,
  /// not draining it, and awaiting a subscription created in another zone can
  /// hang (e.g. across flutter_test fake-async zones).
  static Future<void> start() async {
    unawaited(_sub?.cancel());
    _sub = appBackend.leadStepStream().listen(apply);
    await refresh();
  }

  /// One-shot server hydrate (cold start — covers users who were offline when
  /// the rep updated the lead status). 0 means "no lead" so nothing to apply.
  static Future<void> refresh() async {
    try {
      final step = await appBackend.fetchLeadStep();
      if (step != 0) apply(step);
    } catch (_) {/* offline — the persisted state is the fallback */}
  }

  /// Applies one lead-step value: decides the (optional) notification FIRST —
  /// against the pre-transition state — then mirrors the step into [AppState].
  static void apply(int newStep) {
    final s = AppState();
    final notice = decideLeadStepNotice(
      prevStep: s.trackerStep,
      newStep: newStep,
      optIn: s.prefRequestUpdates,
      lastNotified: s.lastNotifiedLeadStep,
      wasLost: s.leadLost,
    );
    if (newStep == -1) {
      s.setLeadLost(true); // terminal — the rep closed the pipeline
    } else {
      if (s.leadLost) s.setLeadLost(false);
      s.setTrackerStep(newStep); // forward-only guard lives in AppState
    }
    if (notice != null) {
      PushNotificationService.instance
          .notifyLeadUpdate(title: notice.title, body: notice.body);
      s.setLastNotifiedLeadStep(newStep);
    }
  }

  static Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }
}
