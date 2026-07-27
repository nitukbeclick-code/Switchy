import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/plan_cost.dart';

/// Minimal catalogue row — only the fields the cost engine reads.
Plan _plan({
  required int price,
  int? after,
  String? intro,
  List<String> fineLines = const [],
  String cat = 'internet',
  String? priceUnit,
}) =>
    Plan(
      id: 'test',
      provider: 'פרטנר',
      net: 'פרטנר',
      plan: 'test',
      cat: cat,
      price: price,
      after: after,
      intro: intro,
      fineLines: fineLines,
      priceUnit: priceUnit,
    );

void main() {
  group('published ladder wins over everything', () {
    // The exact catalogue row from the audit: net_partner_fiber1g.
    // Displayed ₪936 (39 x 24); the published ladder makes it ₪3,376.
    final fiber = _plan(
      price: 39,
      after: 159,
      intro: 'חודשיים',
      fineLines: const ['ח׳1-2: ₪39 | ח׳3-12: ₪139 | ח׳13+: ₪159'],
    );

    test('12 months follows the published steps, not the promo price', () {
      final c = calculatePlanCost(fiber, months: 12);
      expect(c.basis, PriceBasis.publishedSchedule);
      expect(c.minimum, 39 * 2 + 139 * 10); // 1468
      expect(c.isRange, isFalse);
    });

    test('24 months extends the tail rate, and is NOT price x 24', () {
      final c = calculatePlanCost(fiber, months: 24);
      expect(c.minimum, 39 * 2 + 139 * 10 + 159 * 12); // 3376
      expect(c.minimum, isNot(39 * 24)); // the bug this file exists to prevent
    });

    test('the ranking inversion is gone', () {
      // A flat ₪109 plan is genuinely cheaper over 24 months than the promo
      // plan, and must now sort that way.
      final flat = _plan(price: 109);
      final promoCost = calculatePlanCost(fiber, months: 24).minimum;
      final flatCost = calculatePlanCost(flat, months: 24).minimum;
      expect(flatCost, lessThan(promoCost));
      expect(promoCost - flatCost, closeTo(760, 0.01));
    });

    test('segments compress into renderable steps', () {
      final segs = calculatePlanCost(fiber, months: 12).segments;
      expect(segs.length, 2);
      expect(segs.first.toMonth, 2);
      expect(segs.first.monthly, 39);
      expect(segs.last.monthly, 139);
    });
  });

  group('promo duration published in prose', () {
    test('"לחודשיים" gives 2 promo months then the after price', () {
      final p = _plan(price: 39, after: 159, intro: 'מבצע לחודשיים');
      final c = calculatePlanCost(p, months: 12);
      expect(c.basis, PriceBasis.publishedPromo);
      expect(c.minimum, 39 * 2 + 159 * 10);
    });

    test('"ל-6 חודשים" is parsed numerically', () {
      final p = _plan(price: 50, after: 100, intro: 'מבצע ל-6 חודשים');
      expect(calculatePlanCost(p, months: 12).minimum, 50 * 6 + 100 * 6);
    });

    test('"שנה ראשונה" covers the whole 12-month term', () {
      final p = _plan(price: 50, after: 100, intro: 'שנה ראשונה במחיר מיוחד');
      final c = calculatePlanCost(p, months: 12);
      expect(c.minimum, 50 * 12);
      expect(c.basis, PriceBasis.publishedPromo);
    });

    test('a promo longer than the term does not overrun it', () {
      final p = _plan(price: 50, after: 100, intro: 'מבצע ל-24 חודשים');
      expect(calculatePlanCost(p, months: 12).minimum, 50 * 12);
    });
  });

  // The site engine (site/plan-cost.js) and this one read the same catalogue
  // rows and are meant to agree. They differed by exactly this free month.
  group('a free opening month published in prose, not as a tier', () {
    // The real catalogue row: tri_yes_yes-fiber-triple. Only "ח׳2-12" matched
    // the tier regex, so month 1 kept the ₪209 fallback fill — the app said
    // ₪2,508 for a year in which the plan gives the first month away, while the
    // site said ₪2,299 for the same row.
    final yesTriple = _plan(
      price: 209,
      after: 329,
      intro: 'חודש ראשון חינם',
      fineLines: const [
        'חודש ראשון חינם',
        'ח׳2-12: ₪209',
        'ח׳13-36: ₪229',
        'ח׳37+: ₪329',
        'נתב WiFi7 שנה מתנה',
      ],
    );

    test('the free month is not charged', () {
      final c = calculatePlanCost(yesTriple, months: 12);
      expect(c.basis, PriceBasis.publishedSchedule);
      expect(c.minimum, 209 * 11); // 2299
      expect(c.minimum, isNot(209 * 12)); // 2508 — the bug
      expect(c.segments.first.monthly, 0);
      expect(c.segments.first.toMonth, 1);
    });

    test('both engines now agree on this row', () {
      // site/plan-cost.js returns 2299 for the same fine print.
      expect(calculatePlanCost(yesTriple, months: 12).minimum, 2299);
    });

    test('24 months keeps the free month and follows the published tail', () {
      final c = calculatePlanCost(yesTriple, months: 24);
      expect(c.minimum, 209 * 11 + 229 * 12); // 2299 + 2748
    });

    test('a free ADD-ON is never mistaken for a free subscription month', () {
      // Most "חינם"/"מתנה" in the catalogue describe an add-on — HBO Max, a
      // router, SIM delivery, a projector. Zeroing month 1 for those would
      // invent a discount the plan does not give, and flatter it.
      for (final line in const [
        'HBO Max חינם 3 ח׳ אח"כ ₪25',
        'נתב WiFi7 שנה מתנה',
        'שיחות חו"ל + משלוח SIM חינם',
        'מקרן וידאו במתנה',
        'סינון אתרים חינם',
      ]) {
        final c = calculatePlanCost(
          _plan(price: 100, fineLines: ['ח׳1-12: ₪100', line]),
          months: 12,
        );
        expect(c.minimum, 1200, reason: line);
        expect(c.segments.first.monthly, 100, reason: line);
      }
    });

    test('a free first month with NO published ladder is left alone', () {
      // Conservative on purpose: with no tier ladder we would be inventing a
      // schedule from prose rather than refining a published one. This is the
      // real cel_walla_family300 row. Overstating the cost understates the
      // saving — the safe direction to be wrong in.
      final c = calculatePlanCost(
        _plan(price: 75, fineLines: const ['₪75 ל-3 מנויים', 'חודש ראשון חינם']),
        months: 12,
      );
      expect(c.basis, PriceBasis.fixedPrice);
      expect(c.minimum, 900);
    });
  });

  group('unpublished duration returns a RANGE rather than a guess', () {
    test('min is promo-forever, max is one promo month', () {
      final p = _plan(price: 39, after: 159); // no duration anywhere
      final c = calculatePlanCost(p, months: 12);
      expect(c.basis, PriceBasis.publishedRange);
      expect(c.isRange, isTrue);
      expect(c.minimum, 39 * 12);
      expect(c.maximum, 39 + 159 * 11);
    });
  });

  group('no promo', () {
    test('a flat price is simply multiplied', () {
      final c = calculatePlanCost(_plan(price: 89), months: 12);
      expect(c.basis, PriceBasis.fixedPrice);
      expect(c.minimum, 89 * 12);
      expect(c.isRange, isFalse);
    });

    test('after <= price is not a promo', () {
      final c = calculatePlanCost(_plan(price: 89, after: 89), months: 12);
      expect(c.basis, PriceBasis.fixedPrice);
    });
  });

  group('planHasMonthlyTerm keeps non-monthly tariffs out of annual math', () {
    test('per-minute and per-day abroad tariffs are not monthly', () {
      expect(planHasMonthlyTerm(_plan(price: 1, cat: 'abroad', priceUnit: 'minute')), isFalse);
      expect(planHasMonthlyTerm(_plan(price: 9, cat: 'abroad', priceUnit: 'day')), isFalse);
      expect(planHasMonthlyTerm(_plan(price: 49, cat: 'abroad', priceUnit: 'package')), isFalse);
    });

    test('an abroad plan with no unit defaults to per-package, not monthly', () {
      expect(planHasMonthlyTerm(_plan(price: 49, cat: 'abroad')), isFalse);
    });

    test('an abroad plan explicitly billed monthly IS monthly', () {
      expect(planHasMonthlyTerm(_plan(price: 49, cat: 'abroad', priceUnit: 'month')), isTrue);
    });

    test('ordinary categories are monthly', () {
      expect(planHasMonthlyTerm(_plan(price: 89, cat: 'cellular')), isTrue);
      expect(planHasMonthlyTerm(_plan(price: 89, cat: 'internet')), isTrue);
    });
  });
}
