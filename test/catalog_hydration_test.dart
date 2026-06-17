import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';

void main() {
  // Always restore the seed so one test can't leak a live catalogue into another.
  tearDown(resetCatalog);

  group('mergeLivePlan', () {
    const seed = Plan(
      id: 'cel_x',
      cat: 'cellular',
      provider: 'ספק',
      net: '5g',
      plan: 'מסלול בסיס',
      price: 50,
      priceExact: 49.9,
      term: 12,
      rating: 4.0,
      reviews: 3,
      flags: ['5g', 'nocommit'],
      feats: ['100GB', 'ללא הגבלת דקות'],
      specs: {'נתונים': '100GB'},
      highlight: false,
    );

    test('overlays backend-owned volatile fields', () {
      const live = Plan(
        id: 'cel_x',
        cat: 'cellular',
        provider: 'ספק',
        net: '', // the table doesn't store net — fetchPlans returns ''
        plan: 'מסלול בסיס — מבצע',
        price: 39,
        priceExact: 38.9,
        rating: 4.6,
        reviews: 120,
        highlight: true,
      );
      final m = mergeLivePlan(seed, live);

      // Volatile fields come from the backend.
      expect(m.price, 39);
      expect(m.priceExact, 38.9);
      expect(m.rating, 4.6);
      expect(m.reviews, 120);
      expect(m.highlight, isTrue);
      expect(m.plan, 'מסלול בסיס — מבצע');

      // Rich static detail is preserved from the seed (the table doesn't store it).
      expect(m.net, '5g');
      expect(m.feats, ['100GB', 'ללא הגבלת דקות']);
      expect(m.flags, ['5g', 'nocommit']);
      expect(m.term, 12);
      expect(m.is5G, isTrue);
    });

    test('keeps seed specs/fees when the live row has none', () {
      const live = Plan(
        id: 'cel_x', cat: 'cellular', provider: 'ספק', net: '',
        plan: 'x', price: 40, // empty specs/fees
      );
      final m = mergeLivePlan(seed, live);
      expect(m.specs, {'נתונים': '100GB'}); // fell back to seed
    });
  });

  group('applyLiveCatalog', () {
    test('empty list is a no-op — stays on the seed', () {
      final before = allPlans.length;
      applyLiveCatalog(const []);
      expect(isCatalogHydrated, isFalse);
      expect(allPlans.length, before);
    });

    test('overlays a live price onto a matching seed plan, app-wide', () {
      final target = seedPlans.first;
      final live = target.copyWith(price: target.price + 7);
      applyLiveCatalog([live]);

      expect(isCatalogHydrated, isTrue);
      // planById (and therefore every screen + the engine) sees the live price.
      expect(planById(target.id)!.price, target.price + 7);
      // …but the rich seed detail is intact.
      expect(planById(target.id)!.feats, target.feats);
      // No plans dropped.
      expect(allPlans.length, seedPlans.length);
    });

    test('appends a genuinely-new live plan with no seed match', () {
      const newPlan = Plan(
        id: 'live_only_999', cat: 'cellular', provider: 'חדש',
        net: '', plan: 'מסלול חדש מהשרת', price: 33,
      );
      applyLiveCatalog([newPlan]);
      expect(planById('live_only_999')?.price, 33);
      expect(allPlans.length, seedPlans.length + 1);
    });

    test('resetCatalog reverts to the seed', () {
      applyLiveCatalog([seedPlans.first.copyWith(price: 1)]);
      expect(isCatalogHydrated, isTrue);
      resetCatalog();
      expect(isCatalogHydrated, isFalse);
      expect(planById(seedPlans.first.id)!.price, seedPlans.first.price);
    });
  });
}
