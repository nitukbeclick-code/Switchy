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

  /// ₪/year savings badge; null hides the lime badge entirely.
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
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: ffTheme.alternate),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
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
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: ffTheme.secondary,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'חוסך ₪$savingsPerYear/שנה',
                          style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.primary,
                            fontWeight: FontWeight.w700,
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
                    '₪${plan.price}/${priceUnitShort(plan)}',
                    style: ffTheme.titleMedium.copyWith(color: ffTheme.primary),
                  ),
                  if (showCta) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: ffTheme.primary,
                        borderRadius: BorderRadius.circular(8),
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
    );
  }
}
