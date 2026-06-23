import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the Wave-3 Renewal-Report screen
/// (lib/pages/renewal_report/renewal_report_widget.dart).
///
/// The pure-service layer behind this page (RenewalReport.alternatives /
/// bestSaver) is already covered in test/renewal_report_test.dart. This file
/// adds the rendering layer: it boots the full app and deep-links to
/// /renewal-report/:trackedId via GoRouter, asserting the best-saver banner,
/// the green "צפה במסלול החוסך" CTA, and the comparison rows actually paint.

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

/// Drain flutter_animate's one-shot "restart" timer (scheduled in
/// _AnimateState.initState for the banner + staggered rows) so the test doesn't
/// trip the binding's "A Timer is still pending after dispose" invariant. The
/// entrance animations are finite, so a generous fixed pump fully settles them.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(seconds: 2));
}

String _isoInDays(int days) {
  final d = DateTime.now().add(Duration(days: days));
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

/// Seed a tracked plan and return its generated id (addMyPlan stamps the id
/// from millisecondsSinceEpoch, so we read it back rather than guess).
String _seedTracked(
    {required String cat, required int price, String? promo}) {
  final s = AppState();
  s.addMyPlan(
    category: cat,
    provider: 'סלקום',
    planName: 'המסלול שלי',
    monthlyPrice: price,
    promoEndDate: promo,
  );
  return s.myPlans.first.id;
}

void main() {
  testWidgets(
      'best-saver banner, the green CTA and comparison rows render for an expensive tracked plan',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // A high current price (₪200) guarantees a positive-saving alternative
      // exists, so the saver banner — not the "no saver" note — is shown.
      final id = _seedTracked(cat: 'cellular', price: 200, promo: _isoInDays(14));

      _go(tester, '/renewal-report/$id');
      await _settle(tester);

      // Hero chrome + the current plan.
      expect(find.text('טבלת השוואה מלאה'), findsOneWidget);
      expect(find.text('המסלול שלך היום'), findsOneWidget);
      expect(find.textContaining('המבצע מסתיים בעוד'), findsOneWidget);

      // Headline best-saver banner (amber VALUE) — a yearly-saving headline.
      expect(find.textContaining('אפשר לחסוך'), findsOneWidget);
      expect(find.textContaining('בשנה'), findsWidgets);

      // The explicit green ACTION CTA.
      expect(find.text('צפה במסלול החוסך'), findsOneWidget);

      // The comparison table: a header, the count, and the top "הבחירה שלנו" row.
      expect(find.text('כל המסלולים — מהמשתלם ביותר'), findsOneWidget);
      expect(find.textContaining('מסלולים'), findsWidgets);
      expect(find.text('הבחירה שלנו'), findsOneWidget);
      // Per-row match-score chips.
      expect(find.textContaining('% התאמה'), findsWidgets);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('shows the "no saver" note when the tracked price is already rock-bottom',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Cheaper than any real cellular plan → nothing can beat it → no banner.
      final id = _seedTracked(cat: 'cellular', price: 1);

      _go(tester, '/renewal-report/$id');
      await _settle(tester);

      // The reassuring note replaces the saver banner + its CTA.
      expect(find.textContaining('עדיין מהתחרותיים בשוק'), findsOneWidget);
      expect(find.text('צפה במסלול החוסך'), findsNothing);
      // The full comparison table still renders below it.
      expect(find.text('כל המסלולים — מהמשתלם ביותר'), findsOneWidget);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('unknown tracked id renders the not-found fallback',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/renewal-report/does-not-exist');
      await _settle(tester);

      expect(find.text('המסלול לא נמצא'), findsOneWidget);
      expect(find.text('צפה במסלול החוסך'), findsNothing);
      // The not-found state must never dead-end — it offers a way back to the
      // renewal radar.
      expect(find.text('חזרה למעקב חידושים'), findsOneWidget);

      expect(tester.takeException(), isNull);
    });
  });
}
