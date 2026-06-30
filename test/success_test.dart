import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/pages/success/success_widget.dart';

/// Widget tests for the lead-confirmation / "success" screen
/// (lib/pages/success/success_widget.dart): that the celebration hero renders
/// the personalised greeting + headline, the "what happens next" checklist and
/// both forward CTAs (track / home), and that — when a lead plan is present —
/// the plan-summary card surfaces the chosen provider + plan. Boots the full
/// app through GoRouter exactly like the sibling harnesses
/// (test/results_widget_test.dart, test/lead_widget_test.dart).
///
/// NOTE: this page runs persistent flutter_animate effects (the checkmark
/// shake) plus a staggered checklist driven by delayed setStates, so we pump
/// fixed durations and never pumpAndSettle (which would hang on the pending
/// animation/timer chain).
Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  // Tall surface so the scrolling celebration column lays out without the
  // CTAs falling off-screen.
  await tester.binding.setSurfaceSize(const Size(900, 2400));
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

/// Swallow benign RenderFlex overflow errors — the tall celebration column can
/// overflow the test viewport; that is a layout artefact, not a test failure
/// (same approach as test/lead_widget_test.dart).
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

/// Settle the route transition + the longest flutter_animate fade-in delay
/// (the "back home" link reveals at ~900ms) and the full checklist chain
/// (900 + 500 + 500ms) — without pumpAndSettle.
Future<void> _settleHero(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

void main() {
  testWidgets(
      'Success renders the greeting, headline, checklist and both forward CTAs',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/success');
      await _settleHero(tester);

      expect(find.byType(SuccessWidget), findsOneWidget);

      // Personalised greeting (default firstName is the guest token "אורח").
      expect(find.textContaining('קיבלנו,'), findsOneWidget);
      // Confirmation headline.
      expect(find.text('הבקשה נשלחה בהצלחה'), findsOneWidget);

      // The "what happens next" checklist + all three steps.
      expect(find.text('מה קורה עכשיו?'), findsOneWidget);
      expect(find.text('הבקשה נקלטה במערכת'), findsOneWidget);
      expect(find.text('בדרך כלל נחזור אליכם תוך שעה, בשעות הפעילות'), findsOneWidget);
      expect(find.text('ניוד המספר תוך 1–3 ימי עסקים'), findsOneWidget);

      // Both forward navigations are offered.
      expect(find.text('מעקב אחר התהליך'), findsWidgets);
      expect(find.text('חזרה לדף הבית'), findsOneWidget);

      tester.takeException();
    });
  });

  testWidgets('A pending lead surfaces the plan-summary card', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Seed a real lead so SuccessWidget resolves a plan and shows the card.
      final plan = plansByCat('cellular').first;
      AppState().submitLead(
        name: 'ישראל ישראלי',
        phone: '0501234567',
        provider: plan.provider,
        planId: plan.id,
      );

      _go(tester, '/success');
      await _settleHero(tester);

      // The summary card echoes the chosen provider + plan name.
      expect(find.text(plan.provider), findsWidgets);
      expect(find.text(plan.plan), findsOneWidget);
      // The price line carries the per-unit suffix owned by priceUnitShort().
      expect(
        find.textContaining('₪${plan.priceText}/${priceUnitShort(plan)}'),
        findsOneWidget,
      );

      tester.takeException();
    });
  });
}
