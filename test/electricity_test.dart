import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/data.dart';
import 'package:chosech/data/plans_electricity.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/savings_summary.dart';

/// Tests for the חשמל (electricity) category: that the seed data is present and
/// internally consistent, that the category is wired into the catalogue (the
/// categories list, plansByCat, planById, allProviders, filteredPlans), and —
/// the service gap that matters most — that electricity suppliers never leak
/// into a telecom provider's plan list (plansByProvider matches loosely) and
/// that the category's currentBill defaults to 0 so its indicative monthly
/// figures are never treated as a head-to-head saving.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // The telecom provider names electricity must never collide with.
  // (Derived above from lib/data/plans_*.dart; kept explicit so the leak test
  // is precise rather than self-referential.)
  const telecomProviders = <String>[
    '019 מובייל', 'CCC', 'HOT', 'NextTV', 'STING TV', 'WeCom', 'Xphone',
    'yes', 'בזק', 'גולן טלקום', 'גילת', 'הוט מובייל', 'וואלה מובייל',
    'סלקום', 'פלאפון', 'פרטנר', 'רמי לוי',
  ];

  // ── seed data integrity ──────────────────────────────────────────────────

  group('electricity seed data', () {
    test('electricityPlans is present and non-empty', () {
      expect(electricityPlans, isNotEmpty);
    });

    test('every electricity plan is in the electricity category', () {
      for (final p in electricityPlans) {
        expect(p.cat, equals('electricity'), reason: '${p.id} is not electricity');
      }
    });

    test('every electricity plan has the el_ id prefix and a unique id', () {
      final ids = electricityPlans.map((p) => p.id).toList();
      for (final p in electricityPlans) {
        expect(p.id, startsWith('el_'), reason: '${p.id} lacks the el_ prefix');
      }
      expect(ids.toSet().length, equals(ids.length),
          reason: 'duplicate electricity plan id(s)');
    });

    test('every electricity plan carries a positive indicative price', () {
      for (final p in electricityPlans) {
        expect(p.price, greaterThan(0),
            reason: '${p.id} needs a positive indicative monthly figure');
      }
    });

    test('every electricity plan rides the mains grid and is no-commitment', () {
      for (final p in electricityPlans) {
        expect(p.net, equals('grid'), reason: '${p.id} should be net=grid');
        expect(p.flags, contains('nocommit'),
            reason: '${p.id} should be flagged no-commitment');
      }
    });

    test('every electricity plan seeds NO fabricated review count', () {
      // Same honesty invariant as the rest of the catalogue: no invented stars.
      for (final p in electricityPlans) {
        expect(p.reviews, equals(0),
            reason: '${p.id} must not seed a fabricated review count');
      }
    });

    test('every electricity plan exposes its real offer in specs (discount)', () {
      // The comparable offer (the % off + window) lives in specs, not in price.
      for (final p in electricityPlans) {
        expect(p.specs.containsKey('הנחה'), isTrue,
            reason: '${p.id} must describe its discount in specs');
      }
    });

    test('electricity plans default to monthly pricing (unit=month)', () {
      // No priceUnit set + cat != abroad ⇒ the per-month default. This is what
      // keeps the indicative figure from being read as a per-package/day rate.
      for (final p in electricityPlans) {
        expect(p.unit, equals('month'), reason: '${p.id} should be monthly');
      }
    });
  });

  // ── category wiring ──────────────────────────────────────────────────────

  group('electricity category wiring', () {
    test('the electricity category exists in the categories list', () {
      final cat = categoryById('electricity');
      expect(cat, isNotNull);
      expect(cat!.name, equals('חשמל'));
    });

    test("the category's currentBill default is 0 (no head-to-head saving)", () {
      // The catalogue comment guarantees this: a non-zero default would make the
      // savings engine treat the indicative figures as a real bill comparison.
      expect(categoryById('electricity')!.currentBill, equals(0));
    });

    test("category planCount matches the actual number of electricity plans", () {
      expect(categoryById('electricity')!.planCount,
          equals(plansByCat('electricity').length));
    });

    test('the category has a distinct line icon (not the fallback)', () {
      expect(categoryIconData('electricity'), equals(Icons.bolt_rounded));
      expect(categoryIconData('electricity'),
          isNot(equals(categoryIconData('definitely_unknown_cat'))));
    });

    test('plansByCat(electricity) returns exactly the electricity plans', () {
      final byCat = plansByCat('electricity');
      expect(byCat, isNotEmpty);
      expect(byCat.map((p) => p.id).toSet(),
          equals(electricityPlans.map((p) => p.id).toSet()));
      expect(byCat.every((p) => p.cat == 'electricity'), isTrue);
    });

    test('every electricity plan is reachable via planById', () {
      for (final p in electricityPlans) {
        final found = planById(p.id);
        expect(found, isNotNull, reason: '${p.id} not found via planById');
        expect(found!.cat, equals('electricity'));
      }
    });

    test('electricity plans are part of allPlans', () {
      final allIds = allPlans.map((p) => p.id).toSet();
      for (final p in electricityPlans) {
        expect(allIds, contains(p.id), reason: '${p.id} missing from allPlans');
      }
    });

    test('electricity suppliers appear in allProviders', () {
      for (final p in electricityPlans) {
        expect(allProviders, contains(p.provider),
            reason: '${p.provider} should be a known provider');
      }
    });

    test('filteredPlans(electricity) returns only electricity plans', () {
      final plans = filteredPlans(
        cat: 'electricity', sort: 'price', filters: [], query: '', budget: 0,
      );
      expect(plans, isNotEmpty);
      expect(plans.every((p) => p.cat == 'electricity'), isTrue);
    });

    test('filteredPlans(electricity, sort:price) is ascending', () {
      final plans = filteredPlans(
        cat: 'electricity', sort: 'price', filters: [], query: '', budget: 0,
      );
      for (var i = 0; i < plans.length - 1; i++) {
        expect(plans[i].priceValue, lessThanOrEqualTo(plans[i + 1].priceValue));
      }
    });
  });

  // ── the service gap: no cross-category provider leak ──────────────────────

  group('plansByProvider does not leak electricity into telecom', () {
    test('every electricity provider name is unique vs telecom names', () {
      for (final p in electricityPlans) {
        expect(telecomProviders, isNot(contains(p.provider)),
            reason: '${p.provider} collides with a telecom provider name');
      }
    });

    test('querying a telecom provider never returns an electricity plan', () {
      // plansByProvider matches loosely (substring both ways), so this guards
      // the real risk: a telecom lookup silently pulling in a חשמל supplier.
      for (final name in telecomProviders) {
        final plans = plansByProvider(name);
        expect(plans.any((p) => p.cat == 'electricity'), isFalse,
            reason: 'telecom query "$name" leaked an electricity plan');
      }
    });

    test('querying an electricity supplier returns only its electricity plans',
        () {
      for (final p in electricityPlans) {
        final plans = plansByProvider(p.provider);
        expect(plans, isNotEmpty);
        expect(plans.every((q) => q.cat == 'electricity'), isTrue,
            reason: 'electricity query "${p.provider}" pulled in non-electricity');
      }
    });

    test('electricity providers do not substring-collide with telecom names',
        () {
      // The defensive invariant the seed comment promises: neither name is a
      // substring of the other, in either direction.
      final elecProviders = electricityPlans.map((p) => p.provider).toSet();
      for (final e in elecProviders) {
        for (final t in telecomProviders) {
          expect(e.contains(t) || t.contains(e), isFalse,
              reason: 'electricity "$e" collides with telecom "$t"');
        }
      }
    });
  });

  // ── savings engine treats electricity as non-comparable by default ────────

  group('electricity savings behaviour', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      AppState.reset();
      await AppState().initializePersistedState();
    });

    test('a fresh AppState reports no electricity bill', () {
      expect(AppState().currentBill('electricity'), equals(0));
    });

    test('computeSavings surfaces no electricity opportunity by default', () {
      // currentBill('electricity') == 0 ⇒ the engine never crowns an indicative
      // figure as a real saving.
      final summary = computeSavings(AppState());
      final elec = summary.categories
          .firstWhere((c) => c.categoryId == 'electricity');
      expect(elec.currentBill, equals(0));
      expect(elec.hasBill, isFalse);
      expect(elec.annualSaving, equals(0));
      expect(elec.hasOpportunity, isFalse);
    });
  });

}
