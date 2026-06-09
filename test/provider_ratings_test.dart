import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/provider_ratings.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('ProviderRatings.averageStars', () {
    test('a real provider scores within (0, 5]', () {
      final provider = allProviders.first;
      final avg = ProviderRatings.averageStars(provider);
      expect(avg, greaterThan(0));
      expect(avg, lessThanOrEqualTo(5));
    });

    test('an unknown provider scores 0', () {
      expect(ProviderRatings.averageStars('no_such_provider_xyz'), 0);
    });
  });

  group('ProviderRatings.reviewCount', () {
    test('is non-negative for a real provider', () {
      expect(ProviderRatings.reviewCount(allProviders.first),
          greaterThanOrEqualTo(0));
    });
  });

  group('ProviderRatings.subRating', () {
    test('every dimension is within the seeded range and deterministic', () {
      final provider = allProviders.first;
      for (final k in ProviderRatings.subKeys) {
        final a = ProviderRatings.subRating(provider, k);
        final b = ProviderRatings.subRating(provider, k);
        expect(a, equals(b), reason: '$k should be deterministic');
        expect(a, inInclusiveRange(3.0, 5.0));
      }
    });

    test("a user's own review overrides the seeded sub-rating", () {
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
    test('aggregates stars, count, four sub-keys and user flag', () {
      final state = AppState();
      final provider = allProviders.first;
      final r = ProviderRatings.forProvider(provider, appState: state);

      expect(r.provider, provider);
      expect(r.hasData, isTrue);
      expect(r.sub.keys.toSet(), ProviderRatings.subKeys.toSet());
      expect(r.ratedByUser, isFalse);

      state.addReview(
        provider: provider,
        overall: 5,
        subRatings: {'price': 5, 'service': 5, 'coverage': 5, 'speed': 5},
        text: '',
      );
      expect(
          ProviderRatings.forProvider(provider, appState: state).ratedByUser,
          isTrue);
    });

    test('unknown provider has no data', () {
      final r = ProviderRatings.forProvider('no_such_provider_xyz');
      expect(r.hasData, isFalse);
      expect(r.reviewCount, 0);
    });
  });
}
