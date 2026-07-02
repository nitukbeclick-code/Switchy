import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart' as data;

/// Google's OFFICIAL accessibility guidelines, run against EVERY user-facing
/// screen: androidTapTargetGuideline (every tappable ≥48×48dp) and
/// labeledTapTargetGuideline (every tappable carries a semantic label).
/// These are the exact rules Firebase Test Lab's accessibility scanner flags —
/// its 2026-07-02 Robo run reported 23 touch-target + 12 labeling findings, so
/// this suite is the local, per-commit guard that keeps that count at zero.
///
/// Screens boot through the real GoRouter at a phone-sized surface (390×844).
/// Fixed pumps instead of pumpAndSettle: several screens run repeating
/// entrance/shimmer animations that never settle.
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

/// Swallow benign RenderFlex overflows (tall screens on the fixed test
/// surface) — same approach as test/availability_test.dart. A11y guidelines
/// are asserted separately and are never affected by paint overflow.
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

/// Every static user-facing route. Parameterized screens get a real sample:
/// the first bundled catalogue plan and a real provider name. Excluded on
/// purpose: /lock (biometric gate), /crm + /analytics (admin consoles),
/// /callback + /success + /lead (mid-flow screens that assume prior state),
/// /renewal-report + /support-ticket (need a seeded row to render).
final List<String> _screens = [
  '/onboarding',
  '/auth',
  '/website',
  '/home',
  '/quiz',
  '/results',
  '/search',
  '/savings',
  '/electricity',
  '/plan/${data.allPlans.first.id}',
  '/availability',
  '/switch-calc',
  '/settings',
  '/matches',
  '/renewal',
  '/notifications',
  '/provider/סלקום',
  '/recap',
  '/wallet',
  '/referral',
  '/negotiate',
  '/switch-kit',
  '/street-price',
  '/tracker',
  '/chat',
  '/meeting',
  '/porting',
  '/account',
  '/profile',
  '/bills',
  '/ratings',
  '/compare',
];

void main() {
  for (final path in _screens) {
    testWidgets('a11y guidelines: $path', (tester) async {
      await _ignoringOverflow(() async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await _bootApp(tester);
        _go(tester, path);
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 600));

        final handle = tester.ensureSemantics();
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        handle.dispose();

        // Drain any pending timers/animations before teardown.
        await tester.pump(const Duration(seconds: 2));
        tester.takeException();
      });
    });
  }
}
