import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/recommendation_engine.dart';
import '../../services/savings_summary.dart';
import '../../widgets/app_card.dart';
import '../../widgets/stat_pill.dart';
import '../../widgets/empty_state.dart';

class MatchesWidget extends StatelessWidget {
  const MatchesWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    // One source of truth: the same engine figures as the home hero, the
    // /savings dashboard and the bills screen (see computeSavings) — so the
    // headline saving here can't disagree with those screens.
    final summary = computeSavings(appState);
    final catMatches = <({String catId, String catName, PlanMatch match})>[];
    for (final cs in summary.categories) {
      final best = cs.best;
      if (best == null) continue; // no bill entered for this category
      final cat = categoryById(cs.categoryId);
      catMatches.add((
        catId: cs.categoryId,
        catName: cat?.name ?? cs.categoryId,
        match: best,
      ));
    }

    final totalAnnualSaving = summary.totalAnnualPotential;
    final analyzedCount = summary.categories.where((c) => c.hasBill).length;
    final personalized = appState.billsPersonalized;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text(
          'ההתאמות שלי',
          style: ffTheme.titleLarge.copyWith(color: Colors.white),
        ),
        centerTitle: true,
      ),
      body: catMatches.isEmpty
          ? EmptyState(
              icon: Icons.auto_awesome_rounded,
              headline: 'עדיין אין התאמות',
              subtitle: 'ענה על השאלון ונמצא לך את המסלולים הכי מתאימים',
              ctaLabel: 'התחל שאלון',
              onCtaTap: () async => context.pushNamed('Quiz'),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
              children: [
                // ── Hero summary card ──────────────────────────────────────────
                _buildHeroCard(context, ffTheme, totalAnnualSaving, analyzedCount, personalized)
                    .animate()
                    .fadeIn(duration: 500.ms),
                const SizedBox(height: 24),

                // ── Per-category match cards ───────────────────────────────────
                ...catMatches.asMap().entries.map((entry) {
                  final i = entry.key;
                  final item = entry.value;
                  return _buildMatchCard(context, ffTheme, item.catId, item.catName, item.match, appState, personalized)
                      .animate(delay: (120 + i * 80).ms)
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: 0.06, end: 0);
                }),
              ],
            ),
    );
  }

  Widget _buildHeroCard(
    BuildContext context,
    AppTheme ffTheme,
    int totalSaving,
    int analyzedCount,
    bool personalized,
  ) {
    final savingDisplay = totalSaving > 1000
        ? '₪${(totalSaving / 1000).toStringAsFixed(1)}K'
        : '₪$totalSaving';

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [ffTheme.primaryDark, ffTheme.tertiary],
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.secondary,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '✦ דאשבורד חכם',
              style: ffTheme.labelSmall.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            totalSaving > 0 ? 'חיסכון פוטנציאלי שנתי' : 'התאמות לפי הפרופיל שלך',
            style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.65)),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (totalSaving > 0)
                TweenAnimationBuilder<int>(
                  tween: IntTween(begin: 0, end: totalSaving),
                  duration: const Duration(milliseconds: 1400),
                  curve: Curves.easeOutCubic,
                  builder: (_, value, __) {
                    final disp = value > 1000
                        ? '₪${(value / 1000).toStringAsFixed(1)}K'
                        : '₪$value';
                    return Text(
                      personalized ? disp : '~$disp',
                      style: ffTheme.displaySmall.copyWith(
                        color: AppColors.secondary,
                        fontWeight: FontWeight.bold,
                      ),
                    );
                  },
                )
              else
                Text(
                  savingDisplay,
                  style: ffTheme.displaySmall.copyWith(
                    color: AppColors.secondary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              if (!personalized && totalSaving > 0) ...[
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'הערכה',
                      style: ffTheme.labelSmall.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text(
            !personalized && totalSaving > 0
                ? 'הערכה — עדכנו את החשבונות שלכם לחישוב מדויק'
                : analyzedCount > 0
                    ? 'ניתחנו $analyzedCount קטגוריות עבורך'
                    : 'ניתחנו את כל הקטגוריות עבורך',
            style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.55)),
          ),
        ],
      ),
    );
  }

  Widget _buildMatchCard(
    BuildContext context,
    AppTheme ffTheme,
    String catId,
    String catName,
    PlanMatch match,
    AppState appState,
    bool personalized,
  ) {
    final plan = match.plan;
    final priceLabel = priceUnitLabel(plan);
    final topReason = match.reasons.isNotEmpty ? match.reasons.first : null;

    return AppCard(
      margin: const EdgeInsets.only(bottom: 14),
      onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Category header
          Row(
            children: [
              Icon(categoryIconData(catId), size: 20, color: ffTheme.secondaryText),
              const SizedBox(width: 8),
              Text(
                catName,
                style: ffTheme.labelLarge.copyWith(
                  color: ffTheme.secondaryText,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              // Match score badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: ffTheme.primary,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${match.scorePct}% התאמה',
                  style: ffTheme.labelSmall.copyWith(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),
          // Provider + plan + price row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan.provider,
                      style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      plan.plan,
                      style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (topReason != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        topReason,
                        style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.primary,
                          fontWeight: FontWeight.w600,
                          fontSize: 11,
                        ),
                      ),
                    ],
                    if (match.annualSaving > 0) ...[
                      const SizedBox(height: 8),
                      StatPill(
                        value: personalized
                            ? '₪${match.annualSaving}'
                            : '~₪${match.annualSaving}',
                        label: personalized ? 'לשנה' : 'הערכה לשנה',
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₪${plan.priceText}',
                    style: ffTheme.titleLarge.copyWith(
                      color: ffTheme.primary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    priceLabel,
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
