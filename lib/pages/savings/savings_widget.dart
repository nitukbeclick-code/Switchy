import 'dart:math' as math;
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

/// A whole-app savings dashboard: animated hero total, per-category breakdown,
/// a horizontal bar chart, near renewals, share CTA, and a future-milestone banner.
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
          // ── A: Animated hero total ────────────────────────────────────────
          SliverToBoxAdapter(
            child: _Hero(
              total: summary.totalAnnualPotential,
              hasBill: summary.hasAnyBill,
              personalized: personalized,
              ffTheme: ffTheme,
              onBack: () => context.safePop(),
              onShare: () => _doShare(summary.totalAnnualPotential),
              onGoToBills: () => context.pushNamed('Bills'),
            ),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Realized savings ──────────────────────────────────────
                  if (appState.totalSavings > 0) ...[
                    _RealizedCard(amount: appState.totalSavings, ffTheme: ffTheme)
                        .animate().fadeIn(duration: 300.ms),
                    const SizedBox(height: 16),
                  ],

                  // ── Biggest opportunity ───────────────────────────────────
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

                  // ── B: Per-category enhanced cards ────────────────────────
                  Text('לפי קטגוריה',
                      style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  ...summary.categories.asMap().entries.map((e) {
                    final cs = e.value;
                    final cat = categoryById(cs.categoryId);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _CategoryCard(
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
                      ).animate(delay: (e.key * 100).ms).fadeIn(duration: 280.ms).slideY(begin: 0.06),
                    );
                  }),

                  // ── C: Horizontal bar chart ───────────────────────────────
                  const SizedBox(height: 20),
                  _HorizBarChartCard(
                    categories: summary.categories,
                    personalized: personalized,
                    ffTheme: ffTheme,
                    onCategoryTap: (catId) {
                      appState.setCategory(catId);
                      context.pushNamed('Results');
                    },
                  ).animate(delay: 80.ms).fadeIn(duration: 340.ms).slideY(begin: 0.06),

                  // ── Potential vs realized progress ─────────────────────────
                  if (summary.totalAnnualPotential > 0 || appState.totalSavings > 0) ...[
                    const SizedBox(height: 16),
                    _ProgressCard(
                      potential: summary.totalAnnualPotential,
                      realized: appState.totalSavings,
                      personalized: personalized,
                      ffTheme: ffTheme,
                    ).animate(delay: 60.ms).fadeIn(duration: 340.ms).slideY(begin: 0.06),
                  ],

                  // ── Renewals ───────────────────────────────────────────────
                  if (renewals.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text('חידושים מתקרבים',
                        style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
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

                  // ── D: Share button ────────────────────────────────────────
                  const SizedBox(height: 24),
                  if (summary.totalAnnualPotential > 0)
                    _ShareButton(
                      total: summary.totalAnnualPotential,
                      ffTheme: ffTheme,
                    ).animate(delay: 120.ms).fadeIn(duration: 320.ms),

                  // ── E: Future milestone banner ─────────────────────────────
                  const SizedBox(height: 16),
                  _FutureMilestoneBanner(ffTheme: ffTheme)
                      .animate(delay: 160.ms).fadeIn(duration: 320.ms),

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _doShare(int total) {
    Share.share(
      'גיליתי שאני יכול לחסוך ₪$total בשנה על חבילות תקשורת! 🤑 בדוק גם אתה דרך חוסך: https://chosech.app',
    );
  }
}

// ── A: Hero ────────────────────────────────────────────────────────────────

class _Hero extends StatelessWidget {
  const _Hero({
    required this.total,
    required this.hasBill,
    required this.personalized,
    required this.ffTheme,
    required this.onBack,
    required this.onShare,
    required this.onGoToBills,
  });
  final int total;
  final bool hasBill;
  final bool personalized;
  final AppTheme ffTheme;
  final VoidCallback onBack;
  final VoidCallback onShare;
  final VoidCallback onGoToBills;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: ffTheme.primaryDark),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Nav row ─────────────────────────────────────────────────
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_forward_ios_rounded,
                        color: Colors.white, size: 20),
                    tooltip: 'חזרה',
                    onPressed: onBack,
                  ),
                  Text('החיסכון שלי',
                      style: GoogleFonts.rubik(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: Colors.white)),
                  const Spacer(),
                  if (personalized && total > 0)
                    Semantics(
                      button: true,
                      label: 'שתף את החיסכון',
                      child: IconButton(
                        icon: const Icon(Icons.ios_share_rounded,
                            color: Colors.white, size: 22),
                        tooltip: 'שתף את החיסכון',
                        onPressed: onShare,
                      ),
                    ),
                ],
              ),

              const SizedBox(height: 12),

              // ── Counter or empty state ─────────────────────────────────
              Center(
                child: hasBill
                    ? _CounterSection(
                        total: total, personalized: personalized, ffTheme: ffTheme)
                    : _EmptyHero(ffTheme: ffTheme, onGoToBills: onGoToBills),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Animated counter shown when the user has at least one bill entered.
class _CounterSection extends StatelessWidget {
  const _CounterSection({
    required this.total,
    required this.personalized,
    required this.ffTheme,
  });
  final int total;
  final bool personalized;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'הפוטנציאל לחיסכון השנתי שלך',
          style: ffTheme.labelMedium.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
              letterSpacing: 0.3),
        ),
        const SizedBox(height: 10),
        TweenAnimationBuilder<int>(
          tween: IntTween(begin: 0, end: total),
          duration: const Duration(milliseconds: 1500),
          curve: Curves.easeOutCubic,
          builder: (_, value, __) => Text(
            '₪$value',
            style: ffTheme.displaySmall.copyWith(
              color: AppColors.saving,
              fontWeight: FontWeight.w900,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'בשנה',
          style: GoogleFonts.rubik(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Colors.white.withValues(alpha: 0.75)),
        ),
        const SizedBox(height: 6),
        Text(
          personalized
              ? 'לפי המסלולים שאנחנו ממליצים'
              : 'הערכה — עדכנו את החשבונות שלכם לחישוב מדויק',
          style: ffTheme.bodySmall.copyWith(
              color: Colors.white.withValues(alpha: 0.5)),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

/// Empty state shown when no bills have been entered yet.
class _EmptyHero extends StatelessWidget {
  const _EmptyHero({required this.ffTheme, required this.onGoToBills});
  final AppTheme ffTheme;
  final VoidCallback onGoToBills;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          const SizedBox(height: 8),
          const Icon(Icons.savings_outlined, color: Colors.white54, size: 52),
          const SizedBox(height: 16),
          Text(
            'הכנס חשבונות כדי לחשב\nאת החיסכון שלך',
            style: GoogleFonts.rubik(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                height: 1.3),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          GestureDetector(
            onTap: onGoToBills,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 13),
              decoration: BoxDecoration(
                gradient: ffTheme.accentGradient,
                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                boxShadow: ffTheme.shadowAccent,
              ),
              child: Text(
                'הזן חשבונות עכשיו',
                style: GoogleFonts.rubik(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.white),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
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
                style: ffTheme.titleSmall.copyWith(
                    color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
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
                  Text(
                    'ההזדמנות הכי גדולה שלך · $categoryName',
                    style: GoogleFonts.assistant(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: ffTheme.primaryDark),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    personalized
                        ? 'חיסכון של ₪$saving בשנה'
                        : 'חיסכון מוערך של ~₪$saving בשנה',
                    style: GoogleFonts.rubik(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: ffTheme.primaryDark),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    providerAndPlan,
                    style: GoogleFonts.assistant(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: ffTheme.primaryDark),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
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

// ── B: Enhanced category card ────────────────────────────────────────────────

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
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
    final hasBill = saving.hasBill;
    final hasOpp = saving.hasOpportunity;
    // Savings ratio as a fraction of the current bill (0.0 – 1.0).
    final ratio = (hasBill && saving.currentBill > 0)
        ? (saving.annualSaving / (saving.currentBill * 12)).clamp(0.0, 1.0)
        : 0.0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.lineColor),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Top row: icon + name + saving badge ───────────────────────
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: Icon(categoryIconData(catId),
                    size: 20, color: ffTheme.primaryText),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: ffTheme.titleSmall
                            .copyWith(fontWeight: FontWeight.w800)),
                    Text(
                      hasBill
                          ? 'חשבון נוכחי: ₪${saving.currentBill}$kBillUnit'
                          : 'לא הוזן חשבון',
                      style: ffTheme.labelSmall
                          .copyWith(color: ffTheme.secondaryText),
                    ),
                  ],
                ),
              ),
              if (hasOpp)
                _SavingBadge(
                  annual: saving.annualSaving,
                  personalized: personalized,
                  ffTheme: ffTheme,
                )
              else if (hasBill)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.check_circle_rounded,
                        size: 16, color: ffTheme.success),
                    const SizedBox(width: 4),
                    Text('מחיר תחרותי',
                        style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.success,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
            ],
          ),

          // ── Detailed bill vs best plan row ─────────────────────────────
          if (hasBill && saving.best != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                _PriceCompare(
                  label: 'אתה משלם',
                  value: '₪${saving.currentBill}',
                  sub: 'לחודש',
                  highlight: false,
                  ffTheme: ffTheme,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Icon(Icons.arrow_back_rounded,
                      size: 16, color: ffTheme.secondaryText),
                ),
                _PriceCompare(
                  label: 'המומלץ שלנו',
                  value: '₪${saving.best!.plan.price}',
                  sub: 'לחודש',
                  highlight: true,
                  ffTheme: ffTheme,
                ),
              ],
            ),
          ],

          // ── Progress bar: savings potential ────────────────────────────
          if (hasBill) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    child: LinearProgressIndicator(
                      value: ratio,
                      minHeight: 6,
                      backgroundColor: ffTheme.lineColor,
                      valueColor:
                          const AlwaysStoppedAnimation<Color>(AppColors.saving),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${(ratio * 100).round()}%',
                  style: ffTheme.labelSmall.copyWith(
                      color: AppColors.saving,
                      fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'פוטנציאל חיסכון מהחשבון הנוכחי',
              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
            ),
          ],

          // ── CTA ────────────────────────────────────────────────────────
          const SizedBox(height: 14),
          GestureDetector(
            onTap: onTap,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                gradient: hasBill ? ffTheme.accentGradient : null,
                color: hasBill ? null : ffTheme.accent1,
                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                boxShadow: hasBill ? ffTheme.shadowAccent : null,
              ),
              child: Center(
                child: Text(
                  hasBill ? 'מצא תוכנית' : 'הזן חשבון',
                  style: GoogleFonts.rubik(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: hasBill ? Colors.white : ffTheme.primaryText,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SavingBadge extends StatelessWidget {
  const _SavingBadge({
    required this.annual,
    required this.personalized,
    required this.ffTheme,
  });
  final int annual;
  final bool personalized;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.saving.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
        border: Border.all(color: AppColors.saving.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            personalized ? '₪$annual' : '~₪$annual',
            style: GoogleFonts.rubik(
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: AppColors.saving),
          ),
          Text(
            'בשנה',
            style: ffTheme.labelSmall.copyWith(color: AppColors.savingDark),
          ),
        ],
      ),
    );
  }
}

