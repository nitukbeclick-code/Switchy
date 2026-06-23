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
  @override
  Future<AdminMetrics> fetchAdminMetrics({int windowDays = 14}) async => throw Exception('boom');
}

// Owner-observability backend: real CRM reads (for tab 1) plus a deterministic
// admin-metrics payload (for tab 2). [metrics] overrides the whole payload so a
// test can force the empty/data variants.
class _ObsBackend extends LocalBackend {
  _ObsBackend({this.metrics});

  final AdminMetrics? metrics;

  static const _empty = AdminMetrics(
    windowDays: 14,
    events: [],
    totalEvents: 0,
    toolCalls: ToolCallSummary.empty,
    audit: AuditSummary.empty,
    cron: CronSummary.empty,
  );

  @override
  Future<bool> fetchIsAdmin() async => true;

  @override
  Future<AdminMetrics> fetchAdminMetrics({int windowDays = 14}) async =>
      metrics ?? await super.fetchAdminMetrics(windowDays: windowDays);
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
    // scroll each into view before asserting. Scope to the funnel ListView's own
    // Scrollable (the TabBarView's PageView is also a Scrollable, and comes
    // first in the tree).
    final list = find
        .descendant(of: find.byType(ListView), matching: find.byType(Scrollable))
        .first;
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

  // ── Tab 2 — events & audit (owner observability) ──

  testWidgets('two tabs are present; funnel is the default', (tester) async {
    appBackend = _ObsBackend();
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('משפך'), findsOneWidget);
    expect(find.text('אירועים וביקורת'), findsOneWidget);
    // Default tab is the funnel.
    expect(find.text('סה״כ לידים'), findsOneWidget);
  });

  testWidgets('events & audit tab renders the real admin-metrics sections', (tester) async {
    appBackend = _ObsBackend();
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    await tester.tap(find.text('אירועים וביקורת'));
    await tester.pump(); // kick off the tab transition
    await tester.pump(const Duration(milliseconds: 400)); // settle the tab swipe
    await tester.pump(); // _EventsAuditTab.initState → _load()
    await tester.pump(const Duration(milliseconds: 700)); // flush futures + entrance

    expect(find.text('שיעור הצלחה'), findsOneWidget);
    expect(find.text('קריאות-כלי'), findsOneWidget);

    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(find.text('הצלחת קריאות-כלי של הסוכן'), 250, scrollable: list);
    await tester.pump();
    expect(find.text('הצלחת קריאות-כלי של הסוכן'), findsOneWidget);
    // A real tool name from the deterministic payload.
    expect(find.text('search_plans'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('יומן ביקורת אבטחה'), 250, scrollable: list);
    await tester.pump();
    // A real, labelled audit event from the deterministic payload (status_change).
    expect(find.text('שינוי סטטוס'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('בריאות משימות מתוזמנות'), 250, scrollable: list);
    await tester.pump();
    // The deterministic payload has one stale cron job by name.
    expect(find.text('חלק מהמשימות דורשות טיפול'), findsOneWidget);
    expect(find.text('renewal_reminders'), findsOneWidget);

    // Drain the fl_chart one-shot grow-up so no timer is left pending.
    await tester.pump(const Duration(milliseconds: 700));
  });

  testWidgets('events & audit tab shows the honest empty state with no data', (tester) async {
    appBackend = _ObsBackend(metrics: _ObsBackend._empty);
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    await tester.tap(find.text('אירועים וביקורת'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400)); // settle the tab swipe
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('אין עדיין נתוני תצפית'), findsOneWidget);
    // No KPI grid / success-rate card when there's genuinely no data.
    expect(find.text('שיעור הצלחה'), findsNothing);
  });

  testWidgets('events & audit tab shows a retry state on backend error', (tester) async {
    appBackend = _ErrorBackend();
    await tester.pumpWidget(_wrap(const AnalyticsWidget()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    await tester.tap(find.text('אירועים וביקורת'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400)); // settle the tab swipe
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('לא הצלחנו לטעון'), findsWidgets);
    expect(find.text('נסו שוב'), findsWidgets);
  });
}
