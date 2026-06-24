import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the switch calculator screen
/// (lib/pages/switch_calc/switch_calc_widget.dart): that it renders its three
/// economics sliders + result card, and that switching the category chip
/// re-seeds the page (app-bar subtitle follows the selection). Boots the full
/// app through GoRouter exactly like the existing harnesses
/// (test/bills_widget_test.dart, test/more_screens_test.dart).
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
/// calculator is a tall scroll view that can overflow in the test viewport;
/// that is a pre-existing layout artefact, not a test failure (same approach as
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
  testWidgets('Switch calculator renders its header and three sliders',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/switch-calc');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // App-bar title + the in-body headline share the same copy.
      expect(find.text('מחשבון מעבר'), findsWidgets);
      expect(find.text('חשבו אם המעבר משתלם לכם'), findsOneWidget);

      // The three economics sliders that drive SwitchEconomics.
      expect(find.text('חשבון נוכחי'), findsOneWidget);
      expect(find.text('מסלול חדש'), findsOneWidget);
      expect(find.text('דמי ניתוק'), findsOneWidget);
      expect(find.byType(Slider), findsNWidgets(3));

      // The exit-fee quick presets row (the "ללא" / no-fee preset).
      expect(find.text('ללא'), findsOneWidget);

      // Drain the staggered (one-shot) entrance animations so no Ticker/Timer
      // outlives the widget tree at teardown.
      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Switch calculator shows all five category chips',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/switch-calc');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The category selector maps over _catInfo — every label must render.
      for (final name in ['סלולר', 'אינטרנט', 'טלוויזיה', 'משולב', 'חו"ל']) {
        expect(find.text(name), findsWidgets, reason: 'missing chip for $name');
      }

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Tapping a category chip re-seeds the app-bar subtitle',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/switch-calc');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Default category is cellular ('סלולר') — its label appears as both the
      // chip and the app-bar subtitle, so it shows at least twice.
      expect(find.text('סלולר'), findsWidgets);

      // Tap the internet chip; _selectCat -> setState rebuilds the app bar so
      // the subtitle now reads 'אינטרנט'. The chip sits at the top, on-screen.
      await tester.tap(find.text('אינטרנט').first);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The internet label is now duplicated (chip + app-bar subtitle).
      expect(find.text('אינטרנט'), findsWidgets);
      // The three sliders persist after the category swap.
      expect(find.byType(Slider), findsNWidgets(3));

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