class _PriceCompare extends StatelessWidget {
  const _PriceCompare({
    required this.label,
    required this.value,
    required this.sub,
    required this.highlight,
    required this.ffTheme,
  });
  final String label;
  final String value;
  final String sub;
  final bool highlight;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              value,
              style: GoogleFonts.rubik(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: highlight ? AppColors.saving : ffTheme.secondaryText,
              ),
            ),
            const SizedBox(width: 2),
            Text(sub,
                style: ffTheme.labelSmall
                    .copyWith(color: ffTheme.secondaryText)),
          ],
        ),
      ],
    );
  }
}

// ── C: Horizontal bar chart ──────────────────────────────────────────────────

class _HorizBarChartCard extends StatelessWidget {
  const _HorizBarChartCard({
    required this.categories,
    required this.personalized,
    required this.ffTheme,
    required this.onCategoryTap,
  });
  final List<CategorySaving> categories;
  final bool personalized;
  final AppTheme ffTheme;
  final void Function(String catId) onCategoryTap;

  @override
  Widget build(BuildContext context) {
    // Show only categories with bills; if none, show placeholder rows.
    final withBill = categories.where((c) => c.hasBill).toList();
    final hasData = withBill.isNotEmpty;
    // Bars for all categories with bills (or placeholders using category list).
    final rows = hasData ? withBill : categories;
    final maxSaving =
        rows.fold<int>(0, (m, c) => math.max(m, c.annualSaving));
    final maxY = hasData ? math.max(maxSaving.toDouble(), 1.0) : 800.0;

    // Chart height scales with number of categories.
    final chartH = (rows.length * 52.0).clamp(160.0, 320.0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.glassDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('חיסכון שנתי לפי קטגוריה',
                  style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              if (!personalized && hasData)
                _EstimateChip(ffTheme: ffTheme),
            ],
          ),
          const SizedBox(height: 16),

          if (!hasData) ...[
            // Placeholder prompt
            _NoBillsPrompt(ffTheme: ffTheme),
          ] else ...[
            SizedBox(
              height: chartH,
              child: BarChart(
                BarChartData(
                  alignment: BarChartAlignment.spaceEvenly,
                  maxY: maxY * 1.2,
                  minY: 0,
                  barTouchData: BarTouchData(
                    touchTooltipData: BarTouchTooltipData(
                      getTooltipColor: (_) => ffTheme.primaryDark,
                      getTooltipItem: (group, groupIndex, rod, rodIndex) =>
                          BarTooltipItem(
                        '₪${rod.toY.round()}',
                        ffTheme.labelMedium.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800),
                      ),
                    ),
                    touchCallback: (FlTouchEvent event, BarTouchResponse? response) {
                      if (event is FlTapUpEvent &&
                          response?.spot != null) {
                        final idx = response!.spot!.touchedBarGroupIndex;
                        if (idx >= 0 && idx < withBill.length) {
                          if (withBill[idx].hasOpportunity) {
                            onCategoryTap(withBill[idx].categoryId);
                          }
                        }
                      }
                    },
                  ),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: true,
                    drawHorizontalLine: false,
                    verticalInterval: maxY / 4,
                    getDrawingVerticalLine: (_) => FlLine(
                      color: ffTheme.lineColor,
                      strokeWidth: 1,
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    leftTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 36,
                        getTitlesWidget: (value, meta) {
                          final idx = value.toInt();
                          if (idx < 0 || idx >= withBill.length) {
                            return const SizedBox.shrink();
                          }
                          final cat = categoryById(withBill[idx].categoryId);
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  categoryIconData(withBill[idx].categoryId),
                                  size: 14,
                                  color: ffTheme.secondaryText,
                                ),
                                Text(
                                  cat?.name ?? withBill[idx].categoryId,
                                  style: ffTheme.labelSmall.copyWith(
                                      color: ffTheme.secondaryText,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 9),
                                  textAlign: TextAlign.center,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  barGroups: [
                    for (var i = 0; i < withBill.length; i++)
                      BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(
                            toY: withBill[i].annualSaving.toDouble(),
                            width: 28,
                            color: withBill[i].hasOpportunity
                                ? AppColors.saving
                                : ffTheme.lineColor,
                            borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(6)),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            // Y-axis label
            Text(
              '₪ חיסכון שנתי — הקש על עמודה לתוצאות',
              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

/// Placeholder when no bills are entered yet.
class _NoBillsPrompt extends StatelessWidget {
  const _NoBillsPrompt({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      decoration: BoxDecoration(
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (final cat in ['סלולר', 'אינטרנט', 'טלוויזיה'])
                _PlaceholderBar(label: cat, ffTheme: ffTheme),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'הזן חשבונות כדי לראות את החיסכון הפוטנציאלי',
            style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _PlaceholderBar extends StatelessWidget {
  const _PlaceholderBar({required this.label, required this.ffTheme});
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 36,
          height: 60,
          decoration: BoxDecoration(
            color: ffTheme.lineColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
          ),
          alignment: Alignment.center,
          child: Text('?',
              style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText)),
        ),
        const SizedBox(height: 4),
        Text(label,
            style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
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
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => ffTheme.primaryDark,
                    getTooltipItem: (group, groupIndex, rod, rodIndex) =>
                        BarTooltipItem(
                      '₪${rod.toY.round()}',
                      ffTheme.labelMedium.copyWith(
                          color: Colors.white, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
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
        Text(label,
            style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
      ],
    );
  }
}

// ── Shared estimate chip ─────────────────────────────────────────────────────

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

// ── Renewal row ──────────────────────────────────────────────────────────────

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
                      style: ffTheme.bodyMedium
                          .copyWith(fontWeight: FontWeight.w700),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  Text(
                    days == null
                        ? 'חוסך ₪$saving/שנה במעבר'
                        : days! < 0
                            ? 'המבצע הסתיים — חוסך ₪$saving/שנה'
                            : 'מסתיים בעוד $days ימים — חוסך ₪$saving/שנה',
                    style: ffTheme.labelSmall
                        .copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_left_rounded,
                size: 18, color: ffTheme.secondaryText),
          ],
        ),
      ),
    );
  }
}

// ── D: Share button ──────────────────────────────────────────────────────────

class _ShareButton extends StatelessWidget {
  const _ShareButton({required this.total, required this.ffTheme});
  final int total;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Share.share(
        'גיליתי שאני יכול לחסוך ₪$total בשנה על חבילות תקשורת! 🤑 '
        'בדוק גם אתה דרך חוסך: https://chosech.app',
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 15),
        decoration: BoxDecoration(
          gradient: ffTheme.accentGradient,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          boxShadow: ffTheme.shadowAccent,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.ios_share_rounded, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Text(
              'שתף את החיסכון',
              style: GoogleFonts.rubik(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}

// ── E: Future milestone banner ────────────────────────────────────────────────

class _FutureMilestoneBanner extends StatelessWidget {
  const _FutureMilestoneBanner({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(
          color: ffTheme.lineColor,
          // Dashed border via CustomPainter; fallback to solid with low alpha.
          strokeAlign: BorderSide.strokeAlignInside,
        ),
        boxShadow: ffTheme.shadowGlass,
      ),
      child: _DashedBorder(
        color: ffTheme.lineColor,
        radius: ffTheme.radiusMd,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: ffTheme.brandAccentTint,
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: const Icon(Icons.emoji_events_rounded,
                    size: 22, color: AppColors.brandAccent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('כמה חסכת כבר?',
                        style: ffTheme.titleSmall
                            .copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      'כשתעבור לתוכנית חדשה, תוכל לראות כאן את החיסכון הממשי שלך',
                      style: ffTheme.bodySmall
                          .copyWith(color: ffTheme.secondaryText, height: 1.4),
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

/// A container that paints a dashed border around its child using a [CustomPainter].
/// This avoids any third-party package for dashed borders.
class _DashedBorder extends StatelessWidget {
  const _DashedBorder({
    required this.child,
    required this.color,
    required this.radius,
  });
  final Widget child;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedBorderPainter(color: color, radius: radius),
      child: child,
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color, required this.radius});
  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;

    const dashLen = 6.0;
    const gapLen = 4.0;
    final rrect = RRect.fromRectAndRadius(
        Offset.zero & size, Radius.circular(radius));
    final path = Path()..addRRect(rrect);

    final metrics = path.computeMetrics();
    for (final metric in metrics) {
      var distance = 0.0;
      while (distance < metric.length) {
        final end = math.min(distance + dashLen, metric.length);
        canvas.drawPath(metric.extractPath(distance, end), paint);
        distance += dashLen + gapLen;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
