import '../models.dart';
import '../data.dart';

/// A single matched catalogue category (e.g. "אינטרנט") surfaced as its own
/// search hit, so the UI can offer "browse this whole category" alongside
/// the individual provider/plan matches.
class CategoryHit {
  const CategoryHit({required this.id, required this.name, required this.icon});
  final String id;
  final String name;
  final String icon;
}

/// The result of a global search across the whole catalogue: matching provider
/// names, matching categories, and matching plans (best-first).
class SearchResults {
  const SearchResults({
    required this.providers,
    required this.plans,
    this.categories = const [],
  });
  final List<String> providers;
  final List<CategoryHit> categories;
  final List<Plan> plans;

  bool get isEmpty => providers.isEmpty && plans.isEmpty && categories.isEmpty;
  bool get isNotEmpty => !isEmpty;
  int get total => providers.length + plans.length + categories.length;
}

/// Tokenize a free-text query into lowercased, non-empty words. Splitting on
/// whitespace lets a multi-word query ("פרטנר 5G") match a plan that contains
/// every word even if they aren't adjacent.
List<String> _tokens(String q) =>
    q.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();

/// A bare integer the user typed, if the whole query is a price-like number
/// ("50", "₪99"). Used to bias toward plans at/under that budget.
int? _priceToken(String q) {
  final m = RegExp(r'^\D*?(\d{1,5})\D*$').firstMatch(q);
  if (m == null) return null;
  return int.tryParse(m.group(1)!);
}

