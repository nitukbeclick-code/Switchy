import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Boot the full app with a mocked, reset AppState — mirrors the harness used in
/// screens_content_test.dart / nav_smoke_test.dart.
Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();

  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: AppState(),
      child: const ChosechApp(),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

/// Navigate via GoRouter using the root Navigator element.
void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Pump twice past the route transition + the longest one-shot animate delay,
/// without pumpAndSettle (the screens host repeating shimmer/progress timers).
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

void main() {
  testWidgets('renewal report for a beatable tracked plan offers a share affordance', (tester) async {
    await _bootApp(tester);

    // A ₪190 cellular plan is comfortably beatable, so the saver headline —
    // which hosts the share button — must render.
    AppState().addMyPlan(
      category: 'cellular',
      provider: 'סלקום',
      planName: '5G',
      monthlyPrice: 190,
      promoEndDate: '2026-12-31',
    );
    final id = AppState().myPlans.first.id;

    _go(tester, '/renewal-report/$id');
    await _settle(tester);

    // The saver headline is present (sanity: there is something to share)…
    expect(find.textContaining('אפשר לחסוך'), findsOneWidget);
    // …and it exposes the share icon.
    expect(find.byIcon(Icons.ios_share_rounded), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('renewal report share button carries an accessible share tooltip', (tester) async {
    await _bootApp(tester);

    AppState().addMyPlan(
      category: 'cellular',
      provider: 'פרטנר',
      planName: 'מסלול',
      monthlyPrice: 190,
      promoEndDate: '2026-12-31',
    );
    final id = AppState().myPlans.first.id;

    _go(tester, '/renewal-report/$id');
    await _settle(tester);

    // The share affordance is a labelled IconButton, not a bare icon.
    final shareButton = find.ancestor(
      of: find.byIcon(Icons.ios_share_rounded),
      matching: find.byType(IconButton),
    );
    expect(shareButton, findsWidgets);
    expect(find.byTooltip('שתף'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
