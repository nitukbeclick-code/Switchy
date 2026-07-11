import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart' show Plan;
import 'package:chosech/services/backend/local_backend.dart';
import 'package:chosech/services/catalogue_sync.dart';

/// Pure-logic tests for the live-catalogue refresh path:
/// [hydrateCatalogue] (merge semantics, truth-only + never-blank guarantees)
/// and [CatalogueSync] (start/stop lifecycle + AppState notification).
/// Backend behaviour is faked by subclassing [LocalBackend] — no widgets, no
/// network, mirroring the established service-test style.

/// A backend whose live catalogue is scripted per test.
class _CatalogueBackend extends LocalBackend {
  _CatalogueBackend(this.live);
  final List<Plan> live;
  int fetches = 0;

  @override
  Future<List<Plan>> fetchCatalogue() async {
    fetches++;
    return live;
  }
}

/// A backend whose live read always fails (offline / RLS / transport error).
class _ThrowingBackend extends LocalBackend {
  @override
  Future<List<Plan>> fetchCatalogue() async =>
      throw StateError('live read failed');
}

Plan _plan(String id, {String cat = 'cellular', int price = 10}) => Plan(
      id: id,
      cat: cat,
      provider: 'בדיקה',
      net: 'test',
      plan: 'מסלול $id',
      price: price,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // hydrateCatalogue mutates library globals — restore them after every test
  // so the rest of the suite keeps seeing the compiled snapshot.
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    appBackend = LocalBackend();
  });

  tearDown(() {
    CatalogueSync.stop();
    allPlans
      ..clear()
      ..addAll(compiledPlans);
    catalogueHydrated = false;
    catalogueSyncedAt = null;
    appBackend = LocalBackend();
  });

  group('hydrateCatalogue', () {
    test('an empty live read keeps the last-known-good and reports false',
        () async {
      final before = List<Plan>.of(allPlans);
      final applied = await hydrateCatalogue(_CatalogueBackend(const []));
      expect(applied, isFalse);
      expect(allPlans, orderedEquals(before)); // never blank
      expect(catalogueHydrated, isFalse);
      expect(catalogueSyncedAt, isNull);
    });

    test('a failed live read keeps the last-known-good and reports false',
        () async {
      final before = List<Plan>.of(allPlans);
      final applied = await hydrateCatalogue(_ThrowingBackend());
      expect(applied, isFalse);
      expect(allPlans, orderedEquals(before));
      expect(catalogueSyncedAt, isNull);
    });

    test('live rows win by id — a fresh price replaces the compiled one',
        () async {
      final base = compiledPlans.first;
      final updated = _plan(base.id, cat: base.cat, price: base.price + 7);
      final applied =
          await hydrateCatalogue(_CatalogueBackend([updated]));
      expect(applied, isTrue);
      expect(allPlans.firstWhere((p) => p.id == base.id).price,
          base.price + 7);
      expect(catalogueHydrated, isTrue);
      expect(catalogueSyncedAt, isNotNull);
    });

    test('compiled-only plans are never dropped by a partial live read',
        () async {
      // The live table surfaces just one row; every other compiled plan must
      // survive the merge (the user never sees fewer plans than shipped).
      await hydrateCatalogue(_CatalogueBackend([_plan(compiledPlans.first.id)]));
      expect(allPlans.length, greaterThanOrEqualTo(compiledPlans.length));
      for (final base in compiledPlans) {
        expect(allPlans.any((p) => p.id == base.id), isTrue,
            reason: 'compiled plan ${base.id} must never be dropped');
      }
    });

    test('live-only plans are appended after the compiled order', () async {
      final fresh = _plan('live_only_new_id');
      await hydrateCatalogue(_CatalogueBackend([fresh]));
      expect(allPlans.length, compiledPlans.length + 1);
      // Compiled order preserved first (stable UI), the new id appended last.
      expect(allPlans.last.id, 'live_only_new_id');
      expect(
        allPlans.take(compiledPlans.length).map((p) => p.id),
        orderedEquals(compiledPlans.map((p) => p.id)),
      );
    });

    test('the allPlans list instance stays stable across a refresh', () async {
      final captured = allPlans; // consumers hold the same reference
      await hydrateCatalogue(_CatalogueBackend([_plan('live_only_new_id')]));
      expect(identical(captured, allPlans), isTrue);
      expect(captured.any((p) => p.id == 'live_only_new_id'), isTrue);
    });

    test('is idempotent — re-applying the same snapshot changes nothing',
        () async {
      final backend = _CatalogueBackend([_plan('live_only_new_id')]);
      await hydrateCatalogue(backend);
      final after = List<Plan>.of(allPlans);
      await hydrateCatalogue(backend);
      expect(allPlans.map((p) => p.id), orderedEquals(after.map((p) => p.id)));
    });
  });

  group('CatalogueSync', () {
    test('start hydrates immediately and flips isStarted; stop resets it',
        () async {
      expect(CatalogueSync.isStarted, isFalse);
      await CatalogueSync.start();
      expect(CatalogueSync.isStarted, isTrue);
      // Under LocalBackend the initial hydrate applies the compiled snapshot.
      expect(catalogueHydrated, isTrue);
      CatalogueSync.stop();
      expect(CatalogueSync.isStarted, isFalse);
    });

    test('start is idempotent — a second call replaces the previous poller',
        () async {
      await CatalogueSync.start();
      await CatalogueSync.start(); // must not throw or double-start
      expect(CatalogueSync.isStarted, isTrue);
    });

    test('refresh notifies AppState when a live snapshot is applied',
        () async {
      appBackend = _CatalogueBackend([_plan('live_only_new_id')]);
      var notifies = 0;
      AppState().addListener(() => notifies++);
      await CatalogueSync.refresh();
      expect(notifies, 1);
      expect(allPlans.any((p) => p.id == 'live_only_new_id'), isTrue);
    });

    test('a failed refresh keeps quiet — no notify, no catalogue change',
        () async {
      appBackend = _ThrowingBackend();
      var notifies = 0;
      AppState().addListener(() => notifies++);
      final before = List<Plan>.of(allPlans);
      await CatalogueSync.refresh();
      expect(notifies, 0); // no visible flicker on a failed read
      expect(allPlans, orderedEquals(before));
    });
  });
}
