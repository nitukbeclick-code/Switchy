import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/street_price.dart';

// Server-hydration contract for StreetPriceService (the "light-up" path):
//   • hydrate() GETs the street-price edge fn via an injectable fetcher and
//     caches the SERVER aggregate; aggregateFor stays synchronous and PREFERS
//     the server figure (the global pool) over the local session one;
//   • an honest below-threshold answer caches as "known-empty" (no refetch loop
//     within the TTL) and falls through to the local session aggregate;
//   • ANY error is a silent no-op — nothing cached, offline identical to today,
//     and a later hydrate simply retries;
//   • figures the server refused to publish (nulled below threshold) are NEVER
//     reconstructed client-side — truth stays server-enforced;
//   • concurrent hydrates for the same pair share ONE request (in-flight dedupe)
//     and entries expire after serverTtl.
// All with a fake fetcher — no real network anywhere in this file.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late String provider;
  const category = 'cellular';

  setUp(() {
    StreetPriceService.clear();
    StreetPriceService.fetchOverride = null;
    StreetPriceService.serverTtl = const Duration(minutes: 15);
    provider = allProviders.firstWhere(
      (p) => plansByProvider(p).any((pl) => pl.cat == 'cellular'),
    );
  });

  tearDown(() {
    StreetPriceService.clear();
    StreetPriceService.fetchOverride = null;
    StreetPriceService.serverTtl = const Duration(minutes: 15);
  });

  /// A published (above-threshold) edge-fn GET body, as the deployed contract
  /// returns it (see supabase/functions/street-price/index.ts handleRead).
  Map<String, dynamic> publishedBody({
    int count = 7,
    num typical = 59,
    num min = 39,
    num max = 89,
  }) =>
      {
        'ok': true,
        'report_count': count,
        'meets_threshold': true,
        'reports_needed': 0,
        'typical_price': typical,
        'median_price': typical,
        'min_price': min,
        'max_price': max,
        'avg_price': typical,
        'first_at': '2026-06-01T00:00:00Z',
        'last_at': '2026-07-01T00:00:00Z',
      };

  /// An honest below-threshold body: real count, EVERY price nulled by the DB.
  Map<String, dynamic> belowThresholdBody({int count = 2}) => {
        'ok': true,
        'report_count': count,
        'meets_threshold': false,
        'reports_needed': kStreetPriceMinReports - count,
        'typical_price': null,
        'median_price': null,
        'min_price': null,
        'max_price': null,
        'avg_price': null,
        'first_at': null,
        'last_at': null,
      };

  /// Installs a fake fetcher returning [body] (or throwing when [error]) and
  /// returns a call counter.
  List<int> installFetcher(Map<String, dynamic>? Function() body,
      {bool error = false}) {
    final calls = [0];
    StreetPriceService.fetchOverride = (p, c) async {
      calls[0]++;
      if (error) throw StateError('boom');
      return body();
    };
    return calls;
  }

  group('hydrate → server aggregate', () {
    test('caches the published server figure and aggregateFor returns it', () async {
      final calls = installFetcher(() => publishedBody());
      expect(StreetPriceService.aggregateFor(provider, category), isNull);

      await StreetPriceService.hydrate(provider, category);

      final agg = StreetPriceService.aggregateFor(provider, category);
      expect(agg, isNotNull);
      // Verbatim server figures — real median / min / max / count, transported,
      // never recomputed or fabricated.
      expect(agg!.reportCount, 7);
      expect(agg.typical, 59);
      expect(agg.low, 39);
      expect(agg.high, 89);
      expect(agg.provider, provider);
      expect(agg.category, category);
      // Catalogue baseline re-derived from the REAL local catalogue.
      expect(agg.catalogueLowest,
          StreetPriceService.catalogueLowest(provider, category));
      // Source marker: the server cache holds it.
      expect(StreetPriceService.serverAggregateFor(provider, category), isNotNull);
      expect(StreetPriceService.hasServerAnswer(provider, category), isTrue);
      expect(calls[0], 1);
      // Discovery surfaces light up too.
      expect(StreetPriceService.hasAnyAggregate(provider), isTrue);
      expect(
        StreetPriceService.aggregatesForProvider(provider)
            .any((a) => a.category == category),
        isTrue,
      );
      expect(StreetPriceService.reportsNeeded(provider, category), 0);
    });

    test('a fresh entry is NOT refetched within the TTL (no request loop)', () async {
      final calls = installFetcher(() => publishedBody());
      await StreetPriceService.hydrate(provider, category);
      await StreetPriceService.hydrate(provider, category);
      await StreetPriceService.hydrate(provider, category);
      expect(calls[0], 1);
    });

    test('an expired entry IS refetched (session TTL)', () async {
      final calls = installFetcher(() => publishedBody());
      StreetPriceService.serverTtl = Duration.zero; // everything is stale
      await StreetPriceService.hydrate(provider, category);
      await StreetPriceService.hydrate(provider, category);
      expect(calls[0], 2);
    });

    test('concurrent hydrates for the same pair share ONE request', () async {
      final completer = Completer<Map<String, dynamic>?>();
      final calls = [0];
      StreetPriceService.fetchOverride = (p, c) {
        calls[0]++;
        return completer.future;
      };
      final f1 = StreetPriceService.hydrate(provider, category);
      final f2 = StreetPriceService.hydrate(provider, category);
      completer.complete(publishedBody());
      await Future.wait([f1, f2]);
      expect(calls[0], 1);
      expect(StreetPriceService.aggregateFor(provider, category), isNotNull);
    });
  });

  group('known-empty (honest below-threshold)', () {
    test('caches as known-empty: aggregateFor stays null, no refetch loop', () async {
      final calls = installFetcher(() => belowThresholdBody(count: 2));
      await StreetPriceService.hydrate(provider, category);
      expect(StreetPriceService.aggregateFor(provider, category), isNull);
      expect(StreetPriceService.hasServerAnswer(provider, category), isTrue);
      expect(StreetPriceService.serverAggregateFor(provider, category), isNull);
      // Cached — a second hydrate within the TTL does NOT hit the network again.
      await StreetPriceService.hydrate(provider, category);
      expect(calls[0], 1);
      // The GLOBAL count feeds honest "N more reports" copy.
      expect(StreetPriceService.reportsNeeded(provider, category),
          kStreetPriceMinReports - 2);
    });

    test('never reconstructs figures the server refused to publish', () async {
      // meets_threshold true but no typical price (defensive) → known-empty.
      installFetcher(() => {
            'ok': true,
            'report_count': 9,
            'meets_threshold': true,
            'typical_price': null,
          });
      await StreetPriceService.hydrate(provider, category);
      expect(StreetPriceService.aggregateFor(provider, category), isNull);

      // A tampered body claiming prices WITHOUT meeting the threshold → still
      // known-empty (both gates must agree).
      StreetPriceService.clear();
      installFetcher(() => {
            'ok': true,
            'report_count': 2,
            'meets_threshold': false,
            'typical_price': 49,
            'min_price': 39,
            'max_price': 59,
          });
      await StreetPriceService.hydrate(provider, category);
      expect(StreetPriceService.aggregateFor(provider, category), isNull);
    });

    test('known-empty falls through to a LOCAL session aggregate', () async {
      installFetcher(() => belowThresholdBody(count: 0));
      await StreetPriceService.hydrate(provider, category);
      // The user contributes the unlocking reports in THIS session.
      final base = StreetPriceService.catalogueLowest(provider, category)!;
      final price =
          (base * 0.7).clamp(kStreetPriceMin + 1, kStreetPriceMax - 1);
      for (var i = 0; i < kStreetPriceMinReports; i++) {
        StreetPriceService.submitReport(
            provider: provider, category: category, monthlyPrice: price);
      }
      final agg = StreetPriceService.aggregateFor(provider, category);
      expect(agg, isNotNull);
      expect(agg!.reportCount, kStreetPriceMinReports); // the local pool
    });
  });

  group('merge semantics', () {
    test('server aggregate is PREFERRED over a local session aggregate', () async {
      // Local session unlocks with 5 reports at one price…
      final base = StreetPriceService.catalogueLowest(provider, category)!;
      final localPrice =
          (base * 0.9).clamp(kStreetPriceMin + 1, kStreetPriceMax - 1);
      for (var i = 0; i < kStreetPriceMinReports; i++) {
        StreetPriceService.submitReport(
            provider: provider, category: category, monthlyPrice: localPrice);
      }
      expect(StreetPriceService.aggregateFor(provider, category)!.typical,
          localPrice);

      // …then the server aggregate (the GLOBAL pool) lands with different figures.
      installFetcher(
          () => publishedBody(count: 23, typical: 61, min: 35, max: 99));
      await StreetPriceService.hydrate(provider, category);

      final agg = StreetPriceService.aggregateFor(provider, category)!;
      expect(agg.typical, 61); // server wins
      expect(agg.reportCount, 23);
      expect(agg.low, 35);
      expect(agg.high, 99);
    });
  });

  group('fail-soft (offline identical to today)', () {
    test('a null body caches NOTHING and a later hydrate retries', () async {
      final calls = installFetcher(() => null);
      await StreetPriceService.hydrate(provider, category);
      expect(StreetPriceService.hasServerAnswer(provider, category), isFalse);
      expect(StreetPriceService.aggregateFor(provider, category), isNull);
      // Not "known-empty" — an error is retryable.
      await StreetPriceService.hydrate(provider, category);
      expect(calls[0], 2);
    });

    test('a thrown fetch is swallowed (silent no-op, never rethrows)', () async {
      installFetcher(() => publishedBody(), error: true);
      await StreetPriceService.hydrate(provider, category); // must not throw
      expect(StreetPriceService.hasServerAnswer(provider, category), isFalse);
      expect(StreetPriceService.aggregateFor(provider, category), isNull);
    });

    test('an ok:false body caches nothing', () async {
      installFetcher(() => {'ok': false, 'error': 'temporarily unavailable'});
      await StreetPriceService.hydrate(provider, category);
      expect(StreetPriceService.hasServerAnswer(provider, category), isFalse);
    });

    test('blank provider/category is an instant no-op (no fetch)', () async {
      final calls = installFetcher(() => publishedBody());
      await StreetPriceService.hydrate('   ', category);
      await StreetPriceService.hydrate(provider, '');
      expect(calls[0], 0);
    });
  });

  group('clear()', () {
    test('wipes the server cache along with the session store', () async {
      installFetcher(() => publishedBody());
      await StreetPriceService.hydrate(provider, category);
      expect(StreetPriceService.aggregateFor(provider, category), isNotNull);
      StreetPriceService.clear();
      expect(StreetPriceService.hasServerAnswer(provider, category), isFalse);
      expect(StreetPriceService.aggregateFor(provider, category), isNull);
    });
  });
}
