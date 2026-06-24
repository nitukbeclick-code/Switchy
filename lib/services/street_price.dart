import '../data.dart';
import '../models.dart' show Plan;

/// ─────────────────────────────────────────────────────────────────────────────
/// Street Price (מחיר הרחוב) — what real people actually pay, not the sticker.
///
/// Israeli telecom is a negotiation market: the advertised ("רשמי"/catalogue)
/// price is a starting point, and the price a customer actually lands after a
/// retention call or a "deal of the month" can be materially lower. This service
/// aggregates **real, user-reported** prices for a provider into a single honest
/// "street price" figure — and, crucially, shows NOTHING until enough independent
/// reports back it. No fabricated counts, no synthetic averages, no single-report
/// "trend".
///
/// TRUTH-ONLY / E-E-A-T contract (mirrors `provider_ratings.dart` and the
/// community-moderate pre-screen pattern):
///   • An aggregate is exposed ONLY at/above [kStreetPriceMinReports] *accepted*
///     reports for the (provider, category). Below that → `null` (the UI shows a
///     "be the first / not enough reports yet" state, never an invented number).
///   • Every incoming report passes [screenReport] — a deterministic, high-
///     precision sanity gate (real ₪ range, sane vs the catalogue for that
///     provider+category) — before it can COUNT. A rejected report is recorded
///     but excluded from the aggregate, exactly as flagged community content is
///     held out of the feed.
///   • The "typical" figure is the **median** of accepted reports (robust to a
///     single outlier), reported alongside the real min/max and the real count.
///   • The catalogue baseline it compares against is the provider's real cheapest
///     in-category plan ([Plan.priceValue]) — never a guess.
///
/// Pure & dependency-light: no widgets, no navigation, no persistence. The widget
/// owns capture + storage; this is the single source of truth for "is there a
/// street price, and what is it". Unit-tested in `test/street_price_test.dart`.
/// ─────────────────────────────────────────────────────────────────────────────

/// Minimum number of *accepted* reports for a (provider, category) before any
/// aggregate is shown. Below this the data is too thin to be honest, so the
/// service returns `null` and the UI shows an empty/CTA state. Chosen so a single
/// person (or a tiny clique) can't manufacture a "street price".
///
/// Kept in LOCKSTEP with the server's `STREET_PRICE_MIN_REPORTS` (the
/// `street-price` Edge fn + `supabase/street-prices-2026-06.sql`
/// `get_street_price()` = 5) so the app never surfaces a street price the
/// canonical server-side aggregate wouldn't — write/read/display all agree on
/// what "enough real reports" means.
const int kStreetPriceMinReports = 5;

/// Plausibility bounds for a monthly telecom price report (₪). Anything outside
/// this is almost certainly a typo or junk and is rejected by [screenReport] —
/// it never counts toward an aggregate. Intentionally wide so a genuinely cheap
/// SIM (₪5) or a fat triple-play (₪600) is still accepted.
const double kStreetPriceMin = 1;
const double kStreetPriceMax = 2000;

/// Why a submitted report was rejected from the aggregate. `accepted` means it
/// counts. Mirrors the moderate-verdict shape: a deterministic, explainable gate.
enum StreetPriceVerdict {
  accepted,
  outOfRange, // outside [kStreetPriceMin, kStreetPriceMax]
  empty, // no provider / non-positive price
  implausibleVsCatalogue, // grossly below/above the provider's real catalogue band
}

extension StreetPriceVerdictX on StreetPriceVerdict {
  bool get isAccepted => this == StreetPriceVerdict.accepted;

  /// Short Hebrew reason for the (audit / debug) log — never user-facing copy
  /// that fabricates anything; just states why a number was held out.
  String get reason {
    switch (this) {
      case StreetPriceVerdict.accepted:
        return 'התקבל';
      case StreetPriceVerdict.outOfRange:
        return 'מחיר מחוץ לטווח סביר';
      case StreetPriceVerdict.empty:
        return 'חסר ספק או מחיר';
      case StreetPriceVerdict.implausibleVsCatalogue:
        return 'מחיר חורג מאוד מהקטלוג של הספק';
    }
  }
}

