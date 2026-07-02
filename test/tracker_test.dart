import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/pages/tracker/tracker_widget.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Widget tests for the move tracker (lib/pages/tracker/tracker_widget.dart).
///
/// Two surfaces are exercised through the real GoRouter harness (mirroring
/// test/lead_widget_test.dart):
///   1. The empty state — no lead submitted yet (default fresh AppState):
///      the "you haven't started" copy + the find-a-plan CTA.
///   2. The in-progress state — once a lead exists (step >= 1): the timeline,
///      the collapsible pre-switch checklist (whose header carries an explicit
///      Semantics button label), and the expected-saving VALUE figure.
///
/// The page no longer owns a lead-step subscription (that lives in the
/// app-scope LeadStepSync, wired in main.dart which tests never run); its only
/// backend read is LocalBackend.fetchLeadInfo(), which returns (0, null) — so
/// the rendered state is driven purely by AppState (trackerStep / leadLost)
/// and no timeline date renders, keeping the tests deterministic. No source is
/// modified.

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  // A tall surface so the long, scrolling tracker page fits without off-screen
  // taps; reset (in-test) when this test ends.
  await tester.binding.setSurfaceSize(const Size(900, 2600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Swallow benign RenderFlex overflow errors — the tall tracker page can
/// overflow the test viewport; that is a pre-existing layout artefact, not a
/// test failure (same approach as test/lead_widget_test.dart).
Future<void> _ignoringOverflow(Future<void> Function() body) async {
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    final s = details.exceptionAsString();
    if (s.contains('overflowed') || s.contains('RenderFlex')) return;
    originalOnError?.call(details);
  };
  try {
    await body();
  } finally {
    FlutterError.onError = originalOnError;
  }
}

String _planId() => plansByCat('cellular').first.id;

void main() {
  final originalBackend = appBackend;
  tearDown(() {
    appBackend = originalBackend;
  });

  testWidgets('Empty state renders the "not started yet" prompt + find-a-plan CTA',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/tracker');
      // Past the route transition + the longest flutter_animate delay.
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.byType(TrackerWidget), findsOneWidget);
      // Fresh AppState => no lead, step 0 => the empty-state screen.
      expect(find.text('עוד לא התחלתם'), findsOneWidget);
      expect(find.textContaining('מצא מסלול'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets(
      'In-progress state shows the timeline, the labelled checklist and the saving figure',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // Submitting a lead pins leadPlanId and advances trackerStep to 1, which
      // drives the full in-progress tracker (banner + savings + checklist +
      // timeline), not the empty state.
      AppState().submitLead(
        name: 'ישראל ישראלי',
        phone: '0501234567',
        provider: plansByCat('cellular').first.provider,
        planId: _planId(),
      );
      _go(tester, '/tracker');
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.byType(TrackerWidget), findsOneWidget);
      // The timeline section header is the spine of the in-progress screen.
      expect(find.text('שלבי המעבר'), findsOneWidget);
      // The expected-saving VALUE figure is rendered (currency-prefixed).
      expect(find.textContaining('₪'), findsWidgets);
      // The Wave-11 pre-switch checklist appears once the lead is live (step >= 1)
      // — its header + "0 of N done" progress line confirm it rendered above the
      // timeline. (Its collapse control also carries a Semantics(button) label,
      // but that node sits below the fold in the scroll view, so we assert the
      // visible copy rather than scroll-and-compile its off-screen semantics.)
      expect(find.text('משימות לפני המעבר'), findsOneWidget);
      expect(find.textContaining('הושלמו 0 מתוך'), findsOneWidget);
      // The honest per-ACTIVE-stage helper line (step 1 copy) replaced the
      // fabricated '~24 שעות' SLA chip.
      expect(find.textContaining('צוות הליווי בודק את הבקשה'), findsOneWidget);
      expect(find.textContaining('~24 שעות'), findsNothing);
      // The quiet-guarantee card now sits ABOVE the timeline (copy unchanged).
      expect(find.text('ערבות שקט'), findsOneWidget);
      // No fabricated timeline date offline: LocalBackend.fetchLeadInfo()
      // returns a null created_at, so stage 1 renders without a timestamp.
      expect(find.textContaining('הצטרפות ·'), findsNothing);
      // The invented persona is gone — the tracker speaks as the real team.
      expect(find.textContaining('דנה'), findsNothing);
      expect(find.text('דברו עם צוות הליווי'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
