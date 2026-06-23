import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/nav.dart';
import '../../data.dart' show categoryById;
import '../../services/analytics_dashboard.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart' show appBackend;
import '../../theme/app_theme.dart';
import '../../widgets/empty_state.dart';
import '../crm/crm_widget.dart' show leadStatusLabel, leadStatusColor;

/// Owner analytics — a real, admin-only dashboard with two tabs.
///
/// Tab 1 (משפך): the sales funnel, aggregated by [AnalyticsDashboard] from the
/// SAME admin-gated CRM reads the [CrmWidget] already uses
/// ([Backend.crmListLeads], [Backend.crmListConversations],
/// [Backend.crmOverview]) — no new tables, no fabricated numbers.
///
/// Tab 2 (אירועים וביקורת): owner observability — per-day analytics-event counts,
/// agent tool-call success rates, recent security_audit_log counts, and cron
/// health, all from the admin-gated `admin-metrics` edge function
/// ([Backend.fetchAdminMetrics]).
///
/// Across both tabs, a metric with no underlying rows shows an honest empty
/// state; nothing is estimated. The pages only render; the funnel math lives in
/// the pure [AnalyticsDashboard] service so it unit-tests without a widget.
///
/// Reached from the admin "ניהול לקוחות" area and route-gated to admins in
/// `router.dart`, exactly like /crm.
class AnalyticsWidget extends StatelessWidget {
  const AnalyticsWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: t.background,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_forward_ios_rounded, size: 20),
            tooltip: 'חזרה',
            onPressed: () => context.safePop(),
          ),
          title: const Text('דשבורד אנליטיקס'),
          bottom: TabBar(
            indicatorColor: t.brandAccent,
            labelColor: t.brandAccentText,
            unselectedLabelColor: t.secondaryText,
            labelStyle: t.labelLarge.copyWith(fontWeight: FontWeight.w800),
            tabs: const [
              Tab(text: 'משפך'),
              Tab(text: 'אירועים וביקורת'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _FunnelTab(),
            _EventsAuditTab(),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 1 — sales funnel (the original dashboard body)
// ═══════════════════════════════════════════════════════════════════════════

class _FunnelTab extends StatefulWidget {
  const _FunnelTab();

  @override
  State<_FunnelTab> createState() => _FunnelTabState();
}

class _FunnelTabState extends State<_FunnelTab>
    with AutomaticKeepAliveClientMixin {
  AnalyticsDashboard? _data;
  bool _loading = true;
  Object? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      // The exact reads the CRM screen makes — admin-gated server-side.
      final results = await Future.wait([
        appBackend.crmListLeads(),
        appBackend.crmListConversations(),
        appBackend.crmOverview(),
      ]);
      final leads = results[0] as List<CrmLead>;
      final conversations = results[1] as List<CrmConversation>;
      final overview = results[2] as CrmOverview;
      final data = AnalyticsDashboard.from(
        leads: leads,
        conversations: conversations,
        pipeline: overview.pipeline,
      );
      if (!mounted) return;
      setState(() {
        _data = data;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // keep-alive
    final t = AppTheme.of(context);
    return _body(t);
  }

  Widget _body(AppTheme t) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _data == null) {
      return EmptyState(
        icon: Icons.cloud_off_rounded,
        headline: 'לא הצלחנו לטעון',
        subtitle: 'בדקו את החיבור ונסו שוב.',
        ctaLabel: 'נסו שוב',
        onCtaTap: _load,
      );
    }
    final data = _data!;
    if (data.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          children: const [
            SizedBox(height: 80),
            EmptyState(
              icon: Icons.insights_rounded,
              headline: 'אין עדיין נתונים',
              subtitle:
                  'ברגע שיגיעו לידים ושיחות וואטסאפ, מדדי המשפך יופיעו כאן — בלי הערכות, רק מספרים אמיתיים.',
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
        children: [
          _MethodologyNote(t: t),
          const SizedBox(height: 16),

          // ── Headline KPI cards ──
          _KpiGrid(data: data, t: t)
              .animate()
              .fadeIn(duration: 300.ms)
              .slideY(begin: 0.06, end: 0),
          const SizedBox(height: 24),

          // ── Leads over time ──
          _SectionTitle(text: 'לידים לאורך זמן', t: t),
          const SizedBox(height: 8),
          _Card(
            t: t,
            child: data.totalLeads == 0 || data.peakDay == 0
                ? _InlineEmpty(
                    t: t,
                    icon: Icons.show_chart_rounded,
                    text:
                        'אין עדיין לידים עם תאריך יצירה ב-${data.windowDays} הימים האחרונים.',
                  )
                : _LeadsTimeChart(data: data, t: t),
          ).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── Pipeline / conversion ──
          _SectionTitle(text: 'צבר לידים והמרה', t: t),
          const SizedBox(height: 8),
          _PipelineCard(data: data, t: t).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── By source / channel ──
          _SectionTitle(text: 'לידים לפי ערוץ', t: t),
          const SizedBox(height: 8),
          _BreakdownCard(
            t: t,
            rows: data.leadsBySource,
            labelOf: _sourceLabel,
            emptyText: 'אין נתוני ערוץ עדיין.',
            barColor: t.brandAccent,
          ).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── By desired service ──
          _SectionTitle(text: 'לפי שירות מבוקש', t: t),
          const SizedBox(height: 8),
          _BreakdownCard(
            t: t,
            rows: data.leadsByService,
            labelOf: _serviceLabel,
            emptyText: 'אין נתוני שירות מבוקש (מגיע משיחות וואטסאפ).',
            barColor: t.info,
          ).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── By provider ──
          _SectionTitle(text: 'לפי ספק מבוקש', t: t),
          const SizedBox(height: 8),
          _BreakdownCard(
            t: t,
            rows: data.leadsByProvider,
            labelOf: _providerLabel,
            emptyText: 'אין נתוני ספק עדיין.',
            barColor: t.primary,
          ).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── WhatsApp handling ──
          _SectionTitle(text: 'טיפול בשיחות וואטסאפ', t: t),
          const SizedBox(height: 8),
          _HandlingCard(data: data, t: t).animate().fadeIn(duration: 320.ms),
        ],
      ),
    );
  }

  // ── Label maps (honest: provider names as stored; service via the catalogue) ──

  static String _sourceLabel(String key) {
    if (key == unknownKey) return 'לא ידוע';
    return switch (key) {
      'whatsapp' => 'וואטסאפ',
      'form' => 'טופס',
      'plan' => 'דף מסלול',
      'compare' => 'השוואה',
      'advisor' => 'יועץ AI',
      'callback' => 'בקשת חזרה',
      'porting' => 'ניוד',
      'home' => 'דף הבית',
      _ => key,
    };
  }

  static String _serviceLabel(String key) {
    if (key == unknownKey) return 'לא ידוע';
    return categoryById(key)?.name ?? key;
  }

  static String _providerLabel(String key) =>
      key == unknownKey ? 'לא ידוע' : key;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 2 — events & audit (owner observability from the admin-metrics edge fn)
// ═══════════════════════════════════════════════════════════════════════════

class _EventsAuditTab extends StatefulWidget {
  const _EventsAuditTab();

  @override
  State<_EventsAuditTab> createState() => _EventsAuditTabState();
}

class _EventsAuditTabState extends State<_EventsAuditTab>
    with AutomaticKeepAliveClientMixin {
  AdminMetrics? _data;
  bool _loading = true;
  Object? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      // Admin-gated server-side, exactly like the funnel's CRM reads.
      final data = await appBackend.fetchAdminMetrics();
      if (!mounted) return;
      setState(() {
        _data = data;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // keep-alive
    final t = AppTheme.of(context);
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _data == null) {
      return EmptyState(
        icon: Icons.cloud_off_rounded,
        headline: 'לא הצלחנו לטעון',
        subtitle: 'בדקו את החיבור ונסו שוב.',
        ctaLabel: 'נסו שוב',
        onCtaTap: _load,
      );
    }
    final data = _data!;
    if (data.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          children: const [
            SizedBox(height: 80),
            EmptyState(
              icon: Icons.monitor_heart_outlined,
              headline: 'אין עדיין נתוני תצפית',
              subtitle:
                  'ברגע שיתועדו אירועים, קריאות-כלי, רישומי אבטחה ומשימות מתוזמנות — הם יופיעו כאן. רק מספרים אמיתיים מהשרת, ללא הערכות.',
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
        children: [
          _ObservabilityNote(t: t),
          const SizedBox(height: 16),

          // ── Headline KPIs ──
          _ObsKpiGrid(data: data, t: t)
              .animate()
              .fadeIn(duration: 300.ms)
              .slideY(begin: 0.06, end: 0),
          const SizedBox(height: 24),

          // ── Analytics events over time ──
          _SectionTitle(text: 'אירועי אנליטיקס לאורך זמן', t: t),
          const SizedBox(height: 8),
          _Card(
            t: t,
            child: data.eventsByDay.isEmpty || data.totalEvents == 0
                ? _InlineEmpty(
                    t: t,
                    icon: Icons.show_chart_rounded,
                    text:
                        'אין עדיין אירועי אנליטיקס ב-${data.windowDays} הימים האחרונים.',
                  )
                : _EventsTimeChart(data: data, t: t),
          ).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── Agent tool-call success rates ──
          _SectionTitle(text: 'הצלחת קריאות-כלי של הסוכן', t: t),
          const SizedBox(height: 8),
          _ToolCallsCard(data: data, t: t).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── Security audit log ──
          _SectionTitle(text: 'יומן ביקורת אבטחה', t: t),
          const SizedBox(height: 8),
          _AuditCard(data: data, t: t).animate().fadeIn(duration: 320.ms),
          const SizedBox(height: 24),

          // ── Cron health ──
          _SectionTitle(text: 'בריאות משימות מתוזמנות', t: t),
          const SizedBox(height: 8),
          _CronCard(data: data, t: t).animate().fadeIn(duration: 320.ms),
        ],
      ),
    );
  }
}

class _ObservabilityNote extends StatelessWidget {
  const _ObservabilityNote({required this.t});
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.info.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(t.radiusMd),
        border: Border.all(color: t.info.withValues(alpha: 0.20)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, size: 18, color: t.info),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'נתוני תצפית מהשרת בלבד (admin-metrics, מאובטח לאדמין). מדד ללא רישומים יוצג כריק — ללא הערכות.',
              style: t.bodySmall
                  .copyWith(color: t.primaryText, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _ObsKpiGrid extends StatelessWidget {
  const _ObsKpiGrid({required this.data, required this.t});
  final AdminMetrics data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final rate = data.overallToolSuccessRate;
    final cron = data.cron;
    // Real "needs attention" count = stale + failing jobs, server-derived.
    final attention = cron.stale.length + cron.failing.length;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: [
        _Kpi(
          t: t,
          label: 'אירועים',
          value: '${data.totalEvents}',
          subtitle: 'ב-${data.windowDays} ימים',
          icon: Icons.bolt_rounded,
          tint: t.brandAccent,
        ),
        _Kpi(
          t: t,
          label: 'קריאות-כלי',
          value: '${data.totalToolCalls}',
          subtitle: '${data.totalToolErrors} שגיאות',
          icon: Icons.build_circle_rounded,
          tint: t.info,
        ),
        _Kpi(
          t: t,
          label: 'שיעור הצלחה',
          // Honest '—' when nothing was called; never a fabricated 100%.
          value: rate == null ? '—' : '${(rate * 100).round()}%',
          subtitle: rate == null ? 'אין קריאות' : 'כל הכלים',
          icon: Icons.verified_rounded,
          tint: t.saving,
        ),
        _Kpi(
          t: t,
          label: 'רישומי אבטחה',
          value: '${data.totalAuditEvents}',
          subtitle: cron.isUnknown
              ? 'אין נתוני cron'
              : (attention > 0
                  ? '$attention משימות בעיה'
                  : 'משימות תקינות'),
          icon: Icons.gpp_good_rounded,
          tint: attention > 0 ? t.error : t.brandAccentDark,
        ),
      ],
    );
  }
}

// ── Analytics events bar chart (mirrors the funnel's leads-over-time chart) ──

class _EventsTimeChart extends StatelessWidget {
  const _EventsTimeChart({required this.data, required this.t});
  final AdminMetrics data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final points = data.eventsByDay;
    final peak =
        points.map((p) => p.events).fold<int>(0, (a, b) => a > b ? a : b);
    final maxY = peak.toDouble();
    final tickEvery = (points.length / 6).ceil().clamp(1, points.length);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('${data.windowDays} הימים האחרונים',
                style: t.labelMedium.copyWith(
                    color: t.secondaryText, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text('שיא: $peak ביום',
                style: t.labelSmall.copyWith(color: t.secondaryText)),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 168,
          child: Semantics(
            label:
                'גרף אירועי אנליטיקס יומי על פני ${data.windowDays} ימים. שיא של $peak אירועים ביום.',
            child: BarChart(
              BarChartData(
                alignment: BarChartAlignment.spaceBetween,
                maxY: maxY * 1.2,
                minY: 0,
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => t.primaryDark,
                    getTooltipItem: (group, _, rod, __) {
                      final p = points[group.x];
                      return BarTooltipItem(
                        '${rod.toY.round()} אירועים\n${_dayLabel(p.day)}',
                        t.labelSmall.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700),
                      );
                    },
                  ),
                ),
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: maxY <= 4 ? 1 : (maxY / 4).ceilToDouble(),
                  getDrawingHorizontalLine: (_) => FlLine(
                    color: t.lineColor.withValues(alpha: 0.5),
                    strokeWidth: 1,
                  ),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 30,
                      interval: maxY <= 4 ? 1 : (maxY / 4).ceilToDouble(),
                      getTitlesWidget: (value, meta) {
                        if (value != value.roundToDouble()) {
                          return const SizedBox.shrink();
                        }
                        return Text('${value.round()}',
                            style: t.labelSmall.copyWith(
                                color: t.secondaryText, fontSize: 10));
                      },
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 24,
                      getTitlesWidget: (value, meta) {
                        final i = value.round();
                        if (i < 0 || i >= points.length) {
                          return const SizedBox.shrink();
                        }
                        if (i % tickEvery != 0) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(_shortDay(points[i].day),
                              style: t.labelSmall.copyWith(
                                  color: t.secondaryText, fontSize: 10)),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < points.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: points[i].events.toDouble(),
                          width: points.length > 20 ? 5 : 9,
                          color: t.info,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(4)),
                        ),
                      ],
                    ),
                ],
              ),
              // One-shot grow-up on first paint; no looping animation.
              swapAnimationDuration: const Duration(milliseconds: 600),
              swapAnimationCurve: t.easeOut,
            ),
          ),
        ),
      ],
    );
  }

  String _shortDay(DateTime d) => '${d.day}/${d.month}';
  String _dayLabel(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';
}

