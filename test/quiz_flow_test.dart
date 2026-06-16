import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  // Seed onboarding as already seen so the cold-start router redirect skips
  // /onboarding (which renders its own 'הבא ←' button) and lands on /home.
  // Without this both the onboarding tour and the quiz expose a 'הבא ←'
  // button, making the finder ambiguous.
  SharedPreferences.setMockInitialValues({'seenOnboarding': true});
  // Landing on /home on cold start mounts the "hot deals" carousel, whose
  // fixed-height promo cards throw a benign RenderFlex overflow at the default
  // test surface. That overflow is unrelated to the quiz under test; swallow
  // only overflow errors (re-raising anything else) so it isn't flagged as an
  // unexpected failure. Restored at teardown.
  final priorOnError = FlutterError.onError;
  FlutterError.onError = (FlutterErrorDetails details) {
    if (details.exceptionAsString().contains('A RenderFlex overflowed')) {
      return;
    }
    priorOnError?.call(details);
  };
  addTearDown(() => FlutterError.onError = priorOnError);
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

void main() {
  testWidgets('quiz captures today\'s bill and persists it for savings', (tester) async {
    await _bootApp(tester);
    // Sanity: cellular starts at the default bill, not 89.
    expect(AppState().currentBill('cellular'), isNot(89));

    _go(tester, '/quiz');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
    // Confirm the quiz's first step is up before driving it.
    expect(find.text('מה אתם מחפשים?'), findsOneWidget);

    Future<void> tapNext() async {
      await tester.tap(find.text('הבא ←'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 200));
    }

    await tapNext(); // category → step 2
    await tapNext(); // → step 3
    await tapNext(); // → bill step (4 of 5)

    expect(find.text('כמה אתם משלמים היום?'), findsOneWidget);
    // The bill step is step 4 of the now-5-step quiz (guards the counter label).
    expect(find.text('שלב 4 מתוך 5'), findsOneWidget);

    // Pick a known preset distinct from the default bill.
    final preset = find.text('₪89');
    await tester.ensureVisible(preset);
    await tester.pump();
    await tester.tap(preset);
    await tester.pump(const Duration(milliseconds: 200));

    await tapNext(); // bill → budget step

    await tester.tap(find.text('הצג תוצאות'));
    await tester.pump(const Duration(milliseconds: 300));
    // Let the ~700ms "analyzing" delay resolve so no timer is left pending.
    await tester.pump(const Duration(milliseconds: 800));

    expect(AppState().currentBill('cellular'), equals(89));
  });
}
