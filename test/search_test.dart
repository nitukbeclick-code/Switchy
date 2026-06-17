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

  // ── categoryFilter alone ────────────────────────────────────────────────────
  group('categoryFilter', () {
    test('keeps only plans in the given category', () {
      // A category-name query surfaces several categories (triple bundles also
      // mention "אינטרנט"); the filter must pin results to one [Plan.cat].
      final r = searchEverything('אינטרנט', planLimit: 999, categoryFilter: 'internet');
      expect(r.plans, isNotEmpty);
      expect(r.plans.every((p) => p.cat == 'internet'), isTrue);
    });

    test('an empty-string categoryFilter is treated as no filter', () {
      final all = searchEverything('אינטרנט', planLimit: 999);
      final blank = searchEverything('אינטרנט', planLimit: 999, categoryFilter: '');
      expect(blank.plans.length, equals(all.plans.length));
    });

    test('providers are narrowed to those still holding a matching plan', () {
      final r = searchEverything('אינטרנט', planLimit: 999, categoryFilter: 'internet');
      final survivors = r.plans.map((p) => p.provider).toSet();
      expect(r.providers.every(survivors.contains), isTrue);
    });
  });

  // ── providerFilter alone ────────────────────────────────────────────────────
  group('providerFilter', () {
    test('keeps only plans from the exact provider', () {
      // Pick a provider with more than one plan so the filter does real work.
      final provider = allProviders.firstWhere(
        (name) => allPlans.where((p) => p.provider == name).length > 1,
        orElse: () => allProviders.first,
      );
      final r = searchEverything(provider, planLimit: 999, providerFilter: provider);
      expect(r.plans, isNotEmpty);
      expect(r.plans.every((p) => p.provider == provider), isTrue);
    });

    test('providerFilter matches exactly, not loosely', () {
      // A category query reaches many providers; the exact filter keeps one.
      final provider = allProviders.firstWhere(
        (name) => allPlans.any((p) => p.provider == name && p.cat == 'cellular'),
        orElse: () => allProviders.first,
      );
      final r = searchEverything('סלולר', planLimit: 999, providerFilter: provider);
      expect(r.plans.every((p) => p.provider == provider), isTrue);
    });

    test('an empty-string providerFilter is treated as no filter', () {
      final all = searchEverything('סלולר', planLimit: 999);
      final blank = searchEverything('סלולר', planLimit: 999, providerFilter: '');
      expect(blank.plans.length, equals(all.plans.length));
    });
  });

  // ── maxPrice alone ──────────────────────────────────────────────────────────
  group('maxPrice', () {
    test('keeps only plans at or under the ceiling (inclusive)', () {
      final r = searchEverything('סלולר', planLimit: 999, maxPrice: 40);
      expect(r.plans, isNotEmpty);
      expect(r.plans.every((p) => p.priceValue <= 40), isTrue);
    });

    test('filters on priceValue, so a plan exactly at the ceiling survives', () {
      // Find a real plan price to sit the ceiling exactly on.
      final sample = searchEverything('סלולר', planLimit: 999).plans;
      expect(sample, isNotEmpty);
      final ceiling = sample
          .map((p) => p.priceValue)
          .reduce((a, b) => a < b ? a : b); // the cheapest matching plan
      final r = searchEverything('סלולר', planLimit: 999, maxPrice: ceiling);
      expect(r.plans, isNotEmpty);
      expect(r.plans.every((p) => p.priceValue <= ceiling), isTrue);
      // The boundary plan(s) at exactly the ceiling are retained.
      expect(r.plans.any((p) => p.priceValue == ceiling), isTrue);
    });

    test('a ceiling below every match yields no plans (no fallback re-adds them)', () {
      // The implementation simply filters — there is no documented fallback that
      // re-introduces over-budget plans, so the list goes genuinely empty.
      final r = searchEverything('סלולר', planLimit: 999, maxPrice: 0);
      expect(r.plans, isEmpty);
      // And providers collapse to none, since none retain a matching plan.
      expect(r.providers, isEmpty);
    });
  });

  // ── all three filters combined ──────────────────────────────────────────────
  group('combined filters', () {
    test('category + provider + maxPrice all apply together', () {
      // Choose a (category, provider) pair that genuinely has plans.
      const cat = 'cellular';
      final provider = allPlans
          .firstWhere((p) => p.cat == cat,
              orElse: () => allPlans.first)
          .provider;
      final r = searchEverything(
        'סלולר',
        planLimit: 999,
        categoryFilter: cat,
        providerFilter: provider,
        maxPrice: 99999,
      );
      expect(r.plans.every((p) => p.cat == cat), isTrue);
      expect(r.plans.every((p) => p.provider == provider), isTrue);
      expect(r.plans.every((p) => p.priceValue <= 99999), isTrue);
    });

    test('combined filters never widen beyond each filter applied alone', () {
      const cat = 'cellular';
      final provider = allPlans
          .firstWhere((p) => p.cat == cat, orElse: () => allPlans.first)
          .provider;
      final combined = searchEverything('סלולר',
          planLimit: 999,
          categoryFilter: cat,
          providerFilter: provider,
          maxPrice: 40);
      final byCatOnly =
          searchEverything('סלולר', planLimit: 999, categoryFilter: cat);
      expect(combined.plans.length, lessThanOrEqualTo(byCatOnly.plans.length));
      expect(
        combined.plans.every((p) =>
            p.cat == cat && p.provider == provider && p.priceValue <= 40),
        isTrue,
      );
    });
  });

  // ── conflicting filters ─────────────────────────────────────────────────────
  group('conflicting filters', () {
    test('a category with no plans from the chosen provider yields no plans', () {
      // Find a provider, then a category that provider never serves.
      final provider = allProviders.first;
      final provCats =
          allPlans.where((p) => p.provider == provider).map((p) => p.cat).toSet();
      final missingCat = categories.map((c) => c.id).firstWhere(
            (id) => !provCats.contains(id),
            orElse: () => '',
          );
      // The first provider should not serve every single category; if it
      // somehow does, the test is a no-op rather than a false failure.
      if (missingCat.isEmpty) return;
      final r = searchEverything(
        provider,
        planLimit: 999,
        categoryFilter: missingCat,
        providerFilter: provider,
      );
      expect(r.plans, isEmpty);
      expect(r.providers, isEmpty);
    });

    test('a maxPrice that excludes the only matching provider empties results', () {
      final r = searchEverything('סלולר', planLimit: 999, maxPrice: -1);
      expect(r.plans, isEmpty);
      expect(r.providers, isEmpty);
    });
  });

  // ── dedup by id ─────────────────────────────────────────────────────────────
  group('dedup by id', () {
    test('a broad query yields no duplicate plan ids', () {
      final r = searchEverything('סלולר', planLimit: 999);
      final ids = r.plans.map((p) => p.id).toList();
      expect(ids.toSet().length, equals(ids.length),
          reason: 'each plan id appears at most once');
    });

    test('dedup keeps the first (best-ranked) occurrence', () {
      // The catalogue has unique ids, so dedup is a no-op in practice; assert the
      // invariant holds and order is preserved by checking ids stay distinct and
      // the first plan keeps its rank-0 slot for a provider query.
      final provider = allProviders.first;
      final r = searchEverything(provider, planLimit: 999);
      final ids = r.plans.map((p) => p.id).toList();
      expect(ids.length, equals(ids.toSet().length));
      // First match for a provider query is a provider hit (rank 0).
      if (r.plans.isNotEmpty) {
        expect(r.plans.first.provider.toLowerCase(),
            contains(provider.toLowerCase()));
      }
    });
  });

  // ── budget-token extraction edges ───────────────────────────────────────────
  // A purely price-like query (`_priceToken`) is a SORT bias, not a filter: it
  // floats plans at/under the parsed number to the front (the rest still follow,
  // ranked normally). The effect is therefore only observable when the numeric
  // text ALSO matches some plan textually — a number that appears in no plan's
  // name/feats/specs simply yields an empty list (nothing matched), which is the
  // documented "no fallback" behaviour rather than a crash.
  group('budget token', () {
    // Once the first over-budget plan appears, every plan after it must also be
    // over budget — i.e. the in-budget block leads.
    void expectInBudgetLeads(String query, num b) {
      final plans = searchEverything(query, planLimit: 999).plans;
      var seenOver = false;
      for (final p in plans) {
        if (p.price > b) seenOver = true;
        if (seenOver) {
          expect(p.price > b, isTrue,
              reason: 'in-budget plans must precede over-budget ones for "$query"');
        }
      }
    }

    test('a bare number floats in-budget plans ahead of over-budget ones', () {
      // "50" matches plenty of plans textually (50GB, ₪50, …) AND parses as a
      // budget, so the ordering bias is observable: every ≤50 plan precedes the
      // first >50 plan.
      final plans = searchEverything('50', planLimit: 999).plans;
      expect(plans.where((p) => p.price <= 50), isNotEmpty);
      expect(plans.where((p) => p.price > 50), isNotEmpty,
          reason: 'need both sides of the budget to prove the ordering');
      expectInBudgetLeads('50', 50);
    });

    test('a different bare number reproduces the in-budget-leads ordering', () {
      // Guards against "50" being a lucky coincidence: "100" splits the set too.
      expectInBudgetLeads('100', 100);
    });

    test('a ₪ prefix is stripped before parsing the number', () {
      // "₪50" parses to budget 50; the literal "₪50" text appears in a couple of
      // plans, all in-budget — so the block still leads (vacuously, but it must
      // not throw and must not surface an over-budget plan ahead of an in-budget
      // one).
      expectInBudgetLeads('₪50', 50);
    });

    test('a ₪ suffix parses but, matching no plan text, returns empty (no fallback)', () {
      // The number is extracted regardless of suffix, but "50₪" appears in no
      // plan, and the budget is a sort bias not a filter — so nothing matches
      // and the list is genuinely empty.
      final r = searchEverything('50₪', planLimit: 999);
      expect(r.plans, isEmpty);
    });

    test('a Hebrew "פחות מ-" prefix parses but matches no plan text', () {
      // "פחות מ-50" → budget 50, but the phrase appears in no plan → empty.
      final r = searchEverything('פחות מ-50', planLimit: 999);
      expect(r.plans, isEmpty);
    });

    test('leading zeros parse the integer value but match no plan literally', () {
      // int.tryParse("0050") == 50, yet "0050" is not a substring of any plan,
      // so the result is empty — confirming the token is a bias, not a matcher.
      final r = searchEverything('0050', planLimit: 999);
      expect(r.plans, isEmpty);
    });

    test('the five-digit boundary parses without error', () {
      // 99999 fits \d{1,5} (a valid budget) but is in no plan text → empty, and
      // crucially does not throw on the boundary.
      final r = searchEverything('99999', planLimit: 999);
      expect(r.plans, isEmpty);
      expect(r.isEmpty, isTrue);
    });

    test('a six-digit number is NOT a budget token and matches nothing', () {
      // \d{1,5} cannot consume "100000" and still satisfy the trailing \D*$, so
      // the parser returns null. Either way "100000" matches no plan → empty.
      final r = searchEverything('100000', planLimit: 999);
      expect(r.plans, isEmpty);
      expect(r.isEmpty, isTrue);
    });

    test('a non-numeric query has no budget token and matches nothing here', () {
      // No digits → null budget; the gibberish also matches no plan text.
      final r = searchEverything('zzxyq_not_a_thing_123');
      expect(r.isEmpty, isTrue);
    });

    test('a two-token query with embedded digits is not a pure budget', () {
      // "50 5g" has two digit groups (the second token "5g" leaves a non-digit
      // tail "g" but a digit "5" before it), so ^\D*?(\d+)\D*$ cannot match the
      // whole string → null budget. It still runs as a text search, matching
      // plans that contain both "50" and "5g".
      final plans = searchEverything('50 5g', planLimit: 999).plans;
      expect(plans, isNotEmpty);
      // Without a budget, ordering is by score then price — not budget-gated.
      // Every result must mention both tokens somewhere (provider/plan/feats).
      for (final p in plans) {
        final hay = [
          p.provider,
          p.plan,
          ...p.feats,
          ...p.specs.values,
          ...p.specs.keys,
        ].join(' ').toLowerCase();
        expect(hay.contains('50') && hay.contains('5g'), isTrue,
            reason: 'a multi-word query requires every word to appear');
      }
    });
  });
}
