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

  test('savingsCreditedOnLead with a null plan falls back to the default credit',
      () {
    // No plan (e.g. no real bill captured yet) → the modest generic estimate,
    // regardless of the bill passed in.
    expect(savingsCreditedOnLead(null, 0), equals(kDefaultLeadSavingFallback));
    expect(savingsCreditedOnLead(null, 200), equals(kDefaultLeadSavingFallback));

    // A real plan whose computed yearly saving is positive uses planSaveYear,
    // not the fallback.
    const plan = Plan(
      id: 'test_cell',
      cat: 'cellular',
      provider: 'בדיקה',
      net: 'test',
      plan: 'מסלול בדיקה',
      price: 50,
    );
    final credited = savingsCreditedOnLead(plan, 120);
    expect(credited, equals(planSaveYear(plan, 120)));
    expect(credited, equals((120 - 50) * 12));
    expect(credited, greaterThan(kDefaultLeadSavingFallback));
  });

  test('zero-saving categories mixed with positive ones stay non-negative', () {
    final s = AppState();
    s.resetAllBills();
    // A high bill yields a positive opportunity; an unusually low bill yields a
    // zero (never negative) opportunity for that category.
    s.setCurrentBill('cellular', 220);
    s.setCurrentBill('internet', 1);
    final summary = computeSavings(s);

    final internet =
        summary.categories.firstWhere((c) => c.categoryId == 'internet');
    expect(internet.hasBill, isTrue);
    expect(internet.annualSaving, equals(0));
    expect(internet.hasOpportunity, isFalse);

    // No category can ever contribute a negative saving.
    for (final c in summary.categories) {
      expect(c.annualSaving, greaterThanOrEqualTo(0));
    }

    // The total is exactly the sum of the per-category savings (zeros included).
    final sum = summary.categories.fold<int>(0, (a, c) => a + c.annualSaving);
    expect(summary.totalAnnualPotential, equals(sum));
    expect(summary.totalAnnualPotential, greaterThan(0));
  });

  test('opportunities are ordered largest saving first', () {
    final s = AppState();
    s.resetAllBills();
    s.setCurrentBill('cellular', 220);
    s.setCurrentBill('internet', 230);
    s.setCurrentBill('tv', 180);
    final summary = computeSavings(s);

    final opps = summary.opportunities;
    // Only real, positive opportunities are listed, and the zero-bill
    // categories never appear.
    expect(opps, isNotEmpty);
    expect(opps.every((c) => c.hasOpportunity), isTrue);

    // Descending by annual saving.
    for (var i = 0; i + 1 < opps.length; i++) {
      expect(opps[i].annualSaving,
          greaterThanOrEqualTo(opps[i + 1].annualSaving));
    }
    // The head of the list matches the single top opportunity.
    expect(opps.first.categoryId, equals(summary.topOpportunity!.categoryId));
  });
}
