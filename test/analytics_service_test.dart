import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/analytics_service.dart';

/// Tests for [AnalyticsService]'s pure surface — the part that runs without a
/// network or any `--dart-define` keys.
///
/// The high-value contract here is the [AnalyticsEvent] wire-name set: each
/// enum's `name` is posted to the `analytics-track` edge function, whose
/// `ALLOWED_EVENTS` set rejects anything it doesn't recognise (HTTP 400). If the
/// two drift, every beacon for the renamed event is silently dropped server-side
/// with no compile error to warn us — so we pin the exact strings here. The list
/// MUST equal `ALLOWED_EVENTS` in `supabase/functions/analytics-track/index.ts`.
void main() {
  group('AnalyticsEvent wire names', () {
    test('each event maps to its exact wire string', () {
      expect(AnalyticsEvent.leadStart.name, 'leadStart');
      expect(AnalyticsEvent.leadSubmit.name, 'leadSubmit');
      expect(AnalyticsEvent.quizComplete.name, 'quizComplete');
      expect(AnalyticsEvent.compareView.name, 'compareView');
      expect(AnalyticsEvent.searchQuery.name, 'searchQuery');
      expect(AnalyticsEvent.whatsappClick.name, 'whatsappClick');
      expect(AnalyticsEvent.savingsViewed.name, 'savingsViewed');
      expect(AnalyticsEvent.planView.name, 'planView');
    });

    test('the full wire-name set equals the edge function ALLOWED_EVENTS', () {
      // Keep this in lockstep with supabase/functions/analytics-track/index.ts.
      const allowed = {
        'leadStart',
        'leadSubmit',
        'quizComplete',
        'compareView',
        'searchQuery',
        'whatsappClick',
        'savingsViewed',
        'planView',
      };
      expect(AnalyticsEvent.values.map((e) => e.name).toSet(), equals(allowed));
    });

    test('wire names are unique (no two events share a string)', () {
      final names = AnalyticsEvent.values.map((e) => e.name).toList();
      expect(names.toSet().length, names.length);
    });
  });

  group('no-key behaviour', () {
    test('isEnabled is false without SUPABASE_URL / SUPABASE_ANON_KEY', () {
      // Tests run with no --dart-define, so the keys are empty ⇒ disabled.
      expect(AnalyticsService.isEnabled, isFalse);
    });

    test('track is a no-op that completes without throwing when disabled', () async {
      // No endpoint configured ⇒ track short-circuits before any HTTP call, so
      // it must resolve quietly even with a rich props bag (fire-and-forget).
      await expectLater(
        AnalyticsService.track(
          AnalyticsEvent.planView,
          props: {'planId': 'p1', 'category': 'cellular', 'count': 3, 'flag': true},
        ),
        completes,
      );
    });

    test('track with no props is also a quiet no-op when disabled', () async {
      await expectLater(
        AnalyticsService.track(AnalyticsEvent.searchQuery),
        completes,
      );
    });
  });
}
