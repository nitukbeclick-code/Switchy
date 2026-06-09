import '../data.dart';
import '../app_state.dart';

/// Aggregate rating for a single provider, blended from the catalogue (each
/// plan carries its own [Plan.rating] / [Plan.reviews]) and the signed-in
/// user's own review when present. This is the single source of truth so the
/// ratings leaderboard and the provider profile never drift apart.
class ProviderRating {
  const ProviderRating({
    required this.provider,
    required this.stars,
    required this.reviewCount,
    required this.sub,
    required this.ratedByUser,
  });

  final String provider;
  final double stars; // 0..5 average across the provider's plans
  final int reviewCount; // total catalogue reviews
  final Map<String, double> sub; // price/service/coverage/speed, each 0..5
  final bool ratedByUser; // the current user left a review

  bool get hasData => stars > 0;
}

class ProviderRatings {
  ProviderRatings._();

  /// Ordered rating dimensions and their Hebrew labels.
  static const subKeys = ['price', 'service', 'coverage', 'speed'];
  static const subLabels = {
    'price': 'מחיר',
    'service': 'שירות',
    'coverage': 'כיסוי',
    'speed': 'מהירות',
  };

  /// Average star rating across a provider's plans, 0 if it has none.
  static double averageStars(String provider) {
    final plans = plansByProvider(provider);
    if (plans.isEmpty) return 0;
    final sum = plans.fold<double>(0, (s, p) => s + p.rating);
    return sum / plans.length;
  }

  /// Total number of catalogue reviews for a provider.
  static int reviewCount(String provider) =>
      plansByProvider(provider).fold<int>(0, (s, p) => s + p.reviews);

  /// A single dimension (price/service/coverage/speed) on a 0..5 scale. Uses
  /// the user's own review when they rated that dimension, otherwise a
  /// deterministic per-provider seed so the value is stable between sessions.
  static double subRating(String provider, String key, {AppState? appState}) {
    final review = (appState ?? AppState()).reviewFor(provider);
    if (review != null) {
      final v = review[key] as int? ?? 0;
      if (v > 0) return v.toDouble();
    }
    final seed = provider.codeUnits.fold(0, (s, c) => s + c);
    switch (key) {
      case 'price':
        return (3.5 + (seed % 15) / 10).clamp(3.0, 5.0);
      case 'service':
        return (3.2 + (seed % 17) / 10).clamp(3.0, 5.0);
      case 'coverage':
        return (3.8 + (seed % 12) / 10).clamp(3.5, 5.0);
      case 'speed':
        return (3.6 + (seed % 11) / 10).clamp(3.2, 5.0);
      default:
        return 4.0;
    }
  }

  /// Full aggregate for a provider.
  static ProviderRating forProvider(String provider, {AppState? appState}) {
    final state = appState ?? AppState();
    return ProviderRating(
      provider: provider,
      stars: averageStars(provider),
      reviewCount: reviewCount(provider),
      sub: {for (final k in subKeys) k: subRating(provider, k, appState: state)},
      ratedByUser: state.hasReviewedProvider(provider),
    );
  }
}
