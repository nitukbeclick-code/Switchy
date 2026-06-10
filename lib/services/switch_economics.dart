/// Pure economics for the "מחשבון מעבר" (switch calculator) screen.
///
/// This is the single source of truth for the switch math that the screen used
/// to re-implement inline three separate times (the result getters, the savings
/// bar chart, and the per-milestone timeline). No Flutter, no UI, no
/// navigation — just the numbers, so it can be unit-tested directly.
///
/// All amounts are in ₪ (shekels). "Monthly" saving is per-month for every
/// category except `abroad`, where the same number is the per-package saving
/// (the screen relabels it; the math is identical).
library;

/// Verdict band for a switch, derived from the annual saving.
///
/// Thresholds mirror the original screen: `> 1200` is a strong win,
/// `> 0` is a small win, everything else (including 0) is not worth it.
enum SwitchVerdict {
  /// Annual saving over ₪1200 — strongly worth switching.
  worthIt,

  /// Annual saving in (0, 1200] — a small saving.
  smallSaving,

  /// No annual saving (≤ 0) — not worth switching right now.
  notWorthIt,
}

/// A pure value object capturing the economics of switching from a [current]
/// bill to a [newPlan] price, given a one-off [exitFee].
///
/// Build it once from the three inputs and read the derived figures off the
/// getters; render the result, never re-derive the formulas at the call site.
class SwitchEconomics {
  /// Sentinel returned by [breakEvenMonths] when there is no monthly saving and
  /// the break-even point is therefore undefined (would divide by zero).
  static const double breakEvenUndefined = double.infinity;

  const SwitchEconomics({
    required this.current,
    required this.newPlan,
    this.exitFee = 0,
  });

  /// Current monthly bill (or per-package cost for abroad), in ₪.
  final double current;

  /// New plan price, in ₪.
  final double newPlan;

  /// One-off cost to leave the current provider (early-termination fee), in ₪.
  final double exitFee;

  /// Per-month (or per-package) saving, rounded and clamped to `0..9999`.
  ///
  /// A more expensive new plan yields a negative raw difference and clamps to 0.
  int get monthlySaving => (current - newPlan).round().clamp(0, 9999);

  /// Net saving over a full year, after paying the [exitFee] once, clamped to
  /// `0..99999`. An exit fee larger than a year of savings clamps this to 0.
  int get annualSaving =>
      (monthlySaving * 12 - exitFee.round()).clamp(0, 99999);

  /// Months until the accumulated monthly saving repays the [exitFee].
  ///
  /// Returns [breakEvenUndefined] (`double.infinity`) when [monthlySaving] is 0,
  /// guarding the divide-by-zero. With no exit fee this is 0 (immediate).
  double get breakEvenMonths =>
      monthlySaving > 0 ? exitFee / monthlySaving : breakEvenUndefined;

  /// Whether a finite break-even point exists (there is some monthly saving).
  bool get hasBreakEven => monthlySaving > 0;

  /// The verdict band for this switch, from [annualSaving].
  SwitchVerdict get verdict {
    if (annualSaving > 1200) return SwitchVerdict.worthIt;
    if (annualSaving > 0) return SwitchVerdict.smallSaving;
    return SwitchVerdict.notWorthIt;
  }

  /// Net ₪ saved after [months] of the new plan, having paid the [exitFee]
  /// once up front. Clamped to a non-negative integer.
  ///
  /// This is the canonical figure behind both the savings bar chart and the
  /// per-milestone timeline (6 / 12 / 24 / 36 months, etc.).
  int milestoneAmount(int months) =>
      (monthlySaving * months - exitFee).round().clamp(0, 999999);

  @override
  String toString() =>
      'SwitchEconomics(current: $current, newPlan: $newPlan, '
      'exitFee: $exitFee, monthlySaving: $monthlySaving, '
      'annualSaving: $annualSaving, verdict: $verdict)';
}
