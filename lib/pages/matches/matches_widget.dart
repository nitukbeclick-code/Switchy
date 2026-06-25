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
import '../../widgets/app_sliver_header.dart';
import '../../widgets/refreshable_scroll.dart';

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

    // The single biggest real saving across the matched categories — its card
    // wears a "החיסכון הגדול ביותר" crown so the list has one clear focal point
    // (the top opportunity) instead of N equal-weight cards. Only when a genuine
    // saving exists and there's more than one card to rank.
    int topSaverIndex = -1;
    if (catMatches.length > 1) {
      var bestSave = 0;
      for (var i = 0; i < catMatches.length; i++) {
        final s = catMatches[i].match.annualSaving;
        if (s > bestSave) {
          bestSave = s;
          topSaverIndex = i;
        }
      }
    }

    if (catMatches.isEmpty) {
      return Scaffold(
        backgroundColor: ffTheme.background,
        appBar: AppBar(
          backgroundColor: AppColors.brandAccentDark,
          foregroundColor: Colors.white,
          elevation: 0,
          // Framework-default leading back affordance — RTL-mirrored automatically.
          title: Text(
            'ההתאמות שלי',
            style: ffTheme.titleLarge.copyWith(color: Colors.white),
          ),
          centerTitle: true,
        ),
        body: EmptyState(
          icon: Icons.auto_awesome_rounded,
          headline: 'עדיין אין התאמות',
          subtitle: 'ענה על השאלון ונמצא לך את המסלולים הכי מתאימים',
          ctaLabel: 'התחל שאלון',
          onCtaTap: () async => context.pushNamed('Quiz'),
        ),
      );
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          // ── Collapsing header carries the hero saving figure; the rest of the
          // page scrolls beneath it with pull-to-refresh + bouncing physics. ──
          RefreshableScroll(
            onRefresh: () async {
              HapticFeedback.lightImpact();
              // Re-rank against the latest bills/profile: computeSavings reads
              // live AppState, so a notify is enough to recompute on rebuild.
              AppState().update(() {});
            },
            slivers: [
              AppSliverHeader(
                title: 'ההתאמות שלי',
                expandedHeight: 220,
                flexibleChild: _buildHeroFigure(context, ffTheme,
                    totalAnnualSaving, analyzedCount, personalized),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                    16, 20, 16, appState.comparePlans.isEmpty ? 100 : 160),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // ── Per-category match cards ───────────────────────────────
                    ...catMatches.asMap().entries.map((entry) {
                      final i = entry.key;
                      final item = entry.value;
                      final card = _buildMatchCard(context, ffTheme, item.catId,
                          item.catName, item.match, appState, personalized,
                          isTopSaver: i == topSaverIndex);
                      // The biggest-saving card is the list's focal point (it
                      // also wears the amber crown + hairline). Give it a
                      // confident-but-restrained reveal: settle from a hair
                      // larger (1.025→1.0) on the gentle spring so the eye lands
                      // on the top opportunity first. PURPOSE = focal hierarchy,
                      // once on reveal, no loop; transform drops under
                      // reduced-motion via flutter_animate.
                      if (i == topSaverIndex && topSaverIndex >= 0) {
                        return card
                            .animate()
                            .fadeIn(duration: 400.ms)
                            .scale(
                              begin: const Offset(1.025, 1.025),
                              end: const Offset(1, 1),
                              duration: 420.ms,
                              curve: ffTheme.spring,
                            );
                      }
                      return card
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
                  ]),
                ),
              ),
            ],
          ),

          // ── Compare sticky bar — mirrors Results so the "השוואה" CTA on
          // each card leads somewhere instead of silently filling a list. ──
          PositionedDirectional(
            bottom: 16,
            start: 16,
            end: 16,
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
                      style: ffTheme.titleSmall.copyWith(color: Colors.white),
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

  /// The expanded-header hero: the headline saving figure, layered above the
  /// header's green ACTION wash via [AppSliverHeader.flexibleChild]. Same single
  /// source of truth as the home hero / /savings dashboard (computeSavings), with
  /// the count-up, the personalized prefix and the honest "הערכה" badge intact.
  Widget _buildHeroFigure(
    BuildContext context,
    AppTheme ffTheme,
    int totalSaving,
    int analyzedCount,
    bool personalized,
  ) {
    final savingDisplay = totalSaving > 1000
        ? '₪${(totalSaving / 1000).toStringAsFixed(1)}K'
        : '₪$totalSaving';

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          totalSaving > 0 ? 'חיסכון פוטנציאלי שנתי' : 'התאמות לפי הפרופיל שלך',
          textAlign: TextAlign.center,
          style: ffTheme.bodySmall
              .copyWith(color: Colors.white.withValues(alpha: 0.78)),
        ),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
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
                      color: Colors.white,
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.20),
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
        const SizedBox(height: 4),
        Text(
          !personalized && totalSaving > 0
              ? 'הערכה — עדכנו את החשבונות שלכם לחישוב מדויק'
              : analyzedCount > 0
                  ? 'ניתחנו $analyzedCount קטגוריות עבורך'
                  : 'ניתחנו את כל הקטגוריות עבורך',
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: ffTheme.bodySmall
              .copyWith(color: Colors.white.withValues(alpha: 0.65)),
        ),
      ],
    );
  }

  Widget _buildMatchCard(
    BuildContext context,
    AppTheme ffTheme,
    String catId,
    String catName,
    PlanMatch match,
    AppState appState,
    bool personalized, {
    bool isTopSaver = false,
  }) {
    final plan = match.plan;
    final priceLabel = priceUnitLabel(plan);
    // "Why this" — up to two affirmative reasons; the engine already orders the
    // strongest first (saving, in-budget, then capability tells).
    final reasons = match.reasons.take(2).toList();
    final topCaveat = match.caveats.isNotEmpty ? match.caveats.first : null;
    final inCompare = appState.isInCompare(plan.id);

    return AppCard(
      margin: const EdgeInsets.only(bottom: 14),
      // The top-saver card gets a quiet amber VALUE hairline so the biggest
      // opportunity reads as the focal card at a glance (other cards keep the
      // default ink hairline).
      borderColor: isTopSaver && match.annualSaving > 0
          ? ffTheme.saving.withValues(alpha: 0.45)
          : null,
      onTap: () =>
          context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Category header
          Row(
            children: [
              Icon(categoryIconData(catId),
                  size: 20, color: ffTheme.secondaryText),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  catName,
                  style: ffTheme.labelLarge.copyWith(
                    color: ffTheme.secondaryText,
                    fontWeight: FontWeight.w600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              // Top-saver crown — amber VALUE, the list's single focal point:
              // the category where switching saves the most real money.
              if (isTopSaver && match.annualSaving > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: ffTheme.saving.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(20),
                    border:
                        Border.all(color: ffTheme.saving.withValues(alpha: 0.40)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.emoji_events_rounded,
                          size: 11, color: ffTheme.savingDark),
                      const SizedBox(width: 3),
                      Text('החיסכון הגדול ביותר',
                          style: ffTheme.labelSmall.copyWith(
                              color: ffTheme.savingText,
                              fontSize: 10,
                              fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
              ],
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
                      style: ffTheme.titleSmall
                          .copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      plan.plan,
                      style: ffTheme.bodySmall
                          .copyWith(color: ffTheme.secondaryText),
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
                    style: ffTheme.labelSmall
                        .copyWith(color: ffTheme.secondaryText),
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
                  semanticLabel: 'פרטים על ${plan.provider} ${plan.plan}',
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
                  semanticLabel: inCompare
                      ? 'הסר את ${plan.provider} ${plan.plan} מההשוואה'
                      : 'הוסף את ${plan.provider} ${plan.plan} להשוואה',
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
                'היי, ראיתי את ${plan.provider} – ${plan.plan} (₪${plan.priceText}) ב-Switchy AI ואשמח לפרטים',
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
    this.semanticLabel,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final AppTheme ffTheme;
  final bool active;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final fg = active ? Colors.white : ffTheme.brandAccentText;
    return Semantics(
      button: true,
      label: semanticLabel ?? label,
      child: Material(
        color: active
            ? ffTheme.brandAccent
            : ffTheme.brandAccent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
        child: InkWell(
          borderRadius: BorderRadius.circular(ffTheme.radiusSm),
          onTap: onTap,
          // Guarantee a comfortable, accessible touch target (>= kMinTapTarget).
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: kMinTapTarget),
            child: Center(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon,
                        size: 16,
                        color: active ? Colors.white : ffTheme.brandAccent),
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
        ),
      ),
    );
  }
}
