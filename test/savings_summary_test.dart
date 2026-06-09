import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
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
}
