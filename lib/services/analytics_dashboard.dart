/// Pure, dependency-light aggregation of the **real** CRM data the admin already
/// reads (leads, conversations, the lead pipeline) into the funnel metrics the
/// owner analytics dashboard renders.
///
/// This is the single source of truth for every number on the dashboard: the
/// page renders [AnalyticsDashboard] output, it never re-derives a figure. No
/// widgets, no navigation, no I/O — it is fed the exact lists the CRM seam
/// returns ([Backend.crmListLeads], [Backend.crmListConversations],
/// [Backend.crmOverview]) so it unit-tests without pumping a widget.
///
/// **Honesty contract:** every metric here is *counted* from rows that exist.
/// Nothing is estimated, projected, or invented. A metric with no underlying
/// rows is simply zero / empty, and the UI shows an honest empty state rather
/// than a fabricated number. The only "rate" computed (conversion) is a plain
/// ratio of real counts; when the denominator is zero it is null (unknown), not
/// a made-up percentage.
library;

import 'backend/backend.dart';

/// One point on the "leads over time" series: a calendar day (local) and how
/// many leads were created on it. Days with zero leads are included across the
/// requested window so the chart shows real gaps instead of compressing time.
class LeadDayPoint {
  const LeadDayPoint({required this.day, required this.count});

  /// Midnight (local) of the day this bucket covers.
  final DateTime day;
  final int count;
}

/// A counted breakdown row: a label (source / provider / service) and how many
/// leads carry it, plus its share of the total. Sorted largest-first by the
/// builder. [share] is a plain ratio in 0..1 of real counts — never invented.
class CountBreakdown {
  const CountBreakdown({
    required this.key,
    required this.count,
    required this.share,
  });

  /// The raw value as stored (e.g. 'whatsapp', 'form', a provider name, a
  /// service/intent id). Empty/unknown values are bucketed under [unknownKey].
  final String key;
  final int count;

  /// Fraction of the breakdown's grand total this row represents (0..1).
  final double share;
}

/// The sentinel key used for leads/conversations with no source / provider /
/// service recorded. The UI maps it to an honest "לא ידוע" label rather than
/// dropping the row (dropping it would silently inflate every other share).
const String unknownKey = '__unknown__';

/// The full set of aggregated funnel metrics for the dashboard. Built by
/// [AnalyticsDashboard.from]; pure value object.
class AnalyticsDashboard {
  const AnalyticsDashboard({
    required this.totalLeads,
    required this.pipeline,
    required this.leadsByDay,
    required this.leadsBySource,
    required this.leadsByProvider,
    required this.leadsByService,
    required this.totalConversations,
    required this.openConversations,
    required this.humanTakeovers,
    required this.botActive,
    required this.windowDays,
  });

  // ── Volume ─────────────────────────────────────────────────────────────────
  /// Total leads in the supplied list.
  final int totalLeads;

  /// Lead pipeline counts keyed by status (new / contacted / won / lost),
  /// straight from [CrmOverview.pipeline] — the same source the CRM home tab
  /// uses, so the two screens can never disagree.
  final Map<String, int> pipeline;

  /// Daily lead volume across the analysis window, oldest → newest, including
  /// zero days. Empty when no lead carries a creation timestamp.
  final List<LeadDayPoint> leadsByDay;

  // ── Breakdowns ───────────────────────────────────────────────────────────────
  /// Leads grouped by acquisition source/channel (whatsapp / form / …).
  final List<CountBreakdown> leadsBySource;

  /// Leads grouped by the provider the customer asked about.
  final List<CountBreakdown> leadsByProvider;

  /// Conversations grouped by desired service / intent (cellular / internet …).
  /// Sourced from conversations (where `intent` lives), not leads.
  final List<CountBreakdown> leadsByService;

  // ── Conversations / handling ─────────────────────────────────────────────────
  /// Total WhatsApp conversations supplied.
  final int totalConversations;

  /// Conversations still open (status == 'open').
  final int openConversations;

  /// Conversations a human has taken over (bot silenced). Counted from the
  /// authoritative `botEnabled == false` gate, matching the CRM takeover rule.
  final int humanTakeovers;

  /// Conversations the AI bot is still handling (`botEnabled == true`).
  final int botActive;

  /// The number of days the [leadsByDay] window spans (the caller's choice).
  final int windowDays;

  // ── Derived (pure ratios of real counts) ─────────────────────────────────────

  /// Leads the rep closed successfully.
  int get wonLeads => pipeline['won'] ?? 0;

  /// Leads in a terminal state (won or lost) — the denominator for a *closed*
  /// conversion rate that excludes still-open pipeline.
  int get closedLeads => (pipeline['won'] ?? 0) + (pipeline['lost'] ?? 0);

