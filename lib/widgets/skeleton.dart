import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../theme/app_theme.dart';

/// Shimmering placeholder primitives for content that is still loading from
/// the network — a calm grey wash on the brand's glass surfaces (never a
/// blocking spinner for list content).
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 14, this.radius = 8});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
      ),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(t.radiusLg),
        border: Border.all(color: t.alternate.withValues(alpha: 0.4)),
        boxShadow: t.shadowSoft,
      ),
      child: Shimmer.fromColors(
        baseColor: const Color(0xFFE9EDF0),
        highlightColor: const Color(0xFFF7F9FA),
        child: const Column(
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
