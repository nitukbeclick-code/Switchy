import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';

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

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

void main() {
  testWidgets('Savings snapshot shows its title and per-category breakdown', (tester) async {
    await _bootApp(tester);
    AppState().setCurrentBill('cellular', 220);

    _go(tester, '/savings');
    await _settle(tester);

    expect(find.text('החיסכון שלי'), findsOneWidget);
    expect(find.text('לפי קטגוריה'), findsOneWidget);
    // A high cellular bill must surface at least one annual-saving badge.
    expect(find.textContaining('/שנה'), findsWidgets);
  });

  testWidgets('Renewal report shows the table and our top pick', (tester) async {
    await _bootApp(tester);
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

    expect(find.text('טבלת השוואה מלאה'), findsOneWidget);
    expect(find.text('הבחירה שלנו'), findsOneWidget); // top-ranked row marker
    // A ₪190 plan is beatable, so the saver headline should appear.
    expect(find.textContaining('אפשר לחסוך'), findsOneWidget);
  });

  testWidgets('Global search shows provider and plan sections for a query', (tester) async {
    await _bootApp(tester);

    _go(tester, '/search');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(find.byType(TextField).first, allProviders.first);
    await _settle(tester);

    expect(find.text('ספקים'), findsOneWidget);
    expect(find.text('מסלולים'), findsOneWidget);
  });
}
