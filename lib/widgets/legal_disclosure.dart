import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../legal.dart';

/// Consumer Protection §7b / §17 disclosure block, rendered near a price/CTA.
///
/// Mirrors the web app's `<CommissionDisclosure>` + `<PriceCaveat>` (see
/// web/components/*) using the shared, owner/lawyer-approved Hebrew copy from
/// [legal.dart]:
///   • §7b commission disclosure — the service is free, we receive a referral
///     fee from the provider on a switch, and that does NOT change the price the
///     user pays (lead phrase emphasised, then the honest body).
///   • §17 price caveat — prices include VAT, are accurate as of the update
///     date, and must be verified with the provider before signing.
///
/// Truth-only: it shows ONLY the approved legal text — no figures, ratings or
/// claims are derived here. Muted, compact, RTL-native (start-aligned) and
/// theme-aware so it reads correctly in light and dark.
class LegalDisclosure extends StatelessWidget {
  const LegalDisclosure({super.key, this.padding, this.decorated = false});

  /// Optional outer padding. Defaults to none so callers control spacing.
  final EdgeInsetsGeometry? padding;

  /// Opt-in "honest model" trust treatment: wraps the SAME approved copy in a
  /// quiet pale-tint surface (hairline border + a small shield icon).
  /// Presentation only — the §7b/§17 wording is byte-identical to the plain
  /// variant, so no new legal copy is introduced. Defaults to false, which is
  /// zero visual change for every existing call site. Tokens only (neutral
  /// tint + hairline + muted ink icon) so dark parity comes from AppTheme.
  final bool decorated;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final muted = t.secondaryText;

    final block = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // §7b — commission / referral-fee disclosure (lead emphasised + body).
        Text.rich(
          TextSpan(
            style: t.labelSmall.copyWith(color: muted, height: 1.45),
            children: [
              TextSpan(
                text: '$kCommissionDisclosureLead ',
                style: t.labelSmall.copyWith(
                  color: t.primaryText,
                  fontWeight: FontWeight.w700,
                  height: 1.45,
                ),
              ),
              const TextSpan(text: kCommissionDisclosureBody),
            ],
          ),
          textAlign: TextAlign.start,
        ),
        const SizedBox(height: 6),
        // §17 — price-accuracy caveat (VAT-inclusive · fresh-as-of · verify).
        Text(
          kPriceAccuracyCaveat,
          style: t.labelSmall.copyWith(color: muted, height: 1.45),
          textAlign: TextAlign.start,
        ),
      ],
    );

    // Opt-in quiet trust wrapper. The [block] inside is the same widget tree —
    // the approved copy is rendered once either way, so tests that pin the §7b
    // lead to findsOneWidget stay valid at a decorated call site.
    final content = !decorated
        ? block
        : Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: t.accent1, // neutral pale tint — ink dominates, no accent
              borderRadius: BorderRadius.circular(t.radiusMd),
              border: Border.all(color: t.lineColor),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.shield_outlined, size: 16, color: muted),
                const SizedBox(width: 8),
                Expanded(child: block),
              ],
            ),
          );

    return padding == null
        ? content
        : Padding(padding: padding!, child: content);
  }
}
