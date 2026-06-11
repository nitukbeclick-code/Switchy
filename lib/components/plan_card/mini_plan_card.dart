import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../models.dart';
import '../../data.dart';
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
  });

  final Plan plan;

  /// ₪/year savings badge; null hides the amber VALUE badge entirely.
  final int? savingsPerYear;
  final VoidCallback? onTap;
  final String ctaLabel;
  final bool showCta;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final showBadge = (savingsPerYear ?? 0) > 0;

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
          color: Colors.white,
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
                      // Savings wear the VALUE accent (amber) — same treatment
                      // as the full plan card and the site.
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: ffTheme.saving,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        ),
                        child: Text(
                          'חוסך ₪$savingsPerYear/שנה',
                          style: ffTheme.labelSmall.copyWith(
                            color: const Color(0xFF3A2900),
                            fontWeight: FontWeight.w700,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
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
                  Text(
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
                        style: ffTheme.labelSmall.copyWith(color: Colors.white),
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
