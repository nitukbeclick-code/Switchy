import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';

import 'package:chosech/app_state.dart';
import 'package:chosech/services/edge_advisor.dart';
import 'package:chosech/pages/ai_advisor/ai_advisor_widget.dart';

/// Widget tests for the Switchy AI advisor screen
/// (lib/pages/ai_advisor/ai_advisor_widget.dart).
///
/// The screen renders a seeded Hebrew greeting, a grid of quick-start prompt
/// chips, and an input bar. Tapping a chip sends a turn to the (injectable)
/// edge advisor and shows the reply. We inject a deterministic fake
/// [EdgeAdvisor] (a closure invoker — no network) so the test is fully offline
/// and never exercises the on-device fallback. The fake immediately resolves a
/// reply, so the live-edge path (not the fallback) is what we assert.
///
/// NOTE: the typing indicator + bubbles use repeating/one-shot flutter_animate
/// animations, so we never call pumpAndSettle (the typing dots repeat forever);
/// bounded pumps only.

/// A fake edge advisor that returns a fixed Hebrew reply for any message,
/// without touching the network. Captures the last message it was asked.
EdgeAdvisor _fakeEdge({String reply = 'הנה ההמלצה שלי בשבילך'}) {
  return EdgeAdvisor(invoker: (body) async {
    return {'reply': reply, 'sessionId': 'app_test_session'};
  });
}

Future<void> _pumpAdvisor(
  WidgetTester tester, {
  EdgeAdvisor? edge,
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  // A taller surface so the chip grid + input bar fit on screen (no off-screen
  // taps); reset when the test ends.
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  // A minimal router hosting the advisor plus stub targets for its deep-links,
  // so a stray navigation never crashes the harness.
  final router = GoRouter(
    initialLocation: '/advisor',
    routes: [
      GoRoute(
        path: '/advisor',
        name: 'AIAdvisor',
        builder: (_, __) => AIAdvisorWidget(edgeAdvisor: edge ?? _fakeEdge()),
      ),
      GoRoute(
        path: '/results',
        name: 'Results',
        builder: (_, __) => const Scaffold(body: Text('results-stub')),
      ),
      GoRoute(
        path: '/callback',
        name: 'Callback',
        builder: (_, __) => const Scaffold(body: Text('callback-stub')),
      ),
    ],
  );

  await tester.pumpWidget(
    ChangeNotifierProvider<AppState>.value(
      value: AppState(),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: MaterialApp.router(routerConfig: router),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    await AppState().initializePersistedState();
  });

  testWidgets('renders the seeded greeting, quick-start chips and input bar',
      (tester) async {
    final handle = tester.ensureSemantics();
    await _pumpAdvisor(tester);

    expect(find.byType(AIAdvisorWidget), findsOneWidget);

    // The seeded Hebrew greeting bubble is shown (logged-out copy: no name).
    expect(find.textContaining('יועץ התקשורת החכם שלך'), findsOneWidget);

    // The app-bar identity ("Switchy AI") is present.
    expect(find.text('Switchy AI'), findsOneWidget);

    // The quick-start chips are rendered as tappable prompts — we assert two
    // representative ones by their visible copy. (Each chip is wrapped in a
    // Semantics(button:true) node, but its label merges with the child Text, so
    // we match the Text rather than the exact merged semantics label.)
    expect(find.text('מה הכי משתלם לי?'), findsOneWidget);
    expect(find.text('סלולר הכי זול'), findsOneWidget);

    // The send control carries an a11y label (icon-only button).
    expect(find.bySemanticsLabel('שלח הודעה'), findsOneWidget);

    // The clear-conversation control carries a tooltip a11y label.
    expect(find.byTooltip('נקה שיחה'), findsOneWidget);

    expect(tester.takeException(), isNull);
    handle.dispose();
  });

  testWidgets('tapping a quick-start chip sends the turn and shows the reply',
      (tester) async {
    final handle = tester.ensureSemantics();
    await _pumpAdvisor(tester, edge: _fakeEdge(reply: 'מצאתי לך מסלול משתלם'));

    final chip = find.text('סלולר הכי זול');
    expect(chip, findsOneWidget);
    await tester.tap(chip);
    // Let the async edge round-trip resolve and the reply bubble settle in.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));

    // The user's tapped prompt is echoed into the transcript...
    expect(find.text('סלולר הכי זול'), findsWidgets);
    // ...and the (fake) edge reply is rendered.
    expect(find.text('מצאתי לך מסלול משתלם'), findsOneWidget);

    // The reply turn was persisted to AppState's advisor history (seed + user
    // + bot reply => at least 3 entries).
    final history = AppState().advisorHistory;
    expect(history.length, greaterThanOrEqualTo(3));
    expect(history.last['isUser'], isFalse);

    expect(tester.takeException(), isNull);
    handle.dispose();
  });
}
