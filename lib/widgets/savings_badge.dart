import 'package:flutter/material.dart';
import '../theme.dart';

class SavingsBadge extends StatelessWidget {
  final int savings;
  final bool large;

  const SavingsBadge({
    super.key,
    required this.savings,
    this.large = false,
  });

  @override
  Widget build(BuildContext context) {
    if (savings <= 0) return const SizedBox.shrink();

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 12 : 8,
        vertical: large ? 6 : 4,
      ),
      decoration: BoxDecoration(
        color: AppColors.lime,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '₪$savings',
            style: TextStyle(
              fontSize: large ? 15 : 12,
              fontWeight: FontWeight.w800,
              color: AppColors.greenDark,
            ),
          ),
          const SizedBox(width: 3),
          Text(
            'חיסכון/שנה',
            style: TextStyle(
              fontSize: large ? 13 : 11,
              fontWeight: FontWeight.w600,
              color: AppColors.green,
            ),
          ),
        ],
      ),
    );
  }
}

class SavingsHeroCard extends StatelessWidget {
  final int savings;
  final String? subtitle;

  const SavingsHeroCard({
    super.key,
    required this.savings,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0E3A26), Color(0xFF15603E)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'חיסכון שנתי משוער',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.8),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '₪${savings.toString()}',
                  style: const TextStyle(
                    color: Color(0xFFC9EC4B),
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -1,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.7),
                      fontSize: 13,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: const Color(0xFFC9EC4B).withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Text('💰', style: TextStyle(fontSize: 24)),
            ),
          ),
        ],
      ),
    );
  }
}
