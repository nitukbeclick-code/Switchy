import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/pages/deals/deals_widget.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// A deterministic deals backend: extends [LocalBackend] (inheriting the whole
/// contract) and overrides only the price-history seam with fixed snapshots, so
/// the deals feed renders a controlled set of drops. The realtime stream stays
/// the inherited empty stream (pure heartbeat), keeping the test free of a live
/// socket.
class _FakeDeals extends LocalBackend {
  _FakeDeals(this._snapshots);
  final List<PriceSnapshot> _snapshots;

  @override
  Future<List<PriceSnapshot>> fetchPriceSnapshots({int limit = 400}) async =>
      _snapshots;
}

// A real catalogue plan so DealsEngine keeps the drop (it discards drops whose
// plan id is not in the catalogue).
final _plan = allPlans.first;

PriceSnapshot _snap(double price, DateTime at) => PriceSnapshot(
      planId: _plan.id,
      category: _plan.cat,
      provider: _plan.provider,
      price: price,
      capturedAt: at,
    );

Widget _wrap(Widget child) => MaterialApp(
      builder: (context, w) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(0.7)),
        child: w!,
      ),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: ChangeNotifierProvider<AppState>.value(
          value: AppState(),
          child: child,
        ),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  final base = DateTime(2026, 6, 1);

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  tearDown(() {
    appBackend = LocalBackend();
  });

  testWidgets('renders a real price drop with its old→new headline', (tester) async {
    appBackend = _FakeDeals([
      _snap(50, base),
      _snap(40, base.add(const Duration(days: 1))),
    ]);

    await tester.pumpWidget(_wrap(const DealsWidget()));
    await tester.pump(); // kick off the load
    await tester.pump(const Duration(milliseconds: 400)); // flush futures + entrance

    expect(find.text('מבצעים בזמן אמת'), findsOneWidget);
    // -20% badge for the 50→40 drop.
    expect(find.text('-20%'), findsOneWidget);
    // The plan card renders the provider name.
    expect(find.textContaining(_plan.provider), findsWidgets);
  });

  testWidgets('shows an honest empty state when there are no drops', (tester) async {
    appBackend = _FakeDeals(const []);

    await tester.pumpWidget(_wrap(const DealsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('אין ירידות מחיר כרגע'), findsOneWidget);
    // Canonical BROWSE verb, consistent with the home/results/profile CTAs.
    expect(find.text('השוו מסלולים'), findsOneWidget);
  });

  testWidgets('a price rise is not shown as a deal', (tester) async {
    appBackend = _FakeDeals([
      _snap(40, base),
      _snap(55, base.add(const Duration(days: 1))),
    ]);

    await tester.pumpWidget(_wrap(const DealsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // No drop ⇒ the empty state, never a fabricated deal.
    expect(find.text('אין ירידות מחיר כרגע'), findsOneWidget);
  });
}
