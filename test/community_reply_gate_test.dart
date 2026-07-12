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

/// Regression test for the community REPLY-composer auth gate
/// (lib/pages/community/community_widget.dart → `_submitReply`).
///
/// FOOTGUN: community replies persist via RLS-protected inserts
/// (user_id = auth.uid()). An ANONYMOUS reply would be optimistically rendered,
/// then silently rejected by the DB, and vanish on the next refresh — a
/// confusing "ghost reply". The composer therefore gates on `appState.isLoggedIn`
/// BEFORE doing any optimistic insert or backend write: an anon submit must show
/// a "יש להתחבר כדי להגיב" prompt and call NEITHER `addCommunityReply` (optimistic
/// state) NOR `appBackend.addReply` (the persisted write). A logged-in submit must
/// reach `appBackend.addReply`.
///
/// We drive the real UI (open a post's reply thread → type → press send) and
/// observe `addReply` via a recording backend. Mirrors community_widget_test.dart:
/// a LocalBackend subclass (full contract inherited), the RTL/0.7-textScale wrap,
/// and GoogleFonts runtime-fetch disabled.

/// Records every `addReply` so the test can assert it was / wasn't called.
class _RecordingBackend extends LocalBackend {
  _RecordingBackend(this._remote);
  final List<CommunityPost> _remote;
  final List<ReplyInput> addReplyCalls = [];

  @override
  Future<List<CommunityPost>> fetchPosts({String? channel, DateTime? before}) async =>
      List.unmodifiable(_remote);

  @override
  Future<List<CommunityReply>> fetchReplies(String postId) async => const [];

  @override
  Future<void> addReply(ReplyInput reply) async {
    addReplyCalls.add(reply);
    return super.addReply(reply);
  }
}

CommunityPost _post(String id, String text) => CommunityPost(
      id: id,
      author: 'דנה',
      avatar: 'ד',
      channel: 'המלצות',
      text: text,
      likes: 0,
      replies: 0,
      timestamp: DateTime(2026, 6, 22, 12),
    );

// AppState is provided ABOVE MaterialApp so a modal bottom sheet (pushed on the
// app's Navigator, e.g. the reply composer) can still read it — mirroring the
// real app, where AppState sits above the router. Putting it inside `home:`
// would leave modal routes outside the provider scope (ProviderNotFoundException).
Widget _wrap(Widget child, AppState appState) => ChangeNotifierProvider<AppState>.value(
      value: appState,
      child: MaterialApp(
        builder: (context, w) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: const TextScaler.linear(0.7)),
          child: w!,
        ),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: child,
        ),
      ),
    );

/// Give the test a tall surface so the feed + the reply sheet lay out without a
/// RenderFlex overflow (which flutter_test promotes to a failure).
void _useTallSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(1200, 2600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Open the first post's reply thread, type [text], and press the send action.
Future<void> _composeReply(WidgetTester tester, String text) async {
  // Open the reply thread via the post card's reply action. The button carries a
  // Semantics(label: 'הגב לפוסט'), but its visible reply-count Text merges into
  // the node label, so we target the stable, unambiguous reply icon instead.
  final replyBtn = find.byIcon(Icons.chat_bubble_outline_rounded).first;
  await tester.ensureVisible(replyBtn);
  await tester.pump();
  await tester.tap(replyBtn);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400)); // sheet entrance
  // Type into the reply field, then fire the keyboard "send" action — both the
  // send button and onSubmitted route through the same _submitReply.
  await tester.enterText(find.byType(TextField).last, text);
  await tester.testTextInput.receiveAction(TextInputAction.send);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

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
      'anon reply is GATED: shows "יש להתחבר" and never calls addReply',
      (tester) async {
    _useTallSurface(tester);
    final backend = _RecordingBackend([_post('p1', 'מצאתי מסלול מעולה')]);
    appBackend = backend;
    final appState = AppState(); // default: NOT logged in
    expect(appState.isLoggedIn, isFalse);

    await tester.pumpWidget(_wrap(const CommunityWidget(), appState));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    await _composeReply(tester, 'תגובה אנונימית');

    // The auth prompt is shown…
    expect(find.text('יש להתחבר כדי להגיב'), findsOneWidget);
    // …and NO persisted write happened (the ghost-reply footgun is blocked).
    expect(backend.addReplyCalls, isEmpty);

    await tester.pump(const Duration(seconds: 4)); // drain the snackbar timer
  });

  testWidgets('logged-in reply is allowed: addReply is called with the text',
      (tester) async {
    _useTallSurface(tester);
    final backend = _RecordingBackend([_post('p1', 'מצאתי מסלול מעולה')]);
    appBackend = backend;
    final appState = AppState()
      ..login(name: 'יעל לוי', phone: '0501234567');
    expect(appState.isLoggedIn, isTrue);

    await tester.pumpWidget(_wrap(const CommunityWidget(), appState));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    await _composeReply(tester, 'תגובה אמיתית');

    // No auth prompt, and the reply reached the backend with our text.
    expect(find.text('יש להתחבר כדי להגיב'), findsNothing);
    expect(backend.addReplyCalls, hasLength(1));
    expect(backend.addReplyCalls.single.postId, 'p1');
    expect(backend.addReplyCalls.single.text, 'תגובה אמיתית');

    await tester.pump(const Duration(milliseconds: 400));
  });
}