/// A single real user-reported "what I actually pay" price. Immutable value type;
/// the [accepted] flag is the output of [screenReport] at submission time so the
/// aggregate can trust it without re-screening.
class StreetPriceReport {
  const StreetPriceReport({
    required this.provider,
    required this.category,
    required this.monthlyPrice,
    required this.reportedAt,
    this.planName,
    this.accepted = true,
    this.verdict = StreetPriceVerdict.accepted,
  });

  final String provider;
  final String category; // cellular / internet / tv / triple / abroad
  final double monthlyPrice; // ₪ the user says they actually pay (monthly)
  final DateTime reportedAt;
  final String? planName; // optional, free text the user typed
  final bool accepted; // passed [screenReport] → counts toward the aggregate
  final StreetPriceVerdict verdict;

  Map<String, dynamic> toJson() => {
        'provider': provider,
        'category': category,
        'monthlyPrice': monthlyPrice,
        'reportedAt': reportedAt.toIso8601String(),
        'planName': planName,
        'accepted': accepted,
        'verdict': verdict.name,
      };

  factory StreetPriceReport.fromJson(Map<String, dynamic> j) {
    final v = StreetPriceVerdict.values.firstWhere(
      (e) => e.name == (j['verdict'] as String?),
      orElse: () => StreetPriceVerdict.accepted,
    );
    return StreetPriceReport(
      provider: j['provider'] as String? ?? '',
      category: j['category'] as String? ?? 'cellular',
      monthlyPrice: (j['monthlyPrice'] as num?)?.toDouble() ?? 0,
      reportedAt:
          DateTime.tryParse(j['reportedAt'] as String? ?? '') ?? DateTime.now(),
      planName: j['planName'] as String?,
      accepted: j['accepted'] as bool? ?? true,
      verdict: v,
    );
  }
}

/// The honest aggregate for a (provider, category): the typical (median) street
/// price, the real min/max, the real count, and — when the provider has a
/// catalogue plan in that category — how the street price compares to the
/// cheapest advertised price. Only ever constructed by
/// [StreetPriceService.aggregateFor] when the threshold is met, so a non-null
/// aggregate ALWAYS represents real, sufficient data.
class StreetPriceAggregate {
  const StreetPriceAggregate({
    required this.provider,
    required this.category,
    required this.reportCount,
    required this.typical,
    required this.low,
    required this.high,
    required this.catalogueLowest,
  });

  final String provider;
  final String category;
  final int reportCount; // number of ACCEPTED reports backing this figure
  final double typical; // median of accepted monthly prices (₪)
  final double low; // min accepted (₪)
  final double high; // max accepted (₪)

  /// The provider's cheapest real catalogue price in this category, or null when
  /// the provider has no plan in the category (then no comparison is shown).
  final double? catalogueLowest;

  /// ₪ the typical street price is BELOW the cheapest catalogue price (positive
  /// when the street beats the sticker). Null when there's no catalogue baseline.
  double? get savingVsCatalogue {
    final c = catalogueLowest;
    if (c == null) return null;
    return c - typical;
  }

  /// True only when the street price is meaningfully below catalogue — the honest
  /// "people pay less than the sticker" signal worth surfacing as VALUE.
  bool get beatsCatalogue {
    final s = savingVsCatalogue;
    return s != null && s >= 1; // ≥ ₪1/mo, i.e. a real, non-rounding difference
  }

  /// Discount fraction (0..1) vs the catalogue baseline, or null without one.
  double? get discountFraction {
    final c = catalogueLowest;
    if (c == null || c <= 0) return null;
    final frac = (c - typical) / c;
    return frac.clamp(0.0, 1.0);
  }

  /// Whole-percent discount vs catalogue (0 when none / no baseline).
  int get discountPct => ((discountFraction ?? 0) * 100).round();

  /// Display strings — whole shekel when whole, else 2 decimals (matches Plan).
  String _money(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);
  String get typicalText => _money(typical);
  String get lowText => _money(low);
  String get highText => _money(high);
  String? get catalogueLowestText =>
      catalogueLowest == null ? null : _money(catalogueLowest!);
  String? get savingVsCatalogueText {
    final s = savingVsCatalogue;
    if (s == null || s < 1) return null;
    return _money(s);
  }

  /// True when the band is wide enough that a single "typical" hides real spread
  /// (low and high differ by more than ~15%). The UI can then show the range too.
  bool get hasSpread => high - low > (typical * 0.15);
}

