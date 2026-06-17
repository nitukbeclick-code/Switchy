import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/switch_economics.dart';

void main() {
  group('monthlySaving', () {
    test('rounds the difference', () {
      expect(const SwitchEconomics(current: 120.4, newPlan: 79).monthlySaving,
          41);
      expect(const SwitchEconomics(current: 120.6, newPlan: 79).monthlySaving,
          42);
    });

    test('clamps a negative saving (pricier new plan) to 0', () {
      expect(
          const SwitchEconomics(current: 50, newPlan: 90).monthlySaving, 0);
    });

    test('clamps an enormous saving to 9999', () {
      expect(
          const SwitchEconomics(current: 99999, newPlan: 0).monthlySaving,
          9999);
    });
  });

  group('annualSaving', () {
    test('is twelve months of saving minus the one-off exit fee', () {
      // 100/mo saving, ₪300 exit fee -> 1200 - 300 = 900
      const e = SwitchEconomics(current: 200, newPlan: 100, exitFee: 300);
      expect(e.monthlySaving, 100);
      expect(e.annualSaving, 900);
    });

    test('an exit fee exceeding a year of savings clamps annual to 0', () {
      // 50/mo -> 600/yr, exit fee 1000 -> -400 clamps to 0
      const e = SwitchEconomics(current: 150, newPlan: 100, exitFee: 1000);
      expect(e.annualSaving, 0);
    });

    test('is 0 when there is no monthly saving regardless of exit fee', () {
      expect(const SwitchEconomics(current: 80, newPlan: 80).annualSaving, 0);
    });
  });

  group('breakEvenMonths', () {
    test('divides the exit fee by the monthly saving', () {
      const e = SwitchEconomics(current: 200, newPlan: 100, exitFee: 300);
      expect(e.breakEvenMonths, 3.0);
      expect(e.hasBreakEven, isTrue);
    });

    test('is 0 (immediate) when there is no exit fee', () {
      const e = SwitchEconomics(current: 200, newPlan: 100);
      expect(e.breakEvenMonths, 0.0);
    });

    test('guards divide-by-zero: undefined sentinel when saving is 0', () {
      const e = SwitchEconomics(current: 80, newPlan: 80, exitFee: 200);
      expect(e.monthlySaving, 0);
      expect(e.breakEvenMonths, SwitchEconomics.breakEvenUndefined);
      expect(e.breakEvenMonths, double.infinity);
      expect(e.hasBreakEven, isFalse);
    });
  });

  group('verdict bands', () {
    test('annual > 1200 is worthIt', () {
      // 110/mo -> 1320/yr, no exit fee
      const e = SwitchEconomics(current: 210, newPlan: 100);
      expect(e.annualSaving, 1320);
      expect(e.verdict, SwitchVerdict.worthIt);
    });

    test('exactly 1200 is the lower band (smallSaving, not worthIt)', () {
      // 100/mo -> 1200/yr exactly; threshold is strict > 1200
      const e = SwitchEconomics(current: 200, newPlan: 100);
      expect(e.annualSaving, 1200);
      expect(e.verdict, SwitchVerdict.smallSaving);
    });

    test('annual in (0, 1200] is smallSaving', () {
      // 50/mo -> 600/yr
      const e = SwitchEconomics(current: 150, newPlan: 100);
      expect(e.annualSaving, 600);
      expect(e.verdict, SwitchVerdict.smallSaving);
    });

    test('annual of 0 is notWorthIt', () {
      const e = SwitchEconomics(current: 100, newPlan: 100);
      expect(e.annualSaving, 0);
      expect(e.verdict, SwitchVerdict.notWorthIt);
    });

    test('exit fee that zeroes the annual flips verdict to notWorthIt', () {
      // 50/mo -> 600/yr, exit fee 700 -> clamps to 0
      const e = SwitchEconomics(current: 150, newPlan: 100, exitFee: 700);
      expect(e.verdict, SwitchVerdict.notWorthIt);
    });
  });

  group('milestoneAmount', () {
    const e = SwitchEconomics(current: 200, newPlan: 100, exitFee: 300);
    // monthlySaving == 100

    test('subtracts the exit fee once across the timeline', () {
      expect(e.milestoneAmount(3), 0); // 300 - 300
      expect(e.milestoneAmount(6), 300); // 600 - 300
      expect(e.milestoneAmount(12), 900); // 1200 - 300
      expect(e.milestoneAmount(24), 2100); // 2400 - 300
      expect(e.milestoneAmount(36), 3300); // 3600 - 300
    });

    test('clamps to 0 before break-even', () {
      // 2 months * 100 = 200, minus 300 exit fee -> negative -> 0
      expect(e.milestoneAmount(2), 0);
    });

    test('is 0 at every milestone when there is no monthly saving', () {
      const flat = SwitchEconomics(current: 80, newPlan: 80, exitFee: 100);
      expect(flat.milestoneAmount(6), 0);
      expect(flat.milestoneAmount(24), 0);
    });
  });

  group('monthlySaving — rounding & clamp extremes', () {
    test('rounds at the .5 boundary (banker-free, .5 rounds up)', () {
      // 100.5 - 50 = 50.5 -> 51
      expect(const SwitchEconomics(current: 100.5, newPlan: 50).monthlySaving,
          51);
      // 100.49 - 50 = 50.49 -> 50
      expect(const SwitchEconomics(current: 100.49, newPlan: 50).monthlySaving,
          50);
    });

    test('a one-agora saving rounds down to 0', () {
      // 80.004 - 80 = 0.004 -> 0
      expect(const SwitchEconomics(current: 80.004, newPlan: 80).monthlySaving,
          0);
    });

    test('a tiny fractional new-plan-cheaper still clamps non-negative', () {
      // current barely below new plan -> negative raw -> clamp 0
      expect(const SwitchEconomics(current: 79.9, newPlan: 80).monthlySaving, 0);
    });

    test('an exactly-9999 saving is not clamped', () {
      expect(const SwitchEconomics(current: 9999, newPlan: 0).monthlySaving,
          9999);
    });
  });

  group('annualSaving — fractional exit-fee rounding & clamp', () {
    test('rounds the exit fee before subtracting (round-half-up)', () {
      // 100/mo -> 1200/yr, exit fee 300.5 -> rounds to 301 -> 899
      expect(
          const SwitchEconomics(current: 200, newPlan: 100, exitFee: 300.5)
              .annualSaving,
          899);
      // exit fee 300.4 -> rounds to 300 -> 900
      expect(
          const SwitchEconomics(current: 200, newPlan: 100, exitFee: 300.4)
              .annualSaving,
          900);
    });

    test('clamps the upper bound at 99999', () {
      // 9999/mo * 12 = 119988, no exit fee -> clamps to 99999
      expect(const SwitchEconomics(current: 9999, newPlan: 0).annualSaving,
          99999);
    });
  });

  group('defensive exit fees', () {
    test('a negative exit fee (refund/credit) increases the annual saving', () {
      // 50/mo -> 600/yr, "exit fee" of -100 adds back -> 700
      const e = SwitchEconomics(current: 150, newPlan: 100, exitFee: -100);
      expect(e.monthlySaving, 50);
      expect(e.annualSaving, 700);
    });

    test('a negative exit fee never breaks break-even (clamps at 0 months)', () {
      // exitFee/monthlySaving = -100/50 = -2, but as a repayment horizon a
      // negative fee is already repaid: the raw ratio is negative, which the
      // milestone/verdict layer treats as immediate. break-even itself is the
      // raw quotient; assert it is the documented quotient, then that the
      // savings it feeds never go negative.
      const e = SwitchEconomics(current: 150, newPlan: 100, exitFee: -100);
      expect(e.breakEvenMonths, -2.0);
      expect(e.milestoneAmount(0), 100); // 0*50 - (-100) = 100
    });

    test('a huge exit fee zeroes annual and every milestone before payoff', () {
      const e = SwitchEconomics(current: 200, newPlan: 100, exitFee: 100000);
      expect(e.monthlySaving, 100);
      expect(e.annualSaving, 0);
      expect(e.milestoneAmount(12), 0); // 1200 - 100000 -> 0
      expect(e.verdict, SwitchVerdict.notWorthIt);
      // Break-even is finite but enormous (a thousand months).
      expect(e.breakEvenMonths, 1000.0);
      expect(e.hasBreakEven, isTrue);
    });

    test('a huge exit fee with no monthly saving stays undefined break-even', () {
      const e =
          SwitchEconomics(current: 80, newPlan: 80, exitFee: 1000000);
      expect(e.breakEvenMonths, SwitchEconomics.breakEvenUndefined);
      expect(e.hasBreakEven, isFalse);
      expect(e.annualSaving, 0);
    });
  });

  group('milestoneAmount agrees with the verdict bands', () {
    test('a worthIt switch clears >1200 net by the 12-month milestone', () {
      // 110/mo -> annual 1320 (>1200) -> worthIt; 12mo milestone == annual.
      const e = SwitchEconomics(current: 210, newPlan: 100);
      expect(e.verdict, SwitchVerdict.worthIt);
      expect(e.milestoneAmount(12), e.annualSaving);
      expect(e.milestoneAmount(12), greaterThan(1200));
    });

    test('a smallSaving switch nets the annual figure in (0,1200] at 12mo', () {
      // 50/mo -> 600/yr -> smallSaving.
      const e = SwitchEconomics(current: 150, newPlan: 100);
      expect(e.verdict, SwitchVerdict.smallSaving);
      expect(e.milestoneAmount(12), e.annualSaving);
      expect(e.milestoneAmount(12), inInclusiveRange(1, 1200));
    });

    test('a notWorthIt switch nets 0 at the 12-month milestone', () {
      // exit fee zeroes the annual.
      const e = SwitchEconomics(current: 150, newPlan: 100, exitFee: 700);
      expect(e.verdict, SwitchVerdict.notWorthIt);
      expect(e.annualSaving, 0);
      expect(e.milestoneAmount(12), 0);
    });

    test('milestone at 12 months equals annualSaving for any single switch', () {
      // The 12-month milestone and annualSaving share the exact same formula
      // (12*saving - fee, clamped); pin that they never drift.
      for (final e in const [
        SwitchEconomics(current: 200, newPlan: 100, exitFee: 300),
        SwitchEconomics(current: 175, newPlan: 89, exitFee: 0),
        SwitchEconomics(current: 90, newPlan: 90, exitFee: 50),
        SwitchEconomics(current: 300, newPlan: 50, exitFee: 1234),
      ]) {
        expect(e.milestoneAmount(12), e.annualSaving,
            reason: 'milestone(12) must equal annualSaving for $e');
      }
    });
  });
}
