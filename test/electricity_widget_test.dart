import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data/plans_electricity.dart';
import 'package:chosech/pages/electricity/electricity_widget.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Widget tests for the חשמל (electricity) screen
/// (lib/pages/electricity/electricity_widget.dart).
///
/// The page is pure over the static [electricityPlans] catalogue (no backend
/// fetch), so these boot the real app and drive the real GoRouter to
/// `/electricity` — exercising the actual render path. Assertions stay on stable,
/// honest copy: the indicative caveat (the truth-only gate for this category),
/// the real supplier names, and the a11y labels the file promises.
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
  // Pump past the route transition + the longest one-shot flutter_animate delay
  // (~500ms cap) so no animation timer is left pending.
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

/// Swallow benign RenderFlex overflow errors (pre-existing layout quirks on the
/// narrow test surface), matching test/home_widget_test.dart & a11y_test.dart.
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

  testWidgets('renders the electricity screen without exceptions',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/electricity');
      await _settle(tester);

      expect(find.byType(ElectricityWidget), findsOneWidget);
      expect(tester.takeException(), isNull);
      // The hero title.
      expect(find.text('חשמל'), findsWidgets);
    });
  });

  testWidgets('shows the indicative "verify with supplier" caveat',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/electricity');
      await _settle(tester);

      // The truth-only gate for this category: electricity offers are a % off
      // the regulated tariff, so the figure is indicative — the page says so.
      expect(find.text('אינדיקטיבי — לאימות מול הספק'), findsOneWidget);
    });
  });

  testWidgets('renders the REAL electricity suppliers from the seed',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/electricity');
      await _settle(tester);

      // Walk the lazy list, collecting which seeded suppliers we can see as we
      // scroll down — every real supplier from the catalogue must appear (no
      // invented names, and none missing). Robust to card heights / the fold.
      final expected = electricityPlans.map((p) => p.provider).toSet();
      final seen = <String>{};
      final scrollable = find.byType(Scrollable).first;

      void sweep() {
        for (final provider in expected) {
          if (find.text(provider).evaluate().isNotEmpty) seen.add(provider);
        }
      }

      sweep();
      for (var step = 0; step < 12 && seen.length < expected.length; step++) {
        // Drag, then let the ballistic scroll + one-shot card animations fully
        // settle so no Timer is left pending at teardown.
        await tester.drag(scrollable, const Offset(0, -300));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
        sweep();
      }
      expect(seen, equals(expected),
          reason: 'every real electricity supplier should render; '
              'missing: ${expected.difference(seen)}');
    });
  });

  testWidgets('plan cards expose an a11y label for assistive tech',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/electricity');
      await _settle(tester);

      // Each card is a labelled Semantics button ("פתח את פרטי המסלול …") so it
      // isn't a silent tap target — per CLAUDE.md's a11y convention. The list is
      // sorted ascending by the indicative price, so the cheapest plan is the
      // top (always-built) card — assert its exact summary label is declared on
      // a Semantics(button: true) wrapper.
      final topPlan = [...electricityPlans]
          .reduce((a, b) => a.priceValue <= b.priceValue ? a : b);
      final expectedLabel =
          'פתח את פרטי המסלול ${topPlan.provider} — ${topPlan.plan}';
      final labelledButton = find.byWidgetPredicate(
        (w) => w is Semantics &&
            w.properties.button == true &&
            w.properties.label == expectedLabel,
      );
      expect(labelledButton, findsOneWidget,
          reason: 'the card should declare a labelled Semantics button');
      // The back control is icon-only and carries a tooltip (= semantics label).
      expect(find.byTooltip('חזרה'), findsOneWidget);
    });
  });
}
