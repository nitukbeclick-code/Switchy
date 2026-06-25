import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/negotiation_script.dart';

void main() {
  group('buildNegotiationScript', () {
    test('cellular has a real market benchmark and leverage', () {
      final script = buildNegotiationScript('cellular');
      expect(script.hasLeverage, isTrue);
      expect(script.marketBest, isNotNull);
      // The benchmark is the cheapest REAL regular cellular plan in the catalogue.
      final cheapestRegular = plansByCat('cellular').where((p) => p.isRegular).toList()
        ..sort((a, b) => a.priceValue.compareTo(b.priceValue));
      expect(script.marketBest!.id, cheapestRegular.first.id);
    });

    test('the talking points are grounded in the real benchmark plan', () {
      final script = buildNegotiationScript('cellular');
      final best = script.marketBest!;
      // The script quotes the actual provider + plan + price (no fabrication).
      final joined = script.talkingPoints.join(' ');
      expect(joined, contains(best.provider));
      expect(joined, contains(best.plan));
      expect(joined, contains('₪${best.priceText}'));
    });

    test('passing the user provider adds their own-cheapest leverage line', () {
      final script = buildNegotiationScript('cellular', provider: 'סלקום');
      expect(script.provider, 'סלקום');
      // Cellcom has real cellular plans, so the same-provider best is grounded.
      expect(script.sameProviderBest, isNotNull);
      expect(script.sameProviderBest!.provider, contains('סלקום'));
      // ...and that line appears in the script.
      expect(script.talkingPoints.first, contains('סלקום'));
    });

    test('the disclaimer is a starting-point, not a promise', () {
      expect(NegotiationScript.disclaimer, contains('לא הבטחה'));
    });

    test('every talking point is non-empty', () {
      final script = buildNegotiationScript('internet');
      expect(script.talkingPoints, isNotEmpty);
      expect(script.talkingPoints.every((t) => t.trim().isNotEmpty), isTrue);
    });

    test('an unknown category yields no leverage and an empty script', () {
      final script = buildNegotiationScript('does-not-exist');
      expect(script.hasLeverage, isFalse);
      expect(script.marketBest, isNull);
      expect(script.talkingPoints, isEmpty);
    });

    test('an unknown provider still gives the market benchmark (no own-line)', () {
      final script =
          buildNegotiationScript('cellular', provider: 'ספק-שלא-קיים-12345');
      expect(script.hasLeverage, isTrue);
      expect(script.sameProviderBest, isNull);
    });
  });
}
