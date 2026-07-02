import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
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

  // ── Header PRIORITY layout (live-tour truncation fix) ────────────────────
  // The provider name is the card's identity: it claims its width FIRST; the
  // net chip next; the quiz-match chip shrinks LAST (full → icon-only tonal
  // glyph → hidden). Ahem test-font math: every glyph = fontSize px, so
  // provider 'פלאפון' = 6×15 = 90px; the name row gets card width − 170px
  // (28 card padding + 88 watch/compare + 44 logo + 10 gap).

  void setQuizFitsState() {
    AppState().setQuizCompleted(true);
    AppState().setQuizBudget(100); // price 79 ≤ 100 → 'מתאים לתקציב'
    AppState().setQuizCat('cellular');
  }

  Future<List<String>> pumpAtWidth(WidgetTester tester, double width) async {
    final overflows = <String>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      final s = details.exceptionAsString();
      if (s.contains('overflowed') || s.contains('RenderFlex')) {
        overflows.add(details.toString());
        return;
      }
      originalOnError?.call(details);
    };
    try {
      await tester.pumpWidget(_wrap(
        Center(
          child: SizedBox(
            width: width,
            child: const PlanCardWidget(plan: _testPlan, currentBill: 119),
          ),
        ),
      ));
      await tester.pump();
    } finally {
      FlutterError.onError = originalOnError;
    }
    return overflows;
  }

  testWidgets('wide card: the quiz-match chip renders its FULL text',
      (tester) async {
    setQuizFitsState();
    final overflows = await pumpAtWidth(tester, 500);
    expect(overflows, isEmpty);
    expect(find.text('מתאים לתקציב'), findsOneWidget);
  });

  testWidgets(
      'header PRIORITY: as the card narrows, the provider name keeps its '
      'natural width while the quiz-match chip degrades full → icon-only '
      '(tooltip kept) → hidden, without ever striping', (tester) async {
    setQuizFitsState();
    // Warm-up: the first pump kicks off the bundled Rubik/Assistant font
    // loads, which land async and change glyph metrics mid-test. Complete
    // them for real (runAsync) so the sweep below observes ONE final font.
    await pumpAtWidth(tester, 500);
    await tester.runAsync(GoogleFonts.pendingFonts);
    final modes = <String>[];
    // Metric-agnostic sweep (the test font's glyph advance differs from
    // production Rubik): walk the card down and observe the degradation.
    for (double w = 500; w >= 240; w -= 20) {
      final overflows = await pumpAtWidth(tester, w);
      expect(overflows, isEmpty,
          reason: 'card stripes at ${w}px:\n${overflows.join('\n')}');

      // Identity first: the provider name NEVER truncates — it renders at
      // its full intrinsic width at every card width; the chips give way.
      final para =
          tester.renderObject<RenderParagraph>(find.text('פלאפון'));
      final intrinsic = para.getMaxIntrinsicWidth(double.infinity);
      expect(para.size.width, moreOrLessEquals(intrinsic, epsilon: 1.0),
          reason: 'provider name squeezed at ${w}px '
              '(intrinsic $intrinsic, rendered ${para.size.width})');

      final full = find.text('מתאים לתקציב').evaluate().isNotEmpty;
      final icon = find.byTooltip('מתאים לתקציב').evaluate().isNotEmpty;
      modes.add(full
          ? 'full'
          : icon
              ? 'icon'
              : 'hidden');
    }

    // All three presentation states are reachable…
    expect(modes.first, 'full', reason: modes.join(','));
    expect(modes, contains('icon'), reason: modes.join(','));
    expect(modes.last, 'hidden', reason: modes.join(','));
    // …and the degradation is monotone (never re-grows while narrowing).
    int rank(String m) => const {'full': 0, 'icon': 1, 'hidden': 2}[m]!;
    for (var i = 1; i < modes.length; i++) {
      expect(rank(modes[i]), greaterThanOrEqualTo(rank(modes[i - 1])),
          reason: 'non-monotone degradation: ${modes.join(',')}');
    }
  });

  testWidgets(
      'zero overflow at 390px viewport + 1.3x text scale with the full header '
      '(quiz chip + match score + best-match)', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    setQuizFitsState();
    final overflows = <String>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      final s = details.exceptionAsString();
      if (s.contains('overflowed') || s.contains('RenderFlex')) {
        overflows.add(details.toString());
        return;
      }
      originalOnError?.call(details);
    };
    try {
      await tester.pumpWidget(_wrap(
        const SingleChildScrollView(
          child: PlanCardWidget(
            plan: _testPlan,
            currentBill: 200,
            matchPct: 87,
            bestMatch: true,
          ),
        ),
      ));
      await tester.pump();
    } finally {
      FlutterError.onError = originalOnError;
    }
    expect(overflows, isEmpty,
        reason: 'plan card must never stripe at 390px / 1.3x:\n'
            '${overflows.join('\n')}');
    // The ink "פרטים" action and the price row still both render (alignment
    // anchors of fix 3).
    expect(find.text('פרטים'), findsOneWidget);
    expect(find.text('₪79'), findsOneWidget);
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
