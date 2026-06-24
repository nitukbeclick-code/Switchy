import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Widget tests for the annual recap screen
/// (lib/pages/recap/annual_recap_widget.dart).
///
/// The recap is pure over [AppState] + [computeSavings] (no backend fetch), so
/// these boot the real app and drive the real GoRouter to `/recap` — exercising
/// the actual render path the route serves, not a stubbed harness. Assertions
/// stay on stable, honest copy: the fixed app-bar title, the potential-saving
/// hero label, the at-a-glance stat labels, the icon-only a11y tooltips the file
/// promises (per CLAUDE.md's a11y convention), and the empty-state copy.
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

/// The hero figure counts up via a TweenAnimationBuilder and rows stagger in;
/// pump a couple of generous frames so everything has arrived (but the recap's
/// animations are one-shot, so this still quiesces).
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 800));
  await tester.pump(const Duration(milliseconds: 800));
}

/// Swallow benign RenderFlex overflow errors (pre-existing layout quirks on the
/// narrow test surface), matching test/home_widget_test.dart & a11y_test.dart.
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
  tearDown(() {
    appBackend = LocalBackend();
  });

  testWidgets('renders the recap hero and at-a-glance stats for a guest with bills',
      (tester) async {
    await _ignoringOverflow(() async {
      // A fresh guest carries seed bills, so computeSavings yields a positive
      // potential → the populated recap body renders (not the empty state).
      await _bootApp(tester);
      _go(tester, '/recap');
      await _settle(tester);

      // The fixed app-bar title and the ink hero's potential-saving label.
      expect(find.text('הסיכום השנתי שלי'), findsOneWidget);
      expect(find.text('החיסכון הפוטנציאלי שלך לשנה'), findsOneWidget);

      // The two at-a-glance stat tiles render their fixed labels.
      expect(find.text('מסלולים במעקב'), findsOneWidget);
      expect(find.text('קטגוריות לחיסכון'), findsOneWidget);
    });
  });

  testWidgets('an un-personalized guest sees the figure framed as an estimate',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/recap');
      await _settle(tester);

      // Until bills are personalized the recap explicitly hedges the figure as
      // an estimate — never claims a confirmed personalized saving.
      expect(find.text('הערכה — עדכנו את החשבונות שלכם לחישוב מדויק'),
          findsOneWidget);
      expect(find.text('על בסיס המסלולים שאנחנו ממליצים עבורכם'), findsNothing);
    });
  });

  testWidgets('icon-only controls carry tooltips / a11y labels', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/recap');
      await _settle(tester);

      // The app-bar back button and the share action are icon-only; per the a11y
      // convention each must expose a tooltip (= semantics label). The share
      // action only appears because the guest has something to recap.
      expect(find.byTooltip('חזרה'), findsOneWidget);
      expect(find.byTooltip('שתף את הסיכום'), findsOneWidget);
    });
  });

  testWidgets('with no bills and nothing realized it shows the empty state',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      // Clear the seed bills so there is neither potential nor a realized saving:
      // hasAnything is false and the recap routes to its empty state.
      AppState().resetAllBills();
      _go(tester, '/recap');
      await _settle(tester);

      expect(find.text('הסיכום שלך עוד נכתב'), findsOneWidget);
      // The empty-state CTA invites entering bills rather than dead-ending.
      expect(find.text('הזנת חשבונות'), findsOneWidget);
      // The share action is gated on having something to recap, so it is gone.
      expect(find.byTooltip('שתף את הסיכום'), findsNothing);
    });
  });
}