/// The street-price engine. Stateless logic + an injectable session store so the
/// provider page can submit and read without a DB round-trip (and tests can run
/// fully in-memory). The aggregate is the only thing the UI trusts; everything
/// below the threshold returns `null` by contract.
class StreetPriceService {
  StreetPriceService._();

  /// In-memory, session-scoped report store. This is deliberately NOT persisted
  /// here — persistence/sync is the caller's concern (own-row RLS server-side per
  /// the data contract). Keeping it here lets the provider page show the user's
  /// own just-submitted report immediately and lets tests stay hermetic. Seeded
  /// reports (real catalogue-derived data only) can be added via [seedReports].
  static final List<StreetPriceReport> _reports = [];

  /// All reports currently held (accepted + rejected), newest first. Unmodifiable.
  static List<StreetPriceReport> get allReports {
    final out = [..._reports]
      ..sort((a, b) => b.reportedAt.compareTo(a.reportedAt));
    return List.unmodifiable(out);
  }

  /// Clear the in-memory store (tests + sign-out).
  static void clear() => _reports.clear();

  /// Add already-trusted reports in bulk (e.g. hydrated from the server). Each is
  /// re-screened so a tampered/empty row can never sneak past the gate.
  static void seedReports(Iterable<StreetPriceReport> reports) {
    for (final r in reports) {
      _reports.add(_rescreen(r));
    }
  }

  /// The provider's cheapest real catalogue price in [category], or null when the
  /// provider has no plan there. Uses [Plan.priceValue] (exact) — never a guess.
  /// Only ordinary monthly subscriber plans ([Plan.isRegular]) form the baseline,
  /// so a data-only SIM or per-package abroad add-on can't distort the comparison
  /// (abroad keeps all plans, since "regular" is a monthly-subscriber notion).
  static double? catalogueLowest(String provider, String category) {
    final inCat = plansByProvider(provider)
        .where((p) => p.cat == category)
        .where((p) => category == 'abroad' || p.isRegular)
        .toList();
    if (inCat.isEmpty) return null;
    double? lowest;
    for (final p in inCat) {
      final v = p.priceValue;
      if (lowest == null || v < lowest) lowest = v;
    }
    return lowest;
  }

  /// Deterministic, high-precision sanity gate for a raw report. Returns the
  /// [StreetPriceVerdict] — only [StreetPriceVerdict.accepted] reports count
  /// toward an aggregate. Mirrors community-moderate's heuristic pre-screen:
  /// precision over recall, fail-soft, explainable.
  ///
  ///   • empty                  → no provider, or price not > 0
  ///   • outOfRange             → outside [kStreetPriceMin, kStreetPriceMax]
  ///   • implausibleVsCatalogue → grossly off the provider's real catalogue band
  ///                              for that category (≤10% of, or ≥4× the cheapest
  ///                              advertised price). Wide on purpose: real
  ///                              retention deals are big, but a ₪1 report against
  ///                              a ₪200 plan, or a ₪900 report against a ₪40 SIM,
  ///                              is a typo, not a price.
  static StreetPriceVerdict screenReport({
    required String provider,
    required String category,
    required double monthlyPrice,
  }) {
    if (provider.trim().isEmpty || monthlyPrice <= 0) {
      return StreetPriceVerdict.empty;
    }
    if (monthlyPrice < kStreetPriceMin || monthlyPrice > kStreetPriceMax) {
      return StreetPriceVerdict.outOfRange;
    }
    final base = catalogueLowest(provider, category);
    if (base != null && base > 0) {
      // Real retention discounts can be deep, but not 10x; and nobody pays 4x the
      // cheapest advertised plan as their "street price". Reject the typos only.
      if (monthlyPrice < base * 0.10 || monthlyPrice > base * 4.0) {
        return StreetPriceVerdict.implausibleVsCatalogue;
      }
    }
    return StreetPriceVerdict.accepted;
  }

  /// Build a screened [StreetPriceReport] from raw input WITHOUT storing it. Lets
  /// the widget preview the verdict (e.g. show "המחיר שהוזן חורג") before commit.
  static StreetPriceReport buildReport({
    required String provider,
    required String category,
    required double monthlyPrice,
    String? planName,
    DateTime? at,
  }) {
    final verdict = screenReport(
      provider: provider,
      category: category,
      monthlyPrice: monthlyPrice,
    );
    return StreetPriceReport(
      provider: provider.trim(),
      category: category,
      monthlyPrice: monthlyPrice,
      reportedAt: at ?? DateTime.now(),
      planName: (planName != null && planName.trim().isNotEmpty)
          ? planName.trim()
          : null,
      accepted: verdict.isAccepted,
      verdict: verdict,
    );
  }

