import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/wallet_summary.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('realized savings', () {
    test('with no realized savings the hero is empty', () {
      final s = AppState();
      final w = computeWallet(s);
      expect(w.realizedSaving, 0);
      expect(w.monthlyEquivalent, 0);
      expect(w.hasRealizedSaving, isFalse);
    });

    test('mirrors AppState.totalSavings and floors the monthly equivalent', () {
      final s = AppState();
      s.addSavings(1200);
      final w = computeWallet(s);
      expect(w.realizedSaving, 1200);
      expect(w.monthlyEquivalent, 100); // 1200 / 12
      expect(w.hasRealizedSaving, isTrue);
    });

    test('monthly equivalent floors (never rounds up an over-claim)', () {
      final s = AppState();
      s.addSavings(1199); // 1199/12 = 99.9 → floor 99
      final w = computeWallet(s);
      expect(w.monthlyEquivalent, 99);
    });
  });

  group('social-proof honesty gate', () {
    test('default (no aggregate supplied) never publishes', () {
      final s = AppState();
      final w = computeWallet(s);
      expect(w.aggregateMembers, 0);
      expect(w.showSocialProof, isFalse);
    });

    test('a sub-threshold sample is NOT published', () {
      final s = AppState();
      final w = computeWallet(s,
          aggregateMembers: kSocialProofMinMembers - 1,
          aggregateTypicalSaving: 800);
      expect(w.showSocialProof, isFalse);
    });

    test('an above-threshold sample with a real figure IS published', () {
      final s = AppState();
      final w = computeWallet(s,
          aggregateMembers: kSocialProofMinMembers + 10,
          aggregateTypicalSaving: 800);
      expect(w.showSocialProof, isTrue);
      expect(w.aggregateMembers, kSocialProofMinMembers + 10);
      expect(w.aggregateTypicalSaving, 800);
    });

    test('above the threshold but with no typical figure does NOT publish', () {
      final s = AppState();
      final w = computeWallet(s,
          aggregateMembers: kSocialProofMinMembers + 10,
          aggregateTypicalSaving: 0);
      expect(w.showSocialProof, isFalse);
    });

    test('negative aggregates are coerced to zero (no garbage proof)', () {
      final s = AppState();
      final w = computeWallet(s,
          aggregateMembers: -5, aggregateTypicalSaving: -100);
      expect(w.aggregateMembers, 0);
      expect(w.aggregateTypicalSaving, 0);
      expect(w.showSocialProof, isFalse);
    });

    test('the app threshold matches the web honesty gate (25)', () {
      expect(kSocialProofMinMembers, 25);
    });
  });
}