// ── Agent tool-call success rates ──

class _ToolCallsCard extends StatelessWidget {
  const _ToolCallsCard({required this.data, required this.t});
  final AdminMetrics data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final rows = data.toolCalls.byTool;
    if (rows.isEmpty) {
      return _Card(
        t: t,
        child: _InlineEmpty(
          t: t,
          icon: Icons.build_rounded,
          text: 'אין עדיין קריאות-כלי בחלון הדיווח.',
        ),
      );
    }
    final overall = data.overallToolSuccessRate;
    // Busiest tools first — a real ordering from the server, kept stable.
    final sorted = [...rows]..sort((a, b) => b.calls.compareTo(a.calls));
    return _Card(
      t: t,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('כל הכלים',
                  style: t.labelMedium.copyWith(
                      color: t.secondaryText, fontWeight: FontWeight.w700)),
              const Spacer(),
              Text(
                overall == null
                    ? '${data.totalToolCalls} קריאות · —'
                    : '${data.totalToolCalls} קריאות · ${(overall * 100).round()}%',
                style: t.labelSmall.copyWith(color: t.secondaryText),
              ),
            ],
          ),
          const SizedBox(height: 14),
          for (var i = 0; i < sorted.length; i++) ...[
            _ToolRow(stat: sorted[i], t: t),
            if (i != sorted.length - 1) const SizedBox(height: 14),
          ],
        ],
      ),
    );
  }
}

