import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/referral_code.dart';

void main() {
  group('ReferralCode.make', () {
    test('has the canonical SW-XXXXXX shape', () {
      final code = ReferralCode.make();
      expect(RegExp(r'^SW-[A-Z2-9]{6}$').hasMatch(code), isTrue);
      expect(ReferralCode.isValid(code), isTrue);
    });

    test('only uses the unambiguous alphabet (no 0/O/1/I/L)', () {
      for (var i = 0; i < 200; i++) {
        final body = ReferralCode.make().split('-')[1];
        for (final ch in body.split('')) {
          expect(ReferralCode.alphabet.contains(ch), isTrue,
              reason: 'unexpected char "$ch" in $body');
        }
      }
    });

    test('a seeded RNG is deterministic (test seam)', () {
      final a = ReferralCode.make(Random(42));
      final b = ReferralCode.make(Random(42));
      expect(a, b);
      expect(ReferralCode.isValid(a), isTrue);
    });
  });

  group('ReferralCode.normalize / isValid', () {
    test('normalize trims, uppercases and strips whitespace', () {
      expect(ReferralCode.normalize('  sw-7kq4m9 '), 'SW-7KQ4M9');
      expect(ReferralCode.normalize('SW 7K Q4 M9'), 'SW7KQ4M9');
    });

    test('rejects malformed codes', () {
      expect(ReferralCode.isValid('SW-7KQ4M'), isFalse); // too short
      expect(ReferralCode.isValid('SW-7KQ4M90'), isFalse); // too long
      expect(ReferralCode.isValid('XX-7KQ4M9'), isFalse); // wrong prefix
      expect(ReferralCode.isValid('SW-7KQ4M0'), isFalse); // 0 not in alphabet
      expect(ReferralCode.isValid(''), isFalse);
    });

    test('accepts a lowercase / spaced code after normalization', () {
      expect(ReferralCode.isValid(' sw-7kq4m9 '), isTrue);
    });
  });
}
