import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/pages/switch_kit/street_price_widget.dart';
import 'package:chosech/services/street_price.dart';

/// Widget tests for the standalone /street-price page
/// (lib/pages/switch_kit/street_price_widget.dart). It is driven by the real
/// in-memory [StreetPriceService] (seeded per test), so it asserts the SAME
/// truth-only guarantees the engine enforces:
///   • a typical figure renders ONLY at/above the report threshold;
///   • below the threshold the UI says how many MORE reports are needed — never a
///     fabricated price;
///   • a reported price runs through the sanity gate (an out-of-band typo is held
///     out, and we say so);
///   • a real below-catalogue street price is flagged as VALUE.
/// Pumped standalone (no router) — the route is wired in lib/router.dart and
/// exercised by test/nav_smoke_test.dart.

Future<void> _pump(WidgetTester tester, {String provider = 'סלקום', String? category}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  await tester.binding.setSurfaceSize(const Size(900, 2200));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(brightness: Brightness.light),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: StreetPriceWidget(
          initialProvider: provider,
          initialCategory: category ?? 'cellular',
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  setUp(() => StreetPriceService.clear());
  tearDown(() => StreetPriceService.clear());

  testWidgets('no reports → honest threshold state, NO fabricated figure',
      (tester) async {
    await _pump(tester);
    expect(find.text('עדיין אין מספיק דיווחים'), findsOneWidget);
    expect(find.text('מחיר רחוב טיפוסי'), findsNothing);
    expect(find.textContaining('מבוסס על'), findsNothing);
  });

  testWidgets('enough accepted reports → typical figure + real count render',
      (tester) async {
    // Selcom cellular catalogue floor ≈ ₪39.90; ₪25 is a real below-sticker price.
    for (var i = 0; i < kStreetPriceMinReports; i++) {
      StreetPriceService.submitReport(
          provider: 'סלקום', category: 'cellular', monthlyPrice: 25);
    }
    await _pump(tester);

    expect(find.text('מחיר רחוב טיפוסי'), findsOneWidget);
    expect(find.textContaining('₪25'), findsWidgets);
    expect(
        find.textContaining('מבוסס על $kStreetPriceMinReports דיווחים'),
        findsOneWidget);
    // Below catalogue → the honest VALUE delta is shown.
    expect(find.textContaining('מתחת למחירון'), findsOneWidget);
  });

  testWidgets('an out-of-band price is rejected and held out of the aggregate',
      (tester) async {
    await _pump(tester);
    // ₪9999 is wildly above any Selcom cellular plan — the sanity gate rejects it.
    await tester.enterText(find.byType(TextField), '9999');
    await tester.pump();
    final submit = find.text('שליחת דיווח');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.textContaining('חורג מהטווח הסביר'), findsOneWidget);
    // It never created a publishable aggregate.
    expect(StreetPriceService.aggregateFor('סלקום', 'cellular'), isNull);
  });

  testWidgets('a plausible report is accepted and counted', (tester) async {
    await _pump(tester);
    await tester.enterText(find.byType(TextField), '30');
    await tester.pump();
    final submit = find.text('שליחת דיווח');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pump(const Duration(milliseconds: 300));

    expect(StreetPriceService.acceptedReports('סלקום', 'cellular').length, 1);
    // Still below the threshold → the UI asks for more, no fabricated figure.
    expect(find.textContaining('עוד'), findsWidgets);
  });

  testWidgets('the report form states it is anonymous (no PII)', (tester) async {
    await _pump(tester);
    expect(find.textContaining('אנונימי'), findsOneWidget);
  });
}