class _ToolRow extends StatelessWidget {
  const _ToolRow({required this.stat, required this.t});
  final RateBucket stat;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final rate = stat.successRate;
    final pct = rate == null ? null : (rate * 100).round();
    final fill = (rate ?? 0).clamp(0.0, 1.0);
    // Green for healthy, amber under 90%, red under 70% — a real threshold map.
    final color = rate == null
        ? t.secondaryText
        : rate >= 0.9
            ? t.brandAccent
            : rate >= 0.7
                ? t.saving
                : t.error;
    return Semantics(
      label: pct == null
          ? '${stat.key}: אין קריאות'
          : '${stat.key}: ${stat.calls} קריאות, $pct אחוז הצלחה',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(stat.key,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodyMedium.copyWith(
                        fontWeight: FontWeight.w600,
                        fontFeatures: const [FontFeature.tabularFigures()])),
              ),
              const SizedBox(width: 8),
              Text('${stat.calls}',
                  style: t.titleSmall.copyWith(
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()])),
              const SizedBox(width: 6),
              Text(pct == null ? '· —' : '· $pct%',
                  style: t.labelSmall.copyWith(color: color)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(t.radiusPill),
            child: Stack(
              children: [
                Container(height: 8, color: t.lineColor.withValues(alpha: 0.5)),
                FractionallySizedBox(
                  widthFactor: fill == 0 ? 0.02 : fill,
                  child: Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(t.radiusPill),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (stat.errors > 0)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('${stat.errors} שגיאות',
                  style: t.labelSmall.copyWith(color: t.secondaryText)),
            ),
        ],
      ),
    );
  }
}

