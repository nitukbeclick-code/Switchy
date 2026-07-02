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
import '../../widgets/empty_state.dart';
import '../../widgets/price_text.dart';
import '../../widgets/saving_pill.dart';
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
          backgroundColor: ffTheme.cardSurface,
          foregroundColor: ffTheme.primaryText,
          elevation: 0,
          // Framework-default leading back affordance — RTL-mirrored automatically.
          title: Text(
            'ההתאמות שלי',
            style: ffTheme.titleLarge.copyWith(color: ffTheme.primaryText),
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
                flexibleChild:
                    _buildHeroFigure(context, ffTheme, analyzedCount),
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
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                  // Sticky bars are one of the few sanctioned lifted surfaces
                  // (shadowAccent resolves to empty under Geist).
                  boxShadow: ffTheme.shadowLifted,
                ),
                child: Row(
                  children: [
                    Text(
                      'השווה ${appState.comparePlans.length} מסלולים',
                      // Contrast-aware on-green ink: white on light green-600,
                      // near-black on the lifted dark green-400 (pinned white
                      // fell to ~1.7:1 in dark mode).
                      style: ffTheme.titleSmall.copyWith(color: ffTheme.onSaving),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        context.goNamed('Compare');
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        // Const green-700 holds ≥4.5:1 on the white fill in both
                        // themes (the theme getter lifts to green-500 on dark,
                        // which fails on white).
                        foregroundColor: AppColors.brandAccentDark,
                        elevation: 0,
                        minimumSize: const Size(0, kMinTapTarget),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(ffTheme.radiusLg)),
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

  /// The expanded-header hero. De-pushed: the big animated ₪/year saving figure
  /// (a duplicate of the home hero / /savings dashboard) was removed so this
  /// page reads as a calm comparison tool. The header now states what the page
  /// IS plus an honest one-line of what we analyzed — the real saving still
  /// lives on the per-category match cards (the top-saver card) and on /savings.
  Widget _buildHeroFigure(
    BuildContext context,
    AppTheme ffTheme,
    int analyzedCount,
  ) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          'מסלולים מתאימים לפרופיל שלכם',
          textAlign: TextAlign.center,
          style: ffTheme.titleMedium.copyWith(
            color: ffTheme.primaryText,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          analyzedCount > 0
              ? 'השווינו $analyzedCount קטגוריות עבורכם'
              : 'השווינו את כל הקטגוריות עבורכם',
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
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
              // Top-saver crown — the VALUE-pill tint treatment (the one green
              // tint token), the list's single focal point.
              if (isTopSaver && match.annualSaving > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: ffTheme.brandAccentTint,
                    borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    border: Border.all(color: ffTheme.brandAccent),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.emoji_events_rounded,
                          size: 11, color: ffTheme.savingText),
                      const SizedBox(width: 3),
                      Text('החיסכון הגדול ביותר',
                          style: ffTheme.labelSmall.copyWith(
                              color: ffTheme.savingText,
                              fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
              ],
              const Spacer(),
              // Match score badge — ACTIVE-chip language (green tint + green 1px
              // border + AA green ink); the old solid-green gradient chip read as
              // a CTA and its pinned white failed on the lifted dark green.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: ffTheme.brandAccentTint,
                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                  border: Border.all(color: ffTheme.brandAccent),
                ),
                child: Text(
                  '${match.scorePct}% התאמה',
                  style: ffTheme.labelSmall.copyWith(
                    color: ffTheme.brandAccentText,
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
                                // The green CHECK is the affirmative tell; the
                                // copy itself stays ink (green discipline: data
                                // and supporting text are never green).
                                ExcludeSemantics(
                                  child: Icon(Icons.check_circle_rounded,
                                      size: 13, color: ffTheme.brandAccent),
                                ),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    r,
                                    style: ffTheme.labelSmall.copyWith(
                                      color: ffTheme.primaryText,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )),
                    ],
                    // A single honest caveat (promo expiry / commitment) — a
                    // muted, neutral note so the trade-off is visible up-front
                    // (green stays reserved for value/active, never a caveat).
                    if (topCaveat != null) ...[
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ExcludeSemantics(
                            child: Icon(Icons.info_outline_rounded,
                                size: 13, color: ffTheme.secondaryText),
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              topCaveat,
                              style: ffTheme.labelSmall.copyWith(
                                color: ffTheme.secondaryText,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (match.annualSaving > 0) ...[
                      const SizedBox(height: 8),
                      // The ONE savings treatment app-wide: the shared SavingPill
                      // (pale tint + glyph + tabular figures). Honest copy keeps
                      // the estimate marker when bills aren't personalized.
                      SavingPill(
                        text: personalized
                            ? 'חיסכון ₪${match.annualSaving} לשנה'
                            : 'הערכה: ~₪${match.annualSaving} לשנה',
                        shortText: personalized
                            ? 'חיסכון ₪${match.annualSaving}'
                            : '~₪${match.annualSaving}',
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Money renders through PriceText — the LTR isolate keeps
                  // ₪+digits stable inside the RTL card; price stays INK.
                  PriceText(
                    '₪${plan.priceText}',
                    style: ffTheme.titleLarge.copyWith(
                      color: ffTheme.primary,
                      fontWeight: FontWeight.w800,
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
/// One chip/toggle language: neutral (surface + hairline + ink) when idle;
/// ACTIVE = green tint + green 1px border + AA green ink — solid green stays
/// reserved for primary CTAs.
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
    final fg = active ? ffTheme.brandAccentText : ffTheme.primaryText;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(ffTheme.radiusSm),
      side: BorderSide(
          color: active ? ffTheme.brandAccent : ffTheme.lineColor),
    );
    return Semantics(
      button: true,
      label: semanticLabel ?? label,
      child: Material(
        color: active ? ffTheme.brandAccentTint : ffTheme.cardSurface,
        shape: shape,
        child: InkWell(
          customBorder: shape,
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
                        color: active ? ffTheme.brandAccent : ffTheme.primaryText),
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
