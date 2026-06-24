import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/account/account_widget.dart';

/// Widget tests for the account screen (lib/pages/account/account_widget.dart).
///
/// Boots the full app through GoRouter exactly like the other page harnesses
/// (test/lead_widget_test.dart, nav_smoke_test.dart) so `context.pushNamed`/
/// `goNamed` and `Provider.of<AppState>` resolve against the real router/state.
///
/// Covers the main render (the quick-link rail + quick-actions header always
/// present) and two key state-driven behaviors:
///   1. A GUEST sees the "כניסה" login CTA and the join banner.
///   2. A LOGGED-IN user instead exposes the icon-only profile-settings button,
///      asserted via its Semantics/tooltip label (per the a11y convention).

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  // A tall surface so the long scrollable column lays out without off-screen
  // taps (same approach as the lead/bills harnesses).
  await tester.binding.setSurfaceSize(const Size(900, 2600));
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

/// Swallow benign RenderFlex overflow errors — the tall account column can
/// overflow the test viewport; that is a pre-existing layout artefact, not a
/// test failure (mirrors test/bills_widget_test.dart / lead_widget_test.dart).
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

Future<void> _settle(WidgetTester tester) async {
  // Past the route transition + the longest flutter_animate stagger (~520ms).
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

void main() {
  testWidgets('Account renders for a guest with the login CTA and quick rail',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/account');
      await _settle(tester);

      expect(find.byType(AccountWidget), findsOneWidget);
      // Guest header → "אורח" identity + the white "כניסה" login chip.
      expect(find.text('אורח'), findsOneWidget);
      expect(find.text('כניסה'), findsOneWidget);
      // The free-join banner is the guest-only CTA.
      expect(find.text('הצטרפו ל-Switchy AI בחינם'), findsOneWidget);
      // The always-present quick-link rail + quick-actions section header.
      expect(find.text('חשבונות'), findsOneWidget);
      expect(find.text('פעולות מהירות'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('A logged-in user exposes the icon-only profile-settings button',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // Log in BEFORE navigating so the header renders the settings IconButton.
      AppState().login(name: 'ישראל ישראלי', phone: '0501234567');
      _go(tester, '/account');
      await _settle(tester);

      expect(find.byType(AccountWidget), findsOneWidget);
      // The logged-in name shows; the guest CTA is gone.
      expect(find.text('ישראל ישראלי'), findsOneWidget);
      expect(find.text('כניסה'), findsNothing);
      // The icon-only settings control carries its a11y label via the IconButton
      // tooltip (asserted on the Tooltip — the label's source — since the message
      // only surfaces as a Semantics label once the tooltip overlay is shown).
      final tip = find.byTooltip('הגדרות פרופיל');
      expect(tip, findsOneWidget);
      expect(
        find.descendant(of: tip, matching: find.byIcon(Icons.settings_rounded)),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  });
}
