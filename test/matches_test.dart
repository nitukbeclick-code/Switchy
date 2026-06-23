import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/widgets/whatsapp_button.dart';

/// Widget tests for the Wave-3 Matches screen
/// (lib/pages/matches/matches_widget.dart).
///
/// Boots the full app and navigates to /matches via GoRouter (same harness as
/// test/more_screens_test.dart). The screen derives its cards from
/// computeSavings(AppState); the default bills are non-zero, so cards render
/// without any extra setup.

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

void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

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

/// Drain flutter_animate's one-shot "restart" timer (scheduled in
/// _AnimateState.initState) plus the hero counter tween, so the test doesn't
/// trip the binding's "A Timer is still pending after dispose" invariant. The
/// page's entrance animations are finite (no idle pulse), so a generous fixed
/// pump fully settles them.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(seconds: 2));
}

void main() {
  testWidgets(
      'match cards show reasons, a saving figure, the action row and the WhatsApp CTA',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/matches');
      await _settle(tester);

      // Screen chrome.
      expect(find.text('ההתאמות שלי'), findsOneWidget);

      // Each match card explains itself: the "why it fits" header is rendered
      // whenever the engine produced at least one reason (it does for the
      // default cellular/internet/tv bills, which all beat the market).
      expect(find.text('למה זה מתאים לך'), findsWidgets);

      // A per-card match-score badge ("NN% התאמה").
      expect(find.textContaining('% התאמה'), findsWidgets);

      // A saving figure surfaces somewhere on the page (hero + per-card pills).
      expect(find.textContaining('₪'), findsWidgets);

      // The action row: details + compare on every card.
      expect(find.text('פרטים'), findsWidgets);
      expect(find.text('השוואה'), findsWidgets);

      // The brand-green WhatsApp lead CTA — one per card.
      expect(find.byType(WhatsAppButton), findsWidgets);
      expect(find.textContaining('קבלו הצעה ל'), findsWidgets);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('tapping "השוואה" flips compare state and raises the sticky bar',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/matches');
      await _settle(tester);

      // Nothing in compare yet — the action reads "השוואה", not "בהשוואה".
      expect(AppState().comparePlans, isEmpty);
      expect(find.text('בהשוואה'), findsNothing);

      // Tap the first card's compare action. The label sits inside a
      // Material/InkWell (_MatchAction); tap the InkWell so the gesture lands on
      // the real tap target rather than the inert Text glyph.
      final compareInk = find
          .ancestor(of: find.text('השוואה'), matching: find.byType(InkWell))
          .first;
      await tester.ensureVisible(compareInk);
      await tester.pump();
      await tester.tap(compareInk);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // State flipped: a plan is now queued for comparison and at least one
      // card's action relabelled to "בהשוואה".
      expect(AppState().comparePlans, hasLength(1));
      expect(find.text('בהשוואה'), findsWidgets);

      // The sticky compare bar surfaces with its count + the "השוואה ←" CTA.
      expect(find.textContaining('השווה 1 מסלולים'), findsOneWidget);
      expect(find.text('השוואה ←'), findsOneWidget);

      // Let the sticky-bar slide-in animation finish before teardown.
      await tester.pump(const Duration(milliseconds: 600));
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('shows the empty state with a quiz CTA when no bills are set',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // No bills → no per-category best match → the empty state.
      AppState().resetAllBills();

      _go(tester, '/matches');
      await _settle(tester);

      expect(find.text('עדיין אין התאמות'), findsOneWidget);
      expect(find.text('התחל שאלון'), findsOneWidget);
      // No match cards, hence no action row.
      expect(find.text('פרטים'), findsNothing);

      expect(tester.takeException(), isNull);
    });
  });
}
