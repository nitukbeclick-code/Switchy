// Route: GoRoute(path: '/admin', name: 'Admin', builder: (_, __) => const AdminDashboardWidget())
// Add admin role guard before navigating: only show link in Account page for admin users

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart' show Plan;
import '../../services/backend/local_backend.dart' show appBackend;
import '../../services/savings_summary.dart' show computeSavings;
import '../../theme/app_theme.dart';

class AdminDashboardWidget extends StatefulWidget {
  const AdminDashboardWidget({super.key});

  @override
  State<AdminDashboardWidget> createState() => _AdminDashboardWidgetState();
}

class _AdminDashboardWidgetState extends State<AdminDashboardWidget> {
  int _refreshKey = 0;

  void _refresh() => setState(() => _refreshKey++);

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final theme = AppTheme.of(context);

    return Scaffold(
      backgroundColor: const Color(0xFF0B0F14),
      appBar: AppBar(
        backgroundColor: const Color(0xFF111827),
        elevation: 0,
        centerTitle: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'לוח בקרה',
                  style: theme.titleLarge.copyWith(color: Colors.white, fontSize: 20),
                ),
                const SizedBox(width: 6),
                const ExcludeSemantics(
                  child: Icon(Icons.dashboard_rounded, color: Colors.white, size: 18),
                ),
              ],
            ),
            Text(
              'נתוני עסק בזמן אמת',
              style: theme.labelSmall.copyWith(color: Colors.white54, fontSize: 11),
            ),
          ],
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _refresh,
        backgroundColor: AppColors.brandAccent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.refresh_rounded),
        label: Text('רענן נתונים', style: theme.labelLarge.copyWith(color: Colors.white)),
      ),
      body: SingleChildScrollView(
        key: ValueKey(_refreshKey),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _MetricsGrid(appState: appState, theme: theme),
            const SizedBox(height: 24),
            _LeadPipeline(appState: appState, theme: theme),
            const SizedBox(height: 24),
            _SavingsOpportunity(appState: appState, theme: theme),
            const SizedBox(height: 24),
            _MostWatchedPlans(appState: appState, theme: theme),
            const SizedBox(height: 24),
            _PriceManager(theme: theme, onChanged: _refresh),
            const SizedBox(height: 24),
            _RecentActivityFeed(appState: appState, theme: theme),
            const SizedBox(height: 100),
          ],
        ),
      ),
    );
  }
}

// ── Section 1 — Key Metrics 2×2 grid ─────────────────────────────────────────

class _MetricsGrid extends StatelessWidget {
  const _MetricsGrid({required this.appState, required this.theme});
  final AppState appState;
  final AppTheme theme;

  @override
  Widget build(BuildContext context) {
    final hasLead = appState.leadPlanId != null;
    final trackedCount = appState.myPlans.length;
    final hasMeeting = appState.bookedMeeting != null;
    final postsCount = appState.communityPosts.length;

    final metrics = [
      _MetricData(
        icon: Icons.people_alt_rounded,
        label: 'לידים פעילים',
        value: hasLead ? '1' : '0',
        sub: hasLead ? 'ניוד בתהליך' : 'ממתין לליד',
      ),
      _MetricData(
        icon: Icons.video_call_rounded,
        label: 'פגישות',
        value: hasMeeting ? '1' : '0',
        sub: hasMeeting ? 'פגישה קבועה' : 'אין פגישה',
      ),
      _MetricData(
        icon: Icons.track_changes_rounded,
        label: 'תוכניות עקובות',
        value: '$trackedCount',
        sub: 'מסלולי רדאר',
      ),
      _MetricData(
        icon: Icons.forum_rounded,
        label: 'חברי קהילה',
        value: '$postsCount',
        sub: 'פוסטים בקהילה',
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'מדדים מרכזיים',
          style: theme.titleMedium.copyWith(color: Colors.white70),
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.4,
          ),
          itemCount: metrics.length,
          itemBuilder: (context, i) {
            return _MetricCard(data: metrics[i], theme: theme)
                .animate(delay: (i * 80).ms)
                .fadeIn(duration: 320.ms)
                .slideY(begin: 0.12, end: 0, duration: 320.ms, curve: Curves.easeOutCubic);
          },
        ),
      ],
    );
  }
}

