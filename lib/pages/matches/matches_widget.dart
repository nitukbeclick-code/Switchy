import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/recommendation_engine.dart';
import '../../widgets/app_card.dart';
import '../../widgets/stat_pill.dart';
import '../../widgets/empty_state.dart';

class MatchesWidget extends StatelessWidget {
  const MatchesWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    // Compute all matches once — no engine calls inside nested builders.
    final List<({String catId, String catName, String catIcon, PlanMatch match})> catMatches = [];
    for (final c in categories) {
      final profile = MatchProfile(
        category: c.id,
        currentBill: appState.currentBill(c.id),
        budget: (appState.quizCompleted && appState.quizCat == c.id) ? appState.quizBudget : 0,
        priority: priorityFromId(appState.quizPriority),
        lines: appState.quizLines,
        wants5G: appState.wants5G,
        wantsAbroad: appState.wantsAbroad,
        wantsNoCommit: appState.wantsNoCommit,
      );
      final match = RecommendationEngine.bestMatch(profile);
      if (match != null) {
        catMatches.add((catId: c.id, catName: c.name, catIcon: c.icon, match: match));
      }
    }

    // Total annual saving only for categories where user has a bill.
    final totalAnnualSaving = catMatches.fold<int>(0, (sum, item) {
      final hasBill = appState.currentBill(item.catId) > 0;
      return sum + (hasBill ? item.match.annualSaving : 0);
    });

    final analyzedCount = categories.where((c) => appState.currentBill(c.id) > 0).length;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
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
                _buildHeroCard(context, ffTheme, totalAnnualSaving, analyzedCount)
                    .animate()
                    .fadeIn(duration: 500.ms),
                const SizedBox(height: 24),

                // ── Per-category match cards ───────────────────────────────────
                ...catMatches.asMap().entries.map((entry) {
                  final i = entry.key;
                  final item = entry.value;
                  return _buildMatchCard(context, ffTheme, item.catId, item.catName, item.catIcon, item.match, appState)
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
  ) {
    final savingDisplay = totalSaving > 1000
        ? '₪${(totalSaving / 1000).toStringAsFixed(1)}K'
        : '₪$totalSaving';

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF0E3A26), Color(0xFF1E7A4E)],
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
            style: ffTheme.bodySmall.copyWith(color: Colors.white.withOpacity(0.65)),
          ),
          const SizedBox(height: 6),
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
                  disp,
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
          const SizedBox(height: 8),
          Text(
            analyzedCount > 0
                ? 'ניתחנו $analyzedCount קטגוריות עבורך'
                : 'ניתחנו את כל הקטגוריות עבורך',
            style: ffTheme.bodySmall.copyWith(color: Colors.white.withOpacity(0.55)),
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
    String catIcon,
    PlanMatch match,
    AppState appState,
  ) {
    final plan = match.plan;
    final isAbroad = catId == 'abroad';
    final priceLabel = isAbroad ? 'לחבילה' : '/חודש';
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
              Text(catIcon, style: const TextStyle(fontSize: 20)),
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
                        value: '₪${match.annualSaving}',
                        label: 'לשנה',
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
                    '₪${plan.price}',
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
