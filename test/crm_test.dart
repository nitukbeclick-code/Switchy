import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/crm/crm_widget.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

// A deterministic CRM backend: we extend LocalBackend (so the non-CRM contract is
// inherited) and override only the CRM seam with fixed, fully-controlled data.
// crmSendReply records the calls so the reply test can assert the round-trip.
class _FakeCrm extends LocalBackend {
  _FakeCrm();

  final List<({String conversationId, String body})> sentReplies = [];

  static final _now = DateTime(2026, 6, 22, 12, 0);

  final List<CrmConversation> _conversations = [
    CrmConversation(
      conversationId: 'c1',
      contactId: 'k1',
      name: 'דנה לוי',
      phone: '0521234567',
      status: 'human',
      intent: 'cellular',
      lastSnippet: 'מצאתי לך חבילה ב-39 ש"ח',
      lastAt: _now.subtract(const Duration(minutes: 5)),
      leadStatus: 'contacted',
    ),
    CrmConversation(
      conversationId: 'c2',
      contactId: 'k2',
      name: 'יוסי כהן',
      phone: '0539876543',
      status: 'bot',
      intent: 'internet',
      lastSnippet: 'יש כמה אפשרויות מ-49 ש"ח',
      lastAt: _now.subtract(const Duration(minutes: 30)),
    ),
  ];

  final List<CrmLead> _leads = [
    CrmLead(id: 'l1', name: 'דנה לוי', phone: '0521234567', provider: 'פרטנר', source: 'whatsapp', status: 'new', createdAt: _now),
    CrmLead(id: 'l2', name: 'מירי אברהם', phone: '0501112233', provider: 'בזק', source: 'whatsapp', status: 'new', createdAt: _now),
    CrmLead(id: 'l3', name: 'יוסי כהן', phone: '0539876543', provider: 'סלקום', source: 'form', status: 'contacted', createdAt: _now),
    CrmLead(id: 'l4', name: 'אבי דהן', phone: '0544455667', provider: 'HOT', source: 'form', status: 'won', createdAt: _now),
    CrmLead(id: 'l5', name: 'נועה שמש', phone: '0587778899', provider: 'yes', source: 'whatsapp', status: 'lost', createdAt: _now),
  ];

  @override
  Future<bool> fetchIsAdmin() async => true;

  @override
  Future<CrmOverview> crmOverview() async => CrmOverview(
        // 2 new, 1 contacted, 1 won, 1 lost — drives the four stat cards.
        pipeline: const {'new': 2, 'contacted': 1, 'won': 1, 'lost': 1},
        recent: List.unmodifiable(_conversations),
      );

  @override
  Future<List<CrmConversation>> crmListConversations({String? status, String? search}) async {
    var list = [..._conversations];
    if (status != null && status.isNotEmpty) {
      list = list.where((c) => c.status == status).toList();
    }
    if (search != null && search.isNotEmpty) {
      final q = search.toLowerCase();
      list = list.where((c) => c.name.toLowerCase().contains(q) || c.phone.contains(search)).toList();
    }
    return List.unmodifiable(list);
  }

  @override
  Future<CrmThread> crmGetThread(String conversationId) async {
    final conv = _conversations.firstWhere((c) => c.conversationId == conversationId);
    return CrmThread(
      contact: CrmContact(
        id: conv.contactId,
        name: conv.name,
        phone: conv.phone,
        status: 'qualified',
        leadId: 'l1',
        leadStatus: conv.leadStatus,
      ),
      messages: [
        CrmMessage(id: 'm1', direction: 'in', actor: 'customer', body: 'היי, אפשר לעבור לחבילה זולה יותר?', createdAt: _now.subtract(const Duration(minutes: 20))),
        CrmMessage(id: 'm2', direction: 'out', actor: 'rep', body: 'בטח! מצאתי לך חבילה ב-39 ש"ח', createdAt: _now.subtract(const Duration(minutes: 5))),
      ],
    );
  }

  @override
  Future<void> crmSendReply(String conversationId, String body) async {
    sentReplies.add((conversationId: conversationId, body: body));
  }

  @override
  Future<List<CrmLead>> crmListLeads({String? status}) async {
    final list = status == null || status.isEmpty
        ? _leads
        : _leads.where((l) => l.status == status).toList();
    return List.unmodifiable(list);
  }
}