class _MetricData {
  const _MetricData({
    required this.icon,
    required this.label,
    required this.value,
    required this.sub,
  });
  final IconData icon;
  final String label;
  final String value;
  final String sub;
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.data, required this.theme});
  final _MetricData data;
  final AppTheme theme;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${data.label}: ${data.value}, ${data.sub}',
      child: Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A2030),
        borderRadius: BorderRadius.circular(theme.radiusLg),
        border: Border.all(color: AppColors.brandAccent.withValues(alpha: 0.25)),
        boxShadow: [
          BoxShadow(
            color: AppColors.brandAccent.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              ExcludeSemantics(
                child: Icon(data.icon, color: AppColors.brandAccent, size: 22),
              ),
              Text(
                data.value,
                style: theme.displaySmall.copyWith(
                  color: AppColors.brandAccent,
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                data.label,
                style: theme.titleSmall.copyWith(color: Colors.white, fontSize: 13),
              ),
              const SizedBox(height: 2),
              Text(
                data.sub,
                style: theme.labelSmall.copyWith(color: Colors.white38, fontSize: 10),
              ),
            ],
          ),
        ],
      ),
      ),
    );
  }
}

// ── Section 2 — Lead Pipeline ─────────────────────────────────────────────────

class _LeadPipeline extends StatelessWidget {
  const _LeadPipeline({required this.appState, required this.theme});
  final AppState appState;
  final AppTheme theme;

  static const _stages = [
    'שלח טופס',
    'ניוד בתהליך',
    'אושר',
    'אצל נציג',
    'הושלם',
  ];

  @override
  Widget build(BuildContext context) {
    final currentStep = appState.trackerStep.clamp(0, 4);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A2030),
        borderRadius: BorderRadius.circular(theme.radiusLg),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.timeline_rounded, color: AppColors.brandAccent, size: 20),
              const SizedBox(width: 8),
              Text(
                'צינור לידים',
                style: theme.titleMedium.copyWith(color: Colors.white),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.brandAccent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(theme.radiusPill),
                ),
                child: Text(
                  'שלב ${currentStep + 1}/5',
                  style: theme.labelSmall.copyWith(color: AppColors.brandAccent),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          // Funnel steps
          ...List.generate(_stages.length, (i) {
            final isActive = i <= currentStep;
            final isCurrent = i == currentStep;
            final stageCount = isActive ? 1 : 0;

            return _PipelineStep(
              index: i,
              label: _stages[i],
              count: stageCount,
              isActive: isActive,
              isCurrent: isCurrent,
              theme: theme,
            ).animate(delay: (i * 60).ms).fadeIn(duration: 280.ms).slideX(
                  begin: 0.1,
                  end: 0,
                  duration: 280.ms,
                  curve: Curves.easeOutCubic,
                );
          }),
        ],
      ),
    );
  }
}

class _PipelineStep extends StatelessWidget {
  const _PipelineStep({
    required this.index,
    required this.label,
    required this.count,
    required this.isActive,
    required this.isCurrent,
    required this.theme,
  });
  final int index;
  final String label;
  final int count;
  final bool isActive;
  final bool isCurrent;
  final AppTheme theme;

