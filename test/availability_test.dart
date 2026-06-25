import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the availability / coverage-check screen
/// (lib/pages/availability/availability_widget.dart): that the page renders its
/// app bar, hero, address inputs, the four technology filter chips and the
/// "בדוק זמינות" CTA; and that tapping the CTA with no city entered surfaces the
/// validation SnackBar instead of silently dropping into the loading state.
/// Boots the full app through GoRouter exactly like the existing harnesses
/// (test/results_widget_test.dart, test/bills_widget_test.dart).
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
/// availability column is tall and can overflow in the test viewport; that is a
/// pre-existing layout artefact, not a test failure (same approach as
/// test/bills_widget_test.dart and test/results_widget_test.dart).
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
  testWidgets('Availability screen renders hero, address inputs, tech filters and CTA',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/availability');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 400));

      // App bar title.
      expect(find.text('בדיקת זמינות'), findsOneWidget);

      // Hero card headline + subtitle.
      expect(find.text('בדוק זמינות בכתובת שלך'), findsOneWidget);
      expect(find.text('גלה אילו ספקי אינטרנט פעילים באזורך'), findsOneWidget);

      // Address input labels.
      expect(find.text('עיר'), findsOneWidget);
      expect(find.text('רחוב ומספר (אופציונלי)'), findsOneWidget);

      // Technology filter section + all four chips.
      expect(find.text('סוג טכנולוגיה'), findsOneWidget);
      for (final f in ['הכל', 'סיב אופטי', 'כבלים', 'לוויין']) {
        expect(find.text(f), findsWidgets, reason: 'missing tech filter $f');
      }

      // Primary CTA in its idle label (no city -> not loading yet).
      expect(find.text('בדוק זמינות'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Tapping "בדוק זמינות" with no city shows the validation SnackBar',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/availability');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 400));

      // Tap the CTA without entering a city.
      await tester.tap(find.text('בדוק זמינות'));
      await tester.pump(); // let the SnackBar enter
      await tester.pump(const Duration(milliseconds: 300));

      // The empty-city guard surfaces a clear prompt...
      expect(find.text('הזינו עיר כדי לבדוק זמינות'), findsOneWidget);
      // ...and the page stays out of the loading state (label never flips).
      expect(find.text('בודק כיסוי...'), findsNothing);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
