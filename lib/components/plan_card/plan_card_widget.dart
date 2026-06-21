import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import '../../theme/app_theme.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../widgets/pressable.dart';
import '../logo_widget/logo_widget.dart';

/// Ink read out on the amber VALUE surface — amber is a fixed-hue accent in
/// both themes, so this deep-amber ink stays legible on light AND dark.
const Color _onSaving = Color(0xFF3A2900);

class PlanCardWidget extends StatelessWidget {
  const PlanCardWidget({
    super.key,
    required this.plan,
    required this.currentBill,
    this.showCompare = true,
    this.compact = false,
    this.matchPct,
    this.bestMatch,
  });

  final Plan plan;
  final int currentBill;
  final bool showCompare;
  final bool compact;

  /// Recommendation-engine score (0–100). Rendered as a chip inside the card —
  /// callers must not overlay badges on top of the card (they collide with the
  /// watch/compare controls in RTL).
  final int? matchPct;

  /// Overrides the catalogue `plan.highlight` flag for the "best match"
  /// treatment (amber VALUE ring + floating badge) — e.g. the smart-sort top
  /// pick in results.
  final bool? bestMatch;

  String? _quizMatch(AppState appState) {
    if (!appState.quizCompleted || appState.quizBudget <= 0) return null;
    if (plan.cat != appState.quizCat) return null;
    final diff = plan.price - appState.quizBudget;
    if (diff <= 0) return 'מתאים לתקציב';
    if (diff <= 20) return 'קרוב לתקציב';
    return null;
  }

