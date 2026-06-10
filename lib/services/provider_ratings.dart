import '../app_state.dart';
import '../data.dart';
import '../models.dart';

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
  final double stars; // 0..5 average from REAL reviews (0 when none)
  final int reviewCount; // total real reviews (catalogue + user's own)
  final Map<String, double> sub; // price/service/coverage/speed, each 0..5
  final bool ratedByUser; // the current user left a review

  /// True only when at least one real review backs this provider. Until then
  /// the UI must show "אין עדיין דירוגים" rather than a fabricated average.
  bool get hasData => reviewCount > 0;
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

  /// A catalogue plan counts toward a provider's rating only when it carries a
  /// real review count. A plan with `reviews == 0` is unrated — its `rating`
  /// field is a placeholder, not a signal, and must never be averaged in.
  static bool _hasRealReviews(Plan p) => p.reviews > 0;

  /// Number of real catalogue reviews for a provider (plans with reviews > 0).
  static int _catalogueReviewCount(String provider) => plansByProvider(provider)
      .where(_hasRealReviews)
      .fold<int>(0, (s, p) => s + p.reviews);

  /// Average star rating from a provider's REAL catalogue reviews (weighted by
  /// each plan's review count), or 0 when none of its plans are really rated.
  /// We do NOT average placeholder `rating` values — that would fabricate a
  /// star average out of seed data.
  static double averageStars(String provider) {
    final rated = plansByProvider(provider).where(_hasRealReviews).toList();
    final totalReviews = rated.fold<int>(0, (s, p) => s + p.reviews);
    if (totalReviews <= 0) return 0;
    final weighted = rated.fold<double>(0, (s, p) => s + p.rating * p.reviews);
    return weighted / totalReviews;
  }

  /// Total number of REAL reviews for a provider, blending the catalogue's real
  /// reviews with the signed-in user's own review when present.
  static int reviewCount(String provider, {AppState? appState}) {
    final state = appState ?? AppState();
    final base = _catalogueReviewCount(provider);
    return state.hasReviewedProvider(provider) ? base + 1 : base;
  }

  /// A single dimension (price/service/coverage/speed) on a 0..5 scale, taken
  /// from the user's OWN review when they rated that dimension. There is no
  /// synthetic fallback — without a real review the dimension is 0 ("no data"),
  /// and the UI hides the sub-ratings card.
  static double subRating(String provider, String key, {AppState? appState}) {
    final review = (appState ?? AppState()).reviewFor(provider);
    if (review != null) {
      final v = review[key] as int? ?? 0;
      if (v > 0) return v.toDouble();
    }
    return 0;
  }

  /// Full aggregate for a provider. `hasData` is true only when at least one
  /// real review (catalogue or the user's own) backs it; otherwise every figure
  /// is 0 and the UI shows "אין עדיין דירוגים".
  static ProviderRating forProvider(String provider, {AppState? appState}) {
    final state = appState ?? AppState();
    final review = state.reviewFor(provider);

    // Blend the user's own overall rating into the catalogue average.
    final catReviews = _catalogueReviewCount(provider);
    final catStars = averageStars(provider);
    var stars = catStars;
    var totalReviews = catReviews;
    if (review != null) {
      final own = (review['overall'] as int? ?? 0).toDouble();
      if (own > 0) {
        final blended = catStars * catReviews + own;
        totalReviews = catReviews + 1;
        stars = blended / totalReviews;
      }
    }

    return ProviderRating(
      provider: provider,
      stars: stars,
      reviewCount: totalReviews,
      sub: {for (final k in subKeys) k: subRating(provider, k, appState: state)},
      ratedByUser: state.hasReviewedProvider(provider),
    );
  }
}
