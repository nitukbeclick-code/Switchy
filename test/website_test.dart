import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the marketing website page
/// (lib/pages/website/website_widget.dart).
///
/// The page is pure over the static catalogue + [AppState] (no backend fetch),
/// so these boot the real app and drive the real GoRouter to `/website` — the
/// full-screen route that sits OUTSIDE the bottom-nav shell (per CLAUDE.md the
/// website is a root-navigator route). Assertions stay on stable, honest copy
/// — the section headers and the savings framing — plus two self-contained
/// interactions: the category tabs swapping the bill-input prompt, and the FAQ
/// accordion revealing its answer on tap. Boots via the same harness as
/// test/home_widget_test.dart & test/bills_widget_test.dart.
Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

/// Navigate via GoRouter using the root Navigator element.
void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Let the staggered (one-shot) flutter_animate entrances run without using
/// pumpAndSettle — the page has long-running TweenAnimationBuilder stat
/// counters and AnimatedSwitchers that never quiesce, so a fixed-duration pump
/// is the right tool here (mirrors test/home_widget_test.dart's `_settle`).
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

/// Run [body] while swallowing benign RenderFlex overflow FlutterErrors — the
/// long single-column landing page overflows the narrow test viewport, a
/// pre-existing layout artefact (same approach as test/more_screens_test.dart,
/// test/home_widget_test.dart and test/bills_widget_test.dart).
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

void main() {
  testWidgets('renders the hero, the section headers and honest framing',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/website');
      await _settle(tester);

      // The hero headline + the sticky-nav brand chip are fixed copy.
      expect(find.text('השוואת מחירי תקשורת\nהכי חכמה בישראל'), findsOneWidget);
      expect(find.text('Switchy AI'), findsWidgets);

      // The savings figure is framed as potential, never "you saved X": the
      // hero card prompts the current cellular bill and the comparison header
      // renders. (default cellular bill of ₪119 yields a positive saving.)
      expect(find.text('מה אתם משלמים היום על סלולר?'), findsOneWidget);

      // "השוואת מחירים" lives in a sliver below the fold of the test viewport,
      // so the CustomScrollView hasn't lazily built it yet — scroll it into view
      // before asserting (same pattern as the storytelling-sections test below).
      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text('השוואת מחירים'), 300,
          scrollable: scrollable);
      await tester.pump();
      expect(find.text('השוואת מחירים'), findsWidgets);
    });
  });

  testWidgets('the storytelling sections (how-it-works, why, FAQ) render',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/website');
      await _settle(tester);

      // These section headers live lower in the lazy CustomScrollView — scroll
      // each into view before asserting it.
      final scrollable = find.byType(Scrollable).first;
      for (final header in const ['איך זה עובד?', 'למה Switchy AI?', 'שאלות נפוצות']) {
        await tester.scrollUntilVisible(find.text(header), 300,
            scrollable: scrollable);
        await tester.pump();
        expect(find.text(header), findsOneWidget, reason: 'missing "$header"');
      }
    });
  });

  testWidgets('switching the category tab swaps the bill-input prompt',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/website');
      await _settle(tester);

      // The comparison block defaults to the cellular tab, whose bill-input
      // prompt reads "…על סלולר?". The internet prompt is absent until its tab
      // is selected.
      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text('השוואת מחירים'), 300,
          scrollable: scrollable);
      await tester.pump();
      expect(find.text('מה אתם משלמים על סלולר?'), findsOneWidget);
      expect(find.text('מה אתם משלמים על אינטרנט?'), findsNothing);

      // Tap the "אינטרנט" category chip; the active category's bill prompt
      // re-renders for internet (setState path in _buildCatBillInput).
      await tester.tap(find.text('אינטרנט').first);
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('מה אתם משלמים על אינטרנט?'), findsOneWidget);
      expect(find.text('מה אתם משלמים על סלולר?'), findsNothing);
    });
  });

  testWidgets('tapping a FAQ row expands its answer', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/website');
      await _settle(tester);

      // Scroll the FAQ section in and pick the first question.
      const question = 'האם השירות חינמי?';
      const answer =
          'כן! Switchy AI הוא שירות חינמי לחלוטין. אנחנו מרוויחים עמלה מהספקים, לא ממך.';
      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text(question), 300,
          scrollable: scrollable);
      await tester.pump();

      // Collapsed by default: the question shows, the answer is hidden.
      expect(find.text(question), findsOneWidget);
      expect(find.text(answer), findsNothing);

      // Tapping the row toggles it open (the _FAQ StatefulWidget's `_open`).
      await tester.ensureVisible(find.text(question));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(find.text(question));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text(answer), findsOneWidget);
    });
  });
}
