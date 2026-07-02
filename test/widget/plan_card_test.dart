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

  testWidgets('shows savings badge on the BEST-MATCH card when currentBill is higher than plan price', (tester) async {
    await tester.pumpWidget(_wrap(
      // De-push: the "חוסך ₪X בשנה" chip now prints ONLY on the best-match
      // card, so the badge assertion must flag this card as the best match.
      const PlanCardWidget(plan: _testPlan, currentBill: 200, bestMatch: true),
    ));
    await tester.pump();
    // savings = (200 - 79) * 12 = 1452
    expect(find.textContaining('חוסך'), findsOneWidget);
  });

  testWidgets('generic (non-best) list card hides the savings chip even when beatable', (tester) async {
    await tester.pumpWidget(_wrap(
      // Same beatable bill, but a plain list row (not best-match) — the chip is
      // de-pushed away so the list reads as a calm price comparison.
      const PlanCardWidget(plan: _testPlan, currentBill: 200, bestMatch: false),
    ));
    await tester.pump();
    expect(find.textContaining('חוסך'), findsNothing);
    // The price is still present — only the saving figure was de-pushed.
    expect(find.text('₪79'), findsOneWidget);
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

    // ONE chip language — ACTIVE: pale-green TINT surface + green 1px border,
    // NOT a solid-green fill (solid green is reserved for conversion CTAs).
    final chip = tester.widget<Container>(find
        .ancestor(of: find.text('87% התאמה'), matching: find.byType(Container))
        .first);
    final deco = chip.decoration as BoxDecoration;
    expect(deco.gradient, isNull); // no solid ACTION gradient
    expect(deco.color, const Color(0xFFDCFCE7)); // brandAccentTint surface
    expect(deco.border?.top.width, 1); // hairline green border
    expect(deco.border?.top.color, const Color(0xFF16A34A)); // brandAccent

    // The score text itself is green-on-tint (brandAccentText), not white.
    final scoreText = tester.widget<Text>(find.text('87% התאמה'));
    expect(scoreText.style?.color, const Color(0xFF15803D));
  });

  testWidgets('no match chip when matchPct is omitted', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119),
    ));
    await tester.pump();
    expect(find.textContaining('% התאמה'), findsNothing);
  });

  testWidgets('bestMatch shows the floating badge and the green VALUE ring', (tester) async {
    await tester.pumpWidget(_wrap(
      const PlanCardWidget(plan: _testPlan, currentBill: 119, bestMatch: true),
    ));
    await tester.pump();
    expect(find.text('ההתאמה הכי טובה'), findsOneWidget);
    // The card border carries the green (VALUE) accent, 2px (owner recolor amber→green).
    final box = tester.widgetList<Container>(find.byType(Container)).firstWhere(
      (c) => c.decoration is BoxDecoration && ((c.decoration as BoxDecoration).border?.top.width ?? 0) == 2,
    );
    expect(((box.decoration as BoxDecoration).border!.top.color), const Color(0xFF16A34A));
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
