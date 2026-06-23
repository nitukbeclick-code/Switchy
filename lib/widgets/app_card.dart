import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'pressable.dart';

/// The surface treatment an [AppCard] paints.
enum AppCardVariant {
  /// The soft translucent glass surface ([AppTheme.glassDecoration]) — the
  /// default, cheap enough for long lists.
  glass,

  /// An OPAQUE premium card ([AppTheme.cardDecoration]) — solid fill, soft
  /// shadow, low-opacity ink hairline, top glass-glint. For standalone cards.
  card,

  /// The generously-rounded bento grouping tile ([AppTheme.bentoDecoration]) —
  /// larger radius + a touch more shadow, for anchor data tiles.
  bento,
}

/// The standard white rounded card container used across the app.
///
/// Provides consistent background, hairline border, corner radius and a chosen
/// surface treatment ([AppCardVariant], default [AppCardVariant.glass]). When
/// [onTap] is supplied the card gains tactile [Pressable] scale-on-press
/// feedback. Wrap any content in [child].
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

  /// Which surface treatment to paint. Defaults to [AppCardVariant.glass] so
  /// every existing call site is unchanged.
  final AppCardVariant variant;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = 20,
    this.borderColor,
    this.margin,
    this.onTap,
    this.variant = AppCardVariant.glass,
  });

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // Resolve the chosen surface treatment. Glass stays the cheap translucent
    // default; card/bento use the opaque premium-2026 decorations.
    var decoration = switch (variant) {
      AppCardVariant.glass => ffTheme.glassDecoration(radius: borderRadius),
      AppCardVariant.card => ffTheme.cardDecoration(radius: borderRadius),
      AppCardVariant.bento => ffTheme.bentoDecoration(radius: borderRadius),
    };
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
