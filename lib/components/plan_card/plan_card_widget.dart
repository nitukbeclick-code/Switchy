import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../../theme/app_theme.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../widgets/pressable.dart';
import '../../widgets/price_text.dart';
import '../../widgets/saving_pill.dart';
import '../logo_widget/logo_widget.dart';

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
  /// treatment (flat 2px green VALUE border + flat floating badge, no glow) —
  /// e.g. the smart-sort top pick in results.
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
    final displayAfter = plan.hasPromo ? '₪${plan.afterText}' : null;
    final matchLabel = _quizMatch(appState);

    // One-line summary read out by screen readers before the inner controls.
    // The saving line is announced only on the best-match card — the same place
    // the visible badge now appears (de-pushed: generic list rows show price
    // only, so "חוסך ₪X" is no longer repeated on every card).
    final cardLabel = [
      '${plan.provider} — ${plan.plan}',
      '₪${plan.priceText} ${priceUnitShort(plan)}',
      if (isBest && savings > 0) 'חוסך ₪$savings בשנה',
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
        // Crisp formal frame; the best match is expressed by ONLY the flat 2px
        // green border (+ the flat 'ההתאמה הכי טובה' badge below) — consistent
        // with the app's flat, border-defined thesis. The Geist redesign
        // removed glows; we do not re-introduce one here, so the best-match
        // card keeps the same flat [shadowCard] as its siblings.
        border: Border.all(
          color: isBest ? ffTheme.saving : ffTheme.alternate,
          width: isBest ? 2 : 1,
        ),
        boxShadow: ffTheme.shadowCard,
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
                                          // 15/w700/ink — the title scale exactly.
                                          style: ffTheme.titleLarge,
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
                                  // Rubik micro-chip: nearest Rubik scale token
                                  // is titleSmall (13/w600); the 10px size +
                                  // w700 + info colour are the genuine deltas.
                                  style: ffTheme.titleSmall.copyWith(
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
                                          // Rubik micro-chip: nearest Rubik token
                                          // is titleSmall (13/w600); 9px + w700 +
                                          // tone are the genuine deltas.
                                          style: ffTheme.titleSmall.copyWith(
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
                                    // 13/w500/secondary — the bodySmall scale exactly.
                                    style: ffTheme.bodySmall,
                                  ),
                                  // Secondary affordance: open the provider profile.
                                  const SizedBox(height: 4),
                                  Semantics(
                                    button: true,
                                    label: 'פרופיל ${plan.provider}',
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                                      onTap: () => context.pushNamed('Provider', pathParameters: {'name': plan.provider}),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(vertical: 4),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              'פרופיל הספק',
                                              // 11/w600 labelSmall; w700 + primary
                                              // (link ink) are the genuine deltas.
                                              style: ffTheme.labelSmall.copyWith(
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
                            onTap: () {
                              HapticFeedback.selectionClick();
                              appState.toggleWatch(plan.id);
                            },
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
                            onTap: () {
                              HapticFeedback.selectionClick();
                              appState.toggleCompare(plan.id);
                            },
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
                            // Full-round pill chip.
                            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                            boxShadow: ffTheme.shadowAccent,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.adjust, size: 11, color: Colors.white),
                              const SizedBox(width: 4),
                              Text(
                                '$matchPct% התאמה',
                                // Rubik chip: nearest Rubik token is titleSmall
                                // (13/w600); 11px + w700 + white-on-green are the
                                // genuine deltas.
                                style: ffTheme.titleSmall.copyWith(
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

                // Equipment / fees chips — the category-relevant router / decoder
                // / range-extender / installation / connection-fee the card used
                // to hide (the detail page has the full breakdown on tap). Built
                // from the truth-only [Plan.categoryFields]; we drop any field
                // whose value is already shown above as a spec chip so we never
                // duplicate נפח/מהירות. Neutral white-glass + ink only — the
                // green/amber accents stay reserved for ACTION/VALUE, and the
                // provider's own colours are never touched here.
                Builder(builder: (context) {
                  // Values already rendered as spec chips (first three specs).
                  final shownSpecValues =
                      plan.specs.values.take(3).toSet();
                  final equip = plan
                      .categoryFields()
                      .where((f) => !shownSpecValues.contains(f.value))
                      .toList();
                  if (equip.isEmpty) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      clipBehavior: Clip.hardEdge,
                      children: [
                        for (final f in equip)
                          _EquipChip(
                              label: f.label, value: f.value, ffTheme: ffTheme),
                      ],
                    ),
                  );
                }),

                const SizedBox(height: 12),

                // Price + savings row
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // The plan-card price numeral — the dedicated
                        // priceDisplay token (30/w800/-0.5/tabular). Rendered via
                        // [PriceText] so the ₪+digits run keeps a stable LTR bidi
                        // order inside the RTL card (₪ pinned before the number,
                        // never re-ordered). Truth-only: the REAL displayPrice
                        // string is rendered verbatim, still a single Text node
                        // so find.text('₪79') keeps matching.
                        PriceText(displayPrice),
                        Text(
                          priceUnitLabel(plan),
                          // 12px Assistant caption (default w400) — nearest scale
                          // token by size is labelMedium (12/w600); w400 is the
                          // genuine delta so the unit stays a light caption.
                          style: ffTheme.labelMedium.copyWith(
                            fontWeight: FontWeight.w400,
                            color: ffTheme.secondaryText,
                          ),
                        ),
                        if (displayAfter != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            'אחרי מבצע: $displayAfter',
                            // 12px Assistant caption — labelMedium (12) + w400
                            // delta, matching the price-unit caption above.
                            style: ffTheme.labelMedium.copyWith(
                              fontWeight: FontWeight.w400,
                              color: ffTheme.secondaryText,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const Spacer(),
                    if (isBest && savings > 0)
                      // De-pushed: the "חוסך ₪X בשנה" VALUE pill prints ONLY on
                      // the single best-match card now (not on every list row),
                      // so the list reads as a calm price comparison. When shown
                      // it's still the REAL saving (currentBill − price) × 12,
                      // rendered through the shared [SavingPill] so savings get
                      // the one consistent VALUE treatment (pale-green tint +
                      // green text + savings glyph + tabular figures).
                      SavingPill(text: 'חוסך ₪$savings בשנה'),
                  ],
                ),

                if (plan.intro != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    '* ${plan.intro}',
                    // 11/w600 labelSmall; the warning colour is the genuine delta.
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.warning),
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
                        _FlagChip(label: '5G', ffTheme: ffTheme),
                      if (plan.noCommit)
                        _FlagChip(label: 'ללא התחייבות', ffTheme: ffTheme),
                      if (plan.hasAbroad)
                        _FlagChip(label: 'כולל חו"ל', ffTheme: ffTheme),
                      ...plan.feats.take(3).map((feat) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.background,
                          borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                        ),
                        child: Text(
                          feat,
                          // 11/w600 labelSmall; primaryText is the genuine delta.
                          style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.primaryText,
                          ),
                        ),
                      )),
                    ],
                  ),

                  const SizedBox(height: 12),

                  // Action row — the best match carries the single green
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
          // Floating green "best match" pill overhanging the top edge — the
          // same VALUE anchor the site uses for its lowest-price badge. FLAT,
          // no shadow: 'best match' is expressed by the 2px green border + this
          // badge alone, per the app's flat, border-defined thesis (the Geist
          // redesign removed the badge glow).
          if (isBest)
            PositionedDirectional(
              top: -10,
              start: 14,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
                decoration: BoxDecoration(
                  color: ffTheme.saving,
                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.star_rounded, size: 13, color: ffTheme.onSaving),
                    const SizedBox(width: 4),
                    Text(
                      'ההתאמה הכי טובה',
                      // Rubik badge: nearest Rubik token is titleSmall (13/w600);
                      // 11px + w800 + onSaving ink are the genuine deltas.
                      style: ffTheme.titleSmall.copyWith(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: ffTheme.onSaving,
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

/// The card's "פרטים" action — it OPENS the plan detail, it does not convert,
/// so it stays the card's calm primary action (not a conversion CTA). The best
/// match carries the green ACTION gradient (the one splash of colour per list);
/// regular cards stay formal ink. Both give ripple feedback and meet the 44px
/// touch-target minimum.
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
      'פרטים',
      // Action label: nearest Rubik token is titleLarge (15/w700); 14px + the
      // on-fill labelColor are the genuine deltas. "פרטים" (not "בחירה") — the
      // button opens the plan detail, it doesn't convert, so the verb stays a
      // calm browse action and the conversion accent is spent only at the lead.
      style: ffTheme.titleLarge.copyWith(
        fontSize: 14,
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

/// Per-label icon for an equipment/fee chip — mirrors the plan-detail
/// `_feeIcon` heuristic (router / decoder / installation / connection),
/// defaulting to a neutral receipt glyph.
IconData _equipIcon(String label) {
  final l = label;
  if (l.contains('נתב') || l.contains('ראוטר')) return Icons.router_rounded;
  if (l.contains('ממיר')) return Icons.devices_other_rounded;
  if (l.contains('מגדיל טווח') || l.contains('מרחיב טווח')) {
    return Icons.wifi_tethering_rounded;
  }
  if (l.contains('התקנה')) return Icons.build_rounded;
  if (l.contains('חיבור') || l.contains('הצטרפות')) return Icons.link_rounded;
  return Icons.receipt_long_rounded;
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
        // Full-round pill chip.
        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
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
              // 11/w600/secondary — the labelSmall scale exactly.
              style: ffTheme.labelSmall,
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),
        ],
      ),
    );
  }
}

