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

CommunityPost _post(
  String id,
  String text, {
  String channel = 'המלצות',
  int likes = 0,
  bool isTeam = false,
  bool isVerified = false,
  String? planId,
}) =>
    CommunityPost(
      id: id,
      author: 'דנה',
      avatar: 'ד',
      channel: channel,
      text: text,
      likes: likes,
      replies: 0,
      timestamp: DateTime(2026, 6, 22, 12),
      isTeam: isTeam,
      isVerified: isVerified,
      planId: planId,
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

  // ── Unsupported chrome: claims the screen cannot back ───────────────────────
  //
  // The community screen used to decorate an empty room. Each of these asserts
  // that a specific ornament is GONE — not merely hidden on a quiet day, but
  // absent even when the data that used to summon it is present.

  group('no unearned claims', () {
    testWidgets('the ungated "קהילה פעילה" trophy is gone from an EMPTY feed',
        (tester) async {
      appBackend = _FakeBackend(const []);
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // It used to render here — over nothing at all, which is the one case
      // where "active community" is provably false.
      expect(find.text('עדיין אין פוסטים'), findsOneWidget);
      expect(find.text('קהילה פעילה'), findsNothing);
    });

    testWidgets('…and from a POPULATED feed too (it was never gated)',
        (tester) async {
      appBackend = _FakeBackend([_post('p1', 'טיפ')]);
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('קהילה פעילה'), findsNothing);
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('the stats strip says the counts are only what was loaded',
        (tester) async {
      appBackend = _FakeBackend([_post('p1', 'טיפ')]);
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // The three counts are sums over the loaded page, not community totals,
      // and the strip now says so instead of wearing a trophy.
      expect(find.text('לפי הפוסטים שנטענו'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('no "עסקת השבוע" banner, even for a team post carrying a plan',
        (tester) async {
      // These are exactly the fields the banner used to gate on. Nothing in the
      // app can actually produce them, so the test constructs them by hand —
      // and the banner still must not appear, because "deal of the week" was
      // never computed from any weekly comparison.
      appBackend = _FakeBackend([
        _post('p1', 'חבילה משתלמת', isTeam: true, planId: 'plan-1'),
      ]);
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('עסקת השבוע'), findsNothing);
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('no "טרנדינג" badge, however many all-time likes a post has',
        (tester) async {
      // like_count is an all-time total with no time dimension, so it cannot
      // establish a trend at any threshold. 500 likes is still not "trending".
      appBackend = _FakeBackend([_post('p1', 'פוסט ותיק', likes: 500)]);
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('פוסט ותיק'), findsOneWidget);
      expect(find.text('טרנדינג'), findsNothing);
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('no "צוות" badge and no verified check — neither has a source',
        (tester) async {
      appBackend = _FakeBackend([
        _post('p1', 'הודעה', isTeam: true, isVerified: true),
      ]);
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('הודעה'), findsOneWidget);
      // Authority marks a post object can simply assert about itself.
      // (Asserted on the ICON, not the semantics label: semantics is not
      // enabled in these tests, so a bySemanticsLabel findsNothing would pass
      // even with the badge on screen.)
      expect(find.text('צוות'), findsNothing);
      expect(find.byIcon(Icons.verified_rounded), findsNothing);
      await tester.pump(const Duration(milliseconds: 500));
    });
  });

  // ── The like double-count ───────────────────────────────────────────────────

  group('like count', () {
    // Two posts in different channels on purpose: with a single post the stats
    // strip's 'לייקים' total equals that post's own count, and find.text would
    // match both. Here p1=7 and p2=41 sum to 48, so 7, 41 and 42 are each
    // unique on screen and the assertions are sharp.
    List<CommunityPost> twoPosts() => [
          _post('p1', 'פוסט אהוב', channel: 'סלולר', likes: 7),
          _post('p2', 'פוסט אחר', channel: 'אינטרנט', likes: 41),
        ];

    testWidgets('a post the viewer already liked shows the server count, not +1',
        (tester) async {
      // community_feed.like_count = count(*) over post_likes, so the viewer's
      // own row is ALREADY in the 7. AppState.hasLiked is persisted locally and
      // never reconciled, so the old `post.likes + (liked ? 1 : 0)` painted 8
      // on every load after the like — for the rest of the post's life.
      AppState().toggleLike('p1');
      expect(AppState().hasLiked('p1'), isTrue);

      appBackend = _FakeBackend(twoPosts());
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // 7, not 8.
      expect(find.text('7'), findsOneWidget);
      expect(find.text('8'), findsNothing);
      // The heart is still filled — the like itself is not being denied, only
      // counted once. Exactly one filled heart: p1's.
      expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('liking an unliked post adds exactly one, optimistically',
        (tester) async {
      appBackend = _FakeBackend(twoPosts());
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('41'), findsOneWidget);

      // Both hearts are outlined; index 1 is p2's (feed order = backend order).
      await tester.tap(find.byIcon(Icons.favorite_border_rounded).at(1));
      await tester.pump();

      // Exactly one, and only until the next fetch reflects it.
      expect(find.text('42'), findsOneWidget);
      expect(find.text('43'), findsNothing);
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('like then unlike returns to the server count', (tester) async {
      appBackend = _FakeBackend(twoPosts());
      await tester.pumpWidget(_wrap(const CommunityWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      await tester.tap(find.byIcon(Icons.favorite_border_rounded).at(1));
      await tester.pump();
      expect(find.text('42'), findsOneWidget);

      // p2 is now the only filled heart.
      await tester.tap(find.byIcon(Icons.favorite_rounded));
      await tester.pump();
      expect(find.text('41'), findsOneWidget);
      expect(find.text('40'), findsNothing);
      await tester.pump(const Duration(milliseconds: 500));
    });
  });

  // ── Channel partition repair ────────────────────────────────────────────────

  testWidgets('a post stored under the legacy ASCII spelling is labelled canonically',
      (tester) async {
    // Built from codepoints: ח ו " ל with an ASCII quote — the spelling this
    // app itself used to write into community_posts.channel.
    final legacyAbroad = String.fromCharCodes([0x05D7, 0x05D5, 0x0022, 0x05DC]);
    final canonicalAbroad = kCommunityChannels[4];
    expect(legacyAbroad, isNot(canonicalAbroad)); // guard against a vacuous test

    appBackend = _FakeBackend([
      _post('p1', 'חבילת גלישה ליפן', channel: legacyAbroad),
    ]);
    await tester.pumpWidget(_wrap(const CommunityWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('חבילת גלישה ליפן'), findsOneWidget);
    // The card's channel badge folds to the canonical spelling, so the post is
    // labelled with the same string its channel chip carries — rather than a
    // near-identical look-alike that no filter on any surface matches.
    expect(find.text(legacyAbroad), findsNothing);
    expect(find.text(canonicalAbroad), findsWidgets);
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
