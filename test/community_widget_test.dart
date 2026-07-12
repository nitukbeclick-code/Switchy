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
  Future<List<CommunityPost>> fetchPosts({String? channel, DateTime? before}) async =>
      List.unmodifiable(_remote);
}

/// First fetch throws — the offline / backend-down path.
class _ErrorBackend extends LocalBackend {
  bool failNext = true;

  @override
  Future<List<CommunityPost>> fetchPosts({String? channel, DateTime? before}) async {
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

  // ── Load-older paging (the >50-post hiding regression) ──────────────────────
  // The feed caps a page at 50 rows; scrolling to the end must pull the next
  // OLDER page (via the `before` cursor) and splice it in without hiding the
  // oldest posts or double-counting a boundary-timestamp twin. mergeOlderCommunityPage
  // is the pure page-merge/de-dupe seam the widget uses — tested directly so the
  // proof needs no network and no fragile scroll pumping.
  group('mergeOlderCommunityPage', () {
    CommunityPost at(String id, DateTime ts, {String channel = 'המלצות'}) =>
        CommunityPost(
          id: id,
          author: 'דנה',
          avatar: 'ד',
          channel: channel,
          text: id,
          likes: 0,
          replies: 0,
          timestamp: ts,
        );

    test('appends a second (older) page before the seed tail, de-duped by id', () {
      final base = DateTime(2026, 6, 22, 12);
      // Page 1 (newest-first) + one bundled seed pinned to the tail.
      final current = [
        at('p3', base.subtract(const Duration(minutes: 1))),
        at('p2', base.subtract(const Duration(minutes: 2))),
        at('p1', base.subtract(const Duration(minutes: 3))), // oldest loaded
        at('seed', DateTime(2020), channel: 'המלצות'),
      ];
      // The older page shares the boundary post p1 (same id — the shared-
      // timestamp twin) and adds two genuinely-older posts.
      final older = [
        at('p1', base.subtract(const Duration(minutes: 3))), // boundary twin
        at('o1', base.subtract(const Duration(minutes: 4))),
        at('o2', base.subtract(const Duration(minutes: 5))),
      ];

      final merged =
          mergeOlderCommunityPage(current, older, seedIds: {'seed'});

      // p1 is NOT duplicated; o1/o2 land BEFORE the seed; order stays newest-first.
      expect(merged.map((p) => p.id).toList(),
          ['p3', 'p2', 'p1', 'o1', 'o2', 'seed']);
      // Exactly one p1.
      expect(merged.where((p) => p.id == 'p1').length, 1);
    });

    test('an all-duplicate older page changes nothing (end of feed)', () {
      final base = DateTime(2026, 6, 22, 12);
      final current = [
        at('p2', base.subtract(const Duration(minutes: 1))),
        at('p1', base.subtract(const Duration(minutes: 2))),
      ];
      final merged =
          mergeOlderCommunityPage(current, current, seedIds: const {});
      expect(identical(merged, current), isTrue); // no new ids → same list back
    });

    test('with no seed tail, older posts append at the end', () {
      final base = DateTime(2026, 6, 22, 12);
      final current = [at('p1', base)];
      final merged = mergeOlderCommunityPage(
        current,
        [at('o1', base.subtract(const Duration(minutes: 1)))],
        seedIds: const {},
      );
      expect(merged.map((p) => p.id).toList(), ['p1', 'o1']);
    });
  });
}
