import 'package:flutter/material.dart';
import '../theme.dart';

class LogoWidget extends StatelessWidget {
  final String provider;
  final double size;
  final double fontSize;

  const LogoWidget({
    super.key,
    required this.provider,
    this.size = 40,
    this.fontSize = 16,
  });

  @override
  Widget build(BuildContext context) {
    final color = AppColors.providerColor(provider);
    final initial = provider.isNotEmpty ? provider[0] : '?';

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        shape: BoxShape.circle,
        border: Border.all(color: color.withOpacity(0.3), width: 1.5),
      ),
      child: Center(
        child: Text(
          initial,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ),
    );
  }
}

class ProviderBadge extends StatelessWidget {
  final String provider;
  final double height;

  const ProviderBadge({
    super.key,
    required this.provider,
    this.height = 28,
  });

  @override
  Widget build(BuildContext context) {
    final color = AppColors.providerColor(provider);

    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Center(
        child: Text(
          provider,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ),
    );
  }
}
