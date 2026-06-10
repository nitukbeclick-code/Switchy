import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The standard white rounded card container used across the app.
///
/// Provides consistent background color, border, corner radius and drop shadow
/// that match the existing card pattern (white bg, [AppTheme.alternate] border,
/// soft green-tinted [AppTheme.shadowCard]). Wrap any content in [child].
class AppCard extends StatelessWidget {
  /// The widget to place inside the card.
  final Widget child;

  /// Inner padding. Defaults to `EdgeInsets.all(16)`.
  final EdgeInsetsGeometry padding;

  /// Corner radius. Defaults to `20` ([AppTheme.radiusLg]).
  final double borderRadius;

  /// Override the border color. Defaults to [AppTheme.alternate].
  final Color? borderColor;

  /// Optional bottom margin applied outside the card.
  final EdgeInsetsGeometry? margin;

  /// When provided, the card becomes tappable via [GestureDetector].
  final VoidCallback? onTap;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = 20,
    this.borderColor,
    this.margin,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final card = Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: borderColor ?? ffTheme.alternate),
        boxShadow: ffTheme.shadowCard,
      ),
      child: child,
    );

    if (onTap != null) {
      return GestureDetector(onTap: onTap, child: card);
    }
    return card;
  }
}
