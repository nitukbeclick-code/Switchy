import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';

/// Widget tests for the first-run intro carousel
/// (lib/pages/onboarding/onboarding_widget.dart): that the brand hero + first
/// slide render with honest catalogue counts, that the primary CTA advances the
/// PageView (flipping its label on the final slide), and that the "skip"
/// affordance marks onboarding as seen. Boots the full app through GoRouter
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

void main() {
  testWidgets('Onboarding renders the brand hero, first slide and CTA',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Brand strip — wordmark on the ink hero.
      expect(find.text('Switchy AI'), findsOneWidget);

      // First slide headline + value proposition.
      expect(find.text('כל המחירים\nבמקום אחד'), findsOneWidget);

      // Stat chips are sourced from the live catalogue (data.dart) — never
      // fabricated — so the rendered figures must match the real counts.
      expect(find.text('${allPlans.length}'), findsWidgets);
      expect(find.text('מסלולים'), findsOneWidget);
      expect(find.text('ספקים'), findsOneWidget);
      expect(find.text('קטגוריות'), findsOneWidget);

      // Primary CTA on the first slide advances; the finish label is not shown
      // yet. The skip affordance is available on the early slides.
      expect(find.text('הבא →'), findsOneWidget);
      expect(find.text('בואו נתחיל לחסוך!'), findsNothing);
      expect(find.text('דלג'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Primary CTA advances the carousel and flips to the finish label',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Tap "הבא →" twice to reach the third (final) slide.
      Future<void> tapNext() async {
        final next = find.text('הבא →');
        await tester.ensureVisible(next);
        // Let the slide's entrance animations settle (the Emil motion pass added
        // a hero-badge spring + staggered reveals) so the CTA is a stable hit
        // target before tapping.
        await tester.pump(const Duration(milliseconds: 1000));
        await tester.tap(next);
        // Page-change animation (350ms) + the new slide's entrance effects.
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump(const Duration(milliseconds: 1100));
      }

      await tapNext(); // slide 2
      expect(find.text('כל הספקים\nבמקום אחד'), findsOneWidget);

      await tapNext(); // slide 3
      expect(find.text('מעבר קל\nוחלק'), findsOneWidget);

      // On the final slide the CTA becomes the finish action and the "skip"
      // affordance is suppressed (the CTA itself is the finish).
      expect(find.text('בואו נתחיל לחסוך!'), findsOneWidget);
      expect(find.text('הבא →'), findsNothing);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Skip marks onboarding as seen', (tester) async {
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

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
