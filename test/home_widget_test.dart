import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Widget tests for the home screen (lib/pages/home/home_widget.dart).
///
/// Home is pure over [AppState] + the static catalogue (no backend fetch), so
/// these boot the real app and drive the real GoRouter to `/home` — exercising
/// the actual render path, not a stubbed harness. Assertions stay on stable,
/// honest copy: the greeting, the savings hero, the section headers, and the
/// accessibility labels the file promises (per CLAUDE.md's a11y convention).
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

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

/// Swallow benign RenderFlex overflow errors (pre-existing layout quirks on the
/// narrow test surface), matching test/a11y_test.dart & more_screens_test.dart.
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
  tearDown(() {
    appBackend = LocalBackend();
  });

  testWidgets('renders the greeting and the savings hero', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/home');
      await _settle(tester);

      // The time-of-day greeting prefix is always one of these four.
      final greetings = ['בוקר טוב,', 'צהריים טובים,', 'ערב טוב,', 'לילה טוב,'];
      expect(greetings.any((g) => find.textContaining(g).evaluate().isNotEmpty),
          isTrue, reason: 'expected a Hebrew time-of-day greeting');

      // The restructured hero leads with a calm headline and a SINGLE green CTA.
      // A fresh guest is not bills-personalized, so the headline invites the
      // quiz and the CTA is a calm BROWSE verb ("find packages") — never a
      // savings-pushy promise at this browse-only moment (canonical CRO copy).
      expect(find.text('בואו נמצא לך מסלול משתלם'), findsOneWidget);
      expect(find.text('חפשו חבילות ←'), findsOneWidget);
    });
  });

  testWidgets('the hero never fabricates a savings figure for a fresh guest',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/home');
      await _settle(tester);

      // A fresh guest has no bills, so the engine has no real saving to report.
      // The hero must NOT invent a ₪ figure — it shows the neutral prompt and
      // never the personalized "potential saving up to ₪X" line.
      expect(find.text('השוו מחירים והתחילו לחסוך'), findsOneWidget);
      expect(find.textContaining('חיסכון פוטנציאלי עד'), findsNothing);
    });
  });

  testWidgets('renders the category grid and tools section', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/home');
      await _settle(tester);

      // These sections live lower in the lazy CustomScrollView — scroll them in.
      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(
        find.text('השוואה לפי קטגוריה'), 300,
        scrollable: scrollable,
      );
      await tester.pump();
      expect(find.text('השוואה לפי קטגוריה'), findsOneWidget);
      // The five plan categories render as grid cards (סלולר among them).
      expect(find.text('סלולר'), findsWidgets);

      await tester.scrollUntilVisible(
        find.text('כלים שימושיים'), 300,
        scrollable: scrollable,
      );
      await tester.pump();
      expect(find.text('כלים שימושיים'), findsOneWidget);
    });
  });

  testWidgets('icon-only header controls carry tooltips / a11y labels',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/home');
      await _settle(tester);

      // The notification bell is icon-only; per the a11y convention it carries a
      // tooltip (which Flutter also exposes as a semantics label).
      expect(find.byTooltip('התראות'), findsOneWidget);
      // The header search affordance is wrapped in a labelled Semantics button.
      final searchSemantics = find.descendant(
        of: find.byType(Semantics),
        matching: find.text('חפש ספק או מסלול...'),
      );
      expect(searchSemantics, findsOneWidget);
    });
  });

  testWidgets('the callback FAB is icon-only but carries a tooltip',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/home');
      await _settle(tester);

      // The floating callback button has no visible label; it must expose a
      // tooltip (= semantics label) so it isn't a silent icon to assistive tech.
      expect(find.byTooltip('בקשת שיחה חוזרת'), findsOneWidget);
    });
  });

  testWidgets(
      'home renders with ZERO overflow at a 390px viewport and 1.3x text scale',
      (tester) async {
    // Regression guard for the live-tour bank-grade findings: the category
    // grid used to stripe "BOTTOM OVERFLOWED BY ~13 PIXELS" (childAspectRatio
    // 1.85 was too tight for icon+title+count+price) and the activity tiles by
    // 1px, on a 390-wide phone. Unlike the other tests, this one does NOT
    // swallow RenderFlex overflow — it collects every overflow error and
    // requires none, under the exact conditions of the findings.
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    final overflows = <String>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      final s = details.exceptionAsString();
      if (s.contains('overflowed') || s.contains('RenderFlex')) {
        // Keep the full diagnostics (they name the error-causing widget and its
        // creation location) so a regression pinpoints itself in the failure.
        overflows.add(details.toString());
        return;
      }
      originalOnError?.call(details);
    };
    try {
      await _bootApp(tester);
      // Boot lands on the landing/onboarding route; anything it stripes is that
      // screen's own finding, not home's - judge home only from here on.
      overflows.clear();
      _go(tester, '/home');
      await _settle(tester);
      // Watch a plan so the "הפעילות שלך" horizontal tiles actually render
      // (finding 2 lived in those cards).
      AppState().toggleWatch(allPlans.first.id);
      await _settle(tester);

      // Scroll the whole feed through the viewport so every section lays out
      // (the category grid lives below the fold on a 390x844 phone).
      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(
        find.text('השוואה לפי קטגוריה'), 300,
        scrollable: scrollable,
      );
      await tester.pump();
      await tester.scrollUntilVisible(
        find.text('כלים שימושיים'), 300,
        scrollable: scrollable,
      );
      await tester.pump();
    } finally {
      FlutterError.onError = originalOnError;
    }

    expect(overflows, isEmpty,
        reason: 'home must never stripe at 390px / 1.3x text scale:\n'
            '${overflows.join('\n')}');
  });
}
