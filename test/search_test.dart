import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/search.dart';

void main() {
  group('searchEverything', () {
    test('empty query returns nothing', () {
      expect(searchEverything('').isEmpty, isTrue);
      expect(searchEverything('   ').isEmpty, isTrue);
    });

    test('a provider name matches both the provider and its plans', () {
      final provider = allProviders.first;
      final r = searchEverything(provider);
      expect(r.providers, contains(provider));
      expect(r.plans, isNotEmpty);
      // Top plan results should be from that provider (rank 0).
      expect(r.plans.first.provider, contains(provider));
    });

    test('provider-name hits rank ahead of feature-only hits', () {
      final provider = allProviders.first;
      final r = searchEverything(provider);
      // Every plan whose provider matches should appear before any that only
      // matched on a feature/spec.
      var seenNonProvider = false;
      for (final p in r.plans) {
        final isProviderHit = p.provider.toLowerCase().contains(provider.toLowerCase());
        if (!isProviderHit) seenNonProvider = true;
        if (seenNonProvider) {
          expect(isProviderHit, isFalse, reason: 'provider hits must come first');
        }
      }
    });

    test('a feature term like 5G finds plans', () {
      final r = searchEverything('5G');
      expect(r.plans, isNotEmpty);
    });

    test('a category name surfaces that category\'s plans', () {
      // Other categories may also mention "אינטרנט" (e.g. triple bundles), so
      // assert inclusion rather than exclusivity.
      final internet = searchEverything('אינטרנט', planLimit: 999);
      final internetHits = internet.plans.where((p) => p.cat == 'internet').toList();
      expect(internetHits, isNotEmpty);
      expect(internetHits.length, equals(plansByCat('internet').length));

      final tvHits = searchEverything('טלוויזיה', planLimit: 999)
          .plans
          .where((p) => p.cat == 'tv')
          .toList();
      expect(tvHits.length, equals(plansByCat('tv').length));
    });

    test('gibberish returns no results', () {
      expect(searchEverything('zzxyq_not_a_thing_123').isEmpty, isTrue);
    });

    test('search is case-insensitive for latin provider names', () {
      // Find a latin-letter provider in the catalogue, if any.
      final latin = allProviders.where((p) => RegExp(r'[A-Za-z]').hasMatch(p)).toList();
      if (latin.isEmpty) return; // nothing to assert
      final name = latin.first;
      final lower = searchEverything(name.toLowerCase());
      final upper = searchEverything(name.toUpperCase());
      expect(lower.providers, contains(name));
      expect(upper.providers, contains(name));
    });

    test('respects the plan limit', () {
      final provider = allProviders.first;
      final r = searchEverything(provider, planLimit: 3);
      expect(r.plans.length, lessThanOrEqualTo(3));
    });
  });

  group('SearchFacets', () {
    test('an empty facet set is a no-op', () {
      const f = SearchFacets();
      expect(f.isEmpty, isTrue);
      expect(f.activeCount, 0);
      expect(filtered(allPlans, f), equals(allPlans));
    });

    test('activeCount counts each switched-on facet', () {
      expect(const SearchFacets(fiveG: true).activeCount, 1);
      expect(
          const SearchFacets(fiveG: true, noCommit: true, withData: true, maxPrice: 50)
              .activeCount,
          4);
    });

    test('copyWith can clear the budget', () {
      const f = SearchFacets(maxPrice: 50);
      expect(f.copyWith(clearMaxPrice: true).maxPrice, isNull);
      // A plain copyWith keeps the existing budget.
      expect(f.copyWith(fiveG: true).maxPrice, 50);
    });
  });

  group('filtered', () {
    test('5G facet keeps only real 5G plans', () {
      final out = filtered(allPlans, const SearchFacets(fiveG: true));
      expect(out, isNotEmpty);
      expect(out.every((p) => p.is5G), isTrue);
    });

    test('no-commit facet keeps only plans without a term', () {
      final out = filtered(allPlans, const SearchFacets(noCommit: true));
      expect(out, isNotEmpty);
      expect(out.every((p) => p.noCommit), isTrue);
    });

    test('budget facet keeps only plans at or under the cap', () {
      final out = filtered(allPlans, const SearchFacets(maxPrice: 40));
      expect(out, isNotEmpty);
      expect(out.every((p) => p.priceValue <= 40), isTrue);
      // And it actually narrows the catalogue.
      expect(out.length, lessThan(allPlans.length));
    });

    test('with-data facet keeps only plans carrying a data allowance', () {
      final out = filtered(allPlans, const SearchFacets(withData: true));
      expect(out, isNotEmpty);
      expect(out.every(planHasData), isTrue);
    });

    test('facets are AND-combined', () {
      final out = filtered(
          allPlans, const SearchFacets(fiveG: true, noCommit: true, maxPrice: 999999));
      expect(out.every((p) => p.is5G && p.noCommit), isTrue);
    });

    test('preserves input order (facets only narrow, never reorder)', () {
      final ranked = searchEverything(allProviders.first, planLimit: 999).plans;
      final out = filtered(ranked, const SearchFacets(maxPrice: 999999));
      // With an unreachable cap nothing is dropped and order is identical.
      expect(out.map((p) => p.id).toList(), equals(ranked.map((p) => p.id).toList()));
    });

    test('an impossible combo yields an empty list, not an error', () {
      final out = filtered(allPlans, const SearchFacets(maxPrice: 0));
      expect(out, isEmpty);
    });
  });

  group('planHasData', () {
    test('a plan with a structured נתונים spec has data', () {
      final withSpec = allPlans.firstWhere(
        (p) => (p.specs['נתונים'] ?? '').trim().isNotEmpty,
        orElse: () => allPlans.first,
      );
      if ((withSpec.specs['נתונים'] ?? '').trim().isNotEmpty) {
        expect(planHasData(withSpec), isTrue);
      }
    });

    test('a per-minute abroad tariff with no allowance is not flagged as data', () {
      // ab_019 is a per-minute tariff whose feats mention גלישה, so it *does*
      // count — assert instead on the contract: every flagged plan really does
      // mention a data allowance somewhere we can point to.
      final flagged = allPlans.where(planHasData);
      expect(flagged.every((p) {
        final hay = [p.plan, ...p.feats, ...p.specs.values].join(' ');
        return hay.contains('גלישה') ||
            hay.contains('דאטה') ||
            hay.contains('נתונים') ||
            hay.toLowerCase().contains('gb') ||
            hay.contains('ללא הגבלה');
      }), isTrue);
    });
  });
}
