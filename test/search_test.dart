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
}
