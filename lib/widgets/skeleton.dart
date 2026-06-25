import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../theme/app_theme.dart';

/// Shimmering placeholder primitives for content that is still loading from
/// the network — a calm wash on the brand's glass surfaces (never a blocking
/// spinner for list content). Theme-aware: light slate-grey tones on light,
/// deep slate tones on dark.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 14, this.radius = 8});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    // The fill is the shimmer's BASE tone; the Shimmer ancestor paints the
    // moving highlight over it. On dark this is a slate block, not white.
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF222A38) : Colors.white,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// The shared 3-tone, RTL-aware shimmer wrapper for skeleton content. Wrap any
/// tree of [SkeletonBox]es in this so they animate together with a single sweep
/// that travels along the reading direction (right-to-left in this RTL app).
class SkeletonShimmer extends StatelessWidget {
  const SkeletonShimmer({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final isRtl = Directionality.of(context) == TextDirection.rtl;
    // 3-tone sweep: base → mid → bright highlight → mid → base, so the band has
    // a soft leading + trailing falloff rather than a hard two-stop edge.
    final base = dark ? const Color(0xFF222A38) : const Color(0xFFE9EDF0);
    final mid = dark ? const Color(0xFF2C3647) : const Color(0xFFEFF2F5);
    final hi = dark ? const Color(0xFF36425A) : const Color(0xFFF9FBFC);
    if (reduceMotion) {
      // Static base wash — no sweep — under reduced motion.
      return child;
    }
    return Shimmer(
      // Right-to-left sweep matches the RTL reading direction.
      direction: isRtl ? ShimmerDirection.rtl : ShimmerDirection.ltr,
      period: const Duration(milliseconds: 1400),
      gradient: LinearGradient(
        begin: Alignment.centerRight,
        end: Alignment.centerLeft,
        colors: [base, mid, hi, mid, base],
        stops: const [0.0, 0.35, 0.5, 0.65, 1.0],
      ),
      child: child,
    );
  }
}

/// A ghost of a community post card — three of these stand in for the feed
/// while the first remote page loads.
class SkeletonPostCard extends StatelessWidget {
  const SkeletonPostCard({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      // Soft card surface so the loading ghost sits on the same two-layer
      // shadow + glass-glint as the real post cards it stands in for, instead
      // of a hard 1px border. Shimmer contents below are unchanged.
      decoration: t.cardDecoration(),
      child: const SkeletonShimmer(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SkeletonBox(width: 38, height: 38, radius: 19),
                SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(width: 110, height: 13),
                      SizedBox(height: 6),
                      SkeletonBox(width: 70, height: 10),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: 14),
            SkeletonBox(width: double.infinity, height: 13),
            SizedBox(height: 7),
            SkeletonBox(width: double.infinity, height: 13),
            SizedBox(height: 7),
            SkeletonBox(width: 180, height: 13),
          ],
        ),
      ),
    );
  }
}

/// A ghost of a `MiniPlanCard` — a logo square, the provider + plan name lines,
/// an amber-shaped savings badge, and the price/CTA column on the trailing edge.
/// Laid out to match the real plan row so the loading state already signals the
/// FINAL shape (logo / two text lines + badge / price + CTA) before data lands.
///
/// RTL-aware (the [Row] follows the ambient [Directionality], so the price
/// column sits on the logical trailing edge), dark-aware (via [SkeletonBox] and
/// [AppTheme.cardDecoration]), reduced-motion-safe (the [SkeletonShimmer]
/// ancestor drops its sweep when `MediaQuery.disableAnimations` is set), and
/// announced to screen readers as a single "טוען" rather than a pile of boxes.
class SkeletonPlanCard extends StatelessWidget {
  const SkeletonPlanCard({super.key, this.showBadge = true});

  /// Whether to reserve space for the amber savings badge line, matching a
  /// `MiniPlanCard` that shows a `savingsPerYear` badge.
  final bool showBadge;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Semantics(
      label: 'טוען',
      container: true,
      child: ExcludeSemantics(
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: t.cardDecoration(),
          child: SkeletonShimmer(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Provider logo square — same 52px footprint as LogoWidget.
                SkeletonBox(width: 52, height: 52, radius: t.radiusMd),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SkeletonBox(width: 96, height: 14), // provider name
                      const SizedBox(height: 6),
                      const SkeletonBox(width: 140, height: 11), // plan name
                      if (showBadge) ...[
                        const SizedBox(height: 8),
                        // Savings badge ghost — pill-shaped like the amber VALUE
                        // badge it stands in for.
                        SkeletonBox(width: 88, height: 18, radius: t.radiusPill),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Price + CTA column on the logical trailing edge.
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const SkeletonBox(width: 56, height: 18), // price
                    const SizedBox(height: 10),
                    SkeletonBox(width: 64, height: 28, radius: t.radiusMd), // CTA
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A ghost of a leading-icon list row — a small square/avatar, a title line and
/// a shorter subtitle line, optionally a trailing chip. Stands in for simple
/// list tiles (settings rows, notification rows, search results) while their
/// data loads.
///
/// RTL-aware (the [Row] follows the ambient [Directionality]), dark-aware, and
/// reduced-motion-safe via the [SkeletonShimmer] ancestor; announced as a single
/// "טוען" to screen readers. The leading mark and trailing chip are optional so
/// the tile can match a text-only or icon-led row.
class SkeletonListTile extends StatelessWidget {
  const SkeletonListTile({
    super.key,
    this.hasLeading = true,
    this.hasTrailing = false,
    this.hasSubtitle = true,
  });

  /// Reserve a leading square (icon/avatar) on the logical leading edge.
  final bool hasLeading;

  /// Reserve a trailing chip/value on the logical trailing edge.
  final bool hasTrailing;

  /// Reserve a second, shorter line beneath the title.
  final bool hasSubtitle;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Semantics(
      label: 'טוען',
      container: true,
      child: ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: SkeletonShimmer(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                if (hasLeading) ...[
                  SkeletonBox(width: 40, height: 40, radius: t.radiusMd),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SkeletonBox(width: 160, height: 13), // title
                      if (hasSubtitle) ...[
                        const SizedBox(height: 7),
                        const SkeletonBox(width: 100, height: 11), // subtitle
                      ],
                    ],
                  ),
                ),
                if (hasTrailing) ...[
                  const SizedBox(width: 8),
                  SkeletonBox(width: 48, height: 16, radius: t.radiusSm),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
