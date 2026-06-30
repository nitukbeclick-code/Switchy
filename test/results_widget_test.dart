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
/// (lib/pages/results/results_widget.dart): the category tab bar + sort chips
/// render, the bill-baseline banner and its stepper expose accessible labels,
/// a real category lists plans, and a nonsense search collapses to the empty
/// state with its recovery CTAs. Boots the full app through GoRouter like the
/// existing harnesses (test/bills_widget_test.dart).
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
  testWidgets('Results renders category tabs, sort chips and the bill stepper',
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

      // Sort chips, including the AI smart-sort.
      expect(find.text('התאמה חכמה'), findsOneWidget);
      expect(find.text('הכי זול'), findsOneWidget);

      // The freshness cue + bill baseline.
      expect(find.text('עודכן היום'), findsOneWidget);
      expect(find.text('החשבון שלך:'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Bill stepper and editor expose accessible labels', (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);
      // The catalogue defaults to the cellular category on a fresh boot.
      AppState().setCategory('cellular');

      _go(tester, '/results');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The +/- stepper buttons and the inline bill-edit chip are labelled for
      // screen readers (they are otherwise icon-only / glyph controls). The
      // step buttons wrap a bare InkWell so their label matches exactly; the
      // edit chip wraps the "₪{bill}" Text, which merges into the node — a
      // screen reader hears "ערוך את החשבון החודשי ₪…" — so match the prefix.
      expect(find.bySemanticsLabel('הוסף ₪10 לחשבון'), findsOneWidget);
      expect(find.bySemanticsLabel('הפחת ₪10 מהחשבון'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('ערוך את החשבון החודשי')), findsOneWidget);

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
