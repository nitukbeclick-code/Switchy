import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart' as data;

/// Text-scale regression guards at the app's REAL ceiling: lib/app.dart clamps
/// accessibility text scaling to 1.3x globally (maxScaleFactor), so 1.3 is the
/// largest scale any user can reach — and exactly the scale where dense
/// layouts stripe first. These tests boot the three most at-risk screens
/// (results feed, plan detail, meeting slots grid) through the real GoRouter
/// on a 390x844 phone at 1.3x and require ZERO RenderFlex overflows.
///
/// Unlike a11y_guidelines_test.dart / availability_test.dart, overflow is NOT
/// swallowed here — overflow IS the failure signal. Fixed pumps instead of
/// pumpAndSettle: several screens run repeating entrance/shimmer animations
/// that never settle.
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

/// Boots the app at 390x844 with the platform text scale forced to 1.3 (the
/// same mechanism home_widget_test.dart / widget/plan_card_test.dart use),
/// navigates to [path], scrolls a couple of viewports through the screen's
/// primary vertical scrollable so lazily-built sections actually lay out, and
/// fails on ANY collected RenderFlex overflow.
Future<void> _expectZeroOverflowAt13x(
  WidgetTester tester, {
  required String path,
  required Type verticalScrollable,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  // 1.3 mirrors the global MediaQuery clamp ceiling in lib/app.dart:73 — the
  // worst text scale a real device can ever hand these layouts.
  tester.platformDispatcher.textScaleFactorTestValue = 1.3;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  final overflows = <String>[];
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    final s = details.exceptionAsString();
    if (s.contains('overflowed') || s.contains('RenderFlex')) {
      // Keep the full diagnostics — they name the striped widget and its
      // creation location, so a regression pinpoints itself in the failure.
      overflows.add(details.toString());
      return;
    }
    originalOnError?.call(details);
  };
  try {
    await _bootApp(tester);
    // Boot lands on the landing/onboarding route; anything it stripes is that
    // screen's own finding — judge only the target screen from here on.
    overflows.clear();
    _go(tester, path);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 600));

    // Scroll a couple of viewports so below-the-fold content is built and
    // laid out too (slivers only stripe once instantiated). warnIfMissed off:
    // on short screens the scrollable's center can sit under a floating CTA,
    // which is fine — the drag still reaches the scroll gesture arena.
    final scrollable = find.byType(verticalScrollable).first;
    for (var i = 0; i < 3; i++) {
      await tester.drag(scrollable, const Offset(0, -700),
          warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 300));
    }

    // Drain any pending timers/animations before teardown.
    await tester.pump(const Duration(seconds: 2));
  } finally {
    FlutterError.onError = originalOnError;
  }

  expect(overflows, isEmpty,
      reason: '$path must never stripe at 390x844 / 1.3x text scale:\n'
          '${overflows.join('\n')}');
}

void main() {
  testWidgets('/results renders with zero overflow at the 1.3x clamp',
      (tester) async {
    await _expectZeroOverflowAt13x(
      tester,
      path: '/results',
      verticalScrollable: CustomScrollView,
    );
  });

  testWidgets(
      '/plan/<first catalogue plan> renders with zero overflow at the 1.3x clamp',
      (tester) async {
    await _expectZeroOverflowAt13x(
      tester,
      path: '/plan/${data.allPlans.first.id}',
      verticalScrollable: CustomScrollView,
    );
  });

  testWidgets(
      '/meeting (slots grid) renders with zero overflow at the 1.3x clamp',
      (tester) async {
    await _expectZeroOverflowAt13x(
      tester,
      path: '/meeting',
      verticalScrollable: SingleChildScrollView,
    );
  });
}