// ── Security audit log breakdown ──

class _AuditCard extends StatelessWidget {
  const _AuditCard({required this.data, required this.t});
  final AdminMetrics data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final rows = data.audit.byEvent;
    if (rows.isEmpty) {
      return _Card(
        t: t,
        child: _InlineEmpty(
          t: t,
          icon: Icons.fact_check_outlined,
          text: 'אין רישומי ביקורת בחלון הדיווח.',
        ),
      );
    }
    final sorted = [...rows]..sort((a, b) => b.count.compareTo(a.count));
    final maxCount =
        sorted.map((r) => r.count).fold<int>(0, (a, b) => a > b ? a : b);
    return _Card(
      t: t,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < sorted.length; i++) ...[
            _AuditRow(
              row: sorted[i],
              maxCount: maxCount,
              t: t,
            ),
            if (i != sorted.length - 1) const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _AuditRow extends StatelessWidget {
  const _AuditRow({required this.row, required this.maxCount, required this.t});
  final AuditBucket row;
  final int maxCount;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final label = _auditLabel(row.event);
    final fill = maxCount <= 0 ? 0.0 : (row.count / maxCount).clamp(0.0, 1.0);
    return Semantics(
      label: '$label: ${row.count}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 8),
              Text('${row.count}',
                  style: t.titleSmall.copyWith(
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(t.radiusPill),
            child: Stack(
              children: [
                Container(height: 8, color: t.lineColor.withValues(alpha: 0.5)),
                FractionallySizedBox(
                  widthFactor: fill == 0 ? 0.02 : fill,
                  child: Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: t.brandAccentDark,
                      borderRadius: BorderRadius.circular(t.radiusPill),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Friendly Hebrew labels for the audit events the system actually logs
  // (security_audit_log). Unknown keys render verbatim (honest — we don't invent
  // a translation we don't have).
  static String _auditLabel(String key) => switch (key) {
        'crm_takeover' => 'נציג השתלט על שיחה',
        'takeover' => 'השתלטות נציג',
        'handback' => 'הוחזר לבוט',
        'status_change' => 'שינוי סטטוס',
        'community_content_flagged' => 'תוכן קהילה סומן',
        'analytics_purge' => 'ניקוי אנליטיקס',
        'analytics_events_deleted' => 'אירועי אנליטיקס נמחקו',
        'rep_reply' => 'מענה נציג',
        '(unknown)' => 'לא ידוע',
        _ => key,
      };
}

// ── Cron health ──
// The edge fn returns a CronSummary {ok, known, stale[], failing[]} — how many
// expected jobs are registered, plus the names that are stale (overdue) or
// failing. We render the overall verdict and then the problem jobs by name.
// When nothing is registered/observed (pg_cron not installed yet) we show an
// honest "unknown" empty state rather than implying all-healthy.

class _CronCard extends StatelessWidget {
  const _CronCard({required this.data, required this.t});
  final AdminMetrics data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final cron = data.cron;
    if (cron.isUnknown) {
      return _Card(
        t: t,
        child: _InlineEmpty(
          t: t,
          icon: Icons.schedule_rounded,
          text:
              'אין נתוני משימות מתוזמנות (pg_cron אינו פעיל או שאין משימות רשומות).',
        ),
      );
    }
    final allOk = cron.ok;
    final color = allOk ? t.brandAccent : t.error;
    return _Card(
      t: t,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            label: allOk
                ? '${cron.known} משימות רשומות, כולן תקינות'
                : '${cron.known} משימות רשומות, ${cron.stale.length} תקועות, ${cron.failing.length} נכשלו',
            child: Row(
              children: [
                Icon(
                  allOk
                      ? Icons.check_circle_outline_rounded
                      : Icons.error_outline_rounded,
                  size: 20,
                  color: color,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    allOk
                        ? 'כל המשימות תקינות'
                        : 'חלק מהמשימות דורשות טיפול',
                    style: t.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(t.radiusPill),
                    border: Border.all(color: color.withValues(alpha: 0.20)),
                  ),
                  child: Text(
                    '${cron.known} רשומות',
                    style: t.labelSmall
                        .copyWith(color: color, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
          if (cron.failing.isNotEmpty) ...[
            const SizedBox(height: 12),
            _CronProblemList(
              t: t,
              title: 'נכשלו',
              jobs: cron.failing,
              color: t.error,
              icon: Icons.cancel_outlined,
            ),
          ],
          if (cron.stale.isNotEmpty) ...[
            const SizedBox(height: 12),
            _CronProblemList(
              t: t,
              title: 'תקועות (לא רצו בזמן)',
              jobs: cron.stale,
              color: t.saving,
              icon: Icons.hourglass_bottom_rounded,
            ),
          ],
        ],
      ),
    );
  }
}

class _CronProblemList extends StatelessWidget {
  const _CronProblemList({
    required this.t,
    required this.title,
    required this.jobs,
    required this.color,
    required this.icon,
  });

  final AppTheme t;
  final String title;
  final List<String> jobs;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: t.labelSmall
                .copyWith(color: color, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        for (final job in jobs)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Semantics(
              label: '$title: $job',
              child: Row(
                children: [
                  Icon(icon, size: 16, color: color),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(job,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.bodyMedium.copyWith(
                            fontWeight: FontWeight.w600,
                            fontFeatures: const [
                              FontFeature.tabularFigures()
                            ])),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI grid
// ═══════════════════════════════════════════════════════════════════════════

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.data, required this.t});
  final AnalyticsDashboard data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final conv = data.conversionRate;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: [
        _Kpi(
          t: t,
          label: 'סה״כ לידים',
          value: '${data.totalLeads}',
          icon: Icons.group_rounded,
          tint: t.brandAccent,
        ),
        _Kpi(
          t: t,
          label: 'נסגרו בהצלחה',
          value: '${data.wonLeads}',
          icon: Icons.emoji_events_rounded,
          tint: t.saving,
        ),
        _Kpi(
          t: t,
          label: 'שיעור המרה',
          // Honest: '—' when nothing has closed yet (denominator 0), never a
          // fabricated percentage. Subtitle states the real basis.
          value: conv == null ? '—' : '${(conv * 100).round()}%',
          subtitle: conv == null
              ? 'טרם נסגרו לידים'
              : 'מתוך ${data.closedLeads} שנסגרו',
          icon: Icons.trending_up_rounded,
          tint: t.brandAccentDark,
        ),
        _Kpi(
          t: t,
          label: 'שיחות וואטסאפ',
          value: '${data.totalConversations}',
          subtitle: '${data.openConversations} פתוחות',
          icon: Icons.forum_rounded,
          tint: t.info,
        ),
      ],
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({
    required this.t,
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    this.subtitle,
  });

  final AppTheme t;
  final String label;
  final String value;
  final IconData icon;
  final Color tint;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label: $value${subtitle != null ? ', $subtitle' : ''}',
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: t.bentoDecoration(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: tint.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(t.radiusSm),
                    border: Border.all(color: tint.withValues(alpha: 0.18)),
                  ),
                  child: Icon(icon, size: 19, color: tint),
                ),
                const Spacer(),
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      value,
                      style: GoogleFonts.rubik(
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        color: t.primaryText,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: t.labelMedium.copyWith(
                        color: t.secondaryText, fontWeight: FontWeight.w700)),
                if (subtitle != null)
                  Text(subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.labelSmall.copyWith(color: t.secondaryText)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Leads-over-time bar chart
// ═══════════════════════════════════════════════════════════════════════════

class _LeadsTimeChart extends StatelessWidget {
  const _LeadsTimeChart({required this.data, required this.t});
  final AnalyticsDashboard data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final points = data.leadsByDay;
    final maxY = data.peakDay.toDouble();
    // Show at most ~8 date ticks so the axis stays legible on a phone.
    final tickEvery = (points.length / 6).ceil().clamp(1, points.length);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('${data.windowDays} הימים האחרונים',
                style: t.labelMedium
                    .copyWith(color: t.secondaryText, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text('שיא: ${data.peakDay} ביום',
                style: t.labelSmall.copyWith(color: t.secondaryText)),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 168,
          child: Semantics(
            label:
                'גרף לידים יומי על פני ${data.windowDays} ימים. שיא של ${data.peakDay} לידים ביום.',
            child: BarChart(
              BarChartData(
                alignment: BarChartAlignment.spaceBetween,
                maxY: maxY * 1.2,
                minY: 0,
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => t.primaryDark,
                    getTooltipItem: (group, _, rod, __) {
                      final p = points[group.x];
                      return BarTooltipItem(
                        '${rod.toY.round()} לידים\n${_dayLabel(p.day)}',
                        t.labelSmall.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700),
                      );
                    },
                  ),
                ),
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: maxY <= 4 ? 1 : (maxY / 4).ceilToDouble(),
                  getDrawingHorizontalLine: (_) => FlLine(
                    color: t.lineColor.withValues(alpha: 0.5),
                    strokeWidth: 1,
                  ),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 28,
                      interval: maxY <= 4 ? 1 : (maxY / 4).ceilToDouble(),
                      getTitlesWidget: (value, meta) {
                        if (value != value.roundToDouble()) {
                          return const SizedBox.shrink();
                        }
                        return Text('${value.round()}',
                            style: t.labelSmall
                                .copyWith(color: t.secondaryText, fontSize: 10));
                      },
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 24,
                      getTitlesWidget: (value, meta) {
                        final i = value.round();
                        if (i < 0 || i >= points.length) {
                          return const SizedBox.shrink();
                        }
                        if (i % tickEvery != 0) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(_shortDay(points[i].day),
                              style: t.labelSmall.copyWith(
                                  color: t.secondaryText, fontSize: 10)),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < points.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: points[i].count.toDouble(),
                          width: points.length > 20 ? 5 : 9,
                          color: t.brandAccent,
                          borderRadius:
                              const BorderRadius.vertical(top: Radius.circular(4)),
                        ),
                      ],
                    ),
                ],
              ),
              // One-shot grow-up on first paint; no looping animation.
              swapAnimationDuration: const Duration(milliseconds: 600),
              swapAnimationCurve: t.easeOut,
            ),
          ),
        ),
      ],
    );
  }

  String _shortDay(DateTime d) => '${d.day}/${d.month}';
  String _dayLabel(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline + conversion
// ═══════════════════════════════════════════════════════════════════════════

class _PipelineCard extends StatelessWidget {
  const _PipelineCard({required this.data, required this.t});
  final AnalyticsDashboard data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    const order = ['new', 'contacted', 'won', 'lost'];
    final total = order.fold<int>(0, (s, k) => s + (data.pipeline[k] ?? 0));
    return _Card(
      t: t,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Proportional stacked bar of the four statuses (real counts).
          if (total > 0)
            ClipRRect(
              borderRadius: BorderRadius.circular(t.radiusPill),
              child: SizedBox(
                height: 14,
                child: Row(
                  children: [
                    for (final k in order)
                      if ((data.pipeline[k] ?? 0) > 0)
                        Expanded(
                          flex: data.pipeline[k]!,
                          child: ColoredBox(color: leadStatusColor(k, t)),
                        ),
                  ],
                ),
              ),
            ),
          if (total > 0) const SizedBox(height: 16),
          for (final k in order) ...[
            _PipelineRow(
              label: leadStatusLabel(k),
              count: data.pipeline[k] ?? 0,
              total: total,
              color: leadStatusColor(k, t),
              t: t,
            ),
            if (k != order.last) const SizedBox(height: 10),
          ],
          if (total == 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('אין עדיין לידים בצבר.',
                  style: t.bodySmall.copyWith(color: t.secondaryText)),
            ),
        ],
      ),
    );
  }
}

class _PipelineRow extends StatelessWidget {
  const _PipelineRow({
    required this.label,
    required this.count,
    required this.total,
    required this.color,
    required this.t,
  });

  final String label;
  final int count;
  final int total;
  final Color color;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final pct = total == 0 ? 0 : (count / total * 100).round();
    return Semantics(
      label: '$label: $count${total > 0 ? ', $pct אחוז' : ''}',
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label,
                style: t.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
          ),
          if (total > 0)
            Text('$pct%',
                style: t.labelSmall.copyWith(color: t.secondaryText)),
          const SizedBox(width: 10),
          Text('$count',
              style: t.titleSmall.copyWith(
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()])),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Generic horizontal-bar breakdown (source / service / provider)
// ═══════════════════════════════════════════════════════════════════════════

class _BreakdownCard extends StatelessWidget {
  const _BreakdownCard({
    required this.t,
    required this.rows,
    required this.labelOf,
    required this.emptyText,
    required this.barColor,
  });

  final AppTheme t;
  final List<CountBreakdown> rows;
  final String Function(String key) labelOf;
  final String emptyText;
  final Color barColor;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return _Card(
        t: t,
        child: _InlineEmpty(t: t, icon: Icons.bar_chart_rounded, text: emptyText),
      );
    }
    // Cap the visible rows so a long tail doesn't dominate; aggregate the rest
    // honestly into an "אחר" row (still real counts).
    const maxRows = 6;
    final visible = rows.take(maxRows).toList();
    final rest = rows.skip(maxRows).toList();
    final restCount = rest.fold<int>(0, (s, r) => s + r.count);
    final restShare = rest.fold<double>(0, (s, r) => s + r.share);
    final maxShare =
        rows.map((r) => r.share).fold<double>(0, (a, b) => a > b ? a : b);

    return _Card(
      t: t,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < visible.length; i++) ...[
            _BreakdownRow(
              label: labelOf(visible[i].key),
              count: visible[i].count,
              share: visible[i].share,
              maxShare: maxShare,
              color: barColor,
              t: t,
            ),
            if (i != visible.length - 1 || restCount > 0)
              const SizedBox(height: 12),
          ],
          if (restCount > 0)
            _BreakdownRow(
              label: 'אחר',
              count: restCount,
              share: restShare,
              maxShare: maxShare,
              color: t.secondaryText,
              t: t,
            ),
        ],
      ),
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({
    required this.label,
    required this.count,
    required this.share,
    required this.maxShare,
    required this.color,
    required this.t,
  });

