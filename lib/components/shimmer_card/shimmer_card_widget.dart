import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../theme/app_theme.dart';

class ShimmerCardWidget extends StatelessWidget {
  const ShimmerCardWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // Theme-aware shimmer: the placeholder blocks paint with `block`, while the
    // sweep runs base -> highlight. On dark the old flat-white blocks/highlight
    // were invisible, so derive both from theme tokens and keep contrast in
    // both modes.
    final block = ffTheme.secondary;
    final baseColor = ffTheme.alternate;
    final highlightColor = ffTheme.dark ? ffTheme.secondaryBackground : Colors.white;

    // The skeleton is pure chrome: hide it from the semantics tree so screen
    // readers don't announce a tree of empty placeholder boxes. The shimmer
    // runs its own continuous animation, so isolate it behind a RepaintBoundary
    // — a parent rebuild then can't restart or repaint the sweep.
    return ExcludeSemantics(
      child: RepaintBoundary(
        child: Shimmer.fromColors(
          baseColor: baseColor,
          highlightColor: highlightColor,
          child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: block,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(width: 44, height: 44, decoration: BoxDecoration(color: block, shape: BoxShape.circle)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(height: 14, width: 100, decoration: BoxDecoration(color: block, borderRadius: BorderRadius.circular(7))),
                      const SizedBox(height: 6),
                      Container(height: 11, width: 160, decoration: BoxDecoration(color: block, borderRadius: BorderRadius.circular(6))),
                    ],
                  ),
                ),
                Container(width: 32, height: 32, decoration: BoxDecoration(color: block, shape: BoxShape.circle)),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(height: 28, width: 70, decoration: BoxDecoration(color: block, borderRadius: BorderRadius.circular(8))),
                    const SizedBox(height: 4),
                    Container(height: 11, width: 45, decoration: BoxDecoration(color: block, borderRadius: BorderRadius.circular(6))),
                  ],
                ),
                const Spacer(),
                Container(height: 30, width: 110, decoration: BoxDecoration(color: block, borderRadius: BorderRadius.circular(10))),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              children: List.generate(3, (_) => Container(
                height: 24, width: 80,
                decoration: BoxDecoration(color: block, borderRadius: BorderRadius.circular(8)),
              )),
            ),
            const SizedBox(height: 12),
            Container(height: 36, width: double.infinity, decoration: BoxDecoration(color: block, borderRadius: BorderRadius.circular(10))),
          ],
        ),
      ),
        ),
      ),
    );
  }
}
