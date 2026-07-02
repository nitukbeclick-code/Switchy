import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart' show catalogueSyncedAt;

/// Widget tests for the results / catalogue-browse screen
/// (lib/pages/results/results_widget.dart): the category tab bar renders, the
/// single control rail (sort chips + the "סינון" chip) renders, the merged
/// bill-baseline row opens the bill sheet whose ±10 steppers expose accessible
/// labels, a real category lists plans, and a nonsense search collapses to the
/// empty state with its recovery CTAs. Boots the full app through GoRouter
/// like the existing harnesses (test/bills_widget_test.dart).
Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  // The freshness badge is now data-driven on the live-sync timestamp; pin it so
  // "עודכן היום" renders deterministically here (no live sync runs in the test).
  catalogueSyncedAt = DateTime.now().toUtc();
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

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
  testWidgets(
      'Results renders category tabs, the control rail and the baseline row',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // The catalogue defaults to the cellular category on a fresh boot.
      AppState().setCategory('cellular');

      _go(tester, '/results');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Category tab bar (top) — every category chip is present.
      for (final name in ['סלולר', 'אינטרנט', 'טלוויזיה', 'משולב', 'חו"ל']) {
        expect(find.text(name), findsWidgets, reason: 'missing tab $name');
      }

      // The ONE control rail: sort chips (incl. the AI smart-sort) + the
      // "סינון" chip that opens the filter sheet.
      expect(find.text('התאמה חכמה'), findsOneWidget);
      expect(find.text('הכי זול'), findsOneWidget);
      expect(find.text('סינון'), findsWidgets);

      // The freshness cue + the merged bill-baseline row (the old stepper
      // card and the "מחושב מול" strip collapsed into one line).
      expect(find.text('עודכן היום'), findsOneWidget);
      expect(find.textContaining('החיסכון מחושב מול'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Baseline row opens the bill sheet with labelled ±10 steppers',
      (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);
      // The catalogue defaults to the cellular category on a fresh boot.
      AppState().setCategory('cellular');

      _go(tester, '/results');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The merged baseline row exposes the labelled edit action (the visible
      // text is the ambiguous "ערוך"/"הזן חשבון אמיתי").
      final editAction = find.bySemanticsLabel('ערוך את החשבון החודשי');
      expect(editAction, findsOneWidget);

      // Tapping it opens the bill sheet — where the ±10 stepper buttons now
      // live (relocated from the old inline card, same setCurrentBill logic)
      // — each labelled for screen readers.
      await tester.tap(editAction);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.bySemanticsLabel('הוסף ₪10 לחשבון'), findsOneWidget);
      expect(find.bySemanticsLabel('הפחת ₪10 מהחשבון'), findsOneWidget);

      // The steppers drive the same AppState bill (119 default → 129 → 119).
      await tester.tap(find.bySemanticsLabel('הוסף ₪10 לחשבון'));
      await tester.pump(const Duration(milliseconds: 200));
      expect(AppState().currentBill('cellular'), 129);
      await tester.tap(find.bySemanticsLabel('הפחת ₪10 מהחשבון'));
      await tester.pump(const Duration(milliseconds: 200));
      expect(AppState().currentBill('cellular'), 119);

      await tester.pumpAndSettle();
      tester.takeException();
      handle.dispose();
    });
  });

  testWidgets('A real category lists at least one plan', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // The catalogue defaults to the cellular category on a fresh boot.
      AppState().setCategory('cellular');

      _go(tester, '/results');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The "{n} מסלולים" count line renders and is non-empty for cellular.
      expect(find.textContaining('מסלולים'), findsWidgets);
      // Not the empty state (its shared-EmptyState headline is absent).
      expect(find.text('לא נמצאו תוצאות'), findsNothing);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('A nonsense search collapses to the empty state with a clear CTA',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // The catalogue defaults to the cellular category on a fresh boot.
      AppState().setCategory('cellular');

      _go(tester, '/results');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The first TextField on the page is the in-results provider/plan search.
      await tester.enterText(
          find.byType(TextField).first, 'zzqqxx-no-such-plan');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The shared EmptyState renders the search variant: honest headline +
      // subtitle naming the query, with the single "נקו חיפוש" recovery CTA.
      expect(find.text('לא נמצאו תוצאות'), findsOneWidget);
      expect(find.textContaining('לא מצאנו מסלולים שתואמים'), findsOneWidget);
      // Recovery CTA + the "switch category" helper both exist.
      expect(find.text('נקו חיפוש'), findsWidgets);
      expect(find.text('אפשר גם לעבור קטגוריה'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
