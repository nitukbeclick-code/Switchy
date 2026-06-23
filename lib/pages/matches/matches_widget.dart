import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../../widgets/whatsapp_button.dart';

class MatchesWidget extends StatelessWidget {
  const MatchesWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // The header stays a dark ink band in both modes (ffTheme.primary resolves
    // to off-white ink on dark, so it can't be used as the bar fill).
    final headerColor = isDark ? AppColors.darkSurface : ffTheme.primary;
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
        backgroundColor: headerColor,
        foregroundColor: Colors.white,
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
          : Stack(
              children: [
                ListView(
                  padding: EdgeInsets.fromLTRB(
                      16, 20, 16, appState.comparePlans.isEmpty ? 100 : 160),
                  children: [
                    // ── Hero summary card ──────────────────────────────────────
                    _buildHeroCard(context, ffTheme, totalAnnualSaving,
                            analyzedCount, personalized)
                        .animate()
                        .fadeIn(duration: 500.ms),
                    const SizedBox(height: 24),

                    // ── Per-category match cards ───────────────────────────────
                    ...catMatches.asMap().entries.map((entry) {
                      final i = entry.key;
                      final item = entry.value;
                      return _buildMatchCard(context, ffTheme, item.catId,
                              item.catName, item.match, appState, personalized)
                          .animate(delay: (120 + i * 80).ms)
                          .fadeIn(duration: 400.ms)
                          .slideY(begin: 0.06, end: 0);
                    }),

                    // ── Browse-all footer — the list never dead-ends. ──────────
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton.icon(
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          context.goNamed('Results');
                        },
                        icon: Icon(Icons.grid_view_rounded,
                            size: 18, color: ffTheme.brandAccent),
                        label: Text('עיין בכל המסלולים ←',
                            style: ffTheme.labelLarge.copyWith(
                                color: ffTheme.brandAccentText,
                                fontWeight: FontWeight.w700)),
                      ),
                    ).animate(delay: 360.ms).fadeIn(duration: 300.ms),
                  ],
                ),

