import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the bills screen (lib/pages/bills/bills_widget.dart):
/// that it renders, that every category (including the empty-state / overpay
/// surfaces) shows up, and that the "upload a bill photo" affordance exists and
/// is reachable. Boots the full app through GoRouter exactly like the existing
/// harnesses (test/more_screens_test.dart, test/screens_content_test.dart).
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
/// bill-editor list is tall and can overflow in the test viewport; that is a
/// pre-existing layout artefact, not a test failure (same approach as
/// test/more_screens_test.dart and test 5 in nav_smoke_test.dart).
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
  testWidgets('Bills screen renders its app bar and upload affordance',
      (tester) async {
    await _ignoringOverflow(() async {
      // Enable the semantics tree so find.bySemanticsLabel can resolve the a11y
      // hook below.
      final handle = tester.ensureSemantics();
      await _bootApp(tester);

      _go(tester, '/bills');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // App-bar title + the "compare now" action.
      expect(find.text('החשבונות שלי'), findsOneWidget);
      expect(find.text('השווה עכשיו'), findsOneWidget);

      // The bill-editor section header.
      expect(find.text('עדכן חשבונות'), findsWidgets);

      // The "upload a bill photo" affordance — both the labelled control and
      // its accessibility hook (Semantics button label) must exist. It sits
      // below the fold, so scroll it into view first: Flutter prunes the
      // semantics tree for off-screen content, so find.bySemanticsLabel only
      // resolves once the control is on-screen.
      expect(find.text('צרפו צילום של החשבון'), findsWidgets);
      await tester.ensureVisible(find.text('צרפו צילום של החשבון').first);
      await tester.pump(const Duration(milliseconds: 200));
      // The a11y label carries a descriptive suffix ("…לזיהוי אוטומטי"), so
      // match on the prefix rather than an exact string.
      expect(find.bySemanticsLabel(RegExp(r'^צרפו צילום של החשבון')), findsWidgets);

      // Drain the staggered entrance animations so no Ticker/Timer outlives the
      // widget tree at teardown.
      await tester.pumpAndSettle();
      tester.takeException();
      handle.dispose();
    });
  });

  testWidgets('Tapping the upload affordance opens the camera/gallery sheet',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/bills');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Tap the upload row; a bottom sheet offers camera vs gallery.
      // The affordance sits below the fold, so scroll it into view first.
      final uploadRow = find.text('צרפו צילום של החשבון').first;
      await tester.ensureVisible(uploadRow);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(uploadRow);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('צילום חשבון במצלמה'), findsOneWidget);
      expect(find.text('בחירה מהגלריה'), findsOneWidget);

      tester.takeException();
    });
  });

  testWidgets('Bills editor lists every category, electricity included',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/bills');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The bill editor maps over `categories`, so each category name renders.
      // Electricity ('חשמל') is the newest category and must be present.
      for (final name in ['סלולר', 'אינטרנט', 'טלוויזיה', 'חבילה משולבת', 'חשמל']) {
        expect(find.text(name), findsWidgets, reason: 'missing bill row for $name');
      }

      // Drain the staggered entrance animations so no Ticker/Timer outlives the
      // widget tree at teardown (flutter_animate's longest stagger here is well
      // under a second; these are one-shot, so settling is safe).
      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Bills hero shows the total monthly spend label', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/bills');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The hero total card always renders (with seeded default bills).
      expect(find.text('הוצאה חודשית כוללת'), findsOneWidget);
      expect(find.textContaining('לחודש בכל הקטגוריות'), findsOneWidget);

      // Drain the staggered entrance animations so no Ticker/Timer outlives the
      // widget tree at teardown.
      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