  @override
  Widget build(BuildContext context) {
    final barWidth = (1.0 - index * 0.14).clamp(0.4, 1.0);
    final activeColor = isCurrent ? AppColors.brandAccent : (isActive ? AppColors.brandAccent.withValues(alpha: 0.55) : Colors.white12);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          // Step number
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isActive ? AppColors.brandAccent : Colors.white12,
            ),
            child: Center(
              child: Text(
                '${index + 1}',
                style: theme.labelSmall.copyWith(
                  color: isActive ? Colors.white : Colors.white38,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Label
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: theme.bodySmall.copyWith(
                color: isActive ? Colors.white.withValues(alpha: 0.87) : Colors.white38,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Bar
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return Stack(
                  children: [
                    Container(
                      height: 8,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    FractionallySizedBox(
                      widthFactor: isActive ? barWidth : 0,
                      child: Container(
                        height: 8,
                        decoration: BoxDecoration(
                          color: activeColor,
                          borderRadius: BorderRadius.circular(4),
                          boxShadow: isCurrent
                              ? [BoxShadow(color: AppColors.brandAccent.withValues(alpha: 0.4), blurRadius: 8)]
                              : null,
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          const SizedBox(width: 8),
          // Count badge
          Container(
            width: 28,
            alignment: Alignment.center,
            child: Text(
              '$count',
              style: theme.labelMedium.copyWith(
                color: isActive ? Colors.white70 : Colors.white24,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Section 3 — Savings Opportunity ──────────────────────────────────────────

class _SavingsOpportunity extends StatelessWidget {
  const _SavingsOpportunity({required this.appState, required this.theme});
  final AppState appState;
  final AppTheme theme;

  static const _catNames = {
    'cellular': 'סלולר',
    'internet': 'אינטרנט',
    'tv': 'טלוויזיה',
    'triple': 'חבילה משולבת',
    'abroad': 'חו"ל',
  };

  @override
  Widget build(BuildContext context) {
    final savings = computeSavings(appState);
    final total = savings.totalAnnualPotential;
    final opportunities = savings.opportunities;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A2030),
        borderRadius: BorderRadius.circular(theme.radiusLg),
        border: Border.all(color: AppColors.saving.withValues(alpha: 0.2)),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.savings_rounded, color: AppColors.saving, size: 20),
              const SizedBox(width: 8),
              Text('הזדמנות חיסכון', style: theme.titleMedium.copyWith(color: Colors.white)),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₪${_fmt(total)}',
                    style: theme.headlineSmall.copyWith(
                      color: AppColors.saving,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    'פוטנציאל שנתי כולל',
                    style: theme.labelSmall.copyWith(color: Colors.white38, fontSize: 10),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (opportunities.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'הכנס חשבונות נוכחיים כדי לראות הזדמנויות',
                  style: theme.bodySmall.copyWith(color: Colors.white38),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            ...List.generate(opportunities.length, (i) {
              final opp = opportunities[i];
              final catName = _catNames[opp.categoryId] ?? opp.categoryId;
              final maxSave = opportunities.first.annualSaving;
              final fraction = maxSave > 0 ? opp.annualSaving / maxSave : 0.0;

              return _SavingRow(
                label: catName,
                saving: opp.annualSaving,
                fraction: fraction,
                theme: theme,
              ).animate(delay: (i * 70).ms).fadeIn(duration: 280.ms).slideX(
                    begin: 0.08,
                    end: 0,
                    duration: 280.ms,
                    curve: Curves.easeOutCubic,
                  );
            }),
        ],
      ),
    );
  }

  String _fmt(int v) {
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toString();
  }
}

class _SavingRow extends StatelessWidget {
  const _SavingRow({
    required this.label,
    required this.saving,
    required this.fraction,
    required this.theme,
  });
  final String label;
  final int saving;
  final double fraction;
  final AppTheme theme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: theme.bodySmall.copyWith(color: Colors.white70, fontSize: 12),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Stack(
              children: [
                Container(
                  height: 8,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                FractionallySizedBox(
                  widthFactor: fraction.clamp(0.0, 1.0),
                  child: Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: AppColors.saving,
                      borderRadius: BorderRadius.circular(4),
                      boxShadow: [
                        BoxShadow(color: AppColors.saving.withValues(alpha: 0.4), blurRadius: 6),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 56,
            child: Text(
              '₪$saving/שנה',
              style: theme.labelSmall.copyWith(
                color: AppColors.saving,
                fontWeight: FontWeight.w700,
                fontSize: 10,
              ),
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Section 4 — Most Watched Plans ───────────────────────────────────────────

class _MostWatchedPlans extends StatelessWidget {
  const _MostWatchedPlans({required this.appState, required this.theme});
  final AppState appState;
  final AppTheme theme;

  static const _catIcons = {
    'cellular': Icons.smartphone_rounded,
    'internet': Icons.wifi_rounded,
    'tv': Icons.tv_rounded,
    'triple': Icons.home_rounded,
    'abroad': Icons.flight_takeoff_rounded,
  };

  static const _catNames = {
    'cellular': 'סלולר',
    'internet': 'אינטרנט',
    'tv': 'טלוויזיה',
    'triple': 'משולב',
    'abroad': 'חו"ל',
  };

  @override
  Widget build(BuildContext context) {
    final plans = appState.myPlans.take(5).toList();

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A2030),
        borderRadius: BorderRadius.circular(theme.radiusLg),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.visibility_rounded, color: AppColors.brandAccent, size: 20),
              const SizedBox(width: 8),
              Text('מסלולים עקובים', style: theme.titleMedium.copyWith(color: Colors.white)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white10,
                  borderRadius: BorderRadius.circular(theme.radiusPill),
                ),
                child: Text(
                  '${plans.length} מסלולים',
                  style: theme.labelSmall.copyWith(color: Colors.white54),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (plans.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'אין מסלולים עקובים עדיין',
                  style: theme.bodySmall.copyWith(color: Colors.white38),
                ),
              ),
            )
          else
            ...List.generate(plans.length, (i) {
              final plan = plans[i];
              final days = plan.daysUntilRenewal;
              final catIcon = _catIcons[plan.category] ?? Icons.category_rounded;
              final catName = _catNames[plan.category] ?? plan.category;
              final renewalText = days == null
                  ? 'תאריך לא ידוע'
                  : days < 0
                      ? 'חידוש עבר'
                      : days == 0
                          ? 'מחדש היום!'
                          : 'מחדש בעוד $days ימים';
              final renewalColor = days == null
                  ? Colors.white38
                  : days <= 7
                      ? AppColors.saving
                      : days <= 21
                          ? Colors.orange
                          : Colors.white38;

              return _WatchedPlanRow(
                index: i,
                icon: catIcon,
                catName: catName,
                provider: plan.provider,
                planName: plan.planName,
                price: plan.monthlyPrice,
                renewalText: renewalText,
                renewalColor: renewalColor,
                joinedViaUs: plan.joinedViaUs,
                theme: theme,
              ).animate(delay: (i * 60).ms).fadeIn(duration: 260.ms).slideX(
                    begin: 0.06,
                    end: 0,
                    duration: 260.ms,
                    curve: Curves.easeOutCubic,
                  );
            }),
        ],
      ),
    );
  }
}

class _WatchedPlanRow extends StatelessWidget {
  const _WatchedPlanRow({
    required this.index,
    required this.icon,
    required this.catName,
    required this.provider,
    required this.planName,
    required this.price,
    required this.renewalText,
    required this.renewalColor,
    required this.joinedViaUs,
    required this.theme,
  });
  final int index;
  final IconData icon;
  final String catName;
  final String provider;
  final String planName;
  final int price;
  final String renewalText;
  final Color renewalColor;
  final bool joinedViaUs;
  final AppTheme theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(theme.radiusMd),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          // Rank
          SizedBox(
            width: 20,
            child: Text(
              '${index + 1}',
              style: theme.labelSmall.copyWith(color: Colors.white24, fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(width: 10),
          // Category icon
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.brandAccent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: AppColors.brandAccent, size: 18),
          ),
          const SizedBox(width: 12),
          // Plan info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      provider,
                      style: theme.titleSmall.copyWith(color: Colors.white, fontSize: 13),
                    ),
                    if (joinedViaUs) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: AppColors.saving.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'דרכנו',
                          style: theme.labelSmall.copyWith(
                            color: AppColors.saving,
                            fontSize: 9,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  planName,
                  style: theme.bodySmall.copyWith(color: Colors.white54, fontSize: 11),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Price + renewal
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₪$price$kBillUnit',
                style: theme.titleSmall.copyWith(
                  color: Colors.white.withValues(alpha: 0.87),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                renewalText,
                style: theme.labelSmall.copyWith(
                  color: renewalColor,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Section 5 — Recent Activity Feed ─────────────────────────────────────────

class _RecentActivityFeed extends StatelessWidget {
  const _RecentActivityFeed({required this.appState, required this.theme});
  final AppState appState;
  final AppTheme theme;

  @override
  Widget build(BuildContext context) {
    final posts = appState.communityPosts.take(5).toList();
    final hasSupportTicket = appState.supportTicketId != null;
    final hasMeeting = appState.bookedMeeting != null;
    final hasLead = appState.leadName != null;

    // Build activity items: support/lead/meeting events + community posts
    final activities = <_ActivityItem>[];

    if (hasLead) {
      activities.add(_ActivityItem(
        icon: Icons.person_add_rounded,
        color: AppColors.brandAccent,
        title: 'ליד חדש: ${appState.leadName ?? ""}',
        sub: 'מסלול: ${appState.leadProvider ?? ""} — שלב ${appState.trackerStep + 1}/5',
        ts: null,
      ));
    }

    if (hasMeeting) {
      final m = appState.bookedMeeting!;
      activities.add(_ActivityItem(
        icon: Icons.video_call_rounded,
        color: const Color(0xFF22C55E),
        title: 'פגישה קבועה',
        sub: '${m.meetingDate} ${m.slot}',
        ts: null,
      ));
    }

    if (hasSupportTicket) {
      activities.add(_ActivityItem(
        icon: Icons.support_agent_rounded,
        color: AppColors.saving,
        title: 'פנייה בתמיכה פתוחה',
        sub: 'מס׳ כרטיס: ${appState.supportTicketId}',
        ts: null,
      ));
    }

    for (final post in posts) {
      final ts = post['ts'] as String?;
      activities.add(_ActivityItem(
        icon: Icons.forum_rounded,
        color: Colors.white38,
        title: post['author'] as String? ?? 'משתמש',
        sub: (post['text'] as String? ?? '').take(60),
        ts: ts,
      ));
    }

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A2030),
        borderRadius: BorderRadius.circular(theme.radiusLg),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.bolt_rounded, color: AppColors.saving, size: 20),
              const SizedBox(width: 8),
              Text('פעילות אחרונה', style: theme.titleMedium.copyWith(color: Colors.white)),
            ],
          ),
          const SizedBox(height: 16),
          if (activities.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'אין פעילות אחרונה',
                  style: theme.bodySmall.copyWith(color: Colors.white38),
                ),
              ),
            )
          else
            ...List.generate(activities.length, (i) {
              final item = activities[i];
              final isLast = i == activities.length - 1;
              return _ActivityRow(
                item: item,
                isLast: isLast,
                theme: theme,
              ).animate(delay: (i * 55).ms).fadeIn(duration: 240.ms).slideY(
                    begin: 0.06,
                    end: 0,
                    duration: 240.ms,
                    curve: Curves.easeOutCubic,
                  );
            }),
        ],
      ),
    );
  }
}

class _ActivityItem {
  const _ActivityItem({
    required this.icon,
    required this.color,
    required this.title,
    required this.sub,
    required this.ts,
  });
  final IconData icon;
  final Color color;
  final String title;
  final String sub;
  final String? ts;
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({
    required this.item,
    required this.isLast,
    required this.theme,
  });
  final _ActivityItem item;
  final bool isLast;
  final AppTheme theme;

  String _relativeTime(String? iso) {
    if (iso == null) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'עכשיו';
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} ד׳';
    if (diff.inHours < 24) return 'לפני ${diff.inHours} שעות';
    if (diff.inDays < 7) return 'לפני ${diff.inDays} ימים';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline line + dot
          Column(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: item.color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                  border: Border.all(color: item.color.withValues(alpha: 0.3)),
                ),
                child: Icon(item.icon, color: item.color, size: 16),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 1,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    color: Colors.white10,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          // Content
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.title,
                          style: theme.titleSmall.copyWith(
                            color: Colors.white.withValues(alpha: 0.87),
                            fontSize: 13,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (item.ts != null)
                        Text(
                          _relativeTime(item.ts),
                          style: theme.labelSmall.copyWith(
                            color: Colors.white24,
                            fontSize: 10,
                          ),
                        ),
                    ],
                  ),
                  if (item.sub.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      item.sub,
                      style: theme.bodySmall.copyWith(
                        color: Colors.white38,
                        fontSize: 11,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── String extension — safe truncate ─────────────────────────────────────────

extension _StringX on String {
  String take(int n) => length <= n ? this : '${substring(0, n)}…';
}

// ── Section 6 — Price manager (admin price editing) ───────────────────────────
// Edit a plan's price → appBackend.updatePlanPrice → (Supabase: the plan_prices
// trigger logs it to the ledger; Local: in-memory override) → re-hydrate the
// catalogue so every screen + the price-history sparkline reflect it.

class _PriceManager extends StatefulWidget {
  const _PriceManager({required this.theme, required this.onChanged});
  final AppTheme theme;
  final VoidCallback onChanged;

  @override
  State<_PriceManager> createState() => _PriceManagerState();
}

class _PriceManagerState extends State<_PriceManager> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  bool _saving = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<Plan> get _matches {
    final q = _query.trim();
    if (q.isEmpty) return const [];
    return allPlans
        .where((p) => p.provider.contains(q) || p.plan.contains(q))
        .take(6)
        .toList();
  }

  Future<void> _edit(Plan plan) async {
    final t = widget.theme;
    final ctrl = TextEditingController(text: plan.priceText);
    final newPrice = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A2030),
        title: Text('עריכת מחיר', style: t.titleMedium.copyWith(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${plan.provider} · ${plan.plan}',
                style: t.bodySmall.copyWith(color: Colors.white60)),
            const SizedBox(height: 14),
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: t.titleLarge.copyWith(color: Colors.white),
              decoration: InputDecoration(
                prefixText: '₪ ',
                prefixStyle: t.titleLarge.copyWith(color: Colors.white70),
                filled: true,
                fillColor: Colors.white10,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('ביטול', style: t.labelLarge.copyWith(color: Colors.white54)),
          ),
          TextButton(
            onPressed: () {
              final v = double.tryParse(ctrl.text.trim().replaceAll(',', '.'));
              if (v != null && v > 0) Navigator.pop(ctx, v);
            },
            child: Text('שמור',
                style: t.labelLarge.copyWith(color: AppColors.brandAccent, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (newPrice == null) return;

    final isWhole = newPrice == newPrice.roundToDouble();
    setState(() => _saving = true);
    try {
      await appBackend.updatePlanPrice(
        plan.id,
        price: newPrice.round(),
        priceExact: isWhole ? null : newPrice,
      );
      // Refresh the effective catalogue from the source so every screen + the
      // history sparkline pick up the new price immediately.
      final fresh = await appBackend.fetchPlans();
      AppState().hydrateCatalogWith(fresh);
      if (!mounted) return;
      final shown = isWhole ? '${newPrice.round()}' : newPrice.toStringAsFixed(2);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('המחיר של ${plan.plan} עודכן ל-₪$shown')),
      );
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('עדכון נכשל: $e'), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.theme;
    final matches = _matches;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A2030),
        borderRadius: BorderRadius.circular(t.radiusLg),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.price_change_rounded, color: AppColors.brandAccent, size: 20),
              const SizedBox(width: 8),
              Text('ניהול מחירים', style: t.titleMedium.copyWith(color: Colors.white)),
              const Spacer(),
              if (_saving)
                const SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brandAccent),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(t.radiusPill)),
                  child: Text('${allPlans.length} מסלולים', style: t.labelSmall.copyWith(color: Colors.white54)),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text('עדכון מחיר מתעדכן לכל המשתמשים ונרשם בהיסטוריית המחירים',
              style: t.labelSmall.copyWith(color: Colors.white38)),
          const SizedBox(height: 14),
          TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _query = v),
            style: t.bodyMedium.copyWith(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'חיפוש מסלול או ספק…',
              hintStyle: t.bodyMedium.copyWith(color: Colors.white38),
              prefixIcon: const Icon(Icons.search_rounded, color: Colors.white38, size: 20),
              filled: true,
              fillColor: Colors.white10,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 12),
          if (_query.trim().isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text('הקלידו שם מסלול או ספק כדי לערוך מחיר',
                  style: t.bodySmall.copyWith(color: Colors.white38)),
            )
          else if (matches.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text('לא נמצאו מסלולים תואמים', style: t.bodySmall.copyWith(color: Colors.white38)),
            )
          else
            ...matches.map((p) => _priceRow(p, t)),
        ],
      ),
    );
  }

  Widget _priceRow(Plan p, AppTheme t) {
    return Semantics(
      button: true,
      label: 'ערוך מחיר ${p.plan} של ${p.provider}, מחיר נוכחי ${p.priceText} שקלים',
      child: InkWell(
        onTap: _saving ? null : () => _edit(p),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.plan,
                        style: t.bodyMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(p.provider, style: t.labelSmall.copyWith(color: Colors.white38)),
                  ],
                ),
              ),
              Text('₪${p.priceText}',
                  style: t.titleSmall.copyWith(color: AppColors.saving, fontWeight: FontWeight.w800)),
              const SizedBox(width: 8),
              const Icon(Icons.edit_rounded, color: Colors.white38, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}