  /// Won ÷ closed, in 0..1, or null when nothing has closed yet (unknown — the
  /// UI shows "—", never a fabricated percentage). Deliberately uses the closed
  /// denominator so an in-flight pipeline doesn't read as a low "conversion".
  double? get conversionRate {
    final denom = closedLeads;
    if (denom <= 0) return null;
    return wonLeads / denom;
  }

  /// True when there is literally nothing to show (no leads and no
  /// conversations) — the page-level empty state.
  bool get isEmpty => totalLeads == 0 && totalConversations == 0;

  /// The largest daily lead count in the window (chart Y-axis scaling). 0 when
  /// the series is empty.
  int get peakDay =>
      leadsByDay.isEmpty ? 0 : leadsByDay.map((p) => p.count).reduce((a, b) => a > b ? a : b);

  /// Builds the dashboard from the raw CRM reads.
  ///
  /// [leads] / [conversations] are the lists from [Backend.crmListLeads] /
  /// [Backend.crmListConversations]; [pipeline] is [CrmOverview.pipeline].
  /// [windowDays] bounds the daily series (default 30); [now] is injectable for
  /// deterministic tests. Leads outside the window still count toward totals and
  /// breakdowns (those are not time-bounded) but only in-window days populate
  /// [leadsByDay].
  factory AnalyticsDashboard.from({
    required List<CrmLead> leads,
    required List<CrmConversation> conversations,
    required Map<String, int> pipeline,
    int windowDays = 30,
    DateTime? now,
  }) {
    final clock = now ?? DateTime.now();
    final window = windowDays < 1 ? 1 : windowDays;

    // ── Daily series (local calendar days, zero-filled across the window) ──────
    final today = DateTime(clock.year, clock.month, clock.day);
    final counts = <DateTime, int>{};
    for (final l in leads) {
      final c = l.createdAt;
      if (c == null) continue;
      final local = c.toLocal();
      final day = DateTime(local.year, local.month, local.day);
      // Only days within [today-(window-1) .. today] populate the chart.
      final ageDays = today.difference(day).inDays;
      if (ageDays < 0 || ageDays > window - 1) continue;
      counts[day] = (counts[day] ?? 0) + 1;
    }
    final byDay = <LeadDayPoint>[];
    for (var i = window - 1; i >= 0; i--) {
      final day = today.subtract(Duration(days: i));
      byDay.add(LeadDayPoint(day: day, count: counts[day] ?? 0));
    }

    // ── Breakdowns ────────────────────────────────────────────────────────────
    final bySource = _breakdown(leads.map((l) => l.source));
    final byProvider = _breakdown(leads.map((l) => l.provider));
    final byService = _breakdown(conversations.map((c) => c.intent));

    // ── Conversations / handling ──────────────────────────────────────────────
    final open = conversations.where((c) => c.status == 'open').length;
    final takeovers = conversations.where((c) => !c.botEnabled).length;
    final bot = conversations.where((c) => c.botEnabled).length;

    return AnalyticsDashboard(
      totalLeads: leads.length,
      pipeline: Map.unmodifiable({
        'new': pipeline['new'] ?? 0,
        'contacted': pipeline['contacted'] ?? 0,
        'won': pipeline['won'] ?? 0,
        'lost': pipeline['lost'] ?? 0,
      }),
      leadsByDay: List.unmodifiable(byDay),
      leadsBySource: bySource,
      leadsByProvider: byProvider,
      leadsByService: byService,
      totalConversations: conversations.length,
      openConversations: open,
      humanTakeovers: takeovers,
      botActive: bot,
      windowDays: window,
    );
  }

  /// Counts non-null values (bucketing empty/null under [unknownKey]) and
  /// returns rows sorted largest-first with their real share of the total.
  /// Returns an empty list when there is nothing to count.
  static List<CountBreakdown> _breakdown(Iterable<String?> values) {
    final counts = <String, int>{};
    var total = 0;
    for (final raw in values) {
      final v = (raw == null || raw.trim().isEmpty) ? unknownKey : raw.trim();
      counts[v] = (counts[v] ?? 0) + 1;
      total++;
    }
    if (total == 0) return const [];
    final rows = counts.entries
        .map((e) => CountBreakdown(
              key: e.key,
              count: e.value,
              share: e.value / total,
            ))
        .toList()
      ..sort((a, b) {
        final byCount = b.count.compareTo(a.count);
        if (byCount != 0) return byCount;
        // Stable, deterministic tiebreak so tests/order never flicker. Push the
        // unknown bucket last among equal counts.
        if (a.key == unknownKey) return 1;
        if (b.key == unknownKey) return -1;
        return a.key.compareTo(b.key);
      });
    return List.unmodifiable(rows);
  }
}