  void _openPlan(BuildContext context, AppState appState) {
    appState.viewPlan(plan.id);
    context.push('/plan/${plan.id}');
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ffTheme = AppTheme.of(context);
    final isBest = bestMatch ?? plan.highlight;
    final savings = ((currentBill - plan.price) * 12).clamp(0, 999999);
    final inCompare = appState.isInCompare(plan.id);
    final isWatching = appState.isWatching(plan.id);
    final displayPrice = '₪${plan.priceText}';
    final displayAfter = plan.hasPromo ? '₪${plan.after}' : null;
    final matchLabel = _quizMatch(appState);

    // One-line summary read out by screen readers before the inner controls.
    final cardLabel = [
      '${plan.provider} — ${plan.plan}',
      '₪${plan.priceText} ${priceUnitShort(plan)}',
      if (savings > 0) 'חוסך ₪$savings בשנה',
    ].join(', ');

    return Semantics(
      container: true,
      label: cardLabel,
      child: Padding(
      // Room above for the floating badge to overhang the best-match card.
      padding: EdgeInsets.only(bottom: 12, top: isBest ? 10 : 0),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(ffTheme.radiusLg),
        // Crisp formal frame; the best match wears the VALUE accent — a 2px
        // amber ring + warm glow, mirroring the site's `.plan--best`.
        border: Border.all(
          color: isBest ? ffTheme.saving : ffTheme.alternate,
          width: isBest ? 2 : 1,
        ),
        boxShadow: isBest
            ? [BoxShadow(color: ffTheme.saving.withValues(alpha: 0.28), blurRadius: 22, offset: const Offset(0, 8))]
            : ffTheme.shadowCard,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header row
                Row(
                  children: [
                    // Primary tap target: logo + provider + plan name open the
                    // plan detail. A single secondary affordance below links to
                    // the provider profile.
                    Expanded(
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                        onTap: () => _openPlan(context, appState),
                        child: Row(
                          children: [
                            ExcludeSemantics(
                              child: Hero(
                                tag: 'plan_logo_${plan.id}',
                                child: LogoWidget(provider: plan.provider, size: 44),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          plan.provider,
                                          style: GoogleFonts.rubik(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                            color: ffTheme.primaryText,
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: ffTheme.accent4,
                                  borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                                  border: Border.all(color: ffTheme.info.withValues(alpha: 0.3)),
                                ),
                                child: Text(
                                  plan.netLabel,
                                  style: GoogleFonts.rubik(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: ffTheme.info,
                                  ),
                                ),
                              ),
                              if (matchLabel != null) ...[
                                const SizedBox(width: 6),
                                Builder(builder: (context) {
                                  final fits = matchLabel == 'מתאים לתקציב';
                                  final tone = fits ? ffTheme.success : ffTheme.warning;
                                  return Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: tone.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                                      border: Border.all(color: tone.withValues(alpha: 0.4)),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (fits) ...[
                                          Icon(Icons.check_rounded, size: 9, color: tone),
                                          const SizedBox(width: 2),
                                        ],
                                        Text(
                                          matchLabel,
                                          style: GoogleFonts.rubik(
                                            fontSize: 9,
                                            fontWeight: FontWeight.w700,
                                            color: tone,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                }),
                              ],
                            ],
                          ),
                                  const SizedBox(height: 2),
                                  Text(
                                    plan.plan,
                                    style: GoogleFonts.assistant(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                      color: ffTheme.secondaryText,
                                    ),
                                  ),
                                  // Secondary affordance: open the provider profile.
                                  const SizedBox(height: 4),
                                  Semantics(
                                    button: true,
                                    label: 'פרופיל ${plan.provider}',
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(6),
                                      onTap: () => context.pushNamed('Provider', pathParameters: {'name': plan.provider}),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(vertical: 4),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              'פרופיל הספק',
                                              style: GoogleFonts.assistant(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                                color: ffTheme.primary,
                                              ),
                                            ),
                                            Icon(Icons.chevron_left_rounded, size: 14, color: ffTheme.primary),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        ),
                      ),
                    ),
                    if (showCompare)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _CardIconButton(
                            semanticLabel: isWatching ? 'במעקב מחיר — הסר' : 'עקוב אחר מחיר',
                            tooltip: isWatching ? 'במעקב מחיר' : 'עקוב אחר מחיר',
                            icon: isWatching ? Icons.notifications_active_rounded : Icons.notifications_none_rounded,
                            iconSize: 15,
                            active: isWatching,
                            fill: isWatching ? ffTheme.warning.withValues(alpha: 0.1) : ffTheme.background,
                            borderColor: isWatching ? ffTheme.warning : ffTheme.alternate,
                            iconColor: isWatching ? ffTheme.warning : ffTheme.secondaryText,
                            onTap: () => appState.toggleWatch(plan.id),
                          ),
                          _CardIconButton(
                            semanticLabel: inCompare ? 'בהשוואה — הסר' : 'הוסף להשוואה',
                            tooltip: inCompare ? 'בהשוואה' : 'הוסף להשוואה',
                            icon: inCompare ? Icons.check : Icons.add,
                            iconSize: 16,
                            active: inCompare,
                            fill: inCompare ? ffTheme.primary : ffTheme.background,
                            borderColor: inCompare ? ffTheme.primary : ffTheme.alternate,
                            iconColor: inCompare ? (ffTheme.dark ? ffTheme.background : Colors.white) : ffTheme.secondaryText,
                            onTap: () => appState.toggleCompare(plan.id),
                          ),
                        ],
                      ),
                  ],
                ),

                // Spec chips + recommendation score (wraps — never collides
                // with the header controls).
                if (plan.specs.isNotEmpty || matchPct != null) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    clipBehavior: Clip.hardEdge,
                    children: [
                      if (matchPct != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            // Match score is an ACTION signal → green gradient,
                            // legible in both themes (white ink on green).
                            gradient: ffTheme.accentGradient,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: ffTheme.shadowAccent,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.adjust, size: 11, color: Colors.white),
                              const SizedBox(width: 4),
                              Text(
                                '$matchPct% התאמה',
                                style: GoogleFonts.rubik(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ...plan.specs.entries.take(3).map((e) =>
                        _SpecChip(label: e.key, value: e.value, ffTheme: ffTheme),
                      ),
                    ],
                  ),
                ],

                const SizedBox(height: 12),

                // Price + savings row
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayPrice,
                          style: GoogleFonts.rubik(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: ffTheme.primaryText,
                            letterSpacing: -0.5,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                        Text(
                          priceUnitLabel(plan),
                          style: GoogleFonts.assistant(
                            fontSize: 12,
                            color: ffTheme.secondaryText,
                          ),
                        ),
                        if (displayAfter != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            'אחרי מבצע: $displayAfter',
                            style: GoogleFonts.assistant(
                              fontSize: 12,
                              color: ffTheme.secondaryText,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const Spacer(),
                    if (savings > 0)
                      // Savings wear the VALUE accent (amber), matching the
                      // site's savings figures — never the grey highlight.
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                        decoration: BoxDecoration(
                          color: ffTheme.saving,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        ),
                        child: Text(
                          'חוסך ₪$savings בשנה',
                          style: GoogleFonts.rubik(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: _onSaving,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                  ],
                ),

                if (plan.intro != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    '* ${plan.intro}',
                    style: GoogleFonts.assistant(
                      fontSize: 11,
                      color: ffTheme.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],

                if (!compact) ...[
                  const SizedBox(height: 10),

                  // Flag + feature chips
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (plan.is5G)
                        _FlagChip(label: '5G', color: ffTheme.info, ffTheme: ffTheme),
                      if (plan.noCommit)
                        _FlagChip(label: 'ללא התחייבות', color: ffTheme.success, ffTheme: ffTheme),
                      if (plan.hasAbroad)
                        _FlagChip(label: 'כולל חו"ל', color: ffTheme.tertiary, ffTheme: ffTheme),
                      ...plan.feats.take(3).map((feat) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.background,
                          borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                        ),
                        child: Text(
                          feat,
                          style: GoogleFonts.assistant(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: ffTheme.primaryText,
                          ),
                        ),
                      )),
                    ],
                  ),

                  const SizedBox(height: 12),

                  // Action row — the best match carries the single indigo
                  // ACTION accent on the list; siblings stay formal ink.
                  Row(
                    children: [
                      const Spacer(),
                      _ChooseButton(
                        isBest: isBest,
                        fullWidth: false,
                        ffTheme: ffTheme,
                        onTap: () => _openPlan(context, appState),
                      ),
                    ],
                  ),
                ] else ...[
                  const SizedBox(height: 10),
                  _ChooseButton(
                    isBest: isBest,
                    fullWidth: true,
                    ffTheme: ffTheme,
                    onTap: () => _openPlan(context, appState),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
          ),
          // Floating amber "best match" pill overhanging the top edge — the
          // same VALUE anchor the site uses for its lowest-price badge.
          if (isBest)
            PositionedDirectional(
              top: -10,
              start: 14,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
                decoration: BoxDecoration(
                  color: ffTheme.saving,
                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                  boxShadow: [BoxShadow(color: ffTheme.saving.withValues(alpha: 0.34), blurRadius: 16, offset: const Offset(0, 6))],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.star_rounded, size: 13, color: _onSaving),
                    const SizedBox(width: 4),
                    Text(
                      'ההתאמה הכי טובה',
                      style: GoogleFonts.rubik(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: _onSaving,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
      ),
    );
  }
}

/// The card's "בחירה" CTA. The best match carries the indigo ACTION gradient
/// (the one splash of colour per list); regular cards stay formal ink. Both
/// give ripple feedback and meet the 44px touch-target minimum.
class _ChooseButton extends StatelessWidget {
  const _ChooseButton({
    required this.isBest,
    required this.fullWidth,
    required this.ffTheme,
    required this.onTap,
  });

  final bool isBest;
  final bool fullWidth;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // The best match wears the green gradient → white ink. A regular card's
    // ink CTA flips with the theme (off-white surface on dark), so its label
    // takes the contrasting on-primary ink for that surface.
    final labelColor = isBest
        ? Colors.white
        : (ffTheme.dark ? ffTheme.background : Colors.white);
    final label = Text(
      'בחירה',
      style: GoogleFonts.rubik(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: labelColor,
      ),
    );
    // Pressable supplies the scale-on-press; the InkWell keeps the ripple and
    // owns the tap (so the callback fires exactly once). deferToChild lets the
    // InkWell win the gesture arena instead of Pressable swallowing the tap.
    return Pressable(
      behavior: HitTestBehavior.deferToChild,
      child: Container(
        decoration: BoxDecoration(
          gradient: isBest ? ffTheme.accentGradient : null,
          color: isBest ? null : ffTheme.primary,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          boxShadow: isBest ? ffTheme.shadowAccent : ffTheme.shadowPrimary,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(ffTheme.radiusMd),
            splashColor: Colors.white.withValues(alpha: 0.15),
            onTap: onTap,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: fullWidth ? 0 : 22, vertical: 12),
              child: fullWidth ? Center(child: label) : label,
            ),
          ),
        ),
      ),
    );
  }
}

