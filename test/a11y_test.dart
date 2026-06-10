import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Boot the full app exactly like the existing harnesses
/// (test/screens_content_test.dart, test/more_screens_test.dart).
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

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

/// Run [body] while swallowing benign RenderFlex overflow FlutterErrors
/// (pre-existing layout issues in the app, not test failures) — same
/// approach as test/more_screens_test.dart.
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
  testWidgets('Ratings review form stars expose accessible rate buttons',
      (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);

      _go(tester, '/ratings');
      await _settle(tester);

      // The review form sits below the leaderboard; bring it on-screen so
      // its semantics are compiled (the free-text field sits right under
      // the star rows, so this scrolls the whole form into view).
      await tester.ensureVisible(find.byType(TextField).first);
      await _settle(tester);

      // Every rating dimension exposes 5 labelled star buttons
      // ("דרג X מתוך 5 — <dimension>"); spot-check the corners of the grid.
      expect(find.bySemanticsLabel('דרג 1 מתוך 5 — מחיר'), findsOneWidget);
      expect(find.bySemanticsLabel('דרג 5 מתוך 5 — מחיר'), findsOneWidget);
      expect(find.bySemanticsLabel('דרג 3 מתוך 5 — שירות'), findsOneWidget);
      expect(find.bySemanticsLabel('דרג 1 מתוך 5 — כיסוי'), findsOneWidget);
      expect(find.bySemanticsLabel('דרג 5 מתוך 5 — מהירות'), findsOneWidget);

      handle.dispose();
      tester.takeException();
    });
  });

  testWidgets('Chat input row exposes a labelled send button', (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);

      _go(tester, '/chat');
      await _settle(tester);

      expect(find.bySemanticsLabel('שלח הודעה'), findsOneWidget);

      handle.dispose();
      tester.takeException();
    });
  });

  testWidgets('AI advisor input row exposes a labelled send button',
      (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);

      _go(tester, '/advisor');
      await _settle(tester);

      expect(find.bySemanticsLabel('שלח הודעה'), findsOneWidget);

      handle.dispose();
      tester.takeException();
    });
  });

  testWidgets('Search clear control exposes the "נקה חיפוש" label',
      (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);

      _go(tester, '/search');
      await _settle(tester);

      // The clear (X) control only appears once a query is typed.
      await tester.enterText(find.byType(TextField).first, 'בזק');
      await _settle(tester);

      expect(find.bySemanticsLabel('נקה חיפוש'), findsOneWidget);

      handle.dispose();
      tester.takeException();
    });
  });
}