  /// Re-derive a report's verdict (defensive — used when hydrating untrusted rows).
  static StreetPriceReport _rescreen(StreetPriceReport r) {
    final verdict = screenReport(
      provider: r.provider,
      category: r.category,
      monthlyPrice: r.monthlyPrice,
    );
    return StreetPriceReport(
      provider: r.provider,
      category: r.category,
      monthlyPrice: r.monthlyPrice,
      reportedAt: r.reportedAt,
      planName: r.planName,
      accepted: verdict.isAccepted,
      verdict: verdict,
    );
  }

  /// Submit a raw report. Screens it, stores it (accepted OR rejected, so the
  /// audit trail is complete), and returns the screened report so the caller can
  /// show the verdict. Storing a rejected report does NOT affect any aggregate.
  static StreetPriceReport submitReport({
    required String provider,
    required String category,
    required double monthlyPrice,
    String? planName,
    DateTime? at,
  }) {
    final report = buildReport(
      provider: provider,
      category: category,
      monthlyPrice: monthlyPrice,
      planName: planName,
      at: at,
    );
    _reports.add(report);
    return report;
  }

  /// The ACCEPTED reports for a (provider, category), newest first.
  static List<StreetPriceReport> acceptedReports(
      String provider, String category) {
    final q = provider.trim();
    return allReports
        .where((r) =>
            r.accepted && r.provider == q && r.category == category)
        .toList();
  }

  /// The honest aggregate for a (provider, category), or `null` when fewer than
  /// [kStreetPriceMinReports] accepted reports back it. A non-null result ALWAYS
  /// represents real, sufficient data — the UI can render it without re-checking.
  static StreetPriceAggregate? aggregateFor(String provider, String category) {
    final accepted = acceptedReports(provider, category);
    if (accepted.length < kStreetPriceMinReports) return null;

    final prices = accepted.map((r) => r.monthlyPrice).toList()..sort();
    final typical = _median(prices);
    return StreetPriceAggregate(
      provider: provider.trim(),
      category: category,
      reportCount: accepted.length,
      typical: typical,
      low: prices.first,
      high: prices.last,
      catalogueLowest: catalogueLowest(provider, category),
    );
  }

  /// Every category for [provider] that currently HAS a publishable aggregate
  /// (≥ threshold accepted reports), in catalogue category order. Empty when the
  /// provider has no street-price data above the threshold — the page then shows
  /// only the "report your price" CTA, never a fabricated section.
  static List<StreetPriceAggregate> aggregatesForProvider(String provider) {
    final out = <StreetPriceAggregate>[];
    for (final c in categories) {
      final agg = aggregateFor(provider, c.id);
      if (agg != null) out.add(agg);
    }
    return out;
  }

  /// True when [provider] has at least one category above the report threshold —
  /// i.e. there is something honest to show. Cheap guard for the widget.
  static bool hasAnyAggregate(String provider) =>
      categories.any((c) => aggregateFor(provider, c.id) != null);

  /// How many MORE accepted reports a (provider, category) needs before its
  /// aggregate unlocks. 0 once the threshold is met. Lets the UI say "עוד N דיווחים
  /// ויוצג מחיר הרחוב" honestly, without implying a number exists yet.
  static int reportsNeeded(String provider, String category) {
    final have = acceptedReports(provider, category).length;
    final need = kStreetPriceMinReports - have;
    return need < 0 ? 0 : need;
  }

  // ── median helper ──────────────────────────────────────────────────────────
  static double _median(List<double> sorted) {
    if (sorted.isEmpty) return 0;
    final n = sorted.length;
    final mid = n ~/ 2;
    if (n.isOdd) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2.0;
  }
}

/// The catalogue categories a provider actually serves, used by the report
/// bottom-sheet so the user can only report a price for a real (provider,
/// category) pair (no fabricated category). Returns category ids in catalogue
/// order; empty for an unknown provider.
List<String> providerCategoryIds(String provider) {
  final present = <String>{};
  for (final Plan p in plansByProvider(provider)) {
    present.add(p.cat);
  }
  return categories.map((c) => c.id).where(present.contains).toList();
}
