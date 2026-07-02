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

      // The guardian hero: a fresh guest has NO personalized bills, so it
      // shows the 30-second setup prompt and its CTA — never a status row or
      // an available-saving pill (TRUTH-ONLY: no figures without real bills).
      expect(find.text('הזינו את החשבון שלכם ב-30 שניות'), findsOneWidget);
      expect(find.text('הזינו את החשבון ←'), findsOneWidget);
      expect(find.textContaining('חיסכון זמין'), findsNothing);
    });
  });

  testWidgets('the hero never fabricates a savings figure for a fresh guest',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/home');
      await _settle(tester);

      // A fresh guest has no bills, so the engine has no real saving to report.
      // The hero must NOT invent a ₪ figure — it shows the honest "real
      // numbers, not estimates" sub-line and neither the legacy potential line
      // nor the personalized status/available-saving treatment.
      expect(find.text('בלי הערכות — נחשב לכם חיסכון אמיתי מהמספרים שלכם'),
          findsOneWidget);
      expect(find.textContaining('חיסכון פוטנציאלי עד'), findsNothing);
      expect(find.textContaining('חיסכון זמין'), findsNothing);
      expect(find.text('המצב שלך'), findsNothing);
    });
  });

  testWidgets(
      'guardian hero shows the REAL entered figure and a real available saving',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // The user PERSONALLY enters a ₪200/month cellular bill.
      AppState().setCurrentBill('cellular', 200);
      _go(tester, '/home');
      await _settle(tester);

      // Bank-balance status: the overline + the EXACT figure the user entered
      // (PriceText renders '₪200' as a single text node) + a real available
      // saving in the pill (₪200 is beatable in the cellular catalogue).
      expect(find.text('המצב שלך'), findsOneWidget);
      expect(find.text('₪200'), findsOneWidget);
      expect(find.textContaining('חיסכון זמין: ₪'), findsOneWidget);
      expect(find.text('השוו מסלולים ←'), findsOneWidget);
    });
  });

  testWidgets(
      'guardian hero: honest good-price state when the bill cannot be beaten',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // A bill at (the floor of) the cheapest REAL catalogue price in the
      // category — no plan can undercut it, so the engine reports zero
      // available saving and the hero must say so honestly, without a pill.
      final cheapest = plansByCat('cellular')
          .map((p) => p.priceValue)
          .reduce((a, b) => a < b ? a : b)
          .floor();
      expect(cheapest, greaterThan(0),
          reason: 'the cheapest cellular plan must cost something for this '
              'state to be reachable');
      AppState().setCurrentBill('cellular', cheapest);
      _go(tester, '/home');
      await _settle(tester);

      expect(find.text('המצב שלך'), findsOneWidget);
      expect(find.textContaining('אתם במחיר טוב'), findsOneWidget);
      // TRUTH guards: no fabricated saving pill, no alert promise (the app
      // has no closed-app market watch, so it must not say "נתריע").
      expect(find.textContaining('חיסכון זמין'), findsNothing);
      expect(find.textContaining('נתריע'), findsNothing);
    });
  });

  testWidgets('the "הערך שלי" row surfaces the four value destinations',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/home');
      await _settle(tester);

      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(
        find.text('הערך שלי'), 300,
        scrollable: scrollable,
      );
      await tester.pump();
      expect(find.text('הערך שלי'), findsOneWidget);
      // The four tiles — entry points only, NO ₪ figures in the row.
      expect(find.text('החיסכון שלי'), findsOneWidget);
      expect(find.text('הארנק'), findsOneWidget);
      expect(find.text('סיכום שנתי'), findsOneWidget);
      expect(find.text('הזמינו חברים'), findsOneWidget);
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

  // Shared harness for the zero-overflow guard — run once as a guest and once
  // bills-personalized (the guardian hero renders a completely different
  // status row/pill in the personalized state, so both must be striped-free).
  Future<void> zeroOverflowAt390(WidgetTester tester,
      {required bool personalized}) async {
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
      if (personalized) {
        // A real entered bill → the guardian hero renders the status row +
        // available-saving pill (the widest hero content).
        AppState().setCurrentBill('cellular', 200);
      }
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
        reason: 'home must never stripe at 390px / 1.3x text scale '
            '(personalized: $personalized):\n${overflows.join('\n')}');
  }

  testWidgets(
      'home (guest) renders with ZERO overflow at a 390px viewport and 1.3x text scale',
      (tester) async {
    await zeroOverflowAt390(tester, personalized: false);
  });

  testWidgets(
      'home (personalized) renders with ZERO overflow at a 390px viewport and 1.3x text scale',
      (tester) async {
    await zeroOverflowAt390(tester, personalized: true);
  });
}
