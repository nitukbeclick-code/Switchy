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
}
