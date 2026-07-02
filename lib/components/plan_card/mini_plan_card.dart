import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../models.dart';
import '../../data.dart';
import '../../widgets/price_text.dart';
import '../../widgets/saving_pill.dart';
import '../logo_widget/logo_widget.dart';

/// The compact plan row reused across home (hot deal / quiz match / top pick /
/// watchlist / recently viewed), plan-detail similar-plans, account and profile.
/// One source of truth for the "logo + provider + plan + savings badge + price
/// + CTA" layout that was hand-rolled 8+ times.
class MiniPlanCard extends StatelessWidget {
  const MiniPlanCard({
    super.key,
    required this.plan,
    this.savingsPerYear,
    this.onTap,
    // Opens the plan detail (it does not convert) → the calm browse label
    // "פרטים", consistent with the full plan card. Callers that need a different
    // verb still override it, but the default never spends a conversion verb on
    // a non-conversion tap.
    this.ctaLabel = 'פרטים',
    this.showCta = true,
    this.isBest = false,
  });

  final Plan plan;

  /// ₪/year savings figure; null hides the VALUE pill entirely.
  final int? savingsPerYear;
  final VoidCallback? onTap;
  final String ctaLabel;
  final bool showCta;

  /// De-push gate: the "חוסך ₪X/שנה" VALUE pill prints ONLY when this is the
  /// single best-match / curated card. Generic list rows (watchlist, account,
  /// profile) leave this false so they show price only and the saving figure is
  /// not repeated on every card. When shown, savingsPerYear is the REAL saving.
  final bool isBest;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final showBadge = isBest && (savingsPerYear ?? 0) > 0;

    // One-line summary for screen readers — provider, plan, the REAL price and
    // (only when the VALUE pill is visible) the REAL saving, mirroring exactly
    // what sighted users see on the row. Truth-only, no re-derived figures.
    final cardLabel = [
      '${plan.provider} — ${plan.plan}',
      '₪${plan.priceText}/${priceUnitShort(plan)}',
      if (showBadge) 'חוסך ₪$savingsPerYear/שנה',
    ].join(', ');

    return Semantics(
      button: onTap != null,
      label: cardLabel,
      // Perf: the row repeats across home/watchlist/similar-plans lists — a
      // RepaintBoundary keeps its ink ripple from repainting the whole list
      // when it sits inside an eager Column.
      child: RepaintBoundary(
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          border: Border.all(color: ffTheme.alternate),
          boxShadow: ffTheme.shadowCard,
        ),
        child: Material(
          color: ffTheme.cardSurface,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          child: InkWell(
            borderRadius: BorderRadius.circular(ffTheme.radiusLg),
            onTap: onTap,
            child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Decorative provider logo/initials — hidden from screen readers
              // (the provider name is already in the row's Semantics label).
              ExcludeSemantics(
                child: LogoWidget(provider: plan.provider, size: 52),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(plan.provider, style: ffTheme.titleSmall),
                    const SizedBox(height: 2),
                    // Two lines: on the narrow carousel card long plan names
                    // ('אינטרנט סיבים 1000 מגה…') used to chop mid-word after
                    // one line; the card's height budget fits a second line, so
                    // wrap before ellipsizing (live-tour truncation fix).
                    Text(plan.plan,
                        style: ffTheme.bodySmall,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                    if (showBadge) ...[
                      const SizedBox(height: 6),
                      // Savings wear the one shared VALUE treatment — the
                      // [SavingPill] (pale-green tint + green text + savings
                      // glyph + tabular figures) — same as the full plan card,
                      // so savings read as a recognizable category, not a
                      // competing green button. Truth-only: the REAL saving.
                      // COMPACT-aware: when the middle column is too narrow
                      // for the full copy the pill drops '/שנה' (same real
                      // figure), and hides entirely rather than render an
                      // unreadable 'חו…' half-pill — the full copy stays in
                      // the row's Semantics label above either way.
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: SavingPill(
                          text: 'חוסך ₪$savingsPerYear/שנה',
                          shortText: 'חוסך ₪$savingsPerYear',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Money token (₪ + number + /unit) — rendered via [PriceText]
                  // so the currency+digits keep a stable LTR bidi order inside
                  // the RTL row. Style override keeps the row's titleMedium/ink
                  // numeral (not the larger priceDisplay). Truth-only verbatim;
                  // still a single Text node for find.textContaining(...).
                  PriceText(
                    '₪${plan.priceText}/${priceUnitShort(plan)}',
                    style: ffTheme.titleMedium.copyWith(color: ffTheme.primary),
                  ),
                  if (showCta) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: ffTheme.primary,
                        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                      ),
                      child: Text(
                        '$ctaLabel ←',
                        // The label sits on the ink ACTION fill (ffTheme.primary
                        // = ink on light, near-white on dark). ffTheme.background
                        // is the theme's opposite-lightness canvas, so it always
                        // pairs as a guaranteed-AA (>=16:1) on-color in BOTH
                        // themes — no hardcoded white that would fail on the
                        // near-white dark fill.
                        style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.background,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
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
