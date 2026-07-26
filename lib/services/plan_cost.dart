/// Multi-month cost of a plan, honouring published promo ladders.
///
/// WHY THIS EXISTS: several screens showed `plan.price * N` — the PROMO price
/// multiplied out as if it lasted forever. On פרטנר "Fiber 1000Mb"
/// (₪39 for two months, ₪139 to month 12, ₪159 after) that renders
/// "עלות ל-24 חודשים ₪936" one row below the card's own
/// "מחיר לאחר מבצע ₪159". The real figure is ₪3,376.
///
/// Understating by 3.6x is bad; INVERTING THE RANKING is worse. That plan showed
/// ₪936 against ₪2,616 for a flat ₪109 plan, while actually costing ₪760 more —
/// so a price-comparison app steered the user to the more expensive deal. 23 of
/// the catalogue's plans have `after > price` and every one hit this.
///
/// This is a direct port of `site/plan-cost.js`, which already got it right; the
/// static site and the app were disagreeing about identical catalogue rows.
/// Keep the two in sync — the parsing rules below mirror it deliberately.
///
/// THE RULE THAT MATTERS MOST: never invent a duration. When the catalogue
/// publishes a promo price but not how long it runs, this returns a RANGE
/// (`PriceBasis.publishedRange`) and the UI must show a range. A plausible guess
/// is indistinguishable from a real figure once it is on screen.
library;

import '../models.dart';

/// How a total was arrived at — drives the disclosure text and whether the
/// figure is a single number or a range.
enum PriceBasis {
  /// A month-by-month ladder was published in the plan's fine print.
  publishedSchedule,

  /// A promo price plus a published duration.
  publishedPromo,

  /// A promo price with NO published duration — min/max differ, show a range.
  publishedRange,

  /// No promo: one price for the whole term.
  fixedPrice,
}

/// A stretch of months billed at one rate — for rendering "ח׳1–2 · ₪39".
class CostSegment {
  const CostSegment({required this.fromMonth, required this.toMonth, required this.monthly});

  final int fromMonth;
  final int toMonth;
  final double monthly;
}

class PlanCost {
  const PlanCost({
    required this.months,
    required this.minimum,
    required this.maximum,
    required this.basis,
    required this.segments,
  });

  final int months;
  final double minimum;
  final double maximum;
  final PriceBasis basis;
  final List<CostSegment> segments;

  /// True when the duration was not published, so only a range is honest.
  bool get isRange => (maximum - minimum).abs() >= 0.005;

  /// Hebrew disclosure — says how the number was derived, so a reader can tell
  /// a published ladder from a range we refused to guess at.
  String get disclosure {
    switch (basis) {
      case PriceBasis.publishedSchedule:
        return 'לפי מדרגות המחיר שפורסמו';
      case PriceBasis.publishedPromo:
        return 'לפי משך המבצע והמחיר שאחריו כפי שפורסמו';
      case PriceBasis.publishedRange:
        return 'משך המבצע לא פורסם בקטלוג, לכן מוצג טווח ולא ניחוש';
      case PriceBasis.fixedPrice:
        return 'לפי המחיר החודשי שפורסם';
    }
  }
}

/// Every line of catalogue prose that may carry a ladder or a promo duration.
String _planText(Plan p) => [
      p.intro ?? '',
      ...p.fineLines,
    ].where((s) => s.isNotEmpty).join(' | ');

/// `ח׳1-2: ₪39` → per-month amounts. Returns null when nothing was published,
/// so the caller can fall through to the promo/range rules.
List<double>? _scheduledMonths(String text, double fallback, int months) {
  final result = List<double>.filled(months, fallback);
  var found = false;
  final pattern = RegExp(r'ח[׳\x27"]?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*:\s*₪?\s*([\d,.]+)');
  for (final m in pattern.allMatches(text)) {
    final from = int.tryParse(m.group(1) ?? '');
    final to = int.tryParse(m.group(2) ?? '');
    final amount = double.tryParse((m.group(3) ?? '').replaceAll(',', ''));
    if (from == null || to == null || amount == null) continue;
    final lo = from < 1 ? 1 : from;
    final hi = to > months ? months : to;
    if (lo > hi) continue;
    found = true;
    for (var month = lo; month <= hi; month++) {
      result[month - 1] = amount;
    }
  }
  // An OPEN-ENDED tail — "ח׳13+: ₪159", "שנה 2+: ₪159" — is the steady-state
  // rate. It must actually FILL the remaining months, not merely prove a ladder
  // exists: site/plan-cost.js only ever asks for 12 months, where the explicit
  // ranges already cover everything, so the gap never showed there. Asking for
  // 24 exposes it, and leaving those months at `fallback` would price the tail
  // of the term at the PROMO rate — the very bug this file exists to kill.
  final tail = RegExp(r'(?:ח[׳\x27"]?\s*(\d{1,2})\+|שנה\s*(\d{1,2})\+)\s*:\s*₪?\s*([\d,.]+)')
      .firstMatch(text);
  if (tail != null) {
    final amount = double.tryParse((tail.group(3) ?? '').replaceAll(',', ''));
    // "שנה 2+" means from month 13; "ח׳13+" means from month 13 directly.
    final fromMonth = tail.group(1) != null
        ? int.tryParse(tail.group(1)!)
        : (int.tryParse(tail.group(2) ?? '') is int
            ? (int.parse(tail.group(2)!) - 1) * 12 + 1
            : null);
    if (amount != null && fromMonth != null) {
      found = true;
      for (var month = fromMonth; month <= months; month++) {
        result[month - 1] = amount;
      }
    }
  }
  if (!found) return null;
  // Any month the catalogue simply did not price: prefer the published
  // post-promo rate over the promo headline. Carrying the promo forward is the
  // optimistic lie; the steady-state price is the honest one.
  return result;
}

