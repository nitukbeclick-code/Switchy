import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart' show Plan;
import 'package:chosech/services/street_price.dart';

// Street price is HONEST by contract (mirrors provider_ratings_test):
//   • nothing is shown below kStreetPriceMinReports accepted reports;
//   • a non-null aggregate ALWAYS represents real, sufficient, screened data;
//   • out-of-range / catalogue-implausible reports are rejected and never count;
//   • the "typical" is a real median; min/max/count are real.
// These tests pin that contract so no future change can fabricate a figure.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // A real provider that has a real cellular catalogue plan, so the
  // catalogue-baseline screen + comparison have something to bite on.
  late String provider;
  late String category;
  late double catalogueLowest;

  setUp(() {
    StreetPriceService.clear();
    // Pick the first provider that genuinely serves the cellular category.
    provider = allProviders.firstWhere(
      (p) => plansByProvider(p).any((pl) => pl.cat == 'cellular'),
    );
    category = 'cellular';
    catalogueLowest = StreetPriceService.catalogueLowest(provider, category)!;
  });

  tearDown(StreetPriceService.clear);

  // A price safely inside the provider's plausible catalogue band so it always
  // passes the sanity screen regardless of which provider setUp picked.
  double inBand([double frac = 0.7]) => (catalogueLowest * frac).clamp(
      kStreetPriceMin + 1, kStreetPriceMax - 1);

  group('catalogueLowest', () {
    test('returns the cheapest real catalogue price for the category', () {
      final cat = StreetPriceService.catalogueLowest(provider, category);
      expect(cat, isNotNull);
      final plans =
          plansByProvider(provider).where((p) => p.cat == category).toList();
      final realMin =
          plans.map((p) => p.priceValue).reduce((a, b) => a < b ? a : b);
      expect(cat, realMin);
    });

    test('is null when the provider has no plan in the category', () {
      expect(StreetPriceService.catalogueLowest(provider, 'no_such_cat'), isNull);
    });

    test('is null for an unknown provider', () {
      expect(StreetPriceService.catalogueLowest('no_such_provider', category),
          isNull);
    });
  });

  group('screenReport (sanity gate)', () {
    test('accepts a plausible in-band price', () {
      expect(
        StreetPriceService.screenReport(
            provider: provider, category: category, monthlyPrice: inBand()),
        StreetPriceVerdict.accepted,
      );
    });

    test('rejects an empty provider / non-positive price', () {
      expect(
        StreetPriceService.screenReport(
            provider: '', category: category, monthlyPrice: 50),
        StreetPriceVerdict.empty,
      );
      expect(
        StreetPriceService.screenReport(
            provider: provider, category: category, monthlyPrice: 0),
        StreetPriceVerdict.empty,
      );
    });

    test('rejects a price outside the absolute plausible range', () {
      expect(
        StreetPriceService.screenReport(
            provider: provider,
            category: category,
            monthlyPrice: kStreetPriceMax + 1),
        StreetPriceVerdict.outOfRange,
      );
    });

    test('rejects a price grossly off the provider catalogue band (typo)', () {
      // Well below 10% of the cheapest advertised plan — a typo, not a deal —
      // but still inside the absolute [kStreetPriceMin, kStreetPriceMax] range so
      // it exercises the catalogue-band branch (not the range branch).
      final tinyButInRange =
          (catalogueLowest * 0.05).clamp(kStreetPriceMin, kStreetPriceMax);
      expect(tinyButInRange, lessThan(catalogueLowest * 0.10));
      expect(
        StreetPriceService.screenReport(
            provider: provider,
            category: category,
            monthlyPrice: tinyButInRange),
        StreetPriceVerdict.implausibleVsCatalogue,
      );
      // ~5x the cheapest advertised plan is nobody's "street price" — kept inside
      // the absolute range so this too hits the catalogue-band branch.
      final wayTooHigh =
          (catalogueLowest * 5).clamp(kStreetPriceMin, kStreetPriceMax);
      expect(wayTooHigh, greaterThan(catalogueLowest * 4));
      expect(
        StreetPriceService.screenReport(
            provider: provider,
            category: category,
            monthlyPrice: wayTooHigh),
        StreetPriceVerdict.implausibleVsCatalogue,
      );
    });
  });

  group('threshold gate (kStreetPriceMinReports)', () {
    test('no aggregate below the threshold (no fabricated figure)', () {
      // One short of the threshold.
      for (var i = 0; i < kStreetPriceMinReports - 1; i++) {
        StreetPriceService.submitReport(
            provider: provider, category: category, monthlyPrice: inBand());
      }
      expect(StreetPriceService.aggregateFor(provider, category), isNull);
      expect(StreetPriceService.hasAnyAggregate(provider), isFalse);
      expect(StreetPriceService.aggregatesForProvider(provider), isEmpty);
      expect(StreetPriceService.reportsNeeded(provider, category), 1);
    });

    test('aggregate appears exactly at the threshold', () {
      for (var i = 0; i < kStreetPriceMinReports; i++) {
        StreetPriceService.submitReport(
            provider: provider, category: category, monthlyPrice: inBand());
      }
      final agg = StreetPriceService.aggregateFor(provider, category);
      expect(agg, isNotNull);
      expect(agg!.reportCount, kStreetPriceMinReports);
      expect(StreetPriceService.reportsNeeded(provider, category), 0);
      expect(StreetPriceService.hasAnyAggregate(provider), isTrue);
    });

    test('rejected reports never count toward the threshold', () {
      // Submit threshold-count of REJECTED (out-of-range) reports.
      for (var i = 0; i < kStreetPriceMinReports + 2; i++) {
        final r = StreetPriceService.submitReport(
            provider: provider,
            category: category,
            monthlyPrice: kStreetPriceMax + 100);
        expect(r.accepted, isFalse);
      }
      // None counted → still no aggregate.
      expect(StreetPriceService.aggregateFor(provider, category), isNull);
      expect(
          StreetPriceService.acceptedReports(provider, category), isEmpty);
    });
  });

  group('aggregate math (real median / min / max / count)', () {
    test('odd count → typical is the middle; low/high are the real extremes',
        () {
      // Five accepted, distinct in-band prices (≥ threshold). Sorted: the median
      // is the 3rd; low/high are the extremes. Submitted out of order on purpose.
      final vals = <double>[
        inBand(0.5),
        inBand(0.6),
        inBand(0.7),
        inBand(0.8),
        inBand(0.9),
      ];
      final shuffled = [vals[3], vals[0], vals[4], vals[1], vals[2]];
      for (final p in shuffled) {
        StreetPriceService.submitReport(
            provider: provider, category: category, monthlyPrice: p);
      }
      final sorted = [...vals]..sort();
      final agg = StreetPriceService.aggregateFor(provider, category)!;
      expect(agg.reportCount, 5);
      expect(agg.low, sorted.first);
      expect(agg.high, sorted.last);
      expect(agg.typical, sorted[2]); // median of 5
    });

    test('even count → median is the mean of the two middle values', () {
      // Six accepted, distinct in-band prices (> threshold) → even count.
      final vals = <double>[
        inBand(0.45),
        inBand(0.55),
        inBand(0.65),
        inBand(0.75),
        inBand(0.85),
        inBand(0.95),
      ]..sort();
      for (final p in vals) {
        StreetPriceService.submitReport(
            provider: provider, category: category, monthlyPrice: p);
      }
      final agg = StreetPriceService.aggregateFor(provider, category)!;
      expect(agg.reportCount, 6);
      // n=6 → median is mean of indices 2 and 3.
      expect(agg.typical, (vals[2] + vals[3]) / 2);
    });
  });

  group('catalogue comparison (VALUE delta)', () {
    test('beatsCatalogue + savingVsCatalogue when street is below sticker', () {
      // Three reports clearly below the cheapest catalogue price.
      final cheap = (catalogueLowest * 0.6)
          .clamp(kStreetPriceMin + 1, catalogueLowest - 1);
      for (var i = 0; i < kStreetPriceMinReports; i++) {
        StreetPriceService.submitReport(
            provider: provider, category: category, monthlyPrice: cheap);
      }
      final agg = StreetPriceService.aggregateFor(provider, category)!;
      expect(agg.catalogueLowest, catalogueLowest);
      expect(agg.beatsCatalogue, isTrue);
      expect(agg.savingVsCatalogue, closeTo(catalogueLowest - cheap, 0.001));
      expect(agg.discountPct, greaterThan(0));
    });

    test('does not claim a saving when street is at/above the sticker', () {
      // Report exactly the catalogue price → no saving claimed.
      for (var i = 0; i < kStreetPriceMinReports; i++) {
        StreetPriceService.submitReport(
            provider: provider,
            category: category,
            monthlyPrice: catalogueLowest);
      }
      final agg = StreetPriceService.aggregateFor(provider, category)!;
      expect(agg.beatsCatalogue, isFalse);
      expect(agg.savingVsCatalogueText, isNull);
      expect(agg.discountPct, 0);
    });
  });

  group('buildReport / submitReport', () {
    test('buildReport screens without storing', () {
      final r = StreetPriceService.buildReport(
          provider: provider, category: category, monthlyPrice: inBand());
      expect(r.accepted, isTrue);
      // Nothing stored.
      expect(StreetPriceService.allReports, isEmpty);
    });

    test('trims an empty plan name to null and keeps a real one', () {
      final a = StreetPriceService.buildReport(
          provider: provider,
          category: category,
          monthlyPrice: inBand(),
          planName: '   ');
      expect(a.planName, isNull);
      final b = StreetPriceService.buildReport(
          provider: provider,
          category: category,
          monthlyPrice: inBand(),
          planName: '  100GB  ');
      expect(b.planName, '100GB');
    });

    test('submitReport stores both accepted and rejected (audit trail)', () {
      StreetPriceService.submitReport(
          provider: provider, category: category, monthlyPrice: inBand());
      StreetPriceService.submitReport(
          provider: provider,
          category: category,
          monthlyPrice: kStreetPriceMax + 50); // rejected
      expect(StreetPriceService.allReports.length, 2);
      expect(StreetPriceService.acceptedReports(provider, category).length, 1);
    });
  });

  group('JSON round-trips + hydration re-screens', () {
    test('toJson/fromJson preserves the report', () {
      final r = StreetPriceService.buildReport(
          provider: provider,
          category: category,
          monthlyPrice: inBand(),
          planName: 'X');
      final back = StreetPriceReport.fromJson(r.toJson());
      expect(back.provider, r.provider);
      expect(back.category, r.category);
      expect(back.monthlyPrice, r.monthlyPrice);
      expect(back.planName, 'X');
      expect(back.accepted, r.accepted);
      expect(back.verdict, r.verdict);
    });

    test('seedReports re-screens a tampered "accepted" junk row out', () {
      // A row claiming accepted:true but with a junk price must be re-rejected.
      final tampered = StreetPriceReport(
        provider: provider,
        category: category,
        monthlyPrice: kStreetPriceMax + 999,
        reportedAt: DateTime.now(),
        accepted: true,
        verdict: StreetPriceVerdict.accepted,
      );
      StreetPriceService.seedReports([tampered]);
      expect(StreetPriceService.acceptedReports(provider, category), isEmpty);
    });
  });

  group('providerCategoryIds', () {
    test('lists only real categories the provider serves, in catalogue order',
        () {
      final ids = providerCategoryIds(provider);
      expect(ids, isNotEmpty);
      expect(ids, contains('cellular'));
      final served =
          plansByProvider(provider).map((Plan p) => p.cat).toSet();
      for (final id in ids) {
        expect(served.contains(id), isTrue);
      }
      // Ordered like the catalogue category list.
      final order = categories.map((c) => c.id).toList();
      final positions = ids.map(order.indexOf).toList();
      final sortedPositions = [...positions]..sort();
      expect(positions, sortedPositions);
    });

    test('is empty for an unknown provider', () {
      expect(providerCategoryIds('no_such_provider_xyz'), isEmpty);
    });
  });
}
