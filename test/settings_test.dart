import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the settings screen
/// (lib/pages/settings/settings_widget.dart): that it renders its sections, and
/// that two key controls drive AppState — the price-alert notification toggle
/// and the theme segmented control. Boots the full app through GoRouter exactly
/// like the existing harnesses (test/bills_widget_test.dart,
/// test/plan_detail_widget_test.dart) and navigates to /settings.
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

/// Navigate via GoRouter using the root Navigator element.
void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Run [body] while swallowing benign RenderFlex overflow FlutterErrors — the
/// settings list is tall and can overflow in the test viewport; that is a
/// pre-existing layout artefact, not a test failure (same approach as
/// test/bills_widget_test.dart and test/more_screens_test.dart).
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
  testWidgets('Settings screen renders its app bar and section headers',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/settings');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // App-bar title.
      expect(find.text('הגדרות'), findsOneWidget);

      // The static section headers each render once.
      expect(find.text('התראות'), findsOneWidget);
      expect(find.text('נתונים ופרטיות'), findsOneWidget);
      expect(find.text('מראה'), findsOneWidget);
      expect(find.text('אודות'), findsOneWidget);

      // A representative notification toggle row.
      expect(find.text('התראות מחיר'), findsOneWidget);

      // Drain the staggered one-shot entrance animations so no Ticker/Timer
      // outlives the widget tree at teardown.
      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Toggling the price-alert switch flips the AppState preference',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/settings');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      final appState = AppState();
      // Seeded default is true (see app_state.dart `_prefPriceAlerts = true`).
      expect(appState.prefPriceAlerts, isTrue);

      // The first Switch in the tree is the price-alert toggle.
      final priceSwitch = find.byType(Switch).first;
      await tester.ensureVisible(priceSwitch);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(priceSwitch);
      await tester.pump(const Duration(milliseconds: 300));

      // The toggle drove the single source of truth.
      expect(appState.prefPriceAlerts, isFalse);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Tapping the theme segment switches AppState.themeMode',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/settings');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      final appState = AppState();
      // Default theme mode is system.
      expect(appState.themeMode, ThemeMode.system);

      // The light segment exposes a visible 'בהיר' label wrapped by an
      // accessible Semantics(button:true, label:'בהיר'). It sits below the fold,
      // so scroll it into view first.
      final lightLabel = find.text('בהיר');
      await tester.ensureVisible(lightLabel);
      await tester.pump(const Duration(milliseconds: 200));

      // The a11y hook is wired: the segment is an accessible button labelled
      // 'בהיר' (asserted on the Semantics widget so it's independent of how the
      // compiled semantics tree merges sibling labels in RTL).
      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics &&
              w.properties.button == true &&
              w.properties.label == 'בהיר',
        ),
        findsOneWidget,
      );

      // Tap the segment via its visible label (wrapped by the GestureDetector).
      await tester.tap(lightLabel);
      await tester.pump(const Duration(milliseconds: 300));

      // The segmented control drove AppState.themeMode.
      expect(appState.themeMode, ThemeMode.light);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
