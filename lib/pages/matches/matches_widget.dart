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

// ── Sort modes ────────────────────────────────────────────────────────────────

enum _SortMode { match, price, rating }

class MatchesWidget extends StatefulWidget {
  const MatchesWidget({super.key});

  @override
  State<MatchesWidget> createState() => _MatchesWidgetState();
}

class _MatchesWidgetState extends State<MatchesWidget> {
  _SortMode _sort = _SortMode.match;

  // Plans the user has added to the quick-compare tray.
  final Set<String> _compareTray = {};

  void _addToCompare(AppState appState, String planId) {
    HapticFeedback.selectionClick();
    appState.toggleCompare(planId);
    setState(() {
      if (_compareTray.contains(planId)) {
        _compareTray.remove(planId);
      } else {
        _compareTray.add(planId);
      }
    });
  }

  // Sort the match list by the selected mode.
  List<({String catId, String catName, PlanMatch match})> _sorted(
    List<({String catId, String catName, PlanMatch match})> items,
  ) {
    final out = List.of(items);
    switch (_sort) {
      case _SortMode.match:
        out.sort((a, b) => b.match.score.compareTo(a.match.score));
      case _SortMode.price:
        out.sort((a, b) => a.match.plan.price.compareTo(b.match.plan.price));
      case _SortMode.rating:
        out.sort((a, b) => b.match.plan.rating.compareTo(a.match.plan.rating));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final summary = computeSavings(appState);
    final rawMatches = <({String catId, String catName, PlanMatch match})>[];
    for (final cs in summary.categories) {
      final best = cs.best;
      if (best == null) continue;
      final cat = categoryById(cs.categoryId);
      rawMatches.add((
        catId: cs.categoryId,
        catName: cat?.name ?? cs.categoryId,
        match: best,
      ));
    }

    final catMatches = _sorted(rawMatches);
    final totalAnnualSaving = summary.totalAnnualPotential;
    final analyzedCount = summary.categories.where((c) => c.hasBill).length;
    final personalized = appState.billsPersonalized;

    // The top match after sorting gets the "winner" treatment.
    final topItem = catMatches.isNotEmpty ? catMatches.first : null;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: Colors.white, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text(
          'ההתאמות שלי',
          style: ffTheme.titleLarge.copyWith(color: Colors.white),
        ),
        centerTitle: true,
        // Compare badge in actions
        actions: [
          if (_compareTray.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Semantics(
                button: true,
                label: 'פתח השוואת מסלולים (${_compareTray.length})',
                child: GestureDetector(
                  onTap: () => context.goNamed('Compare'),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      const Icon(Icons.compare_arrows_rounded,
                          color: Colors.white, size: 24),
                      PositionedDirectional(
                        top: -4,
                        end: -6,
                        child: Container(
                          width: 16,
                          height: 16,
                          decoration: BoxDecoration(
                            color: ffTheme.saving,
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Text(
                              '${_compareTray.length}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                fontFeatures: [
                                  FontFeature.tabularFigures()
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      body: catMatches.isEmpty
          ? EmptyState(
              icon: Icons.auto_awesome_rounded,
              headline: 'עדיין אין התאמות',
              subtitle:
                  'ענה על השאלון ונמצא לך את המסלולים הכי מתאימים',
              ctaLabel: 'התחל שאלון',
              onCtaTap: () async => context.pushNamed('Quiz'),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
              children: [
                // ── Hero summary card ──────────────────────────────────────────
                _buildHeroCard(context, ffTheme, totalAnnualSaving,
                        analyzedCount, personalized)
                    .animate()
                    .fadeIn(duration: 500.ms),
                const SizedBox(height: 20),

                // ── Sort chips ─────────────────────────────────────────────────
                _buildSortChips(ffTheme)
                    .animate(delay: 80.ms)
                    .fadeIn(duration: 300.ms),
                const SizedBox(height: 20),

                // ── Per-category match cards ───────────────────────────────────
                ...catMatches.asMap().entries.map((entry) {
                  final i = entry.key;
                  final item = entry.value;
                  final isWinner = i == 0 && topItem != null;
                  return _buildMatchCard(
                    context,
                    ffTheme,
                    item.catId,
                    item.catName,
                    item.match,
                    appState,
                    personalized,
                    isWinner: isWinner,
                  )
                      .animate(delay: (160 + i * 80).ms)
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: 0.06, end: 0);
                }),
              ],
            ),
    );
  }

  // ── Sort chips ───────────────────────────────────────────────────────────────

  Widget _buildSortChips(AppTheme ffTheme) {
    const chips = [
      (_SortMode.match, 'התאמה'),
      (_SortMode.price, 'מחיר'),
      (_SortMode.rating, 'דירוג'),
    ];
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: chips.map((chip) {
          final active = _sort == chip.$1;
          return Padding(
            padding: const EdgeInsetsDirectional.only(end: 8),
            child: Center(
              child: GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _sort = chip.$1);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  gradient: active ? ffTheme.accentGradient : null,
                  color: active ? null : ffTheme.secondaryBackground,
                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                  border: Border.all(
                    color:
                        active ? Colors.transparent : ffTheme.lineColor,
                  ),
                  boxShadow: active ? ffTheme.shadowSoft : null,
                ),
                child: Text(
                  chip.$2,
                  style: ffTheme.labelMedium.copyWith(
                    fontWeight:
                        active ? FontWeight.w700 : FontWeight.w500,
                    color: active ? Colors.white : ffTheme.primaryText,
                  ),
                ),
              ),
            ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // ── Hero card ────────────────────────────────────────────────────────────────

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
        borderRadius: BorderRadius.circular(ffTheme.radiusLg),
        boxShadow: ffTheme.shadowLifted,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding:
                const EdgeInsetsDirectional.fromSTEB(10, 5, 10, 5),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(ffTheme.radiusXs),
            ),
            child: Text(
              '✦ דאשבורד חכם',
              style: ffTheme.labelSmall.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            totalSaving > 0
                ? 'חיסכון פוטנציאלי שנתי'
                : 'התאמות לפי הפרופיל שלך',
            style: ffTheme.bodySmall
                .copyWith(color: Colors.white.withValues(alpha: 0.65)),
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
                    color: ffTheme.saving,
                    fontWeight: FontWeight.bold,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              if (!personalized && totalSaving > 0) ...[
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(ffTheme.radiusXs),
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
            style: ffTheme.bodySmall
                .copyWith(color: Colors.white.withValues(alpha: 0.55)),
          ),
        ],
      ),
    );
  }

  // ── Plan match card ──────────────────────────────────────────────────────────

  Widget _buildMatchCard(
    BuildContext context,
    AppTheme ffTheme,
    String catId,
    String catName,
    PlanMatch match,
    AppState appState,
    bool personalized, {
    bool isWinner = false,
  }) {
    final plan = match.plan;
    final priceLabel = priceUnitLabel(plan);
    final inCompare = _compareTray.contains(plan.id);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Amber gradient border for the winner card.
        if (isWinner)
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    ffTheme.saving,
                    ffTheme.saving.withValues(alpha: 0.4),
                    ffTheme.saving,
                  ],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(ffTheme.radiusLg + 2),
              ),
            ),
          ),
        Padding(
          padding: EdgeInsets.all(isWinner ? 2 : 0),
          child: AppCard(
            margin: const EdgeInsets.only(bottom: 14),
            onTap: () => context.pushNamed('PlanDetail',
                pathParameters: {'planId': plan.id}),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Winner badge
                if (isWinner) ...[
                  Container(
                    padding: const EdgeInsetsDirectional.fromSTEB(
                        10, 4, 12, 4),
                    decoration: BoxDecoration(
                      color: ffTheme.saving,
                      borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.emoji_events_rounded,
                            size: 13, color: Colors.white),
                        const SizedBox(width: 5),
                        Text(
                          'ההמלצה שלנו',
                          style: ffTheme.labelSmall.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Category header row
                Row(
                  children: [
                    Icon(categoryIconData(catId),
                        size: 20, color: ffTheme.secondaryText),
                    const SizedBox(width: 8),
                    Text(
                      catName,
                      style: ffTheme.labelLarge.copyWith(
                        color: ffTheme.secondaryText,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    // Score badge + "למה?" chip
                    _ScoreBadge(
                      match: match,
                      ffTheme: ffTheme,
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
                          if (match.annualSaving > 0) ...[
                            const SizedBox(height: 8),
                            StatPill(
                              value: personalized
                                  ? '₪${match.annualSaving}'
                                  : '~₪${match.annualSaving}',
                              label: personalized
                                  ? 'לשנה'
                                  : 'הערכה לשנה',
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
                            fontFeatures: const [
                              FontFeature.tabularFigures()
                            ],
                          ),
                        ),
                        Text(
                          priceLabel,
                          style: ffTheme.labelSmall
                              .copyWith(color: ffTheme.secondaryText),
                        ),
                        const SizedBox(height: 6),
                        // + Compare button
                        Semantics(
                          button: true,
                          label: inCompare
                              ? 'הסר מהשוואה'
                              : 'הוסף להשוואה',
                          child: GestureDetector(
                            onTap: () =>
                                _addToCompare(appState, plan.id),
                            child: AnimatedContainer(
                              duration:
                                  const Duration(milliseconds: 180),
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: inCompare
                                    ? ffTheme.brandAccent
                                    : ffTheme.secondaryBackground,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: inCompare
                                      ? ffTheme.brandAccent
                                      : ffTheme.alternate,
                                  width: 1.5,
                                ),
                              ),
                              child: Icon(
                                inCompare
                                    ? Icons.check_rounded
                                    : Icons.add_rounded,
                                size: 14,
                                color: inCompare
                                    ? Colors.white
                                    : ffTheme.secondaryText,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),

                // Winner: extra reasons preview
                if (isWinner && match.reasons.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Divider(height: 1),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: match.reasons.take(3).map((r) {
                      return Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: ffTheme.saving.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                              color:
                                  ffTheme.saving.withValues(alpha: 0.35)),
                        ),
                        child: Text(
                          r,
                          style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.saving,
                            fontWeight: FontWeight.w600,
                            fontSize: 11,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ── Score badge with "למה?" tap ───────────────────────────────────────────────

class _ScoreBadge extends StatelessWidget {
  const _ScoreBadge({required this.match, required this.ffTheme});
  final PlanMatch match;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: ffTheme.primary,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
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
        const SizedBox(width: 6),
        // "למה?" tappable chip
        Semantics(
          button: true,
          label: 'למה המסלול הזה מתאים',
          child: GestureDetector(
            onTap: () => _showWhySheet(context, ffTheme),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: ffTheme.brandAccent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                border: Border.all(
                    color: ffTheme.brandAccent.withValues(alpha: 0.4)),
              ),
              child: Text(
                'למה?',
                style: ffTheme.labelSmall.copyWith(
                  color: ffTheme.brandAccent,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // Build human-readable explanation bullets.
  List<_ExplanationItem> _explanations(PlanMatch m) {
    final items = <_ExplanationItem>[];
    for (final r in m.reasons) {
      items.add(_ExplanationItem(text: r, isPositive: true));
    }
    for (final c in m.caveats) {
      items.add(_ExplanationItem(text: c, isPositive: false));
    }
    if (items.isEmpty) {
      // Derive from plan specs when engine produced no explicit reasons.
      final plan = m.plan;
      if (plan.is5G) {
        items.add(const _ExplanationItem(text: 'כולל 5G מהיר', isPositive: true));
      }
      if (plan.noCommit) {
        items.add(const _ExplanationItem(
            text: 'ללא התחייבות — ביטול בכל עת', isPositive: true));
      }
      if (plan.isFixed) {
        items.add(const _ExplanationItem(
            text: 'מחיר קבוע — ללא עליות', isPositive: true));
      }
      if (plan.hasAbroad) {
        items.add(const _ExplanationItem(
            text: 'כולל גלישה בחו"ל', isPositive: true));
      }
    }
    return items;
  }

  void _showWhySheet(BuildContext context, AppTheme ffTheme) {
    final items = _explanations(match);
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: ffTheme.alternate,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: ffTheme.brandAccent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.lightbulb_outline_rounded,
                    color: ffTheme.brandAccent, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('למה המסלול הזה?',
                        style: ffTheme.titleMedium
                            .copyWith(fontWeight: FontWeight.w700)),
                    Text('${match.scorePct}% התאמה — ${match.label}',
                        style: ffTheme.bodySmall
                            .copyWith(color: ffTheme.secondaryText)),
                  ],
                ),
              ),
            ]),
            const SizedBox(height: 20),
            if (items.isEmpty)
              Text(
                'תוכנית זו מתאימה לפרופיל שלך על בסיס מחיר ותנאי המסלול.',
                style: ffTheme.bodyMedium
                    .copyWith(color: ffTheme.secondaryText),
              )
            else
              ...items.map((item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          item.isPositive
                              ? Icons.check_circle_rounded
                              : Icons.warning_amber_rounded,
                          size: 18,
                          color: item.isPositive
                              ? const Color(0xFF16A34A)
                              : ffTheme.saving,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            item.text,
                            style: ffTheme.bodyMedium.copyWith(
                              color: item.isPositive
                                  ? ffTheme.primaryText
                                  : ffTheme.secondaryText,
                            ),
                          ),
                        ),
                      ],
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

class _ExplanationItem {
  const _ExplanationItem({required this.text, required this.isPositive});
  final String text;
  final bool isPositive;
}
