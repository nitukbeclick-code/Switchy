import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';

/// Widget tests for the ONE-QUESTION onboarding
/// (lib/pages/onboarding/onboarding_widget.dart): slide 1 asks the single
/// cellular-bill question (preset amount chips + an honest "לא יודע" escape),
/// slide 2 shows the §7b commission disclosure with live catalogue counts, and
/// finishing lands on Home. TRUTH contract under test: a chosen amount is
/// committed via [AppState.setCurrentBill] (which personalizes the category —
/// pillar 0), while skip / "לא יודע" leave the user un-personalized so no ₪
/// figure can ever be fabricated for them. Boots the full app through GoRouter
/// exactly like the existing harnesses (test/auth_widget_test.dart,
/// test/bills_widget_test.dart) — `/onboarding` is the router's initialLocation
/// and a freshly-reset AppState (no seen/quiz/login flags) is not redirected
/// away, so the carousel is the landing surface.
Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  // Let the carousel's entrance animations run; flutter_animate effects here are
  // one-shot, so pumping past their longest delay settles the tree.
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 900));
}

/// Run [body] while swallowing benign RenderFlex overflow FlutterErrors — the
/// slides are tall and can overflow the default test viewport; that is a
/// pre-existing layout artefact, not a test failure (same approach as
/// test/auth_widget_test.dart and test/bills_widget_test.dart).
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

/// Tap a widget on the onboarding surface and pump through the page-change
/// animation (350ms) + the next slide's entrance effects.
Future<void> _tapAndSettle(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump(const Duration(milliseconds: 400));
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump(const Duration(milliseconds: 1100));
}

void main() {
  testWidgets('First slide asks the one bill question with honest chips',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Brand strip — wordmark on the ink hero.
      expect(find.text('Switchy AI'), findsOneWidget);

      // The one question + the estimate-is-fine reassurance.
      expect(find.text('כמה אתם משלמים בחודש\nעל סלולר?'), findsOneWidget);
      expect(find.text('הערכה מספיקה — תמיד אפשר לדייק אחר כך'), findsOneWidget);

      // Preset amount chips (including the ₪150+ honest floor) and the
      // "don't know" escape hatch.
      expect(find.text('₪90'), findsOneWidget);
      expect(find.text('₪150+'), findsOneWidget);
      expect(find.text('לא יודע'), findsOneWidget);

      // Primary CTA on the first slide advances; the finish label is not shown
      // yet. The skip affordance is available on the first slide.
      expect(find.text('הבא →'), findsOneWidget);
      expect(find.text('בואו נתחיל לחסוך!'), findsNothing);
      expect(find.text('דלג'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets(
      'Picking ₪90 and advancing commits the bill and shows the trust slide',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Choose the ₪90 chip, then advance.
      await _tapAndSettle(tester, find.text('₪90'));
      await _tapAndSettle(tester, find.text('הבא →'));

      // COMMIT-ON-ADVANCE: the amount the user personally chose is now the
      // recorded cellular bill AND the category is marked personalized
      // (pillar-0 TRUTH gate) — real ₪ figures may now be shown downstream.
      expect(AppState().currentBill('cellular'), 90);
      expect(AppState().billsPersonalized, isTrue);
      expect(AppState().isBillPersonalized('cellular'), isTrue);

      // Trust slide: the §7b commission disclosure (approved wording from
      // lib/legal.dart, verbatim) + LIVE catalogue counts from data.dart.
      expect(find.text('שקוף. הוגן. חינמי.'), findsOneWidget);
      expect(find.textContaining('דמי תיווך'), findsOneWidget);
      expect(find.text('${allPlans.length}'), findsWidgets);
      expect(find.text('מסלולים'), findsOneWidget);

      // On the final slide the CTA becomes the finish action and the "skip"
      // affordance is suppressed (the CTA itself is the finish).
      expect(find.text('בואו נתחיל לחסוך!'), findsOneWidget);
      expect(find.text('הבא →'), findsNothing);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Skip marks onboarding seen WITHOUT personalizing any bill',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // A fresh user has not seen onboarding yet.
      expect(AppState().seenOnboarding, isFalse);

      final skip = find.text('דלג');
      await tester.ensureVisible(skip);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(skip);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Tapping skip persists the seen flag so returning users aren't shown the
      // carousel again (the router relies on this to redirect away).
      expect(AppState().seenOnboarding, isTrue);
      // TRUTH: a skipping guest answered nothing — no bill may be fabricated,
      // so the guest stays un-personalized (and sees no ₪ figures downstream).
      expect(AppState().billsPersonalized, isFalse);
      expect(AppState().isBillPersonalized('cellular'), isFalse);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('"לא יודע" auto-advances without personalizing', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      await _tapAndSettle(tester, find.text('לא יודע'));

      // Advanced to the trust slide…
      expect(find.text('שקוף. הוגן. חינמי.'), findsOneWidget);
      expect(find.text('בואו נתחיל לחסוך!'), findsOneWidget);

      // …but an honest non-answer commits NOTHING personal: the internal seed
      // estimate stays untouched (119 — used for ranking, never displayed as
      // the user's own bill), and no category is marked personalized.
      expect(AppState().currentBill('cellular'), 119);
      expect(AppState().billsPersonalized, isFalse);
      expect(AppState().isBillPersonalized('cellular'), isFalse);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Finishing after ₪90 lands on Home with the guardian hero',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Answer the question and walk the whole flow to the finish CTA.
      await _tapAndSettle(tester, find.text('₪90'));
      await _tapAndSettle(tester, find.text('הבא →'));
      await _tapAndSettle(tester, find.text('בואו נתחיל לחסוך!'));
      // Home's own entrance effects.
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // Finish marks onboarding seen and routes to Home (approved routing
      // change — was Auth; kAuthGateRequired still enforces auth when flipped
      // on). The guardian hero greets a personalized user with their status.
      expect(AppState().seenOnboarding, isTrue);
      expect(AppState().currentBill('cellular'), 90);
      expect(find.text('כמה אתם משלמים בחודש\nעל סלולר?'), findsNothing);
      expect(find.textContaining('המצב שלך'), findsWidgets);

      await tester.pumpAndSettle(const Duration(milliseconds: 200));
      tester.takeException();
    });
  });
}