/// Watch / compare control: a 44×44 tap target (a11y minimum) around the 32px
/// visual circle, with ripple feedback.
class _CardIconButton extends StatelessWidget {
  const _CardIconButton({
    required this.semanticLabel,
    required this.tooltip,
    required this.icon,
    required this.iconSize,
    required this.active,
    required this.fill,
    required this.borderColor,
    required this.iconColor,
    required this.onTap,
  });

  final String semanticLabel;
  final String tooltip;
  final IconData icon;
  final double iconSize;
  final bool active;
  final Color fill;
  final Color borderColor;
  final Color iconColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      label: semanticLabel,
      child: Tooltip(
        message: tooltip,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onTap,
              child: Center(
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: fill,
                    shape: BoxShape.circle,
                    border: Border.all(color: borderColor),
                  ),
                  child: Icon(icon, size: iconSize, color: iconColor),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

IconData _specIcon(String label) {
  if (label.contains('נתונים') || label.contains('גלישה')) return Icons.data_usage_rounded;
  if (label.contains('דקות')) return Icons.call_rounded;
  if (label.contains('SMS') || label.contains('sms')) return Icons.sms_rounded;
  if (label.contains('מהירות')) return Icons.speed_rounded;
  if (label.contains('ערוצים')) return Icons.tv_rounded;
  if (label.contains('חו"ל') || label.contains('חול')) return Icons.public_rounded;
  return Icons.check_rounded;
}

class _SpecChip extends StatelessWidget {
  const _SpecChip({required this.label, required this.value, required this.ffTheme});
  final String label;
  final String value;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_specIcon(label), size: 11, color: ffTheme.secondaryText),
          const SizedBox(width: 3),
          Flexible(
            child: Text(
              value,
              style: GoogleFonts.assistant(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: ffTheme.secondaryText,
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),
        ],
      ),
    );
  }
}

class _FlagChip extends StatelessWidget {
  const _FlagChip({required this.label, required this.color, required this.ffTheme});
  final String label;
  final Color color;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(ffTheme.radiusXs),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: GoogleFonts.assistant(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
