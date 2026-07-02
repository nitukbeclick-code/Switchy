import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/legal.dart';
import 'package:chosech/services/street_price.dart';

/// Widget tests for the plan-detail enrichments
/// (lib/pages/plan_detail/plan_detail_widget.dart):
///
///  1. The post-promo price badge — built only from the plan's REAL
///     after/afterExact + intro, and only when there's a genuine promo jump.
///  2. The "תשלומים וציוד" expandable section — surfacing the plan's REAL fees
///     dict (installation / router / one-off charges) verbatim.
///  3. The trust-signals row (street price + real rating) — strictly truth-
///     gated: ABSENT with no accepted reports / no real reviews, present only
///     once the real thresholds are met. The §7b disclosure renders exactly
///     once (the decorated wrapper must not duplicate the approved copy).
///
/// All must be truth-only: the badge never appears for a no-promo plan, the
/// fee rows render the data's own labels/values without invention, and the
/// trust rows never show a placeholder or a fabricated figure.

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
  // The street-price store is static/in-memory — keep every test hermetic so a
  // seeded aggregate can never leak into a "no data" assertion (or vice versa).
  setUp(StreetPriceService.clear);
  tearDown(StreetPriceService.clear);

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

  // ── Trust surfacing (Guardian Wave, pillar 4) ────────────────────────────

  testWidgets(
      'trust rows are ABSENT with no reports/reviews, and the §7b disclosure '
      'renders exactly once (decorated wrapper does not duplicate it)',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/plan/net_bezeq_bfiber300');
      await _settle(tester);

      // §7b lead — the approved copy renders exactly ONCE even though the
      // plan-detail call site opts into the decorated trust treatment.
      expect(find.textContaining(kCommissionDisclosureLead), findsOneWidget);
      // §17 caveat also once.
      expect(find.textContaining(kPriceAccuracyCaveat), findsOneWidget);

      // Truth-threshold regression guard: with ZERO accepted street-price
      // reports and ZERO real reviews there is NO trust row — no placeholder,
      // no invented figure.
      expect(find.textContaining('משלמים בפועל'), findsNothing);
      expect(find.textContaining('ביקורות אמיתיות'), findsNothing);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets(
      'street-price row appears only once 5 accepted reports back it, with the '
      'real median and real count', (tester) async {
    await _ignoringOverflow(() async {
      final plan = planById('net_bezeq_bfiber300')!;
      // In-band prices (safely inside the provider's plausible catalogue band,
      // mirroring street_price_test's seeding pattern) so all 5 are ACCEPTED.
      final base =
          StreetPriceService.catalogueLowest(plan.provider, plan.cat)!;
      double inBand(double frac) => (base * frac)
          .clamp(kStreetPriceMin + 1, kStreetPriceMax - 1)
          .toDouble();

      // 4 reports — still below kStreetPriceMinReports (5).
      for (var i = 0; i < 4; i++) {
        final r = StreetPriceService.submitReport(
          provider: plan.provider,
          category: plan.cat,
          monthlyPrice: inBand(0.6 + i * 0.05),
        );
        expect(r.accepted, isTrue);
      }
      expect(
          StreetPriceService.aggregateFor(plan.provider, plan.cat), isNull);

      await _bootApp(tester);
      _go(tester, '/plan/net_bezeq_bfiber300');
      await _settle(tester);

      // Below the truth threshold → NO street-price row.
      expect(find.textContaining('משלמים בפועל'), findsNothing);

      // 5th accepted report unlocks the honest aggregate.
      final fifth = StreetPriceService.submitReport(
        provider: plan.provider,
        category: plan.cat,
        monthlyPrice: inBand(0.8),
      );
      expect(fifth.accepted, isTrue);
      final agg = StreetPriceService.aggregateFor(plan.provider, plan.cat);
      expect(agg, isNotNull);

      // Re-enter the page so it rebuilds with the new aggregate.
      _go(tester, '/home');
      await _settle(tester);
      _go(tester, '/plan/net_bezeq_bfiber300');
      await _settle(tester);

      // The row shows the REAL median + REAL count — nothing else.
      expect(find.textContaining('משלמים בפועל'), findsOneWidget);
      expect(find.textContaining('(חציון, ${agg!.reportCount} דיווחים)'),
          findsOneWidget);
      expect(find.text('₪${agg.typicalText}'), findsWidgets);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets(
      "rating row appears only after a REAL review backs the provider",
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      final plan = planById('net_bezeq_bfiber300')!;

      _go(tester, '/plan/net_bezeq_bfiber300');
      await _settle(tester);

      // No real reviews anywhere → no rating row.
      expect(find.textContaining('ביקורות אמיתיות'), findsNothing);

      // Seed ONE real review through the app's own path (the user's own
      // review — the same seeding path provider_ratings_test uses).
      AppState().addReview(
        provider: plan.provider,
        overall: 5,
        subRatings: const {'price': 5, 'service': 5, 'coverage': 5, 'speed': 5},
        text: '',
      );
      await _settle(tester);

      // The row now shows the REAL blended figures: ★ 5 from 1 real review.
      expect(find.text('★ 5 · 1 ביקורות אמיתיות'), findsOneWidget);

      expect(tester.takeException(), isNull);
    });
  });
}
