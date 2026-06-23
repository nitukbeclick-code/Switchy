import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/provider_ratings.dart';

// Ratings are honest now: the catalogue ships no fabricated review counts, so a
// provider reports "no data" until a real review (the user's own) backs it.
// These tests pin that contract — no synthetic averages, no seeded sub-ratings.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('ProviderRatings.averageStars', () {
    test('a catalogue provider has no fabricated average (0 until real reviews)', () {
      expect(ProviderRatings.averageStars(allProviders.first), 0);
    });

    test('an unknown provider scores 0', () {
      expect(ProviderRatings.averageStars('no_such_provider_xyz'), 0);
    });
  });

  group('ProviderRatings.reviewCount', () {
    test('is zero for a provider with no real reviews', () {
      expect(ProviderRatings.reviewCount(allProviders.first), 0);
    });

    test("counts the user's own review", () {
      final state = AppState();
      final provider = allProviders.first;
      state.addReview(
        provider: provider,
        overall: 4,
        subRatings: {'price': 5, 'service': 4, 'coverage': 3, 'speed': 2},
        text: 'great value',
      );
      expect(ProviderRatings.reviewCount(provider, appState: state), 1);
    });
  });

  group('ProviderRatings.subRating', () {
    test('every dimension is 0 (no data) without a real review', () {
      final provider = allProviders.first;
      for (final k in ProviderRatings.subKeys) {
        expect(ProviderRatings.subRating(provider, k), 0);
      }
    });

    test("a user's own review supplies the sub-rating", () {
      final state = AppState();
      final provider = allProviders.first;
      state.addReview(
        provider: provider,
        overall: 4,
        subRatings: {'price': 5, 'service': 4, 'coverage': 3, 'speed': 2},
        text: 'great value',
      );
      expect(ProviderRatings.subRating(provider, 'price', appState: state), 5.0);
      expect(ProviderRatings.subRating(provider, 'speed', appState: state), 2.0);
    });
  });

  group('zero-review providers report uniformly empty', () {
    test('every catalogue provider starts with no fabricated rating data', () {
      // The whole point: a fresh catalogue (no real reviews anywhere) must yield
      // zeros across the board — no provider gets a seeded average or sub-rating.
      for (final provider in allProviders) {
        expect(ProviderRatings.averageStars(provider), 0,
            reason: '$provider must not show a fabricated average');
        expect(ProviderRatings.reviewCount(provider), 0);
        final r = ProviderRatings.forProvider(provider);
        expect(r.hasData, isFalse);
        expect(r.stars, 0);
        expect(r.ratedByUser, isFalse);
        // The sub map is always fully-keyed (no missing dimensions), all zero.
        expect(r.sub.keys.toSet(), ProviderRatings.subKeys.toSet());
        expect(r.sub.values.every((v) => v == 0), isTrue);
      }
    });

    test('an empty/whitespace provider name also reports no data', () {
      final r = ProviderRatings.forProvider('');
      expect(r.hasData, isFalse);
      expect(r.stars, 0);
      expect(r.reviewCount, 0);
    });

    test('a review with overall 0 does not fabricate a star average', () {
      final state = AppState();
      final provider = allProviders.first;
      // A degenerate review (overall 0) must not flip hasData on via the stars
      // path — only the count of the user's own review bumps reviewCount.
      state.addReview(
        provider: provider,
        overall: 0,
        subRatings: const {'price': 0, 'service': 0, 'coverage': 0, 'speed': 0},
        text: '',
      );
      final r = ProviderRatings.forProvider(provider, appState: state);
      expect(r.stars, 0); // no positive overall → no average fabricated
      expect(r.sub.values.every((v) => v == 0), isTrue);
    });
  });

  group('ProviderRatings.forProvider', () {
    test('reports no data until a real review exists, then aggregates it', () {
      final state = AppState();
      final provider = allProviders.first;

      final before = ProviderRatings.forProvider(provider, appState: state);
      expect(before.provider, provider);
      expect(before.hasData, isFalse);
      expect(before.reviewCount, 0);
      expect(before.stars, 0);
      expect(before.sub.keys.toSet(), ProviderRatings.subKeys.toSet());
      expect(before.ratedByUser, isFalse);

      state.addReview(
        provider: provider,
        overall: 5,
        subRatings: {'price': 5, 'service': 5, 'coverage': 5, 'speed': 5},
        text: '',
      );
      final after = ProviderRatings.forProvider(provider, appState: state);
      expect(after.hasData, isTrue);
      expect(after.ratedByUser, isTrue);
      expect(after.reviewCount, 1);
      expect(after.stars, 5.0);
    });

    test('unknown provider has no data', () {
      final r = ProviderRatings.forProvider('no_such_provider_xyz');
      expect(r.hasData, isFalse);
      expect(r.reviewCount, 0);
    });
  });
}
