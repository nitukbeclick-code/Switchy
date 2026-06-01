import 'package:flutter/material.dart';
import '../theme.dart';

class StarsWidget extends StatelessWidget {
  final double rating;
  final int reviews;
  final double starSize;
  final bool showCount;

  const StarsWidget({
    super.key,
    required this.rating,
    this.reviews = 0,
    this.starSize = 14,
    this.showCount = true,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildStars(),
        const SizedBox(width: 4),
        Text(
          rating.toStringAsFixed(1),
          style: TextStyle(
            fontSize: starSize,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        if (showCount && reviews > 0) ...[
          const SizedBox(width: 3),
          Text(
            '($reviews)',
            style: TextStyle(
              fontSize: starSize - 1,
              color: AppColors.inkMuted,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildStars() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final full = i < rating.floor();
        final half = !full && i < rating && (rating - rating.floor()) >= 0.5;
        return Icon(
          full
              ? Icons.star_rounded
              : half
                  ? Icons.star_half_rounded
                  : Icons.star_outline_rounded,
          size: starSize,
          color: const Color(0xFFD99A2B),
        );
      }),
    );
  }
}
