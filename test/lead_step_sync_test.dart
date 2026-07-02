import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/lead_step_sync.dart';

/// Unit tests for the lead-step sync (lib/services/lead_step_sync.dart).
///
/// 1. `decideLeadStepNotice` — the PURE notification decision, table-driven:
///    a cold hydrate (prev == 0) never fires; a real advance fires exactly
///    once (persisted lastNotified dedupes repeats); opt-out silences
///    everything; a terminal 'lost' fires once per session regardless of
///    lastNotified; backwards / repeated / unmapped steps stay silent.
/// 2. `LeadStepSync.apply` — the state mirror: -1 flips AppState.leadLost, a
///    live step clears it and advances trackerStep (forward-only), and only a
///    genuinely-notified advance records lastNotifiedLeadStep.
///
/// PushNotificationService is never init()ed here, so notifyLeadUpdate is a
/// guarded no-op — no platform channel is touched.

class _Case {
  const _Case(
    this.name, {
    required this.prev,
    required this.next,
    this.optIn = true,
    this.lastNotified = 0,
    this.wasLost = false,
    this.expectTitle,
  });

  final String name;
  final int prev;
  final int next;
  final bool optIn;
  final int lastNotified;
  final bool wasLost;

  /// Expected notice title, or null when the transition must stay silent.
  final String? expectTitle;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('decideLeadStepNotice (pure)', () {
    const cases = <_Case>[
      // Cold hydrate: prev == 0 means "the app just learned the step" — the
      // user must never be pinged about old news on launch.
      _Case('cold hydrate to step 2 never fires', prev: 0, next: 2),
      _Case('cold hydrate to step 4 never fires', prev: 0, next: 4),
      // Real advances fire — with the approved copy.
      _Case('advance 1→2 fires the step-2 notice',
          prev: 1, next: 2, expectTitle: 'המסלול אושר! שלב 2 מתוך 4'),
      _Case('advance 2→4 fires the step-4 notice',
          prev: 2,
          next: 4,
          lastNotified: 2,
          expectTitle: 'המעבר הושלם! שלב 4 מתוך 4'),
      // Dedupe: once notified (persisted), a repeat of the same step is silent.
      _Case('already-notified step is deduped',
          prev: 1, next: 2, lastNotified: 2),
      // Opt-in gates everything.
      _Case('opt-out silences progress', prev: 1, next: 2, optIn: false),
      _Case('opt-out silences lost too', prev: 2, next: -1, optIn: false),
      // Lost fires once per session, regardless of lastNotified.
      _Case('lost fires the closed notice',
          prev: 2, next: -1, expectTitle: 'הפנייה נסגרה'),
      _Case('lost ignores lastNotified',
          prev: 2, next: -1, lastNotified: 4, expectTitle: 'הפנייה נסגרה'),
      _Case('lost never re-fires within a session',
          prev: 2, next: -1, wasLost: true),
      // Never notify on non-progress.
      _Case('backwards step never fires', prev: 3, next: 2),
      _Case('same step never fires', prev: 2, next: 2),
      // No approved copy for step 3 — stay silent rather than invent copy.
      _Case('unmapped step 3 stays silent', prev: 2, next: 3),
    ];

    for (final c in cases) {
      test(c.name, () {
        final notice = decideLeadStepNotice(
          prevStep: c.prev,
          newStep: c.next,
          optIn: c.optIn,
          lastNotified: c.lastNotified,
          wasLost: c.wasLost,
        );
        if (c.expectTitle == null) {
          expect(notice, isNull);
        } else {
          expect(notice, isNotNull);
          expect(notice!.title, c.expectTitle);
          expect(notice.body, isNotEmpty);
        }
      });
    }

    test('notices carry the approved body copy verbatim', () {
      expect(
        decideLeadStepNotice(
                prevStep: 1, newStep: 2, optIn: true, lastNotified: 0, wasLost: false)!
            .body,
        'צוות הליווי אישר את הבקשה — מדריך הניתוק הוא השלב הבא',
      );
      expect(
        decideLeadStepNotice(
                prevStep: 2, newStep: 4, optIn: true, lastNotified: 0, wasLost: false)!
            .body,
        'ברוכים הבאים לחבילה החדשה',
      );
      expect(
        decideLeadStepNotice(
                prevStep: 1, newStep: -1, optIn: true, lastNotified: 0, wasLost: false)!
            .body,
        'הטיפול בפנייה הסתיים — אפשר תמיד להתחיל חיפוש חדש',
      );
    });
  });

  group('LeadStepSync.apply (state mirror)', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      AppState.reset();
      await AppState().initializePersistedState();
    });

    test('-1 flips leadLost; a live step clears it and advances', () {
      AppState().setTrackerStep(1);
      LeadStepSync.apply(-1);
      expect(AppState().leadLost, isTrue);
      // trackerStep is untouched by 'lost' (it can't go backwards).
      expect(AppState().trackerStep, 1);

      LeadStepSync.apply(2);
      expect(AppState().leadLost, isFalse);
      expect(AppState().trackerStep, 2);
    });

    test('a real advance records lastNotifiedLeadStep', () {
      AppState().setTrackerStep(1);
      LeadStepSync.apply(2);
      expect(AppState().lastNotifiedLeadStep, 2);
    });

    test('cold hydrate applies the step but records no notification', () {
      // prev == 0 (fresh state): the step lands, but no notice is minted so
      // lastNotifiedLeadStep stays 0 — the launch never re-announces old news.
      LeadStepSync.apply(2);
      expect(AppState().trackerStep, 2);
      expect(AppState().lastNotifiedLeadStep, 0);
    });

    test('backwards stream values never regress trackerStep', () {
      AppState().setTrackerStep(3);
      LeadStepSync.apply(2);
      expect(AppState().trackerStep, 3);
    });
  });
}
