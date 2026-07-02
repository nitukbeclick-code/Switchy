import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart' show Plan;
import 'package:chosech/services/savings_summary.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  test('with no bills there is no potential and no opportunity', () {
    final s = AppState();
    s.resetAllBills();
    final summary = computeSavings(s);
    expect(summary.hasAnyBill, isFalse);
    expect(summary.totalAnnualPotential, 0);
    expect(summary.topOpportunity, isNull);
    expect(summary.categories.every((c) => c.best == null), isTrue);
  });

  test('covers every catalogue category', () {
    final s = AppState();
    final summary = computeSavings(s);
    expect(summary.categories.map((c) => c.categoryId).toSet(),
        equals(categories.map((c) => c.id).toSet()));
  });

  test('a high bill yields a positive per-category opportunity', () {
    final s = AppState();
    s.resetAllBills();
    s.setCurrentBill('cellular', 220);
    final summary = computeSavings(s);
    final cell = summary.categories.firstWhere((c) => c.categoryId == 'cellular');
    expect(cell.hasBill, isTrue);
    expect(cell.best, isNotNull);
    expect(cell.annualSaving, greaterThan(0));
    expect(cell.hasOpportunity, isTrue);
  });

  test('total equals the sum of category savings and top is the max', () {
    final s = AppState();
    s.resetAllBills();
    s.setCurrentBill('cellular', 200);
    s.setCurrentBill('internet', 230);
    final summary = computeSavings(s);

    final sum = summary.categories.fold<int>(0, (a, c) => a + c.annualSaving);
    expect(summary.totalAnnualPotential, equals(sum));

    final top = summary.topOpportunity;
    expect(top, isNotNull);
    for (final c in summary.categories) {
      expect(top!.annualSaving, greaterThanOrEqualTo(c.annualSaving));
    }
  });

  group('multi-plan savings totals', () {
    test('bills across three categories sum into the total, each independent', () {
      final s = AppState();
      s.resetAllBills();
      s.setCurrentBill('cellular', 220);
      s.setCurrentBill('internet', 240);
      s.setCurrentBill('tv', 180);
      final summary = computeSavings(s);

      // Exactly the three billed categories carry an opportunity.
      final billed = summary.categories.where((c) => c.hasBill).toList();
      expect(billed.map((c) => c.categoryId).toSet(),
          {'cellular', 'internet', 'tv'});
      for (final c in billed) {
        expect(c.best, isNotNull);
        // Each category's saving is measured against ITS OWN bill, never a global.
        expect(c.annualSaving, equals(c.best!.annualSaving));
        expect(c.currentBill, equals(s.currentBill(c.categoryId)));
      }
      // The total is the exact sum of the per-category savings.
      final manual = summary.categories.fold<int>(0, (a, c) => a + c.annualSaving);
      expect(summary.totalAnnualPotential, equals(manual));
      expect(summary.totalAnnualPotential, greaterThan(0));
    });

    test('opportunities are positive-only and sorted largest-saving first', () {
      final s = AppState();
      s.resetAllBills();
      s.setCurrentBill('cellular', 220);
      s.setCurrentBill('internet', 240);
      s.setCurrentBill('tv', 180);
      final summary = computeSavings(s);

      final opps = summary.opportunities;
      // Every listed opportunity is a real, positive saving.
      expect(opps.every((c) => c.annualSaving > 0), isTrue);
      expect(opps.every((c) => c.hasOpportunity), isTrue);
      // Descending by annual saving.
      for (var i = 0; i < opps.length - 1; i++) {
        expect(opps[i].annualSaving, greaterThanOrEqualTo(opps[i + 1].annualSaving));
      }
      // The donut's top slice is the same as topOpportunity.
      if (opps.isNotEmpty) {
        expect(opps.first.categoryId, summary.topOpportunity!.categoryId);
      }
    });

    test('a category whose cheapest plan is not cheaper than the bill yields no opportunity', () {
      final s = AppState();
      s.resetAllBills();
      // A deliberately tiny bill: no real plan beats it, so saving is 0 and the
      // category is billed-but-not-an-opportunity (it must not pollute the total).
      s.setCurrentBill('cellular', 1);
      final summary = computeSavings(s);
      final cell = summary.categories.firstWhere((c) => c.categoryId == 'cellular');
      expect(cell.hasBill, isTrue);
      expect(cell.annualSaving, 0);
      expect(cell.hasOpportunity, isFalse);
      expect(summary.opportunities.any((c) => c.categoryId == 'cellular'), isFalse);
    });
  });

  group('personalized totals (TRUTH-ONLY)', () {
    test('only the personally-entered category counts, never seed defaults', () {
      final s = AppState();
      // Fresh state carries seed defaults (cellular 119, internet 140, tv 130,
      // triple 260) — none personalized. The user enters ONLY cellular.
      s.setCurrentBill('cellular', 220);
      final summary = computeSavings(s);

      final cell = summary.categories.firstWhere((c) => c.categoryId == 'cellular');
      expect(cell.personalized, isTrue);
      for (final c in summary.categories.where((c) => c.categoryId != 'cellular')) {
        expect(c.personalized, isFalse,
            reason: 'seed-default ${c.categoryId} must not be personalized');
      }

      // 220 exactly — NOT 220+140+130+260: seed bills contribute nothing.
      expect(summary.personalizedMonthlyTotal, equals(220));

      // Annual potential counts only cellular's real saving.
      expect(summary.personalizedAnnualPotential, equals(cell.annualSaving));
      expect(summary.personalizedAnnualPotential, greaterThan(0));

      // The all-categories total (which still includes seed-default bills) can
      // never be below the personalized-only figure.
      expect(summary.totalAnnualPotential,
          greaterThanOrEqualTo(summary.personalizedAnnualPotential));
    });

    test('guest with no personalized bills has zero personalized figures', () {
      final s = AppState();
      final summary = computeSavings(s);
      expect(summary.categories.any((c) => c.personalized), isFalse);
      expect(summary.personalizedMonthlyTotal, 0);
      expect(summary.personalizedAnnualPotential, 0);
    });

    test('CategorySaving.personalized defaults to false', () {
      const c = CategorySaving(categoryId: 'cellular', currentBill: 100, best: null);
      expect(c.personalized, isFalse);
    });
  });

  group('savingsCreditedOnLead', () {
    test('credits the real computed saving when it is positive', () {
      const plan = Plan(
        id: 'syn-cheap',
        cat: 'cellular',
        provider: 'בדיקה',
        net: '4G',
        plan: 'מסלול זול',
        price: 39,
      );
      // (120 - 39) * 12 = 972 > 0 → the real figure is credited.
      expect(savingsCreditedOnLead(plan, 120), planSaveYear(plan, 120));
      expect(savingsCreditedOnLead(plan, 120), greaterThan(0));
    });

    test('falls back to the modest default when there is no positive saving', () {
      const plan = Plan(
        id: 'syn-dear',
        cat: 'cellular',
        provider: 'בדיקה',
        net: '4G',
        plan: 'מסלול יקר',
        price: 199,
      );
      // No bill, or a plan pricier than the bill → fall back, never 0/negative.
      expect(savingsCreditedOnLead(plan, 0), kDefaultLeadSavingFallback);
      expect(savingsCreditedOnLead(plan, 100), kDefaultLeadSavingFallback);
      // A null plan also falls back.
      expect(savingsCreditedOnLead(null, 100), kDefaultLeadSavingFallback);
    });
  });
}
