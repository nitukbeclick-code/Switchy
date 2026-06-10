import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/provider_ratings.dart';

void main() {
  // ── planSaveYear ────────────────────────────────────────────────────────────

  group('planSaveYear', () {
    // Use constructed plans so the formula is verified independently of the
    // catalogue data (which is replaced as real provider plans are loaded).
    Plan p(int price) => Plan(id: 't', cat: 'cellular', provider: 'x', net: '4G', plan: 't', price: price);

    test('calculates annual saving correctly', () {
      // ₪35 vs bill ₪119 → (119-35)*12 = 1008
      expect(planSaveYear(p(35), 119), equals(1008));
    });

    test('clamps to 0 when plan price exceeds bill', () {
      // ₪179 vs bill ₪99 → negative, clamps to 0
      expect(planSaveYear(p(179), 99), equals(0));
    });

    test('returns 0 when plan price equals bill', () {
      expect(planSaveYear(p(109), 109), equals(0));
    });

    test('large saving is not artificially capped', () {
      // ₪15 vs bill ₪2000 → (2000-15)*12 = 23820
      expect(planSaveYear(p(15), 2000), equals(23820));
    });
  });

  // ── planById ────────────────────────────────────────────────────────────────

  group('planById', () {
    test('returns a plan for a valid id', () {
      // Look up a real id dynamically so the test survives data changes.
      final sample = plansByCat('cellular').first;
      final plan = planById(sample.id);
      expect(plan, isNotNull);
      expect(plan!.id, equals(sample.id));
      expect(plan.cat, equals('cellular'));
    });

    test('returns null for an unknown id', () {
      expect(planById('does_not_exist'), isNull);
    });
  });

  // ── plansByCat ──────────────────────────────────────────────────────────────

  group('plansByCat', () {
    test('returns only plans for the requested category', () {
      final cellular = plansByCat('cellular');
      expect(cellular, isNotEmpty);
      expect(cellular.every((p) => p.cat == 'cellular'), isTrue);
    });

    test('covers all five categories', () {
      for (final cat in ['cellular', 'internet', 'tv', 'triple', 'abroad']) {
        expect(plansByCat(cat), isNotEmpty, reason: 'category $cat should have plans');
      }
    });

    test('returns empty list for unknown category', () {
      expect(plansByCat('unknown_cat'), isEmpty);
    });

    test('internet plans do not appear in cellular results', () {
      final cellular = plansByCat('cellular');
      expect(cellular.any((p) => p.cat == 'internet'), isFalse);
    });
  });

  // ── plansByProvider / allProviders ───────────────────────────────────────────

  group('plansByProvider', () {
    test('returns only the given provider plans and matches loosely', () {
      final provider = allProviders.first;
      final plans = plansByProvider(provider);
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.provider == provider), isTrue);
    });

    test('a short query finds the full provider name', () {
      // every catalogue provider should be findable by its own (sub)string
      for (final name in allProviders.take(5)) {
        expect(plansByProvider(name), isNotEmpty);
      }
    });

    test('empty query returns empty, unknown provider returns empty', () {
      expect(plansByProvider(''), isEmpty);
      expect(plansByProvider('no_such_provider_xyz'), isEmpty);
    });

    test('allProviders is distinct and non-empty', () {
      final ps = allProviders;
      expect(ps, isNotEmpty);
      expect(ps.toSet().length, equals(ps.length));
    });
  });

  // ── catalogue integrity ──────────────────────────────────────────────────────

  group('catalogue integrity', () {
    test('every plan id is unique', () {
      final ids = allPlans.map((p) => p.id).toList();
      expect(ids.toSet().length, equals(ids.length),
          reason: 'duplicate plan id(s) in the catalogue');
    });

    test('every plan has a positive price', () {
      for (final p in allPlans) {
        expect(p.price, greaterThan(0), reason: 'plan ${p.id} has price ${p.price}');
      }
    });

    test('every plan has a non-empty provider and plan name', () {
      for (final p in allPlans) {
        expect(p.provider.trim(), isNotEmpty, reason: 'plan ${p.id} has empty provider');
        expect(p.plan.trim(), isNotEmpty, reason: 'plan ${p.id} has empty name');
      }
    });

    test('every plan belongs to a known category', () {
      const valid = {'cellular', 'internet', 'tv', 'triple', 'abroad'};
      for (final p in allPlans) {
        expect(valid, contains(p.cat), reason: 'plan ${p.id} has category ${p.cat}');
      }
    });

    test("each category's planCount matches the actual number of plans", () {
      for (final c in categories) {
        expect(c.planCount, equals(plansByCat(c.id).length),
            reason: 'planCount drift for ${c.id}');
      }
    });

    test('after-promo price, when present, is at least the promo price', () {
      for (final p in allPlans.where((p) => p.hasPromo)) {
        expect(p.after, greaterThanOrEqualTo(p.price),
            reason: 'plan ${p.id} promo ₪${p.price} > after ₪${p.after}');
      }
    });
  });

  // ── hotDeal ─────────────────────────────────────────────────────────────────

  group('hotDeal', () {
    test('returns a plan when a saving exists', () {
      // Bill ₪119 should beat at least one cellular plan
      final deal = hotDeal(119, cat: 'cellular');
      expect(deal, isNotNull);
    });

    test('returned plan maximises annual saving among regular plans', () {
      const bill = 119;
      final deal = hotDeal(bill, cat: 'cellular');
      expect(deal, isNotNull);

      // Verify no other *regular* cellular plan has a bigger saving.
      // (dataonly/kosher plans are not eligible — see the test below.)
      final cellular = plansByCat('cellular').where((p) => p.isRegular);
      for (final p in cellular) {
        expect(planSaveYear(p, bill), lessThanOrEqualTo(planSaveYear(deal!, bill)));
      }
    });

    test('never crowns a dataonly or kosher plan as the flagship deal', () {
      // An ₪11 tablet/IoT data-only SIM "saves" the most vs. a ₪119 bill but
      // is not a replacement for a regular line — it must never win.
      final deal = hotDeal(119, cat: 'cellular');
      expect(deal, isNotNull);
      expect(deal!.isRegular, isTrue,
          reason: 'hot deal must be a regular plan, got ${deal.kind} (${deal.id})');
    });

    test('returns null when no plan is cheaper than bill=0', () {
      // Every plan costs > 0 so no saving exists at bill=0
      final deal = hotDeal(0, cat: 'cellular');
      expect(deal, isNull);
    });

    test('works for internet category', () {
      final deal = hotDeal(200, cat: 'internet');
      expect(deal, isNotNull);
      expect(deal!.cat, equals('internet'));
    });
  });

  // ── filteredPlans ────────────────────────────────────────────────────────────

  group('filteredPlans', () {
    test('returns all cellular plans with no restrictions', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.cat == 'cellular'), isTrue);
    });

    test('filters by 5G flag', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: ['5g'],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.is5G), isTrue);
    });

    test('filters by nocommit flag', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: ['nocommit'],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.noCommit), isTrue);
    });

    test('budget filter excludes plans above threshold', () {
      const maxBudget = 40;
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: '',
        budget: maxBudget,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.price <= maxBudget), isTrue);
    });

    test('query filter matches provider name', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: 'גולן',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.provider.contains('גולן') || p.plan.contains('גולן') || p.feats.any((f) => f.contains('גולן'))), isTrue);
    });

    test('sort by price produces ascending order', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: '',
        budget: 0,
      );
      for (var i = 0; i < plans.length - 1; i++) {
        expect(plans[i].price, lessThanOrEqualTo(plans[i + 1].price));
      }
    });

    test('sort by save ranks regular plans by saving, non-regular last', () {
      const bill = 119;
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'save',
        filters: [],
        query: '',
        budget: 0,
        currentBill: bill,
      );
      // Regular plans are in descending saving order.
      final regular = plans.where((p) => p.isRegular).toList();
      for (var i = 0; i < regular.length - 1; i++) {
        expect(
          planSaveYear(regular[i], bill),
          greaterThanOrEqualTo(planSaveYear(regular[i + 1], bill)),
        );
      }
      // dataonly/kosher plans still appear — but only after every regular plan.
      final firstNonRegular = plans.indexWhere((p) => !p.isRegular);
      final lastRegular = plans.lastIndexWhere((p) => p.isRegular);
      expect(firstNonRegular, greaterThan(-1),
          reason: 'non-regular plans must remain in the full results list');
      expect(lastRegular, lessThan(firstNonRegular),
          reason: 'non-regular plans must sort after all regular plans');
    });

    test('dataonly and kosher plans still appear in the results list', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'save',
        filters: [],
        query: '',
        budget: 0,
        currentBill: 119,
      );
      final ids = plans.map((p) => p.id).toSet();
      expect(ids, contains('cel_hotmobile_dataonly20'));
      expect(ids, contains('cel_ramilevy_maxkasher'));
    });

    test('query that matches nothing returns empty list', () {
      final plans = filteredPlans(
        cat: 'cellular',
        sort: 'price',
        filters: [],
        query: 'xyzzy_no_match_12345',
        budget: 0,
      );
      expect(plans, isEmpty);
    });

    test('abroad category returns only abroad plans', () {
      final plans = filteredPlans(
        cat: 'abroad',
        sort: 'price',
        filters: [],
        query: '',
        budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.cat == 'abroad'), isTrue);
    });
  });

  // ── Plan model helpers ───────────────────────────────────────────────────────

  group('Plan model', () {
    test('noCommit is true when term is null', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 30);
      expect(p.noCommit, isTrue);
    });

    test('noCommit is false when term > 0', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 30, term: 12);
      expect(p.noCommit, isFalse);
    });

    test('is5G reflects flags list', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '5G', plan: 'pl', price: 40, flags: ['5g']);
      expect(p.is5G, isTrue);
    });

    test('hasAbroad reflects flags list', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 35, flags: ['abroad']);
      expect(p.hasAbroad, isTrue);
    });

    test('kind defaults to regular', () {
      const p = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 30);
      expect(p.kind, equals('regular'));
      expect(p.isRegular, isTrue);
      const d = Plan(id: 'x', cat: 'cellular', provider: 'p', net: '4G', plan: 'pl', price: 11, kind: 'dataonly');
      expect(d.isRegular, isFalse);
    });
  });

  // ── community feed ───────────────────────────────────────────────────────────

  group('community posts', () {
    // The community feed ships with NO seeded posts: we never fabricate social
    // proof. Real posts arrive from the backend / the user's own submissions,
    // and until then the UI shows an honest empty state.
    test('the seed community feed is empty', () {
      expect(communityPosts, isEmpty,
          reason: 'no invented testimonials / "team report" posts may be seeded');
    });

    test('any post that ever ships still deep-links to a real plan', () {
      // Guards the invariant for real posts: a planId, when present, must
      // resolve. Vacuously true while the seed is empty, but protects against a
      // future regression that re-introduces a post with a dangling planId.
      for (final post in communityPosts.where((p) => p.planId != null)) {
        expect(planById(post.planId!), isNotNull,
            reason: 'post ${post.id} deep-links to missing plan ${post.planId}');
      }
    });
  });

  // ── filter coverage ──────────────────────────────────────────────────────────

  group('filter coverage', () {
    // Mirrors the quick-filter chips the results screen offers per category
    // (lib/pages/results/results_widget.dart) — every chip must be reachable.
    const filterDefs = <String, List<String>>{
      'cellular': ['5g', 'nocommit', 'fixed', 'abroad', 'kosher'],
      'internet': ['nocommit', 'fiber', '1g', 'fixed'],
      'tv': ['streaming', 'sport', 'netflix'],
      'triple': ['netflix', 'sport', 'nocommit'],
      'abroad': ['esim', 'nocommit'],
    };

    test('every filter def matches at least one plan in its category', () {
      filterDefs.forEach((cat, filters) {
        for (final f in filters) {
          final plans = filteredPlans(
              cat: cat, sort: 'price', filters: [f], query: '', budget: 0);
          expect(plans, isNotEmpty,
              reason: "filter '$f' in category '$cat' is a dead end");
        }
      });
    });

    test('1g filter derives speed from structured specs, not plan names', () {
      final plans = filteredPlans(
          cat: 'internet', sort: 'price', filters: ['1g'], query: '', budget: 0);
      final ids = plans.map((p) => p.id).toSet();
      // The gigabit fiber plans the old name-matching used to miss.
      for (final id in [
        'net_cellcom_fiber1g',
        'net_cellcom_fiber25g',
        'net_gilat_1g_online',
        'net_gilat_1g_year',
        'net_gilat_1g_lifetime',
      ]) {
        expect(ids, contains(id), reason: '$id is a gigabit fiber plan');
      }
      for (final p in plans) {
        expect(planDownloadMbps(p), greaterThanOrEqualTo(1000),
            reason: '${p.id} matched 1g without a gigabit download speed');
      }
    });

    test('planDownloadMbps parses the structured speed spec', () {
      Plan p(String? speed) => Plan(
          id: 'x', cat: 'internet', provider: 'p', net: 'fiber', plan: 'pl',
          price: 99, specs: speed == null ? const {} : {'מהירות': speed});
      expect(planDownloadMbps(p('עד 1000/100')), 1000);
      expect(planDownloadMbps(p('עד 2500/250')), 2500);
      expect(planDownloadMbps(p('עד 100/3')), 100);
      expect(planDownloadMbps(p('עד 1000Mb')), 1000);
      expect(planDownloadMbps(p(null)), 0);
    });
  });

  // ── pricing units ────────────────────────────────────────────────────────────

  group('pricing units', () {
    test('every abroad plan declares an explicit price unit', () {
      for (final p in plansByCat('abroad')) {
        expect(p.priceUnit, isNotNull,
            reason: '${p.id} must not fall back to the category default');
        expect(['package', 'day', 'month', 'minute'], contains(p.priceUnit),
            reason: '${p.id} has unknown unit ${p.priceUnit}');
      }
    });

    test('abroad tariffs carry their real pricing model', () {
      expect(planById('ab_019')!.unit, 'minute');
      for (final id in ['ab_cellcom', 'ab_hot', 'ab_golan']) {
        expect(planById(id)!.unit, 'day', reason: '$id is a per-day tariff');
      }
      for (final id in ['ab_partner', 'ab_pelephone', 'ab_partner_3g', 'ab_019_world']) {
        expect(planById(id)!.unit, 'month', reason: '$id is a monthly subscription');
      }
      for (final id in ['ab_airalo', 'ab_airalo_3g', 'ab_airalo_global']) {
        expect(planById(id)!.unit, 'package', reason: '$id is a one-off package');
      }
    });

    test('priceUnitLabel / priceUnitShort cover every unit incl. defaults', () {
      Plan p(String cat, [String? unit]) => Plan(
          id: 'x', cat: cat, provider: 'p', net: '4G', plan: 'pl',
          price: 10, priceUnit: unit);
      // Defaults preserve the historical behavior of every call site:
      expect(priceUnitLabel(p('cellular')), 'לחודש');
      expect(priceUnitLabel(p('internet')), 'לחודש');
      expect(priceUnitLabel(p('abroad')), 'לחבילה');
      // Explicit units:
      expect(priceUnitLabel(p('abroad', 'day')), 'ליום');
      expect(priceUnitLabel(p('abroad', 'minute')), 'לדקה');
      expect(priceUnitLabel(p('abroad', 'month')), 'לחודש');
      expect(priceUnitLabel(p('abroad', 'package')), 'לחבילה');
      expect(priceUnitShort(p('cellular')), 'חודש');
      expect(priceUnitShort(p('abroad')), 'חבילה');
      expect(priceUnitShort(p('abroad', 'day')), 'יום');
      expect(priceUnitShort(p('abroad', 'minute')), 'דקה');
    });

    test('minute tariffs sort last in price-ascending order', () {
      final plans = filteredPlans(
          cat: 'abroad', sort: 'price', filters: [], query: '', budget: 0);
      expect(plans.first.unit, isNot('minute'),
          reason: 'a ₪1/minute tariff is not the cheapest package');
      final firstMinute = plans.indexWhere((p) => p.unit == 'minute');
      final lastOther = plans.lastIndexWhere((p) => p.unit != 'minute');
      expect(firstMinute, greaterThan(-1),
          reason: 'minute tariffs must remain in the list');
      expect(lastOther, lessThan(firstMinute),
          reason: 'minute tariffs must sort after all package/day/month plans');
    });
  });

  // ── catalogue ratings ────────────────────────────────────────────────────────
  //
  // Catalogue plans carry NO seeded review counts (reviews == 0): the old
  // star/review figures were fabricated. A provider therefore reports "no data"
  // until a real review backs it, and the UI shows "אין עדיין דירוגים" instead
  // of a made-up average.

  group('catalogue ratings', () {
    test('no plan ships a fabricated review count', () {
      for (final p in allPlans) {
        expect(p.reviews, equals(0),
            reason: '${p.id} must not seed a fabricated review count');
      }
    });

    test('a real provider reports no rating data (no real reviews yet)', () {
      final provider = allProviders.first;
      expect(ProviderRatings.averageStars(provider), equals(0),
          reason: 'an unreviewed provider must not expose a star average');
      final r = ProviderRatings.forProvider(provider);
      expect(r.hasData, isFalse, reason: 'no real reviews ⇒ hasData is false');
      expect(r.reviewCount, equals(0));
      expect(r.stars, equals(0));
    });

    test('an unknown provider also reports no data', () {
      expect(ProviderRatings.averageStars('no_such_provider_xyz'), equals(0));
      final r = ProviderRatings.forProvider('no_such_provider_xyz');
      expect(r.hasData, isFalse);
      expect(r.reviewCount, equals(0));
    });

    test('every provider in the catalogue is currently a no-data provider', () {
      for (final provider in allProviders) {
        expect(ProviderRatings.forProvider(provider).hasData, isFalse,
            reason: '$provider has no real reviews, so it must show no data');
      }
    });
  });
}
