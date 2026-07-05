import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/main.dart';

/// Tests for the Sentry per-session quota guard — the pure decision function
/// [sentryEventShouldDrop] that keeps a per-frame overflow storm from burning
/// the 5,000-events/month free-tier cap once the app DSN is armed.
///
/// The rule: the first N events sharing a COARSE fingerprint (exception type +
/// first message line) still report (so the bug is seen); everything past N in
/// the same session is dropped. Distinct fingerprints are tracked
/// independently, so one flooding bug never suppresses a different real crash.
void main() {
  const cap = 5;

  test('same fingerprint reports the first N, then drops the flood', () {
    final seen = <String, int>{};
    const fp = 'RenderFlex|A RenderFlex overflowed by 13 pixels';

    // The first N calls must all be KEPT (not dropped) — the bug still reports.
    for (var i = 0; i < cap; i++) {
      expect(
        sentryEventShouldDrop(fp, seen, cap: cap),
        isFalse,
        reason: 'event #${i + 1} of the cap must still report',
      );
    }

    // Everything beyond the cap in the same session is dropped.
    expect(sentryEventShouldDrop(fp, seen, cap: cap), isTrue);
    expect(sentryEventShouldDrop(fp, seen, cap: cap), isTrue);
    expect(sentryEventShouldDrop(fp, seen, cap: cap), isTrue);
  });

  test('distinct fingerprints each get their own budget', () {
    final seen = <String, int>{};
    const a = 'RenderFlex|A RenderFlex overflowed by 13 pixels';
    const b = 'StateError|Bad state: no element';

    // Exhaust fingerprint A's whole budget.
    for (var i = 0; i < cap; i++) {
      expect(sentryEventShouldDrop(a, seen, cap: cap), isFalse);
    }
    expect(sentryEventShouldDrop(a, seen, cap: cap), isTrue);

    // A being flooded must NOT suppress a different, unrelated crash: B still
    // reports for its own first N.
    for (var i = 0; i < cap; i++) {
      expect(
        sentryEventShouldDrop(b, seen, cap: cap),
        isFalse,
        reason: 'a different fingerprint keeps its full budget',
      );
    }
    expect(sentryEventShouldDrop(b, seen, cap: cap), isTrue);
  });

  test('default cap is a small positive number (real bugs still surface)', () {
    final seen = <String, int>{};
    const fp = 'FlutterError|constraints are not normalized';

    // Using the production default (no explicit cap): the first call always
    // reports, and a large burst is eventually dropped — proving the guard is
    // armed with a small finite budget, not an accidental 0 (drop-everything)
    // or unbounded (never-drop) value.
    expect(sentryEventShouldDrop(fp, seen), isFalse);
    var dropped = false;
    for (var i = 0; i < 1000; i++) {
      if (sentryEventShouldDrop(fp, seen)) {
        dropped = true;
        break;
      }
    }
    expect(dropped, isTrue, reason: 'a per-frame storm must eventually be capped');
  });
}
