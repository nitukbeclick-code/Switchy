import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/components/plan_card/mini_plan_card.dart';
import 'package:chosech/widgets/saving_pill.dart';
import 'package:chosech/models.dart';

const _testPlan = Plan(
  id: 'mini-1',
  cat: 'cellular',
  provider: 'פלאפון',
  net: '5g',
  plan: 'גלישה ללא הגבלה',
  price: 79,
);

const _fiberPlan = Plan(
  id: 'mini-2',
  cat: 'fiber',
  provider: 'בזק',
  net: 'fiber',
  plan: 'אינטרנט סיבים אופטיים 1000 מגה לבית עם נתב',
  price: 99,
);

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: child)),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  group('MiniPlanCard', () {
    testWidgets('renders provider, plan and price', (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(width: 400, child: MiniPlanCard(plan: _testPlan)),
      ));
      expect(find.text('פלאפון'), findsOneWidget);
      expect(find.text('גלישה ללא הגבלה'), findsOneWidget);
      expect(find.textContaining('₪79'), findsOneWidget);
    });

    testWidgets('plan name may wrap to a SECOND line before ellipsizing '
        '(live-tour fix: no more mid-word chop after one line)',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(width: 340, child: MiniPlanCard(plan: _fiberPlan)),
      ));
      final nameText = tester.widget<Text>(find.text(_fiberPlan.plan));
      expect(nameText.maxLines, 2);
      expect(nameText.overflow, TextOverflow.ellipsis);
    });

    testWidgets(
        'wide card: the best-match saving pill shows the FULL "/שנה" copy',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(
          width: 520,
          child: MiniPlanCard(
            plan: _testPlan,
            savingsPerYear: 480,
            isBest: true,
          ),
        ),
      ));
      expect(find.text('חוסך ₪480/שנה'), findsOneWidget);
    });

    testWidgets(
        'as the card narrows the pill degrades full → SHORT truthful copy '
        '(no "/שנה") → hidden — never an ellipsized half-word',
        (tester) async {
      // Metric-agnostic sweep (the test font's glyph advance differs from
      // production Assistant): walk the card down and observe the pill.
      // Warm-up: complete the async bundled-font loads first so the whole
      // sweep observes ONE consistent font (metrics change when they land).
      await tester.pumpWidget(_wrap(const SizedBox(
        width: 520,
        child: MiniPlanCard(plan: _testPlan, savingsPerYear: 480, isBest: true),
      )));
      await tester.runAsync(GoogleFonts.pendingFonts);
      final modes = <String>[];
      for (double w = 520; w >= 225; w -= 15) {
        await tester.pumpWidget(_wrap(
          SizedBox(
            width: w,
            child: const MiniPlanCard(
              plan: _testPlan,
              savingsPerYear: 480,
              isBest: true,
            ),
          ),
        ));
        final full = find.text('חוסך ₪480/שנה').evaluate().isNotEmpty;
        final short = find.text('חוסך ₪480').evaluate().isNotEmpty;
        modes.add(full
            ? 'full'
            : short
                ? 'short'
                : 'hidden');
      }

      // All three presentation states are reachable…
      expect(modes.first, 'full', reason: modes.join(','));
      expect(modes, contains('short'), reason: modes.join(','));
      expect(modes.last, 'hidden', reason: modes.join(','));
      // …and degradation is monotone (never re-grows while narrowing).
      int rank(String m) => const {'full': 0, 'short': 1, 'hidden': 2}[m]!;
      for (var i = 1; i < modes.length; i++) {
        expect(rank(modes[i]), greaterThanOrEqualTo(rank(modes[i - 1])),
            reason: 'non-monotone degradation: ${modes.join(',')}');
      }
    });

    testWidgets(
        'ultra-narrow card: the pill hides entirely rather than render "חו…" '
        '— but the row semantics still announce the real saving',
        (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(_wrap(
        const SizedBox(
          width: 220,
          child: MiniPlanCard(
            plan: _testPlan,
            savingsPerYear: 480,
            isBest: true,
            showCta: false,
          ),
        ),
      ));
      // No visible pill text at all (full or short) — hidden beats half-word.
      expect(find.text('חוסך ₪480/שנה'), findsNothing);
      expect(find.text('חוסך ₪480'), findsNothing);
      // TRUTH kept for assistive tech: the row's one-line Semantics label
      // still carries the real figure.
      expect(
        find.bySemanticsLabel(RegExp(r'חוסך ₪480/שנה')),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('generic (non-best) row never shows the pill', (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(
          width: 520,
          child: MiniPlanCard(plan: _testPlan, savingsPerYear: 480),
        ),
      ));
      expect(find.textContaining('חוסך'), findsNothing);
    });
  });

  group('SavingPill compact mode', () {
    testWidgets('without shortText the legacy ellipsizing path is unchanged',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(width: 80, child: SavingPill(text: 'חוסך ₪1452 בשנה')),
      ));
      // Legacy: the full text node renders (visually ellipsized), never hides.
      expect(find.text('חוסך ₪1452 בשנה'), findsOneWidget);
    });

    testWidgets('with shortText: full → short → hidden by available width',
        (tester) async {
      const pill = SavingPill(
        text: 'חוסך ₪1452 בשנה',
        shortText: 'חוסך ₪1452',
      );

      // Metric-agnostic sweep from roomy to cramped. Warm-up first so the
      // async bundled-font loads land before any width decision is recorded.
      await tester.pumpWidget(_wrap(const SizedBox(width: 400, child: pill)));
      await tester.runAsync(GoogleFonts.pendingFonts);
      final modes = <String>[];
      for (double w = 400; w >= 40; w -= 10) {
        await tester.pumpWidget(_wrap(SizedBox(width: w, child: pill)));
        final full = find.text('חוסך ₪1452 בשנה').evaluate().isNotEmpty;
        final short = find.text('חוסך ₪1452').evaluate().isNotEmpty;
        modes.add(full
            ? 'full'
            : short
                ? 'short'
                : 'hidden');
      }
      expect(modes.first, 'full', reason: modes.join(','));
      expect(modes, contains('short'), reason: modes.join(','));
      expect(modes.last, 'hidden', reason: modes.join(','));
      int rank(String m) => const {'full': 0, 'short': 1, 'hidden': 2}[m]!;
      for (var i = 1; i < modes.length; i++) {
        expect(rank(modes[i]), greaterThanOrEqualTo(rank(modes[i - 1])),
            reason: 'non-monotone degradation: ${modes.join(',')}');
      }
    });
  });
}
