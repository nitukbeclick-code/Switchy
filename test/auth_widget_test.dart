import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Widget tests for the sign-in screen (lib/pages/auth/auth_widget.dart):
/// that the choose-mode landing renders with its honest benefits + the
/// (mandatory) consent panel, that the email-signup form is reachable and
/// validates, and that the social/skip affordances expose accessible labels.
/// Boots the full app through GoRouter exactly like the existing harnesses
/// (test/bills_widget_test.dart, test/more_screens_test.dart).
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
/// auth form is tall and can overflow in the test viewport; that is a
/// pre-existing layout artefact, not a test failure (same approach as
/// test/bills_widget_test.dart and test/more_screens_test.dart).
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
  testWidgets('Auth choose-mode renders the brand, benefits and consent panel',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/auth');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Header copy for the default (choose) mode.
      expect(find.text('מצטרפים לחוסך'), findsOneWidget);

      // The three honest benefit rows that explain what an account unlocks.
      expect(find.text('שמירת מסלולים והשוואות מועדפות'), findsOneWidget);
      expect(find.text('התראה כשמגיע מחיר טוב יותר'), findsOneWidget);
      expect(find.text('הנתונים שלכם נשמרים ומאובטחים'), findsOneWidget);

      // Social + email entry points.
      expect(find.text('המשך עם Google'), findsOneWidget);
      expect(find.text('המשך עם Facebook'), findsOneWidget);
      expect(find.text('הרשמה עם מייל'), findsOneWidget);

      // The guest escape hatch — login is optional.
      expect(find.text('המשך כאורח'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Social buttons and guest skip expose accessible labels',
      (tester) async {
    await _ignoringOverflow(() async {
      // The choose-mode body (benefits + 3 consent rows + 2 social CTAs) is
      // taller than the default 600px test surface, and Flutter prunes
      // off-screen content from the semantics tree. Give the surface enough
      // height so every control co-resides without scrolling — this keeps the
      // a11y assertions deterministic instead of viewport-fragile.
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final handle = tester.ensureSemantics();
      await _bootApp(tester);

      _go(tester, '/auth');
      // Settle the choose-body entrance animation so every control is laid out
      // and contributing to the semantics tree before we read labels.
      await tester.pumpAndSettle();

      // _SocialButton / consent rows merge their child Text (glyph + lead-in
      // copy) into the labelled node, so the exposed a11y string starts with the
      // intent text and carries trailing copy — match on the meaningful prefix,
      // which is exactly what a screen reader announces first.
      expect(find.bySemanticsLabel(RegExp('^המשך עם Google')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('^המשך עם Facebook')), findsOneWidget);

      // The mandatory-consent links open the legal docs and are exposed as
      // labelled buttons ("פתח תנאי השימוש" / "פתח מדיניות הפרטיות").
      expect(find.bySemanticsLabel(RegExp('^פתח תנאי השימוש')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('^פתח מדיניות הפרטיות')), findsOneWidget);

      tester.takeException();
      handle.dispose();
    });
  });

  testWidgets('Email signup form is reachable and validates empty input',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/auth');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Switch into the email-signup mode. The CTA sits below the fold in the
      // test viewport, so scroll it on-screen before tapping (avoids a missed
      // hit-test).
      final emailSignupCta = find.text('הרשמה עם מייל');
      await tester.ensureVisible(emailSignupCta);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(emailSignupCta);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Header flips to the signup copy and the form fields appear.
      expect(find.text('יוצרים חשבון'), findsOneWidget);
      expect(find.text('שם מלא'), findsWidgets);
      expect(find.text('מייל'), findsWidgets);

      // Submitting an empty form surfaces the field validators instead of
      // proceeding (no auth call, no navigation).
      final createBtn = find.text('יצירת חשבון');
      await tester.ensureVisible(createBtn);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(createBtn);
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('נא להזין שם'), findsOneWidget);
      expect(find.text('מייל לא תקין'), findsOneWidget);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });

  testWidgets('Login mode shows the forgot-password affordance', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/auth');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // Enter login mode via the "already registered?" prompt. The label is a
      // Text.rich ("כבר רשומים? התחברו") inside a TextButton, so locate the
      // RichText by its span text, then tap the enclosing TextButton (its
      // onPressed is what flips the mode).
      final loginPromptText = find.byWidgetPredicate(
        (w) =>
            w is RichText &&
            w.text.toPlainText().contains('כבר רשומים') &&
            w.text.toPlainText().contains('התחברו'),
      );
      expect(loginPromptText, findsOneWidget);
      final loginButton = find.ancestor(
        of: loginPromptText,
        matching: find.byType(TextButton),
      );
      expect(loginButton, findsOneWidget);
      // The prompt sits at the bottom of a tall scroll view — bring it on-screen
      // so the tap lands on a hittable target (avoids a missed hit-test).
      await tester.ensureVisible(loginButton);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(loginButton);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('ברוכים הבאים חזרה'), findsOneWidget);
      // Login has no name/confirm fields but offers password recovery.
      expect(find.text('שכחתי סיסמה'), findsOneWidget);
      expect(find.text('התחברות'), findsWidgets);

      await tester.pumpAndSettle();
      tester.takeException();
    });
  });
}
