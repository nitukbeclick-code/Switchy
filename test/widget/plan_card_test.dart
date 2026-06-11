import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/components/plan_card/plan_card_widget.dart';
import 'package:chosech/models.dart';
import 'package:chosech/app_state.dart';

const _testPlan = Plan(
  id: 'test-plan-1',
  cat: 'cellular',
  provider: 'פלאפון',
  net: '5g',
  plan: 'גלישה ללא הגבלה',
  price: 79,
  rating: 4.5,
  reviews: 120,
);

Widget _wrap(Widget child) {
  return MaterialApp(
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        body: ChangeNotifierProvider<AppState>.value(
          value: AppState(),
          child: child,
        ),
      ),
    ),
  );
}

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  testWidgets('renders provider name', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();
    expect(find.text('פלאפון'), findsOneWidget);
  });

  testWidgets('renders plan price', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();
    expect(find.text('₪79'), findsOneWidget);
  });

  testWidgets('renders לחודש for cellular plans', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();
    expect(find.text('לחודש'), findsOneWidget);
  });

  testWidgets('renders לחבילה for abroad plans', (tester) async {
    const abroadPlan = Plan(
      id: 'abroad-1',
      cat: 'abroad',
      provider: 'Airalo',
      net: 'esim',
      plan: 'חבילת חו"ל',
      price: 49,
    );
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: abroadPlan, currentBill: 0),
    ));
    await tester.pump();
    expect(find.text('לחבילה'), findsOneWidget);
  });

  testWidgets('shows savings badge when currentBill is higher than plan price', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 200),
    ));
    await tester.pump();
    // savings = (200 - 79) * 12 = 1452
    expect(find.textContaining('חוסך'), findsOneWidget);
  });

  testWidgets('icon-only watch/compare buttons expose accessible labels', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();

    expect(find.bySemanticsLabel('עקוב אחר מחיר'), findsOneWidget);
    expect(find.bySemanticsLabel('הוסף להשוואה'), findsOneWidget);

    handle.dispose();
  });

  testWidgets('matchPct renders the recommendation score inside the card', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119, matchPct: 87),
    ));
    await tester.pump();
    expect(find.text('87% התאמה'), findsOneWidget);
  });

  testWidgets('no match chip when matchPct is omitted', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();
    expect(find.textContaining('% התאמה'), findsNothing);
  });

  testWidgets('bestMatch shows the floating badge and the amber VALUE ring', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119, bestMatch: true),
    ));
    await tester.pump();
    expect(find.text('ההתאמה הכי טובה'), findsOneWidget);
    // The card border carries the amber (VALUE) accent, 2px.
    final box = tester.widgetList<Container>(find.byType(Container)).firstWhere(
      (c) => c.decoration is BoxDecoration && ((c.decoration as BoxDecoration).border?.top.width ?? 0) == 2,
    );
    expect(((box.decoration as BoxDecoration).border!.top.color), const Color(0xFFF59E0B));
  });

  testWidgets('regular card has no best-match badge', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();
    expect(find.text('ההתאמה הכי טובה'), findsNothing);
  });

  testWidgets('the provider logo initials are hidden from screen readers', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();

    // 'פל' is the logo fragment for פלאפון; it must not surface as a label.
    expect(find.bySemanticsLabel('פל'), findsNothing);
    // The full provider name is still present as readable text.
    expect(find.text('פלאפון'), findsOneWidget);

    handle.dispose();
  });
}
