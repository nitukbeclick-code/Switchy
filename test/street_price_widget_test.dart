import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/street_price.dart';

// Widget-level contract for the provider page "מחיר הרחוב" section:
//   • the section + "report your price" CTA always render on a provider page;
//   • with NO reports there is no fabricated figure — only the empty/CTA state;
//   • once enough REAL accepted reports exist, the aggregate renders ("מבוסס על
//     N דיווחים"), and a below-catalogue street price is flagged as VALUE;
//   • the report bottom-sheet opens with its title.
// The provider widget does NOT touch the router (route is owned by SA-F); these
// tests reach the page via the existing /provider/:name route already in place.

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  StreetPriceService.clear();
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

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

const _provider = 'סלקום';

void main() {
  setUp(() => StreetPriceService.clear());
  tearDown(() => StreetPriceService.clear());

  testWidgets('street-price section + report CTA render on a provider page',
      (tester) async {
    await _bootApp(tester);
    _go(tester, '/provider/$_provider');
    await _settle(tester);

    expect(find.text('מחיר הרחוב'), findsOneWidget);
    expect(find.text('דווח/י את המחיר שלך'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no reports → honest empty state, NO fabricated figure',
      (tester) async {
    await _bootApp(tester);
    _go(tester, '/provider/$_provider');
    await _settle(tester);

    // The "be the first" honest empty copy is shown...
    expect(
      find.textContaining('עדיין אין מספיק דיווחים'),
      findsOneWidget,
    );
    // ...and there is no fabricated "based on N reports" aggregate.
    expect(find.textContaining('מבוסס על'), findsNothing);
  });

  testWidgets(
      'enough real reports → aggregate renders with the real count + VALUE delta',
      (tester) async {
    // Seed THREE accepted, below-catalogue reports BEFORE building the page so
    // the aggregate is already publishable on first render. Selcom cellular
    // catalogue floor is ~₪39.90; ₪25 is a real, in-band below-sticker price.
    for (var i = 0; i < kStreetPriceMinReports; i++) {
      StreetPriceService.submitReport(
        provider: _provider,
        category: 'cellular',
        monthlyPrice: 25,
      );
    }
    expect(
        StreetPriceService.aggregateFor(_provider, 'cellular'), isNotNull);

    await _bootApp(tester);
    // _bootApp clears the store; re-seed after boot (clear happens in _bootApp).
    for (var i = 0; i < kStreetPriceMinReports; i++) {
      StreetPriceService.submitReport(
        provider: _provider,
        category: 'cellular',
        monthlyPrice: 25,
      );
    }
    _go(tester, '/provider/$_provider');
    await _settle(tester);

    // The real, non-fabricated report count is surfaced.
    expect(
      find.textContaining('מבוסס על $kStreetPriceMinReports דיווחים'),
      findsOneWidget,
    );
    // The typical (median) figure renders.
    expect(find.textContaining('₪25'), findsWidgets);
    // Below-catalogue → the honest VALUE delta is shown.
    expect(find.textContaining('מתחת למחירון'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tapping the CTA opens the report bottom-sheet', (tester) async {
    await _bootApp(tester);
    _go(tester, '/provider/$_provider');
    await _settle(tester);

    // The CTA may be below the fold in the provider CustomScrollView — bring it
    // into view before tapping, then let the modal route transition settle.
    final cta = find.text('דווח/י את המחיר שלך');
    await tester.ensureVisible(cta);
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    await tester.tap(cta);
    await tester.pump(); // start the modal route
    await tester.pump(const Duration(milliseconds: 500)); // finish the animation

    // The sheet's submit button + price field (distinct from the panel CTA).
    expect(find.text('שליחת דיווח'), findsOneWidget);
    expect(find.text('כמה אתם משלמים בחודש? (₪)'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
