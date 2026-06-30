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
    this.ctaLabel = 'בחר',
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

    return Semantics(
      button: onTap != null,
      label: '${plan.provider} — ${plan.plan}',
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
              LogoWidget(provider: plan.provider, size: 52),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(plan.provider, style: ffTheme.titleSmall),
                    const SizedBox(height: 2),
                    Text(plan.plan,
                        style: ffTheme.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    if (showBadge) ...[
                      const SizedBox(height: 6),
                      // Savings wear the one shared VALUE treatment — the
                      // [SavingPill] (pale-green tint + green text + savings
                      // glyph + tabular figures) — same as the full plan card,
                      // so savings read as a recognizable category, not a
                      // competing green button. Truth-only: the REAL saving.
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: SavingPill(text: 'חוסך ₪$savingsPerYear/שנה'),
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
    );
  }
}
