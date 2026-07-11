import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the internet-provider directory
/// (lib/pages/availability/availability_widget.dart): after the honest-copy
/// reframe the page is a general per-technology provider directory — no
/// address form, no "בדוק זמינות" CTA, no fake 900ms checking delay. The list
/// renders immediately, the tech chips genuinely filter it, and the copy
/// carries the explicit caveat that per-address availability is confirmed
/// with the provider. Boots the full app through GoRouter exactly like the
/// existing harnesses (test/results_widget_test.dart,
/// test/bills_widget_test.dart).
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
/// directory column is tall and can overflow in the test viewport; that is a
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
  testWidgets('directory renders hero, tech filters and the provider list immediately',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/availability');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 400));

      // App bar title — a directory, not a lookup.
      expect(find.text('ספקי אינטרנט בישראל'), findsOneWidget);

      // Hero headline + the up-front honest caveat.
      expect(find.text('ספקי אינטרנט לפי טכנולוגיה'), findsOneWidget);
      expect(find.text('זמינות מדויקת בכתובת שלכם נבדקת ישירות מול הספק'),
          findsOneWidget);

      // Technology filter section + all four chips.
      expect(find.text('סוג טכנולוגיה'), findsOneWidget);
      for (final f in ['הכל', 'סיב אופטי', 'כבלים', 'לוויין']) {
        expect(find.text(f), findsWidgets, reason: 'missing tech filter $f');
      }

      // The list renders IMMEDIATELY — no gate, no fake check.
      expect(find.text('ספקים פעילים'), findsOneWidget);
      expect(find.text('בזק'), findsWidgets);
      expect(find.text('HOT'), findsWidgets);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('the address-check pretense is gone: no city form, no check CTA, no checking copy',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/availability');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 400));

      // The old fake-lookup surface must not come back.
      expect(find.text('בדוק זמינות'), findsNothing);
      expect(find.text('עיר'), findsNothing);
      expect(find.text('רחוב ומספר (אופציונלי)'), findsNothing);
      expect(find.textContaining('בודק זמינות ספקים'), findsNothing);
      expect(find.text('בדוק זמינות בכתובת שלך'), findsNothing);
      expect(find.byType(TextField), findsNothing);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('tech chips genuinely filter the directory (לוויין shows גילת, hides HOT)',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/availability');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 400));

      // Full list first: the cables provider is present.
      expect(find.text('HOT'), findsWidgets);

      await tester.ensureVisible(find.text('לוויין').first);
      await tester.pump();
      await tester.tap(find.text('לוויין').first);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Only the satellite provider remains in the list.
      expect(find.text('גילת'), findsWidgets);
      expect(find.text('HOT'), findsNothing);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