/// Search providers and plans by free text — provider name, plan name,
/// features, and spec keys/values. Case-insensitive (a no-op for Hebrew) and
/// whitespace-tokenized, so a multi-word query matches when every word is
/// found somewhere in the plan.
///
/// Ranking favours, in order: provider-name matches, plan-name matches (with a
/// prefix/word-boundary boost), then feature/spec matches; ties break on price.
/// A purely numeric query is treated as a budget — plans at or under it float up
/// and the cheapest come first. Pure and testable; no UI, no navigation.
///
/// Optional filters narrow results without changing the base ranking:
/// - [categoryFilter]: keep only plans whose [Plan.cat] matches this id.
/// - [providerFilter]: keep only plans whose [Plan.provider] matches exactly.
/// - [maxPrice]: keep only plans with [Plan.priceValue] ≤ this value.
SearchResults searchEverything(
  String query, {
  int planLimit = 40,
  String? categoryFilter,
  String? providerFilter,
  double? maxPrice,
}) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) {
    return const SearchResults(providers: [], plans: [], categories: []);
  }

  final words = _tokens(q);
  final budget = _priceToken(q);

  bool contains(String? s) => s != null && s.toLowerCase().contains(q);

  // Every whitespace-separated word appears somewhere in [s].
  bool containsAllWords(String? s) {
    if (s == null) return false;
    final low = s.toLowerCase();
    return words.every(low.contains);
  }

  // A word-boundary / prefix hit reads as a stronger match than a mid-word
  // substring ("פרטנר" at the start of "פרטנר פלוס" beats "...פרטנר" buried in
  // a feature line).
  bool startsOrBoundary(String s) {
    final low = s.toLowerCase();
    if (low.startsWith(q)) return true;
    return low.contains(' $q');
  }

  // ── Categories ────────────────────────────────────────────────────────────
  final categoryHits = categories
      .where((c) => containsAllWords(c.name) || c.name.toLowerCase().contains(q))
      .map((c) => CategoryHit(id: c.id, name: c.name, icon: c.icon))
      .toList();
  final matchedCatIds = categoryHits.map((c) => c.id).toSet();

  // ── Providers ─────────────────────────────────────────────────────────────
  // Match a provider only when the query is a substring of its name — not the
  // reverse, which would let a short name (CCC/HOT/yes) match unrelated queries.
  // Boundary/prefix matches rank ahead of mid-name ones.
  final providers = allProviders.where(contains).toList()
    ..sort((a, b) {
      final byBoundary =
          (startsOrBoundary(b) ? 1 : 0).compareTo(startsOrBoundary(a) ? 1 : 0);
      if (byBoundary != 0) return byBoundary;
      return a.length.compareTo(b.length); // shorter = closer to an exact hit
    });

  // ── Plans ─────────────────────────────────────────────────────────────────
  bool matches(Plan p) {
    // A category-name query ("אינטרנט") surfaces that whole category, exactly
    // as before.
    if (matchedCatIds.contains(p.cat)) return true;
    final catName = categoryById(p.cat)?.name;
    return containsAllWords(p.provider) ||
        containsAllWords(p.plan) ||
        contains(p.provider) ||
        contains(p.plan) ||
        contains(catName) ||
        p.feats.any(containsAllWords) ||
        p.feats.any(contains) ||
        p.specs.values.any(contains) ||
        p.specs.keys.any(contains);
  }

  // Lower score = better. Provider hits (0) < plan-name hits (1) < the rest (2),
  // with a fractional bonus for a prefix/word-boundary hit so a clean name match
  // edges out a buried one within the same tier.
  double score(Plan p) {
    if (contains(p.provider)) {
      return startsOrBoundary(p.provider) ? 0.0 : 0.5;
    }
    if (contains(p.plan)) {
      return startsOrBoundary(p.plan) ? 1.0 : 1.5;
    }
    return 2.0;
  }

  final matched = allPlans.where(matches).toList();

  matched.sort((a, b) {
    // When the query is a budget, plans within it lead — cheapest first.
    if (budget != null) {
      final aIn = a.price <= budget, bIn = b.price <= budget;
      if (aIn != bIn) return aIn ? -1 : 1;
    }
    final byScore = score(a).compareTo(score(b));
    if (byScore != 0) return byScore;
    return a.price.compareTo(b.price);
  });

  // Dedupe by id, preserving rank order (defensive — the catalogue shouldn't
  // hold duplicate ids, but a future merge could).
  final seen = <String>{};
  var plans = <Plan>[];
  for (final p in matched) {
    if (seen.add(p.id)) plans.add(p);
  }

  // ── Apply optional filters ────────────────────────────────────────────────
  if (categoryFilter != null && categoryFilter.isNotEmpty) {
    plans = plans.where((p) => p.cat == categoryFilter).toList();
  }
  if (providerFilter != null && providerFilter.isNotEmpty) {
    plans = plans.where((p) => p.provider == providerFilter).toList();
  }
  if (maxPrice != null) {
    plans = plans.where((p) => p.priceValue <= maxPrice).toList();
  }

  // Filter providers to those that still have matching plans (or matched the
  // text query themselves).
  final filteredProviderNames = plans.map((p) => p.provider).toSet();
  final filteredProviders = (categoryFilter != null || providerFilter != null || maxPrice != null)
      ? providers.where((name) => filteredProviderNames.contains(name)).toList()
      : providers;

  return SearchResults(
    providers: filteredProviders,
    categories: categoryHits,
    plans: plans.length > planLimit ? plans.sublist(0, planLimit) : plans,
  );
}

/// The cheapest *regular* plan in each category, in catalogue category order —
/// the real catalogue's honest "browse-by-category" highlight for the empty
/// search state. Never invented popularity; just the genuine lowest price.
/// Per-minute/per-day abroad tariffs are excluded so the figure is comparable.
List<Plan> cheapestPerCategory() {
  final out = <Plan>[];
  for (final c in categories) {
    Plan? best;
    for (final p in allPlans) {
      if (p.cat != c.id) continue;
      if (!p.isRegular) continue;
      if (p.unit == 'minute' || p.unit == 'day') continue;
      if (best == null || p.priceValue < best.priceValue) best = p;
    }
    if (best != null) out.add(best);
  }
  return out;
}
