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
import '../../services/analytics_service.dart';

/// A whole-app savings dashboard: total potential, the biggest opportunity, a
/// per-category breakdown, near renewals, and what the user has already saved.
class SavingsWidget extends StatefulWidget {
  const SavingsWidget({super.key});

  @override
  State<SavingsWidget> createState() => _SavingsWidgetState();
}

class _SavingsWidgetState extends State<SavingsWidget> {
  @override
  void initState() {
    super.initState();
    // Funnel beacon — once per view of the savings dashboard. Fire-and-forget.
    AnalyticsService.track(AnalyticsEvent.savingsViewed);
  }

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
              // Not-yet-personalized → a green ACTION cue straight into the bills
              // flow so the estimate hero converts instead of dead-ending.
              onStart: appState.billsPersonalized ? null : () => context.pushNamed('Bills'),
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
                  _SectionHeader(title: 'לפי קטגוריה', ffTheme: ffTheme),
                  const SizedBox(height: 10),
                  ...summary.categories.asMap().entries.map((e) {
                    final cs = e.value;
                    final cat = categoryById(cs.categoryId);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _CategoryRow(
                        saving: cs,
                        catId: cs.categoryId,
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
                    _SectionHeader(title: 'חידושים מתקרבים', ffTheme: ffTheme),
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
  const _Hero({required this.total, required this.hasBill, required this.personalized, required this.ffTheme, required this.onBack, this.onStart});
  final int total;
  final bool hasBill;
  final bool personalized;
  final AppTheme ffTheme;
  final VoidCallback onBack;
  final VoidCallback? onStart; // shown only in the not-personalized estimate state

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        // The premium ink hero: a soft top-right→bottom-left wash with a lifted
        // shadow so it reads as the page's "premium" surface, not a flat block.
        gradient: ffTheme.brandGradient,
        boxShadow: ffTheme.shadowSoft,
      ),
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
                        'גיליתי שאפשר לחסוך עד ₪$total בשנה על חשבונות התקשורת — בדקו גם אתם עם Switchy AI',
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
                            // Amber VALUE for a real figure; a legible white-alpha
                            // dash for the placeholder (the old `secondary` token
                            // went dark slate on dark, vanishing on the ink hero).
                            color: hasBill ? ffTheme.saving : Colors.white.withValues(alpha: 0.45),
                            fontWeight: FontWeight.bold,
                            // Fixed-width digits — the count-up doesn't jitter sideways.
                            fontFeatures: const [FontFeature.tabularFigures()]),
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
                    if (onStart != null) ...[
                      const SizedBox(height: 16),
                      Semantics(
                        button: true,
                        label: 'עדכנו חשבונות לחישוב מדויק',
                        child: GestureDetector(
                          onTap: onStart,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
                            decoration: BoxDecoration(
                              // Green ACTION pill — the one conversion cue on the
                              // estimate hero, with its accent glow.
                              gradient: ffTheme.accentGradient,
                              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                              boxShadow: ffTheme.shadowAccent,
                            ),
                            child: Text('עדכנו חשבונות לחישוב מדויק ←',
                                style: ffTheme.titleSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ),
                    ],
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

// ── Section header ──────────────────────────────────────────────────────────

/// A section title with a short leading accent bar (green ACTION rule) for a
/// crisp, scannable hierarchy down the dashboard.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.ffTheme});
  final String title;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: ffTheme.primary,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(title, style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
      ],
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
    // "Already saved" is a realised win — render it in the green ACTION tint so
    // it reads as money in the bank, distinct from the amber "potential" figures.
    // The figure itself uses the AA-safe green text token (the fill hue is too
    // light as small text); the surface/icon use the brand green.
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ffTheme.brandAccent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: ffTheme.brandAccent.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.savings_rounded, color: ffTheme.brandAccent, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700),
                children: [
                  const TextSpan(text: 'כבר חסכת '),
                  TextSpan(
                      text: '₪$amount',
                      style: ffTheme.titleSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w800)),
                  const TextSpan(text: ' דרך Switchy AI'),
                ],
              ),
            ),
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
    final savingText =
        personalized ? 'חיסכון של ₪$saving בשנה' : 'חיסכון מוערך של ~₪$saving בשנה';
    // The headline opportunity is a VALUE moment — wash it in the amber savings
    // tint with a matching hairline so the figure reads as money, not chrome.
    return Semantics(
      button: true,
      label: 'ההזדמנות הכי גדולה: $categoryName, $savingText. הצג מסלול',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          splashColor: ffTheme.saving.withValues(alpha: 0.12),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: ffTheme.saving.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
            ),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: ffTheme.saving.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(Icons.rocket_launch_rounded, size: 24, color: ffTheme.savingDark),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('ההזדמנות הכי גדולה שלך · $categoryName',
                          style: ffTheme.labelMedium
                              .copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 3),
                      Text(savingText,
                          style: GoogleFonts.rubik(
                              fontSize: 19, fontWeight: FontWeight.w800, color: ffTheme.savingDark)),
                      const SizedBox(height: 2),
                      Text(providerAndPlan,
                          style: ffTheme.bodySmall.copyWith(
                              color: ffTheme.primaryText, fontWeight: FontWeight.w600),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                Icon(Icons.arrow_back_ios_rounded, size: 16, color: ffTheme.savingDark),
              ],
            ),
          ),
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
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return Container(
      padding: const EdgeInsets.all(18),
      // Premium bento tile — the donut is an anchor data surface, so it gets the
      // generous corner + soft elevation rather than the flat list glass.
      decoration: ffTheme.bentoDecoration(),
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
              // Donut with the total in the hole. The slices sweep in clockwise
              // from 12 o'clock (a `t`-driven startDegreeOffset rotation paired
              // with a grow on radius) so the chart "draws itself".
              SizedBox(
                width: 116,
                height: 116,
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: reduceMotion ? 1 : 0, end: 1),
                  duration: const Duration(milliseconds: 1100),
                  curve: ffTheme.easeOut,
                  builder: (_, t, __) {
                    final sections = <PieChartSectionData>[];
                    for (var i = 0; i < opportunities.length; i++) {
                      final cs = opportunities[i];
                      sections.add(PieChartSectionData(
                        value: cs.annualSaving.toDouble(),
                        color: _sliceColor(i, cs),
                        // Radius eases up as the sweep completes for a subtle grow.
                        radius: 20 + 6 * t,
                        showTitle: false,
                      ));
                    }
                    return Stack(
                      alignment: Alignment.center,
                      children: [
                        PieChart(
                          PieChartData(
                            sections: sections,
                            sectionsSpace: 2,
                            centerSpaceRadius: 32,
                            // Sweep clockwise: start fully rotated back, settle at -90°.
                            startDegreeOffset: -90 - 360 * (1 - t),
                          ),
                        ),
                        Opacity(
                          opacity: t,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(personalized ? '₪$total' : '~₪$total',
                                  style: GoogleFonts.rubik(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                      color: ffTheme.savingText)),
                              Text('לשנה',
                                  style: ffTheme.labelSmall
                                      .copyWith(color: ffTheme.secondaryText)),
                            ],
                          ),
                        ),
                      ],
                    );
                  },
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
                .copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800)),
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
      padding: const EdgeInsets.all(18),
      // Premium bento tile — the potential-vs-realized chart anchors the page.
      decoration: ffTheme.bentoDecoration(),
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
              // Bars grow up from the baseline on first paint.
              swapAnimationDuration: const Duration(milliseconds: 650),
              swapAnimationCurve: ffTheme.easeOut,
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
    required this.catId,
    required this.name,
    required this.personalized,
    required this.ffTheme,
    required this.onTap,
  });
  final CategorySaving saving;
  final String catId;
  final String name;
  final bool personalized;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final has = saving.hasBill;
    final opportunity = saving.hasOpportunity;
    final hint = opportunity
        ? 'אפשר לחסוך ${personalized ? '' : 'כ'}₪${saving.annualSaving} בשנה'
        : has
            ? 'מחיר תחרותי'
            : 'הזן חשבון';
    return Semantics(
      button: true,
      label: '$name. $hint',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          child: Container(
            padding: const EdgeInsets.all(15),
            // Premium card hairline (low-opacity ink) + soft shadow, replacing
            // the old full-strength border.
            decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                  ),
                  child: Icon(categoryIconData(catId), size: 20, color: ffTheme.primaryText),
                ),
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
                      color: ffTheme.saving.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(personalized ? '₪${saving.annualSaving}/שנה' : '~₪${saving.annualSaving}/שנה',
                        style: GoogleFonts.rubik(
                            fontSize: 12, fontWeight: FontWeight.w800, color: ffTheme.savingText)),
                  )
                else if (has)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check_circle_rounded, size: 14, color: ffTheme.primary),
                      const SizedBox(width: 4),
                      Text('מחיר תחרותי',
                          style: ffTheme.labelSmall
                              .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                    ],
                  )
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
    final timing = days == null
        ? null
        : days! < 0
            ? 'המבצע הסתיים'
            : 'מסתיים בעוד $days ימים';
    return Semantics(
      button: true,
      label: '$provider $planName. ${timing == null ? '' : '$timing, '}חוסך ₪$saving בשנה במעבר',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          child: Container(
            padding: const EdgeInsets.all(15),
            // Premium card hairline + soft shadow, replacing the old border.
            decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: ffTheme.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                  ),
                  child: Icon(Icons.alarm_rounded, color: ffTheme.warning, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('$provider · $planName',
                          style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (timing != null) ...[
                            Flexible(
                              child: Text(timing,
                                  style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                            ),
                            Text(' · ', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                          ],
                          Text('חוסך ₪$saving/שנה',
                              style: ffTheme.labelSmall.copyWith(
                                  color: ffTheme.savingText, fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_left_rounded, size: 18, color: ffTheme.secondaryText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
