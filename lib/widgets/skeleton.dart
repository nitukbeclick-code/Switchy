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
      decoration: BoxDecoration(
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusLg),
        border: Border.all(color: t.alternate.withValues(alpha: 0.4)),
      ),
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
