import '../models.dart';
import '../data.dart';

/// The result of a global search across the whole catalogue: matching provider
/// names and matching plans (best-first).
class SearchResults {
  const SearchResults({required this.providers, required this.plans});
  final List<String> providers;
  final List<Plan> plans;

  bool get isEmpty => providers.isEmpty && plans.isEmpty;
  bool get isNotEmpty => !isEmpty;
  int get total => providers.length + plans.length;
}

/// Search providers and plans by free text — provider name, plan name,
/// features, and spec keys/values. Case-insensitive (a no-op for Hebrew).
/// Pure and testable; no UI, no navigation.
SearchResults searchEverything(String query, {int planLimit = 40}) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return const SearchResults(providers: [], plans: []);

  bool has(String? s) => s != null && s.toLowerCase().contains(q);

  // Match a provider only when the query is a substring of its name — not the
  // reverse, which would let a short name (CCC/HOT/yes) match unrelated queries.
  final providers = allProviders.where(has).toList();

  bool matches(Plan p) =>
      has(p.provider) ||
      has(p.plan) ||
      p.feats.any(has) ||
      p.specs.values.any(has) ||
      p.specs.keys.any(has);

  // Rank: provider-name hits first, then plan-name hits, then the rest;
  // ties broken by ascending price.
  int rank(Plan p) {
    if (has(p.provider)) return 0;
    if (has(p.plan)) return 1;
    return 2;
  }

  final plans = allPlans.where(matches).toList()
    ..sort((a, b) {
      final byRank = rank(a).compareTo(rank(b));
      if (byRank != 0) return byRank;
      return a.price.compareTo(b.price);
    });

  return SearchResults(
    providers: providers,
    plans: plans.length > planLimit ? plans.sublist(0, planLimit) : plans,
  );
}
