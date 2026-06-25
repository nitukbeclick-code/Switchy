import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';

/// Widget tests for the global search screen
/// (lib/pages/search/search_widget.dart): the empty-query "browse" surface
/// (recent + categories + honest cheapest-per-category), live results as you
/// type, the no-results empty state with a recovery CTA, and the clear-search
/// affordance — plus the accessibility labels on the icon-only controls.
/// The service ranking itself is covered separately in test/search_test.dart;
/// here we exercise the widget. Boots the full app through GoRouter like the
/// existing harnesses (test/bills_widget_test.dart).
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
  testWidgets('Empty query shows the browse-by-category surface', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/search');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The browse-by-category header and the honest cheapest list.
      expect(find.text('עיון לפי קטגוריה'), findsOneWidget);
      expect(find.text('המסלולים הזולים ביותר'), findsOneWidget);
      // Honest subtitle: lowest price from the real catalogue (no invented
      // popularity).
      expect(find.textContaining('המחיר הנמוך ביותר בכל קטגוריה'), findsOneWidget);

      // Every real category is offered as a browse chip.
      for (final c in categories) {
        expect(find.text(c.name), findsWidgets,
            reason: 'missing browse chip for ${c.name}');
      }

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Typing a provider name yields live, grouped results',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/search');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Type a real provider name into the search field.
      final provider = allProviders.first;
      await tester.enterText(find.byType(TextField).first, provider);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The result-count summary line references the query.
      expect(find.textContaining('תוצאות עבור "$provider"'), findsWidgets);
      // A provider section appears for a provider-name query.
      expect(find.text('ספקים'), findsWidgets);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('A nonsense query shows the no-results empty state + clear CTA',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/search');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      await tester.enterText(
          find.byType(TextField).first, 'zzqqxx-no-such-plan');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // EmptyState headline echoes the query; CTA offers to clear it.
      expect(find.textContaining('לא נמצאו תוצאות עבור'), findsOneWidget);
      expect(find.text('נקו את החיפוש'), findsOneWidget);

      // Tapping the recovery CTA returns to the browse surface.
      await tester.tap(find.text('נקו את החיפוש'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('עיון לפי קטגוריה'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('The clear-search icon exposes an accessible label', (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);

      _go(tester, '/search');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // The clear (×) control only appears once the field is non-empty.
      await tester.enterText(find.byType(TextField).first, 'סלולר');
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.bySemanticsLabel('נקה חיפוש'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
      handle.dispose();
    });
  });
}