/// A compact equipment / fee chip for the card — same white-glass + ink pill
/// styling as [_SpecChip], but it carries the label too (e.g. "נתב +₪21.9/ח׳",
/// "התקנה: חינם", "דמי חיבור: אין"), since the label is what distinguishes one
/// fee from another. Decorative detail inside the card's top-level Semantics; it
/// adds no competing focusable node, and uses no green/amber (those stay
/// reserved for ACTION/VALUE).
class _EquipChip extends StatelessWidget {
  const _EquipChip(
      {required this.label, required this.value, required this.ffTheme});
  final String label;
  final String value;
  final AppTheme ffTheme;

  /// Compose "label value" — but when the value already starts with a sign /
  /// currency (e.g. "+₪21.9/ח׳") keep it tight ("נתב +₪21.9/ח׳"); otherwise add
  /// a colon ("התקנה: חינם") for readability.
  String get _text {
    final v = value.trim();
    final joiner = (v.startsWith('+') || v.startsWith('₪') || v.startsWith('-'))
        ? ' '
        : ': ';
    return '$label$joiner$v';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: ffTheme.background,
        // Full-round pill chip.
        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_equipIcon(label), size: 11, color: ffTheme.secondaryText),
          const SizedBox(width: 3),
          Flexible(
            child: Text(
              _text,
              // 11/w600/secondary — the labelSmall scale exactly.
              style: ffTheme.labelSmall,
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
  const _FlagChip({required this.label, required this.ffTheme});
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    // GEIST: feature flags are decorative, so they read as neutral mono chips
    // (accent1 fill, hairline border, secondary ink) — the green/amber accents
    // stay reserved for genuine ACTION/VALUE, not info badges.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(ffTheme.radiusXs),
        border: Border.all(color: ffTheme.lineColor),
      ),
      child: Text(
        label,
        // 11/w600 labelSmall; w700 is the genuine delta (flag chips read bolder).
        style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}