                // ── Compare sticky bar — mirrors Results so the "השוואה" CTA on
                // each card leads somewhere instead of silently filling a list. ──
                Positioned(
                  bottom: 16,
                  left: 16,
                  right: 16,
                  child: AnimatedSlide(
                    offset: appState.comparePlans.isEmpty
                        ? const Offset(0, 2)
                        : Offset.zero,
                    duration: ffTheme.motionMedium,
                    curve: ffTheme.emphasized,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: ffTheme.accentGradient,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: ffTheme.shadowAccent,
                      ),
                      child: Row(
                        children: [
                          Text(
                            'השווה ${appState.comparePlans.length} מסלולים',
                            style:
                                ffTheme.titleSmall.copyWith(color: Colors.white),
                          ),
                          const Spacer(),
                          ElevatedButton(
                            onPressed: () {
                              HapticFeedback.lightImpact();
                              context.goNamed('Compare');
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: AppColors.brandAccentDark,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                            ),
                            child: Text('השוואה ←',
                                style: ffTheme.labelMedium.copyWith(
                                    color: AppColors.brandAccentDark,
                                    fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
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
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusXl),
        boxShadow: ffTheme.shadowLifted,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(ffTheme.radiusXs),
              border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.auto_awesome_rounded, size: 12, color: ffTheme.saving),
                const SizedBox(width: 5),
                Text(
                  'דאשבורד חכם',
                  style: ffTheme.labelSmall.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
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
                        color: ffTheme.saving,
                        fontWeight: FontWeight.bold,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    );
                  },
                )
              else
                Text(
                  savingDisplay,
                  style: ffTheme.displaySmall.copyWith(
                    color: Colors.white,
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
    // "Why this" — up to two affirmative reasons; the engine already orders the
    // strongest first (saving, in-budget, then capability tells).
    final reasons = match.reasons.take(2).toList();
    final topCaveat = match.caveats.isNotEmpty ? match.caveats.first : null;
    final inCompare = appState.isInCompare(plan.id);

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
              // Match score badge — green = ACTION/match signal, rendered as the
              // accent gradient with a soft glow so it reads as the win state on
              // both light and dark surfaces.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  gradient: ffTheme.accentGradient,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: ffTheme.shadowAccent,
                ),
                child: Text(
                  '${match.scorePct}% התאמה',
                  style: ffTheme.labelSmall.copyWith(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
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
                    // "למה זה מתאים לך" — explicit, scannable reasons so the
                    // ranking is explainable, not a black box.
                    if (reasons.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        'למה זה מתאים לך',
                        style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.secondaryText,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ...reasons.map((r) => Padding(
                            padding: const EdgeInsets.only(bottom: 3),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Green = the affirmative "why it fits" tell.
                                Icon(Icons.check_circle_rounded,
                                    size: 13, color: ffTheme.brandAccent),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    r,
                                    style: ffTheme.labelSmall.copyWith(
                                      color: ffTheme.brandAccentText,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 11,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )),
                    ],
                    // A single honest caveat (promo expiry / commitment) — the
                    // amber VALUE note so the trade-off is visible up-front.
                    if (topCaveat != null) ...[
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.info_outline_rounded,
                              size: 13, color: ffTheme.savingDark),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              topCaveat,
                              style: ffTheme.labelSmall.copyWith(
                                color: ffTheme.secondaryText,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (match.annualSaving > 0) ...[
                      const SizedBox(height: 8),
                      StatPill(
                        value: personalized
                            ? '₪${match.annualSaving}'
                            : '~₪${match.annualSaving}',
                        label: personalized ? 'חיסכון לשנה' : 'הערכה לשנה',
                        // Amber = VALUE. Theme-aware so the savings badge holds
                        // contrast on both the glass-white and slate surfaces.
                        backgroundColor: ffTheme.saving.withValues(alpha: 0.14),
                        textColor: ffTheme.savingDark,
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
                      fontFeatures: const [FontFeature.tabularFigures()],
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
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 12),
          // ── CTA row: details · compare · WhatsApp lead ──────────────────────
          // Three explicit next steps so a match never dead-ends at a card.
          Row(
            children: [
              Expanded(
                child: _MatchAction(
                  icon: Icons.article_outlined,
                  label: 'פרטים',
                  onTap: () {
                    HapticFeedback.selectionClick();
                    context.pushNamed('PlanDetail',
                        pathParameters: {'planId': plan.id});
                  },
                  ffTheme: ffTheme,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MatchAction(
                  icon: inCompare
                      ? Icons.check_circle_rounded
                      : Icons.compare_arrows_rounded,
                  label: inCompare ? 'בהשוואה' : 'השוואה',
                  active: inCompare,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    appState.toggleCompare(plan.id);
                  },
                  ffTheme: ffTheme,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Primary lead CTA — WhatsApp, the brand green ACTION button, with a
          // plan-aware prefill so the rep lands on context.
          WhatsAppButton(
            source: 'matches',
            width: double.infinity,
            height: 46,
            label: 'קבלו הצעה ל${plan.provider}',
            prefillText:
                'היי, ראיתי את ${plan.provider} – ${plan.plan} (₪${plan.priceText}) בחוסך ואשמח לפרטים',
          ),
        ],
      ),
    );
  }
}

/// A compact, equal-width secondary action used in the match-card CTA row.
/// Tinted-green when idle; solid-green "active" when the plan is in compare.
class _MatchAction extends StatelessWidget {
  const _MatchAction({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.ffTheme,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final AppTheme ffTheme;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final fg = active ? Colors.white : ffTheme.brandAccentText;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: active
            ? ffTheme.brandAccent
            : ffTheme.brandAccent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
        child: InkWell(
          borderRadius: BorderRadius.circular(ffTheme.radiusSm),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 16, color: active ? Colors.white : ffTheme.brandAccent),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: ffTheme.labelMedium.copyWith(
                    color: fg,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
