import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../theme/app_theme.dart';

class ShimmerCardWidget extends StatelessWidget {
  const ShimmerCardWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);

    return Shimmer.fromColors(
      baseColor: ffTheme.alternate,
      highlightColor: Colors.white,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          boxShadow: ffTheme.shadowSoft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(width: 44, height: 44, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(height: 14, width: 100, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(7))),
                      const SizedBox(height: 6),
                      Container(height: 11, width: 160, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6))),
                    ],
                  ),
                ),
                Container(width: 32, height: 32, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(height: 28, width: 70, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8))),
                    const SizedBox(height: 4),
                    Container(height: 11, width: 45, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6))),
                  ],
                ),
                const Spacer(),
                Container(height: 30, width: 110, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10))),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              children: List.generate(3, (_) => Container(
                height: 24, width: 80,
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
              )),
            ),
            const SizedBox(height: 12),
            Container(height: 36, width: double.infinity, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10))),
          ],
        ),
      ),
    );
  }
}