Widget _wrap(Widget child) => MaterialApp(
      // GoogleFonts runtime fetch is off in tests, so a wider fallback font
      // stands in for Rubik/Assistant. Shrink the text scale a touch so the
      // app's fixed-width controls (e.g. the 116px "שליחה" button) don't report
      // a font-metric-only overflow that never happens with the real fonts.
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

  late _FakeCrm backend;

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    backend = _FakeCrm();
    appBackend = backend;
  });

  tearDown(() {
    appBackend = LocalBackend();
  });

  group('CrmWidget tabs', () {
    testWidgets('renders the three tabs', (tester) async {
      await tester.pumpWidget(_wrap(const CrmWidget()));
      await tester.pump(); // kick off the initial loads
      await tester.pump(const Duration(milliseconds: 400)); // flush futures + entrance

      expect(find.text('ניהול לקוחות'), findsOneWidget);
      expect(find.text('סקירה'), findsOneWidget);
      expect(find.text('שיחות'), findsOneWidget);
      expect(find.text('צבר לידים'), findsOneWidget);
    });
  });

  group('Overview pipeline', () {
    testWidgets('the four pipeline stat cards show their counts', (tester) async {
      await tester.pumpWidget(_wrap(const CrmWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // Card labels.
      expect(find.text('חדשים'), findsOneWidget);
      expect(find.text('נוצר קשר'), findsOneWidget);
      expect(find.text('נסגרו בהצלחה'), findsOneWidget);
      expect(find.text('אבודים'), findsOneWidget);
      // Counts from the seeded pipeline {new:2, contacted:1, won:1, lost:1}.
      expect(find.text('2'), findsOneWidget); // new
      expect(find.text('1'), findsWidgets); // contacted / won / lost all = 1

      // The recent-conversations section sits below the stat grid. Scroll the
      // overview's own (vertical) ListView — the Scrollable wrapping the cards —
      // not the TabBarView's horizontal PageView.
      final overviewList =
          find.ancestor(of: find.text('חדשים'), matching: find.byType(Scrollable)).first;
      await tester.scrollUntilVisible(find.text('שיחות אחרונות'), 200, scrollable: overviewList);
      await tester.pump();
      expect(find.text('שיחות אחרונות'), findsOneWidget);
      expect(find.text('דנה לוי'), findsWidgets);
    });
  });

  group('Conversations → thread', () {
    // Conversation rows expose a Semantics button "שיחה עם <name>. <snippet>";
    // the same row type renders on both the overview and the conversations tab,
    // and either one opens the same thread (c1 for Dana). We tap the first match.
    // Built inside each test, AFTER tester.ensureSemantics() enables the tree.
    Finder danaRow() => find.bySemanticsLabel(RegExp(r'^שיחה עם דנה לוי'));

    testWidgets('tapping a conversation opens its thread with the messages', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(_wrap(const CrmWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // Move to the conversations tab.
      await tester.tap(find.text('שיחות'));
      await tester.pump();
      // Settle the tab transition + the rows' staggered reveal (the Emil motion
      // pass added a fadeIn+slideY) so the row is a stable hit target.
      await tester.pump(const Duration(milliseconds: 800));

      // Open Dana's conversation.
      await tester.tap(danaRow().first);
      await tester.pump(); // start the push
      await tester.pump(const Duration(milliseconds: 400)); // load the thread

      // The thread shows the seeded messages.
      expect(find.text('היי, אפשר לעבור לחבילה זולה יותר?'), findsOneWidget);
      expect(find.textContaining('מצאתי לך חבילה'), findsWidgets);
      // …and a reply composer.
      expect(find.text('שליחה'), findsOneWidget);
      // Flush the flutter_animate entrance timers (message-bubble reveal) before
      // disposing, so no pending Timer trips the binding.
      await tester.pump(const Duration(seconds: 1));
      handle.dispose();
    });

    testWidgets('typing a reply and tapping send calls crmSendReply', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(_wrap(const CrmWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      await tester.tap(find.text('שיחות'));
      await tester.pump();
      // Settle the tab transition + the rows' staggered reveal before tapping.
      await tester.pump(const Duration(milliseconds: 800));

      await tester.tap(danaRow().first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // Type into the reply box and send.
      await tester.enterText(find.byType(TextField).last, 'אחבר אותך לנציג מיד');
      await tester.pump();
      await tester.tap(find.text('שליחה'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(backend.sentReplies, hasLength(1));
      expect(backend.sentReplies.single.conversationId, 'c1');
      expect(backend.sentReplies.single.body, 'אחבר אותך לנציג מיד');
      handle.dispose();
    });
  });

  group('Leads tab', () {
    testWidgets('renders the lead pipeline grouped by status', (tester) async {
      await tester.pumpWidget(_wrap(const CrmWidget()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      await tester.tap(find.text('צבר לידים'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // The first pipeline groups (new / contacted) sit above the fold.
      expect(find.text('חדשים'), findsWidgets);
      expect(find.text('נוצר קשר'), findsWidgets);
      // A 'new' lead is visible at the top.
      expect(find.text('מירי אברהם'), findsOneWidget);

      // The lower groups (won / lost) need a scroll into view.
      final list = find.byType(Scrollable).last;
      await tester.scrollUntilVisible(find.text('אבודים'), 200, scrollable: list);
      await tester.pump();
      expect(find.text('נסגרו'), findsWidgets); // 'won' group header
      expect(find.text('אבודים'), findsWidgets); // 'lost' group header
      expect(find.text('אבי דהן'), findsOneWidget); // the seeded 'won' lead
    });
  });
}