  final String label;
  final int count;
  final double share;
  final double maxShare;
  final Color color;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final pct = (share * 100).round();
    // Bar length is relative to the largest row (so the leader fills the track),
    // but the printed figure is the true share — the visual never overstates.
    final fill = maxShare <= 0 ? 0.0 : (share / maxShare).clamp(0.0, 1.0);
    return Semantics(
      label: '$label: $count לידים, $pct אחוז',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 8),
              Text('$count',
                  style: t.titleSmall.copyWith(
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()])),
              const SizedBox(width: 6),
              Text('· $pct%',
                  style: t.labelSmall.copyWith(color: t.secondaryText)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(t.radiusPill),
            child: Stack(
              children: [
                Container(height: 8, color: t.lineColor.withValues(alpha: 0.5)),
                FractionallySizedBox(
                  widthFactor: fill == 0 ? 0.02 : fill,
                  child: Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(t.radiusPill),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp handling card (bot vs human takeover)
// ═══════════════════════════════════════════════════════════════════════════

class _HandlingCard extends StatelessWidget {
  const _HandlingCard({required this.data, required this.t});
  final AnalyticsDashboard data;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    final total = data.totalConversations;
    if (total == 0) {
      return _Card(
        t: t,
        child: _InlineEmpty(
          t: t,
          icon: Icons.support_agent_rounded,
          text: 'אין עדיין שיחות וואטסאפ.',
        ),
      );
    }
    return _Card(
      t: t,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  t: t,
                  label: 'מטופלות ע״י הבוט',
                  value: '${data.botActive}',
                  icon: Icons.smart_toy_rounded,
                  tint: t.info,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MiniStat(
                  t: t,
                  label: 'נציג השתלט',
                  value: '${data.humanTakeovers}',
                  icon: Icons.headset_mic_rounded,
                  tint: t.saving,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(t.radiusPill),
            child: SizedBox(
              height: 12,
              child: Row(
                children: [
                  if (data.botActive > 0)
                    Expanded(
                      flex: data.botActive,
                      child: ColoredBox(color: t.info),
                    ),
                  if (data.humanTakeovers > 0)
                    Expanded(
                      flex: data.humanTakeovers,
                      child: ColoredBox(color: t.saving),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '${data.openConversations} שיחות פתוחות מתוך $total סה״כ.',
            style: t.bodySmall.copyWith(color: t.secondaryText),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.t,
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
  });

  final AppTheme t;
  final String label;
  final String value;
  final IconData icon;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label: $value',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(t.radiusMd),
          border: Border.all(color: tint.withValues(alpha: 0.18)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: tint),
            const SizedBox(height: 10),
            Text(value,
                style: GoogleFonts.rubik(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: t.primaryText,
                  fontFeatures: const [FontFeature.tabularFigures()],
                )),
            Text(label,
                style: t.labelSmall
                    .copyWith(color: t.secondaryText, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared bits
// ═══════════════════════════════════════════════════════════════════════════

class _MethodologyNote extends StatelessWidget {
  const _MethodologyNote({required this.t});
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.brandAccentTint,
        borderRadius: BorderRadius.circular(t.radiusMd),
        border: Border.all(color: t.brandAccent.withValues(alpha: 0.18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_outlined, size: 18, color: t.brandAccentText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'כל המספרים כאן נספרים מנתוני ה-CRM האמיתיים (לידים ושיחות) — ללא הערכות. מדד ללא נתונים יוצג כריק.',
              style: t.bodySmall
                  .copyWith(color: t.brandAccentText, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.text, required this.t});
  final String text;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: t.brandAccent,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(text,
            style: t.titleMedium.copyWith(fontWeight: FontWeight.w800)),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.t, required this.child});
  final AppTheme t;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: t.bentoDecoration(),
      child: child,
    );
  }
}

class _InlineEmpty extends StatelessWidget {
  const _InlineEmpty({required this.t, required this.icon, required this.text});
  final AppTheme t;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Row(
        children: [
          Icon(icon, size: 22, color: t.secondaryText),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text,
                style: t.bodySmall.copyWith(color: t.secondaryText)),
          ),
        ],
      ),
    );
  }
}
