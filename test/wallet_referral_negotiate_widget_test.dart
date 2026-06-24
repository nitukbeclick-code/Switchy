import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the F1–F3 surfaces:
///   • /wallet     — realized savings hero + gated social proof
///   • /referral   — share-the-tool code (no fabricated reward)
///   • /negotiate  — grounded retention script
/// The pure layers (computeWallet / buildNegotiationScript / ReferralCode) are
/// covered in their own unit tests; this boots the full app and deep-links to
/// each route to assert the rendering + honesty microcopy actually paints.

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(seconds: 2));
}

Future<void> _ignoringOverflow(Future<void> Function() body) async {
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    final s = details.exceptionAsString();
    if (s.contains('overflowed') || s.contains('RenderFlex')) return;
    originalOnError?.call(details);
  };
  try {
    await body();
  } finally {
    FlutterError.onError = originalOnError;
  }
}

void main() {
  testWidgets('wallet renders the realized hero and the neutral (un-published) proof',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      AppState().addSavings(1200);

      _go(tester, '/wallet');
      await _settle(tester);

      expect(find.text('ארנק התקשורת'), findsWidgets);
      // Realized figure painted (₪1200) + the "already saved" framing.
      expect(find.text('כבר חסכת'), findsOneWidget);
      expect(find.textContaining('₪1200'), findsWidgets);
      // Below threshold → neutral, claim-free fallback (never a fabricated avg).
      expect(find.textContaining('כשאין עדיין מספיק נתונים'), findsOneWidget);
      // The honesty footnote: estimate, not a promise.
      expect(find.textContaining('הערכה, לא הבטחה'), findsOneWidget);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('wallet empty state when nothing was saved yet', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/wallet');
      await _settle(tester);

      expect(find.text('עוד לא חסכת דרכנו'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('referral renders a valid SW-code + value framing (no cash reward)',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/referral');
      await _settle(tester);

      expect(find.text('עזרו לחבר לחסוך'), findsOneWidget);
      expect(find.text('שתפו את הקוד'), findsOneWidget);
      // A well-formed SW-XXXXXX code is painted.
      final codeFinder = find.textContaining(RegExp(r'SW-[A-Z2-9]{6}'));
      expect(codeFinder, findsWidgets);
      // §30A honesty: explicitly NO promised payment for sharing. It sits at the
      // bottom of the lazy ListView, so scroll it into view first.
      await tester.scrollUntilVisible(
        find.textContaining('לא מבטיחים תשלום'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pump();
      expect(find.textContaining('לא מבטיחים תשלום'), findsOneWidget);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('negotiate renders a grounded script with the benchmark + disclaimer',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/negotiate?category=cellular');
      await _settle(tester);

      expect(find.text('תסריט מיקוח'), findsWidgets);
      expect(find.text('המחיר שמולו מתמקחים'), findsOneWidget);
      expect(find.text('מה אומרים בשיחה'), findsOneWidget);
      // Honest disclaimer + copy CTA sit lower in the lazy ListView — scroll to
      // bring the disclaimer into view before asserting.
      await tester.scrollUntilVisible(
        find.textContaining('לא הבטחה'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pump();
      expect(find.textContaining('לא הבטחה'), findsOneWidget);
      expect(find.text('העתק את התסריט'), findsWidgets);

      expect(tester.takeException(), isNull);
    });
  });
}
