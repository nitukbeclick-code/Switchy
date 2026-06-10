import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/savings_summary.dart';
import '../../services/renewal_report.dart';

/// A whole-app savings dashboard: total potential, the biggest opportunity, a
/// per-category breakdown, near renewals, and what the user has already saved.
class SavingsWidget extends StatelessWidget {
  const SavingsWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final summary = computeSavings(appState);
    final top = summary.topOpportunity;
    final personalized = appState.billsPersonalized;

    // Tracked plans with a real saver available (near or not).
    final renewals = appState.myPlans
        .map((tp) => (tp: tp, saver: RenewalReport.bestSaver(tp, appState)))
        .where((e) => e.saver != null)
        .toList();

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: _Hero(
              total: summary.totalAnnualPotential,
              hasBill: summary.hasAnyBill,
              personalized: appState.billsPersonalized,
              ffTheme: ffTheme,
              onBack: () => context.safePop(),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Already saved with us
                  if (appState.totalSavings > 0) ...[
                    _RealizedCard(amount: appState.totalSavings, ffTheme: ffTheme)
                        .animate().fadeIn(duration: 300.ms),
                    const SizedBox(height: 16),
                  ],

                  // Biggest opportunity
                  if (top != null && top.best != null) ...[
                    _TopOpportunityCard(
                      saving: top.annualSaving,
                      categoryName: categoryById(top.categoryId)?.name ?? top.categoryId,
                      providerAndPlan: '${top.best!.plan.provider} · ${top.best!.plan.plan}',
                      personalized: personalized,
                      ffTheme: ffTheme,
                      onTap: () => context.pushNamed('PlanDetail',
                          pathParameters: {'planId': top.best!.plan.id}),
                    ).animate().fadeIn(duration: 320.ms).slideY(begin: 0.08),
                    const SizedBox(height: 20),
                  ],

                  // Donut: potential annual saving split by category (real values).
                  if (summary.opportunities.isNotEmpty) ...[
                    _PotentialDonutCard(
                      opportunities: summary.opportunities,
                      total: summary.totalAnnualPotential,
                      personalized: personalized,
                      ffTheme: ffTheme,
                    ).animate().fadeIn(duration: 340.ms).slideY(begin: 0.06),
                    const SizedBox(height: 16),
                  ],

                  // Progress bar: potential vs already-realized savings.
                  if (summary.totalAnnualPotential > 0 || appState.totalSavings > 0) ...[
                    _ProgressCard(
                      potential: summary.totalAnnualPotential,
                      realized: appState.totalSavings,
                      personalized: personalized,
                      ffTheme: ffTheme,
                    ).animate(delay: 60.ms).fadeIn(duration: 340.ms).slideY(begin: 0.06),
                    const SizedBox(height: 20),
                  ],

                  // Per-category breakdown
                  Text('לפי קטגוריה', style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  ...summary.categories.asMap().entries.map((e) {
                    final cs = e.value;
                    final cat = categoryById(cs.categoryId);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _CategoryRow(
                        saving: cs,
                        icon: cat?.icon ?? '•',
                        name: cat?.name ?? cs.categoryId,
                        personalized: personalized,
                        ffTheme: ffTheme,
                        onTap: () {
                          appState.setCategory(cs.categoryId);
                          if (cs.hasBill) {
                            context.pushNamed('Results');
                          } else {
                            context.pushNamed('Bills');
                          }
                        },
                      ).animate(delay: (e.key * 50 + 80).ms).fadeIn(duration: 260.ms),
                    );
                  }),

                  // Renewals
                  if (renewals.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text('חידושים מתקרבים', style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 10),
                    ...renewals.map((e) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _RenewalRow(
                            provider: e.tp.provider,
                            planName: e.tp.planName,
                            saving: e.saver!.annualSaving,
                            days: e.tp.daysUntilRenewal,
                            ffTheme: ffTheme,
                            onTap: () => context.pushNamed('RenewalReport',
                                pathParameters: {'trackedId': e.tp.id}),
                          ),
                        )),
                  ],

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Hero ────────────────────────────────────────────────────────────────────

class _Hero extends StatelessWidget {
  const _Hero({required this.total, required this.hasBill, required this.personalized, required this.ffTheme, required this.onBack});
  final int total;
  final bool hasBill;
  final bool personalized;
  final AppTheme ffTheme;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: ffTheme.primaryDark),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white, size: 20),
                    tooltip: 'חזרה',
                    onPressed: onBack,
                  ),
                  Text('החיסכון שלי',
                      style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                  const Spacer(),
                  if (personalized && total > 0)
                    IconButton(
                      icon: const Icon(Icons.ios_share_rounded, color: Colors.white, size: 22),
                      tooltip: 'שתף את החיסכון',
                      onPressed: () => Share.share(
                        'גיליתי שאפשר לחסוך עד ₪$total בשנה על חשבונות התקשורת — בדקו גם אתם עם חוסך',
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Center(
                child: Column(
                  children: [
                    Text(
                      hasBill ? 'חיסכון פוטנציאלי שנתי' : 'גלו כמה אפשר לחסוך',
                      style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.6)),
                    ),
                    const SizedBox(height: 6),
                    TweenAnimationBuilder<int>(
                      tween: IntTween(begin: 0, end: total),
                      duration: const Duration(milliseconds: 1400),
                      curve: Curves.easeOutCubic,
                      builder: (_, value, __) => Text(
                        hasBill ? '₪$value' : '₪—',
                        style: ffTheme.displaySmall.copyWith(
                            color: ffTheme.secondary, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      personalized
                          ? 'לפי המסלולים שאנחנו ממליצים'
                          : 'הערכה — עדכנו את החשבונות שלכם לחישוב מדויק',
                      style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.55)),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Realized savings ────────────────────────────────────────────────────────

class _RealizedCard extends StatelessWidget {
  const _RealizedCard({required this.amount, required this.ffTheme});
  final int amount;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ffTheme.success.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.success.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.savings_rounded, color: ffTheme.success, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Text('כבר חסכת ₪$amount דרך חוסך',
                style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ── Top opportunity ─────────────────────────────────────────────────────────

class _TopOpportunityCard extends StatelessWidget {
  const _TopOpportunityCard({
    required this.saving,
    required this.categoryName,
    required this.providerAndPlan,
    required this.personalized,
    required this.ffTheme,
    required this.onTap,
  });
  final int saving;
  final String categoryName;
  final String providerAndPlan;
  final bool personalized;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ffTheme.secondary,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(Icons.rocket_launch_outlined, size: 30, color: ffTheme.primaryDark),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('ההזדמנות הכי גדולה שלך · $categoryName',
                      style: GoogleFonts.assistant(
                          fontSize: 12, fontWeight: FontWeight.w700, color: ffTheme.primaryDark)),
                  const SizedBox(height: 2),
                  Text(personalized ? 'חיסכון של ₪$saving בשנה' : 'חיסכון מוערך של ~₪$saving בשנה',
                      style: GoogleFonts.rubik(
                          fontSize: 18, fontWeight: FontWeight.w800, color: ffTheme.primaryDark)),
                  const SizedBox(height: 2),
                  Text(providerAndPlan,
                      style: GoogleFonts.assistant(
                          fontSize: 12, fontWeight: FontWeight.w600, color: ffTheme.primaryDark),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            Icon(Icons.arrow_back_ios_rounded, size: 16, color: ffTheme.primaryDark),
          ],
        ),
      ),
    );
  }
}

// ── Potential donut (by category) ───────────────────────────────────────────

class _PotentialDonutCard extends StatelessWidget {
  const _PotentialDonutCard({
    required this.opportunities,
    required this.total,
    required this.personalized,
    required this.ffTheme,
  });
  final List<CategorySaving> opportunities;
  final int total;
  final bool personalized;
  final AppTheme ffTheme;

  // A formal monochrome ramp (ink → grey → light) so multi-category slices stay
  // legible in greyscale without any colour. Assigned by index; wraps cleanly if
  // there are ever more slices than ramp steps.
  static const List<Color> _ramp = [
    Color(0xFF111827), // ink black
    Color(0xFF374151), // slate
    Color(0xFF6B7280), // grey
    Color(0xFF9CA3AF), // light grey
    Color(0xFFCBD2D9), // pale grey
  ];

  Color _sliceColor(int i, CategorySaving cs) => _ramp[i % _ramp.length];

  @override
  Widget build(BuildContext context) {
    final sections = <PieChartSectionData>[];
    for (var i = 0; i < opportunities.length; i++) {
      final cs = opportunities[i];
      sections.add(PieChartSectionData(
        value: cs.annualSaving.toDouble(),
        color: _sliceColor(i, cs),
        radius: 26,
        showTitle: false,
      ));
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.glassDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('פוטנציאל לפי קטגוריה',
                  style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              if (!personalized)
                _EstimateChip(ffTheme: ffTheme),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              // Donut with the total in the hole.
              SizedBox(
                width: 116,
                height: 116,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    PieChart(
                      PieChartData(
                        sections: sections,
                        sectionsSpace: 2,
                        centerSpaceRadius: 32,
                        startDegreeOffset: -90,
                      ),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(personalized ? '₪$total' : '~₪$total',
                            style: GoogleFonts.rubik(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: ffTheme.primaryText)),
                        Text('לשנה',
                            style: ffTheme.labelSmall
                                .copyWith(color: ffTheme.secondaryText)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              // Legend.
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < opportunities.length; i++)
                      Padding(
                        padding: EdgeInsets.only(
                            bottom: i == opportunities.length - 1 ? 0 : 8),
                        child: _LegendRow(
                          color: _sliceColor(i, opportunities[i]),
                          name: categoryById(opportunities[i].categoryId)?.name ??
                              opportunities[i].categoryId,
                          amount: opportunities[i].annualSaving,
                          personalized: personalized,
                          ffTheme: ffTheme,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  const _LegendRow({
    required this.color,
    required this.name,
    required this.amount,
    required this.personalized,
    required this.ffTheme,
  });
  final Color color;
  final String name;
  final int amount;
  final bool personalized;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 11,
          height: 11,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.25), width: 0.5),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(name,
              style: ffTheme.bodySmall.copyWith(
                  color: ffTheme.primaryText, fontWeight: FontWeight.w600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ),
        const SizedBox(width: 6),
        Text(personalized ? '₪$amount' : '~₪$amount',
            style: ffTheme.labelMedium
                .copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w800)),
      ],
    );
  }
}

// ── Potential vs realized progress ──────────────────────────────────────────

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({
    required this.potential,
    required this.realized,
    required this.personalized,
    required this.ffTheme,
  });
  final int potential;
  final int realized;
  final bool personalized;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    // Scale both bars to the larger of the two so the chart is always honest.
    final maxVal = (potential > realized ? potential : realized).toDouble();
    final safeMax = maxVal <= 0 ? 1.0 : maxVal;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.glassDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('פוטנציאל מול מומש',
                  style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              if (!personalized && potential > 0) _EstimateChip(ffTheme: ffTheme),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 150,
            child: BarChart(
              BarChartData(
                alignment: BarChartAlignment.spaceEvenly,
                maxY: safeMax * 1.18,
                minY: 0,
                // Tap a bar to read its exact value (parity with the bills chart).
                // The values are also always shown in the _ValueTag row below, so
                // the data never relies on the chart alone.
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => ffTheme.primaryDark,
                    getTooltipItem: (group, groupIndex, rod, rodIndex) => BarTooltipItem(
                      '₪${rod.toY.round()}',
                      ffTheme.labelMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 26,
                      getTitlesWidget: (value, meta) {
                        final label = value == 0 ? 'פוטנציאל' : 'מומש';
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(label,
                              style: ffTheme.labelSmall.copyWith(
                                  color: ffTheme.secondaryText,
                                  fontWeight: FontWeight.w700)),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  // Two-step ink ramp: slate for the potential, full ink for what
                  // was realised — clearly distinct in greyscale.
                  _bar(0, potential.toDouble(), ffTheme.tertiary, ffTheme),
                  _bar(1, realized.toDouble(), ffTheme.primary, ffTheme),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _ValueTag(
                  label: 'פוטנציאל',
                  text: potential > 0
                      ? (personalized ? '₪$potential' : '~₪$potential')
                      : '—',
                  color: ffTheme.tertiary,
                  ffTheme: ffTheme),
              _ValueTag(
                  label: 'כבר נחסך',
                  text: realized > 0 ? '₪$realized' : '—',
                  color: ffTheme.primary,
                  ffTheme: ffTheme),
            ],
          ),
          if (realized == 0) ...[
            const SizedBox(height: 8),
            Text('עוד לא מומש חיסכון — כל מעבר נספר כאן',
                style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
          ],
        ],
      ),
    );
  }

  BarChartGroupData _bar(int x, double y, Color color, AppTheme t) {
    return BarChartGroupData(
      x: x,
      barRods: [
        BarChartRodData(
          toY: y,
          width: 46,
          color: color,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
        ),
      ],
    );
  }
}

class _ValueTag extends StatelessWidget {
  const _ValueTag({
    required this.label,
    required this.text,
    required this.color,
    required this.ffTheme,
  });
  final String label;
  final String text;
  final Color color;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(text,
            style: GoogleFonts.rubik(
                fontSize: 17, fontWeight: FontWeight.w800, color: color)),
        const SizedBox(height: 2),
        Text(label, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
      ],
    );
  }
}

class _EstimateChip extends StatelessWidget {
  const _EstimateChip({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: ffTheme.accent2,
        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
      ),
      child: Text('הערכה',
          style: ffTheme.labelSmall.copyWith(
              color: ffTheme.secondaryText, fontWeight: FontWeight.w700)),
    );
  }
}

// ── Category row ────────────────────────────────────────────────────────────

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.saving,
    required this.icon,
    required this.name,
    required this.personalized,
    required this.ffTheme,
    required this.onTap,
  });
  final CategorySaving saving;
  final String icon;
  final String name;
  final bool personalized;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final has = saving.hasBill;
    final opportunity = saving.hasOpportunity;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
        ),
        child: Row(
          children: [
            Text(icon, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                  Text(
                    has ? 'משלם ₪${saving.currentBill}/חודש' : 'לא הוזן חשבון',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ),
            if (opportunity)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: ffTheme.secondary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(personalized ? '₪${saving.annualSaving}/שנה' : '~₪${saving.annualSaving}/שנה',
                    style: GoogleFonts.rubik(
                        fontSize: 12, fontWeight: FontWeight.w800, color: ffTheme.primaryDark)),
              )
            else if (has)
              Text('מעולה — מחיר תחרותי',
                  style: ffTheme.labelSmall.copyWith(color: ffTheme.success, fontWeight: FontWeight.w600))
            else
              Row(
                children: [
                  Text('הזן חשבון',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                  Icon(Icons.chevron_left_rounded, size: 16, color: ffTheme.primary),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

// ── Renewal row ─────────────────────────────────────────────────────────────

class _RenewalRow extends StatelessWidget {
  const _RenewalRow({
    required this.provider,
    required this.planName,
    required this.saving,
    required this.days,
    required this.ffTheme,
    required this.onTap,
  });
  final String provider;
  final String planName;
  final int saving;
  final int? days;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
        ),
        child: Row(
          children: [
            Icon(Icons.alarm_rounded, color: ffTheme.warning, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$provider · $planName',
                      style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(
                    days == null
                        ? 'חוסך ₪$saving/שנה במעבר'
                        : days! < 0
                            ? 'המבצע הסתיים — חוסך ₪$saving/שנה'
                            : 'מסתיים בעוד $days ימים — חוסך ₪$saving/שנה',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_left_rounded, size: 18, color: ffTheme.secondaryText),
          ],
        ),
      ),
    );
  }
}
