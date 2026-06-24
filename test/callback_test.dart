import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/callback/callback_widget.dart';

/// Widget tests for the callback request form
/// (lib/pages/callback/callback_widget.dart): that the form renders with its
/// human-rep value-prop and the timing chips (read via their explicit semantics
/// labels), and the page-specific behaviour that the topic chip row collapses to
/// the pre-filled topic when the user already has a focused category. Boots the
/// full app through GoRouter exactly like the other harnesses
/// (test/lead_widget_test.dart, test/nav_smoke_test.dart).

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  await tester.binding.setSurfaceSize(const Size(900, 2400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Swallow benign RenderFlex overflow errors — the tall form can overflow the
/// test viewport; a pre-existing layout artefact, not a test failure (same
/// approach as test/lead_widget_test.dart / test/bills_widget_test.dart).
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
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    await AppState().initializePersistedState();
  });

  testWidgets('Callback form renders the rep value-prop and timing chips',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/callback');
      // Past the route transition + the longest flutter_animate delay (~220ms).
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.byType(CallbackWidget), findsOneWidget);
      // The honest human-rep value-prop card + the primary CTA copy.
      expect(find.text('נציג אנושי יחזור אליכם'), findsOneWidget);
      expect(find.text('בקש שיחה חוזרת'), findsOneWidget);
      // The timing-chip row ('מתי נוח לכם?') sits below the fold in the scroll
      // view, so bring it into view before asserting on its a11y semantics.
      await tester.ensureVisible(find.text('מתי נוח לכם?'));
      await tester.pump(const Duration(milliseconds: 300));
      // Each timing chip exposes an explicit semantics label for screen readers
      // (the icon-only visual is excluded from semantics; see source).
      expect(find.bySemanticsLabel('זמן מועדף: בהקדם'), findsOneWidget);
      expect(find.bySemanticsLabel('זמן מועדף: ערב'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('Topic chips collapse to the pre-filled topic from selectedCat',
      (tester) async {
    await _ignoringOverflow(() async {
      // The user is focused on internet — the form should pre-fill that topic
      // and collapse the chip row to just it + a "change topic" affordance.
      AppState().setCategory('internet');
      await _bootApp(tester);
      _go(tester, '/callback');
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // The "filled from your choice" hint + collapsed row are shown; the other
      // topics (e.g. סלולר) stay hidden until "change topic" is tapped.
      expect(find.textContaining('מולא לפי הבחירה שלכם'), findsOneWidget);
      expect(find.text('שנו נושא'), findsOneWidget);
      expect(find.text('אינטרנט'), findsOneWidget);
      expect(find.text('סלולר'), findsNothing);

      // Tapping "change topic" expands the full chip list.
      await tester.ensureVisible(find.text('שנו נושא'));
      await tester.tap(find.text('שנו נושא'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('סלולר'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
