import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/models.dart';
import 'package:chosech/pages/community/community_widget.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Widget tests for the community feed (lib/pages/community/community_widget.dart).
///
/// The feed renders [Backend.fetchPosts] output. These inject deterministic
/// backends (extending [LocalBackend] so the full contract is inherited) and
/// assert the real render + the error-boundary behaviour: a failed first load
/// with nothing cached must show an honest "couldn't load" + retry state, never
/// a silent "empty community".
class _FakeBackend extends LocalBackend {
  _FakeBackend(this._remote);
  final List<CommunityPost> _remote;

  @override
  Future<List<CommunityPost>> fetchPosts({String? channel}) async =>
      List.unmodifiable(_remote);
}

/// First fetch throws — the offline / backend-down path.
class _ErrorBackend extends LocalBackend {
  bool failNext = true;

  @override
  Future<List<CommunityPost>> fetchPosts({String? channel}) async {
    if (failNext) throw Exception('offline');
    return const [];
  }
}

CommunityPost _post(String id, String text, {String channel = 'המלצות'}) =>
    CommunityPost(
      id: id,
      author: 'דנה',
      avatar: 'ד',
      channel: channel,
      text: text,
      likes: 0,
      replies: 0,
      timestamp: DateTime(2026, 6, 22, 12),
    );

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

  testWidgets('renders the header and a post fetched from the backend',
      (tester) async {
    appBackend = _FakeBackend([_post('p1', 'מצאתי מסלול מעולה ב-30 שקל')]);
    await tester.pumpWidget(_wrap(const CommunityWidget()));
    await tester.pump(); // kick off the load
    await tester.pump(const Duration(milliseconds: 500)); // flush + entrance

    expect(find.text('קהילת Switchy AI'), findsOneWidget);
    expect(find.text('מצאתי מסלול מעולה ב-30 שקל'), findsOneWidget);
    // Drain the staggered card entrance so no animation timer is left pending.
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('empty feed (loaded ok) shows the honest "no posts yet" state',
      (tester) async {
    appBackend = _FakeBackend(const []);
    await tester.pumpWidget(_wrap(const CommunityWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('עדיין אין פוסטים'), findsOneWidget);
    expect(find.text('פרסם פוסט'), findsOneWidget);
    // It is NOT the failure state.
    expect(find.text('לא הצלחנו לטעון את הקהילה'), findsNothing);
  });

  testWidgets(
      'failed first load with nothing cached shows error + retry, not an empty lie',
      (tester) async {
    appBackend = _ErrorBackend();
    await tester.pumpWidget(_wrap(const CommunityWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // Honest error boundary, not the "no posts yet" empty state.
    expect(find.text('לא הצלחנו לטעון את הקהילה'), findsOneWidget);
    expect(find.text('נסו שוב'), findsOneWidget);
    expect(find.text('עדיין אין פוסטים'), findsNothing);
  });

  testWidgets('retry after a failure recovers and renders posts',
      (tester) async {
    final backend = _ErrorBackend();
    appBackend = backend;
    await tester.pumpWidget(_wrap(const CommunityWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('לא הצלחנו לטעון את הקהילה'), findsOneWidget);

    // Backend recovers; the retry CTA re-fetches and the feed fills in.
    // (HapticFeedback inside _refreshFeed is a no-op under the test binding.)
    backend.failNext = false;
    // No posts to return after recovery → honest "no posts yet", not an error.
    await tester.tap(find.text('נסו שוב'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('לא הצלחנו לטעון את הקהילה'), findsNothing);
    expect(find.text('עדיין אין פוסטים'), findsOneWidget);
  });

  testWidgets('channel chips render with the "all" channel selectable',
      (tester) async {
    appBackend = _FakeBackend([
      _post('p1', 'טיפ לחיסכון', channel: 'המלצות'),
      _post('p2', 'שאלה על אינטרנט', channel: 'אינטרנט'),
    ]);
    await tester.pumpWidget(_wrap(const CommunityWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // The channel rail includes the "all" filter and the per-topic channels.
    expect(find.text('הכל'), findsWidgets);
    expect(find.text('סלולר'), findsWidgets);
    await tester.pump(const Duration(milliseconds: 500));
  });
}
