import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/theme/app_theme.dart';

/// Dark-mode smoke tests for the key pages.
///
/// The app ships a full dark token set (AppTheme._dark) wired through
/// [ChosechApp]'s `themeMode`, but the rest of the suite pumps pages in light
/// mode only — a hardcoded light-only colour slipping into a page would ship
/// unnoticed. Each case here boots the REAL app with
/// [AppState.setThemeMode] = [ThemeMode.dark], navigates to a key route,
/// asserts the dark theme actually resolved ([AppTheme.dark] is true at the
/// page's Scaffold), that the page threw no exceptions, and that a key
/// semantic surface is present. Pattern follows test/nav_smoke_test.dart /
/// test/app_smoke_test.dart (full GoRouter boot, no widget stubs).
Future<void> _bootDarkApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  AppState().setThemeMode(ThemeMode.dark);

  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: AppState(),
      child: const ChosechApp(),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

/// Navigate via GoRouter using the root Navigator element.
void _navigateTo(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Swallow benign RenderFlex overflows (tall screens on the fixed 800x600
/// test surface) — same approach as test/availability_test.dart and
/// test/bills_widget_test.dart. Real exceptions still surface.
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

/// The dark theme must have RESOLVED at the page's Scaffold — not merely been
/// requested — so a page accidentally pinned to the light theme fails loudly.
void _expectDarkResolved(WidgetTester tester) {
  final ctx = tester.element(find.byType(Scaffold).first);
  expect(AppTheme.of(ctx).dark, isTrue,
      reason: 'the page must resolve the DARK AppTheme under ThemeMode.dark');
  expect(Theme.of(ctx).brightness, Brightness.dark);
}

void main() {
  // (route, seed, a key visible/semantic surface asserted per page)
  testWidgets('Home renders in dark mode without exceptions', (tester) async {
    await _ignoringOverflow(() async {
      await _bootDarkApp(tester);

      // A fresh install boots to onboarding — navigate to the Home tab.
      _navigateTo(tester, '/home');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 400));

      _expectDarkResolved(tester);
      expect(tester.takeException(), isNull);
      // Key page semantics: the notification bell keeps its a11y tooltip.
      expect(find.byTooltip('התראות'), findsOneWidget);
    });
  });

  testWidgets('Results renders in dark mode without exceptions', (tester) async {
    await _ignoringOverflow(() async {
      await _bootDarkApp(tester);
      AppState().setCategory('cellular');
      AppState().setCurrentBill('cellular', 120);

      _navigateTo(tester, '/results');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      _expectDarkResolved(tester);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('PlanDetail renders in dark mode without exceptions', (tester) async {
    await _ignoringOverflow(() async {
      await _bootDarkApp(tester);
      final plan = plansByCat('cellular').first;

      _navigateTo(tester, '/plan/${plan.id}');
      // Pump past the route transition (~300ms) + the longest flutter_animate
      // delay (~305ms) so no one-shot animation timer is left pending — same
      // cadence as test/nav_smoke_test.dart's plan-detail case.
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      _expectDarkResolved(tester);
      expect(tester.takeException(), isNull);
      // The plan's provider is on screen (page rendered real content).
      expect(find.textContaining(plan.provider), findsWidgets);
    });
  });

  testWidgets('Compare renders in dark mode without exceptions', (tester) async {
    await _ignoringOverflow(() async {
      await _bootDarkApp(tester);
      final plans = plansByCat('cellular');
      AppState().setCategory('cellular');
      AppState().setCurrentBill('cellular', 120);
      AppState().toggleCompare(plans[0].id);
      AppState().toggleCompare(plans[1].id);

      _navigateTo(tester, '/compare');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      _expectDarkResolved(tester);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('Profile renders in dark mode without exceptions', (tester) async {
    await _ignoringOverflow(() async {
      await _bootDarkApp(tester);

      _navigateTo(tester, '/profile');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      _expectDarkResolved(tester);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('Settings renders in dark mode without exceptions', (tester) async {
    await _ignoringOverflow(() async {
      await _bootDarkApp(tester);

      _navigateTo(tester, '/settings');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      _expectDarkResolved(tester);
      expect(tester.takeException(), isNull);
      // Key section heading is present in dark mode too.
      expect(find.text('התראות'), findsWidgets);
    });
  });
}
