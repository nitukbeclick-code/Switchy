import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/session_actions.dart';
import 'package:chosech/widgets/app_button.dart';
import 'package:chosech/pages/onboarding/onboarding_widget.dart';

/// Tests for the shared session actions (lib/services/session_actions.dart)
/// and the Profile logout root-cause fix.
///
/// No Supabase is initialized here, so [signOutCompletely] must ride the
/// fail-soft AuthService contract (same as test/auth_service_test.dart): the
/// network sign-out degrades to a no-op and the LOCAL effect — AppState's
/// identity mirror flipping to logged-out — must still land.
///
/// The widget test boots the full app through GoRouter exactly like
/// test/availability_test.dart, drives the Profile logout confirm sheet, and
/// pins the fixed behaviour: confirm → signed out + landed on Onboarding.

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

/// Navigate via GoRouter using the root Navigator element.
void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Run [body] while swallowing benign RenderFlex overflow FlutterErrors — the
/// profile column is tall and can overflow the fixed test viewport; that is a
/// pre-existing layout artefact, not a test failure (same approach as
/// test/availability_test.dart and test/profile_test.dart).
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
  TestWidgetsFlutterBinding.ensureInitialized();

  group('signOutCompletely (no Supabase — fail-soft path)', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      AppState.reset();
      await AppState().initializePersistedState();
    });

    test('flips AppState.isLoggedIn to false and clears the identity mirror',
        () async {
      final s = AppState();
      s.login(name: 'דנה', phone: '0521234567', email: 'a@b.com');
      expect(s.isLoggedIn, isTrue);

      // AuthService.signOut() has no Supabase to talk to here — it must
      // degrade to a no-op (never throw) and the local logout must still land.
      await signOutCompletely(s);

      expect(s.isLoggedIn, isFalse);
      expect(s.userName, isEmpty);
      expect(s.userPhone, isEmpty);
      expect(s.userEmail, isEmpty);
    });

    test('is safe to call when already logged out', () async {
      final s = AppState();
      expect(s.isLoggedIn, isFalse);
      await signOutCompletely(s);
      expect(s.isLoggedIn, isFalse);
    });
  });

  testWidgets('Profile logout sheet confirm signs out and lands on Onboarding',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // A logged-in identity mirror so the Profile renders its logout button.
      AppState().login(name: 'ישראל ישראלי', phone: '0521234567');

      _go(tester, '/profile');
      // Drain the profile's one-shot flutter_animate entrance timers (same
      // settle budget as test/profile_test.dart).
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(seconds: 2));

      // Open the confirm sheet by invoking the button's handler directly —
      // the shell's glass bottom nav can swallow hit-tests over modals in the
      // 800x600 test viewport (harness artefact documented in
      // test/profile_test.dart), so tapping pixels would test the harness,
      // not the flow. The real _confirmLogout still runs end-to-end.
      final logoutBtn =
          tester.widget<AppButton>(find.widgetWithText(AppButton, 'התנתקות'));
      unawaited(logoutBtn.onPressed());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600)); // sheet entrance
      expect(find.text('האם להתנתק מהחשבון?'), findsOneWidget);

      // Confirm — pops the sheet with `true`, which awaits the full sign-out
      // (fail-soft without Supabase) and then routes to Onboarding.
      final confirmBtn =
          tester.widget<AppButton>(find.widgetWithText(AppButton, 'התנתק'));
      unawaited(confirmBtn.onPressed());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600)); // sheet exit + signOut
      await tester.pump(const Duration(milliseconds: 400)); // route transition
      // Onboarding's own one-shot entrance effects (same budget as
      // test/onboarding_test.dart's boot settle).
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 1200));

      expect(AppState().isLoggedIn, isFalse);
      expect(find.byType(OnboardingWidget), findsOneWidget);

      tester.takeException();
    });
  });
}
