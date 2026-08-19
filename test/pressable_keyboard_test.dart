// ─────────────────────────────────────────────────────────────────────────────
// Pressable is the app's most-used tap primitive (34 files). It used to be a
// bare GestureDetector: not focusable, not activatable by Enter/Space, and it
// painted no focus ring — so every card, chip and row built on it was unusable
// for keyboard and switch-access users on the web target, which is a release
// gate. These tests pin the keyboard contract so it cannot silently regress.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:chosech/widgets/pressable.dart';

/// The app's real shell. AppTheme.of() reads the ambient Theme brightness, so a
/// plain MaterialApp is all the widget needs; the app is RTL everywhere.
Widget _host(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: child)),
      ),
    );

void main() {
  testWidgets('a tappable Pressable takes keyboard focus', (tester) async {
    await tester.pumpWidget(_host(
      Pressable(onTap: () {}, child: const Text('שורה')),
    ));

    final node = Focus.maybeOf(
      tester.element(find.text('שורה')),
      scopeOk: true,
    );
    expect(node, isNotNull, reason: 'Pressable must contribute a focus node');

    // Tab must land on it — the plain WCAG 2.1.1 requirement.
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.hasPrimaryFocus,
      isTrue,
      reason: 'Tab must reach a Pressable that has an onTap',
    );
  });

  testWidgets('Enter and Space fire onTap, exactly like a tap', (tester) async {
    var taps = 0;
    await tester.pumpWidget(_host(
      Pressable(onTap: () => taps++, child: const Text('שורה')),
    ));

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();

    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(taps, 1, reason: 'Enter must activate a focused Pressable');

    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pumpAndSettle();
    expect(taps, 2, reason: 'Space must activate a focused Pressable');

    // ...and the pointer path still works unchanged.
    await tester.tap(find.text('שורה'));
    await tester.pumpAndSettle();
    expect(taps, 3);
  });

  testWidgets('a Pressable with no handler stays out of the tab order',
      (tester) async {
    // A focus stop that does nothing is worse than no focus stop: a keyboard
    // user tabs into it, presses Enter, and nothing happens.
    await tester.pumpWidget(_host(
      const Pressable(child: Text('לא לחיץ')),
    ));

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();

    expect(
      FocusManager.instance.primaryFocus?.context?.widget,
      isNot(isA<FocusableActionDetector>()),
      reason: 'a handler-less Pressable must not become a focus stop',
    );
  });

  testWidgets('long-press-only Pressables are still reachable',
      (tester) async {
    // onLongPress alone counts as tappable for the scale feedback, so it must
    // count for focus too — otherwise the widget animates but cannot be reached.
    await tester.pumpWidget(_host(
      Pressable(onLongPress: () {}, child: const Text('לחיצה ארוכה')),
    ));

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();
    expect(FocusManager.instance.primaryFocus?.hasPrimaryFocus, isTrue);
  });
}
