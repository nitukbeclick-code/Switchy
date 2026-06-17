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

  group('ProviderRatings.averageStars — review-count weighting contract', () {
    test('every catalogue provider averages 0 (no plan ships real reviews)', () {
      // The catalogue intentionally seeds reviews == 0 on every plan, so the
      // weighted average (Σ rating*reviews / Σ reviews) has a zero denominator
      // and the guard returns 0. This pins that no placeholder `rating` ever
      // leaks into a fabricated star average.
      for (final p in allProviders) {
        expect(ProviderRatings.averageStars(p), 0,
            reason: 'provider $p must report 0 stars without real reviews');
      }
    });
  });

  group('ProviderRatings.forProvider — blends the user review into the avg', () {
    test('with no catalogue reviews the blended average equals the user overall',
        () {
      // catReviews == 0, catStars == 0  ->  blended == (0*0 + own)/(0+1) == own.
      final state = AppState();
      final provider = allProviders.first;
      state.addReview(
        provider: provider,
        overall: 3,
        subRatings: {'price': 3, 'service': 3, 'coverage': 3, 'speed': 3},
        text: 'ok',
      );
      final r = ProviderRatings.forProvider(provider, appState: state);
      expect(r.stars, 3.0);
      expect(r.reviewCount, 1);
      expect(r.hasData, isTrue);
      expect(r.ratedByUser, isTrue);
    });

    test('an overall of 0 is ignored: no data even though a review row exists',
        () {
      // A review with overall == 0 contributes no star signal; the blend guard
      // (own > 0) leaves stars/reviewCount at the catalogue baseline of 0.
      final state = AppState();
      final provider = allProviders.first;
      state.addReview(
        provider: provider,
        overall: 0,
        subRatings: {'price': 4, 'service': 0, 'coverage': 0, 'speed': 0},
        text: 'no overall',
      );
      final r = ProviderRatings.forProvider(provider, appState: state);
      expect(r.stars, 0);
      expect(r.reviewCount, 0);
      expect(r.hasData, isFalse);
      // But the act of reviewing is still recorded.
      expect(r.ratedByUser, isTrue);
      // The one rated sub-dimension still surfaces.
      expect(r.sub['price'], 4.0);
    });
  });

  group('ProviderRatings.subRating — partial & missing dimensions', () {
    test('a partial review rates only the dimensions the user scored', () {
      // User rates price & service; leaves coverage & speed at 0.
      final state = AppState();
      final provider = allProviders.first;
      state.addReview(
        provider: provider,
        overall: 4,
        subRatings: {'price': 5, 'service': 3, 'coverage': 0, 'speed': 0},
        text: 'partial',
      );
      expect(ProviderRatings.subRating(provider, 'price', appState: state), 5.0);
      expect(
          ProviderRatings.subRating(provider, 'service', appState: state), 3.0);
      // Unscored dimensions stay "no data" (0), never a synthetic fallback.
      expect(
          ProviderRatings.subRating(provider, 'coverage', appState: state), 0);
      expect(ProviderRatings.subRating(provider, 'speed', appState: state), 0);
    });

    test('an unknown sub-key is 0 (missing field handled defensively)', () {
      final state = AppState();
      final provider = allProviders.first;
      state.addReview(
        provider: provider,
        overall: 4,
        subRatings: {'price': 5, 'service': 4, 'coverage': 3, 'speed': 2},
        text: 'full',
      );
      expect(
          ProviderRatings.subRating(provider, 'nonexistent_dim',
              appState: state),
          0);
    });

    test('forProvider.sub carries exactly the four known dimensions', () {
      final state = AppState();
      final provider = allProviders.first;
      state.addReview(
        provider: provider,
        overall: 4,
        subRatings: {'price': 5, 'service': 4, 'coverage': 3, 'speed': 2},
        text: 'full',
      );
      final r = ProviderRatings.forProvider(provider, appState: state);
      expect(r.sub.keys.toSet(), ProviderRatings.subKeys.toSet());
      expect(r.sub['price'], 5.0);
      expect(r.sub['service'], 4.0);
      expect(r.sub['coverage'], 3.0);
      expect(r.sub['speed'], 2.0);
    });
  });
}
