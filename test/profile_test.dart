import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/profile/profile_widget.dart';

/// Widget tests for the Wave-3 Profile screen (lib/pages/profile/profile_widget.dart).
///
/// These boot the full app (MaterialApp.router + the whole go_router graph +
/// Provider<AppState>) — the same harness as test/more_screens_test.dart and
/// test/app_smoke_test.dart — then navigate to /profile via GoRouter. This way
/// the page's many `context.pushNamed(...)` links and theme/RTL wiring resolve
/// exactly as in the real app, instead of being mocked.

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
/// Profile screen has tall stacked sections that can overflow the fixed test
/// viewport. These are pre-existing layout artefacts, not test failures (same
/// approach as test/more_screens_test.dart / test/nav_smoke_test.dart).
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
/// _AnimateState.initState for the alert/savings/tracked cards) so the test
/// doesn't trip the binding's "A Timer is still pending after dispose"
/// invariant. The entrance animations are finite, so a generous fixed pump
/// fully settles them.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(seconds: 2));
}

/// ISO date [days] out from today (yyyy-MM-dd).
String _isoInDays(int days) {
  final d = DateTime.now().add(Duration(days: days));
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

void main() {
  testWidgets(
      'renders the renewal alert, savings card and tracked-plans section when data exists',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Seed a tracked plan whose promo ends ~12 days out. This drives THREE
      // surfaces at once:
      //  • nextRenewal != null  → the "חידוש קרוב" alert card
      //  • myPlans.isNotEmpty   → the "המסלולים שלי" tracked-plans section
      // A high monthly price (₪200) guarantees a positive saving so the bills
      // already entered (defaults are non-zero) produce a savings opportunity.
      final s = AppState();
      s.addMyPlan(
        category: 'cellular',
        provider: 'סלקום',
        planName: 'מסלול ביתי',
        monthlyPrice: 200,
        promoEndDate: _isoInDays(12),
      );

      _go(tester, '/profile');
      await _settle(tester);

      // Upcoming-renewal alert (lib/pages/profile/profile_widget.dart:547).
      expect(find.text('חידוש קרוב'), findsOneWidget);
      expect(find.textContaining('המבצע מסתיים בעוד'), findsOneWidget);

      // Saving-potential card (amber VALUE) — default bills are non-zero so the
      // whole-app opportunity is positive.
      expect(find.text('פוטנציאל החיסכון שלך'), findsOneWidget);
      expect(find.textContaining('בשנה'), findsWidgets);

      // Tracked-plans section header + its "מעקב חידושים" action link.
      expect(find.text('המסלולים שלי'), findsOneWidget);
      expect(find.text('מעקב חידושים'), findsOneWidget);
      // The seeded carrier/plan renders inside the section.
      expect(find.text('מסלול ביתי'), findsWidgets);

      expect(tester.takeException(), isNull);
    });
  });

  testWidgets(
      'edit-profile sheet rejects an invalid phone then saves a valid one',
      (tester) async {
    // Pump the sheet in isolation (the full-app shell's live-blur GlassPanel
    // bottom nav intercepts taps over the modal, which is a harness artefact —
    // not a real-device issue). This still exercises the real EditProfileSheet:
    // its controllers, IL-phone validation, error UX and the save → pop flow.
    GoogleFonts.config.allowRuntimeFetching = false;
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    await AppState().initializePersistedState();
    final s = AppState();
    s.login(name: 'ישראל ישראלי', phone: '0521234567');

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: s,
        child: MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () => showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => const EditProfileSheet(),
                    ),
                    child: const Text('open'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('עריכת פרופיל'), findsOneWidget);

    final saveBtn = find.text('שמור שינויים');
    final phoneField = find.byKey(const Key('editProfilePhone'));
    expect(phoneField, findsOneWidget);

    Future<void> tapSave() async {
      await tester.ensureVisible(saveBtn);
      await tester.pump();
      await tester.tap(saveBtn);
    }

    // Enter an invalid phone and try to save → inline error, no state change.
    await tester.enterText(phoneField, '123');
    await tester.pump();
    await tapSave();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('מספר טלפון אינו תקין'), findsOneWidget);
    // Phone in state is unchanged by a rejected save.
    expect(AppState().userPhone, equals('0521234567'));

    // Correct it to a valid number and save → sheet closes, state updates.
    await tester.enterText(phoneField, '054-765-4321');
    await tester.pump();
    await tapSave();
    // Drive the async save (local upsert is a no-op) + the close animation,
    // without waiting on the success SnackBar's full on-screen duration.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(AppState().userPhone, equals('0547654321')); // normalized
    expect(AppState().userName, equals('ישראל ישראלי'));
    // The sheet has closed — its title is gone.
    expect(find.text('עריכת פרופיל'), findsNothing);
  });

  testWidgets('degrades gracefully when there are no tracked plans and no bills',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      // Zero out every bill so the savings card has nothing to show, and add no
      // tracked plans — the data-driven sections must all be absent while the
      // always-present chrome (header, notification toggles) still renders.
      AppState().resetAllBills();

      _go(tester, '/profile');
      await _settle(tester);

      // Data-driven sections are gone.
      expect(find.text('חידוש קרוב'), findsNothing);
      expect(find.text('פוטנציאל החיסכון שלך'), findsNothing);
      expect(find.text('המסלולים שלי'), findsNothing);

      // The page still builds and shows its static scaffolding, so an empty
      // profile is a clean screen rather than a blank/broken one.
      expect(find.text('התראות'), findsOneWidget);
      expect(find.text('ירידות מחיר'), findsOneWidget);
      expect(find.text('שפה'), findsOneWidget);

      expect(tester.takeException(), isNull);
    });
  });
}
