import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the plan-detail enrichments
/// (lib/pages/plan_detail/plan_detail_widget.dart):
///
///  1. The post-promo price badge — built only from the plan's REAL
///     after/afterExact + intro, and only when there's a genuine promo jump.
///  2. The "תשלומים וציוד" expandable section — surfacing the plan's REAL fees
///     dict (installation / router / one-off charges) verbatim.
///
/// Both must be truth-only: the badge never appears for a no-promo plan, and the
/// fee rows render the data's own labels/values without invention.

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

/// Drain flutter_animate's finite one-shot entrance timers so the binding's
/// "A Timer is still pending after dispose" invariant doesn't trip.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(seconds: 2));
}

void main() {
  testWidgets(
      'promo internet plan shows the post-promo badge and the payments/equipment fees',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Real plan: בזק bFiber 300 — ₪109 now, ₪196 after a "חודשיים" promo,
      // with real התקנה + נתב fees.
      _go(tester, '/plan/net_bezeq_bfiber300');
      await _settle(tester);

      // ── Post-promo badge ──────────────────────────────────────────────
      expect(find.text('מחיר עכשיו'), findsOneWidget);
      // The "after" caption embeds the plan's real intro window.
      expect(find.text('אחרי חודשיים'), findsWidgets);
      // Both real figures are present (₪109 now, ₪196 after).
      expect(find.textContaining('₪109'), findsWidgets);
      expect(find.textContaining('₪196'), findsWidgets);

      // ── Payments & equipment section (collapsed header visible) ────────
      expect(find.text('תשלומים וציוד'), findsOneWidget);
      expect(find.text('התקנה, נתב ותשלומים חד-פעמיים'), findsOneWidget);

      // Expand it and confirm the REAL fee labels/values paint. The header
      // sits below the test viewport, so scroll it into view before tapping.
      // The page nests several Scrollables, so target the primary
      // CustomScrollView explicitly (the default finder matches >1).
      await tester.scrollUntilVisible(
        find.text('תשלומים וציוד'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('תשלומים וציוד'));
      await _settle(tester);
      expect(find.text('התקנה'), findsWidgets);
      expect(find.text('נתב'), findsWidgets);
      expect(find.text('+₪19.9/ח׳'), findsOneWidget);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets(
      'no-promo plan hides the post-promo badge but still shows its fees',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Real plan: סלקום 5G Pro Care 1500 — after: null (no promo jump) but it
      // carries a real fee ('דמי חיבור' → 'אין').
      _go(tester, '/plan/cel_cellcom_5gprocare1500');
      await _settle(tester);

      // The badge must NOT be fabricated when there's no real promo jump.
      expect(find.text('מחיר עכשיו'), findsNothing);

      // The payments/equipment section still renders from the real fees dict.
      expect(find.text('תשלומים וציוד'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('תשלומים וציוד'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('תשלומים וציוד'));
      await _settle(tester);
      expect(find.text('דמי חיבור'), findsWidgets);

      expect(tester.takeException(), isNull);
    });
  });
}
