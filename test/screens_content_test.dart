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
    // Personalised + positive total → the share action is offered.
    expect(find.byIcon(Icons.ios_share_rounded), findsOneWidget);
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
    // Each alternative row carries a provider star rating.
    expect(find.byIcon(Icons.star_rounded), findsWidgets);
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

  testWidgets('search remembers a submitted query and shows it on the empty state', (tester) async {
    await _bootApp(tester);

    _go(tester, '/search');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(find.byType(TextField).first, 'בזק');
    await tester.pump();
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump();

    // Clear the field to return to the empty/suggestions state.
    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pump(const Duration(milliseconds: 300));

    // The recent-searches section appears only when there is history.
    expect(find.text('חיפושים אחרונים'), findsOneWidget);
    expect(AppState().recentSearches, contains('בזק'));
  });

  testWidgets('search category chip runs a category search', (tester) async {
    await _bootApp(tester);
    _go(tester, '/search');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    // The empty state offers category browse chips; tap "אינטרנט".
    expect(find.text('חיפוש לפי קטגוריה'), findsOneWidget);
    await tester.tap(find.text('אינטרנט').first);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    // Results now show the plans section.
    expect(find.text('מסלולים'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tapping a renewal notification deep-links into that plan\'s report', (tester) async {
    await _bootApp(tester);
    final soon = DateTime.now().add(const Duration(days: 10));
    final iso = '${soon.year.toString().padLeft(4, '0')}-${soon.month.toString().padLeft(2, '0')}-${soon.day.toString().padLeft(2, '0')}';
    AppState().addMyPlan(category: 'cellular', provider: 'סלקום', planName: '5G 200GB', monthlyPrice: 90, promoEndDate: iso);

    _go(tester, '/notifications');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.textContaining('מסתיים בעוד'), findsWidgets);
    await tester.tap(find.textContaining('מסתיים בעוד').first);
    await tester.pump(const Duration(milliseconds: 700));
    await tester.pump(const Duration(milliseconds: 700));

    // Landed on the renewal report.
    expect(find.text('טבלת השוואה מלאה'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('provider profile shows the hero, ratings panel and best match', (tester) async {
    await _bootApp(tester);
    _go(tester, '/provider/סלקום');
    await tester.pump(const Duration(milliseconds: 700));
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.textContaining('מסלולים ב-'), findsOneWidget); // hero plan/category count
    expect(find.text('דירוג הלקוחות'), findsOneWidget); // ratings panel
    expect(find.text('ההמלצה אצל סלקום'), findsOneWidget); // best-match card
    expect(tester.takeException(), isNull);
  });

  testWidgets('renewal screen opens a tracked plan\'s full comparison table', (tester) async {
    await _bootApp(tester);
    AppState().addMyPlan(category: 'cellular', provider: 'פרטנר', planName: 'מסלול', monthlyPrice: 120, promoEndDate: '2026-12-31');

    _go(tester, '/renewal');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('טבלת השוואה מלאה'));
    await tester.pump(const Duration(milliseconds: 700));
    await tester.pump(const Duration(milliseconds: 700));

    // The report hero is up ("המסלול שלך היום" is unique to it).
    expect(find.text('המסלול שלך היום'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('home savings hero is honest about estimate vs personalized', (tester) async {
    await _bootApp(tester);
    _go(tester, '/home');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    // Fresh user hasn't entered a bill → the figure is framed as an estimate.
    expect(find.textContaining('הערכה'), findsWidgets);

    // Enter a real bill → the hero switches to the personalized framing.
    AppState().setCurrentBill('cellular', 200);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('מחושב לפי החשבונות שלך'), findsOneWidget);
  });
}