/// How many months the promo price runs, when the catalogue says so.
int? _promoMonths(String text) {
  final numbered = RegExp(r'ל[-־]?\s*(\d{1,2})\s*חודש').firstMatch(text);
  if (numbered != null) {
    final n = int.tryParse(numbered.group(1) ?? '');
    if (n != null) return n < 1 ? 1 : n;
  }
  if (RegExp(r'לחודשיים').hasMatch(text)) return 2;
  if (RegExp(r'לחודש(?:\s|$|\||,)').hasMatch(text)) return 1;
  if (RegExp(r'לשנה|שנה ראשונה|מחיר שנה').hasMatch(text)) return 12;
  return null;
}

List<CostSegment> _compress(List<double> months) {
  if (months.isEmpty) return const [];
  final out = <CostSegment>[];
  var fromMonth = 1;
  var monthly = months[0];
  for (var i = 1; i <= months.length; i++) {
    if (i < months.length && months[i] == monthly) continue;
    out.add(CostSegment(fromMonth: fromMonth, toMonth: i, monthly: monthly));
    fromMonth = i + 1;
    if (i < months.length) monthly = months[i];
  }
  return out;
}

/// Total cost over [months], honouring any published promo ladder.
///
/// Only meaningful for plans billed monthly. An abroad package priced per-day or
/// per-minute has no monthly total to compute — callers must check
/// [planHasMonthlyTerm] first rather than multiplying a per-minute tariff by 12.
PlanCost calculatePlanCost(Plan plan, {int months = 12}) {
  final headline = plan.priceExact ?? plan.price.toDouble();
  final after = plan.afterExact ?? plan.after?.toDouble();
  final text = _planText(plan);

  final schedule = _scheduledMonths(text, headline, months);
  if (schedule != null) {
    final total = schedule.fold<double>(0, (s, a) => s + a);
    return PlanCost(
      months: months,
      minimum: total,
      maximum: total,
      basis: PriceBasis.publishedSchedule,
      segments: _compress(schedule),
    );
  }

  if (after != null && after > headline) {
    final duration = _promoMonths(text);
    if (duration != null) {
      final promo = duration > months ? months : duration;
      final ladder = List<double>.generate(months, (i) => i < promo ? headline : after);
      final total = ladder.fold<double>(0, (s, a) => s + a);
      return PlanCost(
        months: months,
        minimum: total,
        maximum: total,
        basis: PriceBasis.publishedPromo,
        segments: _compress(ladder),
      );
    }
    // Duration unpublished. The floor is "promo forever", the ceiling is "one
    // promo month then full price". Show the range; do NOT pick a midpoint.
    return PlanCost(
      months: months,
      minimum: headline * months,
      maximum: headline + after * (months - 1),
      basis: PriceBasis.publishedRange,
      segments: [CostSegment(fromMonth: 1, toMonth: months, monthly: headline)],
    );
  }

  final total = headline * months;
  return PlanCost(
    months: months,
    minimum: total,
    maximum: total,
    basis: PriceBasis.fixedPrice,
    segments: [CostSegment(fromMonth: 1, toMonth: months, monthly: headline)],
  );
}

/// Whether a multi-month total means anything for this plan.
///
/// Abroad packages priced per-package/day/minute are not monthly commitments;
/// annualising them produces a number with no real-world referent (and the
/// recommendation engine ranked on exactly that).
bool planHasMonthlyTerm(Plan plan) {
  final unit = plan.priceUnit;
  if (unit == null || unit.isEmpty) return plan.cat != 'abroad';
  return unit == 'month';
}
