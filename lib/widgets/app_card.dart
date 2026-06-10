import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'pressable.dart';

/// The standard white rounded card container used across the app.
///
/// Provides consistent background, hairline border, corner radius and the soft
/// diffuse [AppTheme.glassDecoration] surface. When [onTap] is supplied the card
/// gains tactile [Pressable] scale-on-press feedback. Wrap any content in [child].
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
    // Soft-glass surface: translucent white fill + a bright hairline + the
    // diffuse glass shadow (no live blur — cheap enough for long lists).
    var decoration = ffTheme.glassDecoration(radius: borderRadius);
    // Preserve the API: an explicit borderColor still overrides the hairline.
    if (borderColor != null) {
      decoration = decoration.copyWith(border: Border.all(color: borderColor!));
    }
    final card = Container(
      margin: margin,
      padding: padding,
      decoration: decoration,
      child: child,
    );

    if (onTap != null) {
      return Pressable(onTap: onTap, child: card);
    }
    return card;
  }
}
