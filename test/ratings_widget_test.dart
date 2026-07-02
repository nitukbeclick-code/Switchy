import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/ratings/ratings_widget.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Widget tests for the ratings leaderboard (lib/pages/ratings/ratings_widget.dart).
///
/// The board renders [Backend.fetchAllReviews] output. These inject
/// deterministic backends (extending [LocalBackend] so the full contract is
/// inherited) and assert the error-boundary behaviour: a failed first load must
/// show an honest "couldn't load" + retry state — never eat the error into a
/// false "no ratings yet" board.
class _ErrorReviews extends LocalBackend {
  bool failNext = true;

  @override
  Future<List<ReviewInput>> fetchAllReviews() async {
    if (failNext) throw Exception('offline');
    return const [];
  }
}

Widget _wrap(Widget child) => MaterialApp(
      builder: (context, w) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(0.7)),
        child: w!,
      ),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: ChangeNotifierProvider<AppState>.value(
          value: AppState(),
          child: child,
        ),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  tearDown(() {
    appBackend = LocalBackend();
  });

  testWidgets(
      'failed first load shows the honest error + retry, not "no ratings yet"',
      (tester) async {
    appBackend = _ErrorReviews();
    await tester.pumpWidget(_wrap(const RatingsWidget()));
    await tester.pump(); // kick off the load
    await tester.pump(const Duration(milliseconds: 500)); // flush + entrance

    // Honest error boundary, not the empty-leaderboard state (and no
    // forever-skeleton: the error state replaces the ghost rows).
    expect(find.text('לא הצלחנו לטעון את הדירוגים'), findsOneWidget);
    expect(find.text('נסו שוב'), findsOneWidget);
    expect(find.text('אין עדיין דירוגים'), findsNothing);
    // Drain the empty-state entrance so no animation frame is left mid-flight.
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('retry after a failure recovers into the real leaderboard',
      (tester) async {
    final backend = _ErrorReviews();
    appBackend = backend;
    await tester.pumpWidget(_wrap(const RatingsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('לא הצלחנו לטעון את הדירוגים'), findsOneWidget);

    // Backend recovers; the retry CTA re-fetches and the board fills in. An
    // empty-but-successful fetch renders the honest empty board, not an error.
    backend.failNext = false;
    await tester.tap(find.text('נסו שוב'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('לא הצלחנו לטעון את הדירוגים'), findsNothing);
    expect(find.text('לוח מנצחים'), findsOneWidget);
    // Drain the staggered content entrance timers.
    await tester.pump(const Duration(milliseconds: 700));
  });
}
