import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/analytics/analytics_widget.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

// A deterministic analytics backend: extends LocalBackend (inherits the full
// contract) and overrides only the three CRM reads the dashboard aggregates.
class _FakeBackend extends LocalBackend {
  _FakeBackend({this.leads, this.conversations, this.pipeline});

  final List<CrmLead>? leads;
  final List<CrmConversation>? conversations;
  final Map<String, int>? pipeline;

  static final _now = DateTime(2026, 6, 22, 12, 0);

  static final _defaultLeads = <CrmLead>[
    CrmLead(id: 'l1', name: 'דנה לוי', phone: '0521234567', provider: 'פרטנר', source: 'whatsapp', status: 'new', createdAt: _now),
    CrmLead(id: 'l2', name: 'מירי אברהם', phone: '0501112233', provider: 'בזק', source: 'whatsapp', status: 'contacted', createdAt: _now.subtract(const Duration(days: 1))),
    CrmLead(id: 'l3', name: 'יוסי כהן', phone: '0539876543', provider: 'סלקום', source: 'form', status: 'won', createdAt: _now.subtract(const Duration(days: 2))),
    CrmLead(id: 'l4', name: 'אבי דהן', phone: '0544455667', provider: 'HOT', source: 'form', status: 'lost', createdAt: _now.subtract(const Duration(days: 3))),
  ];

  static const _defaultConversations = <CrmConversation>[
    CrmConversation(conversationId: 'c1', contactId: 'k1', name: 'דנה לוי', phone: '0521234567', status: 'human', intent: 'cellular', botEnabled: false),
    CrmConversation(conversationId: 'c2', contactId: 'k2', name: 'יוסי כהן', phone: '0539876543', status: 'bot', intent: 'internet', botEnabled: true),
  ];

  @override
  Future<bool> fetchIsAdmin() async => true;

  @override
  Future<List<CrmLead>> crmListLeads({String? status}) async =>
      List.unmodifiable(leads ?? _defaultLeads);

  @override
  Future<List<CrmConversation>> crmListConversations({String? status, String? search}) async =>
      List.unmodifiable(conversations ?? _defaultConversations);

  @override
  Future<CrmOverview> crmOverview() async => CrmOverview(
        pipeline: pipeline ?? const {'new': 1, 'contacted': 1, 'won': 1, 'lost': 1},
        recent: List.unmodifiable(conversations ?? _defaultConversations),
      );
}

class _ErrorBackend extends LocalBackend {
  @override
  Future<bool> fetchIsAdmin() async => true;
  @override
  Future<List<CrmLead>> crmListLeads({String? status}) async => throw Exception('boom');
  @override
  Future<List<CrmConversation>> crmListConversations({String? status, String? search}) async => throw Exception('boom');
  @override
  Future<CrmOverview> crmOverview() async => throw Exception('boom');
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

  testWidgets('renders the title and KPI cards from real CRM reads', (tester) async {
    appBackend = _FakeBackend();
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump(); // kick off the load
    await tester.pump(const Duration(milliseconds: 700)); // flush futures + entrance

    expect(find.text('דשבורד אנליטיקס'), findsOneWidget);
    expect(find.text('סה״כ לידים'), findsOneWidget);
    expect(find.text('4'), findsWidgets); // 4 leads total
    expect(find.text('שיעור המרה'), findsOneWidget);
    // 1 won / (1 won + 1 lost) = 50% — a real ratio, not invented.
    expect(find.text('50%'), findsWidgets);
  });

  testWidgets('renders the section titles and breakdowns', (tester) async {
    appBackend = _FakeBackend();
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    // The page is a lazy ListView, so off-screen sections aren't built yet —
    // scroll each into view before asserting.
    final list = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('לידים לאורך זמן'), 250, scrollable: list);
    await tester.pump();
    expect(find.text('לידים לאורך זמן'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('לידים לפי ערוץ'), 250, scrollable: list);
    await tester.pump();
    expect(find.text('לידים לפי ערוץ'), findsOneWidget);

    // A real, labelled acquisition channel from the seeded leads.
    await tester.scrollUntilVisible(find.text('וואטסאפ'), 250, scrollable: list);
    await tester.pump();
    expect(find.text('וואטסאפ'), findsOneWidget);

    // Drain the fl_chart one-shot grow-up animation so no timer is left pending
    // at teardown (the chart was scrolled into view, starting its 600ms swap).
    await tester.pump(const Duration(milliseconds: 700));
  });

  testWidgets('empty data shows the honest empty state, no fabricated numbers', (tester) async {
    appBackend = _FakeBackend(leads: const [], conversations: const [], pipeline: const {});
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('אין עדיין נתונים'), findsOneWidget);
    // No conversion percentage or KPI grid when there's genuinely no data.
    expect(find.text('שיעור המרה'), findsNothing);
  });

  testWidgets('a backend error shows a retry empty state', (tester) async {
    appBackend = _ErrorBackend();
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('לא הצלחנו לטעון'), findsOneWidget);
    expect(find.text('נסו שוב'), findsOneWidget);
  });

  testWidgets('conversion reads "—" (not 0%) when nothing has closed', (tester) async {
    appBackend = _FakeBackend(
      leads: [
        CrmLead(id: 'l1', name: 'a', phone: '0500000000', source: 'form', status: 'new', createdAt: _FakeBackend._now),
      ],
      conversations: const [],
      pipeline: const {'new': 1, 'contacted': 0, 'won': 0, 'lost': 0},
    );
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('שיעור המרה'), findsOneWidget);
    expect(find.text('—'), findsWidgets);
    expect(find.text('טרם נסגרו לידים'), findsOneWidget);
  });
}
