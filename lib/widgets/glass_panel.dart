import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A frosted-glass surface: a real backdrop blur behind a translucent overlay
/// with a hairline border.
///
/// Use SPARINGLY — live [BackdropFilter] blur is GPU-costly. Reserve it for a
/// few high-value surfaces (the bottom nav, sticky headers, modal sheets, hero
/// overlays). For list cards prefer the cheap [AppTheme.glassDecoration]
/// (translucent fill + soft shadow, no live blur) so scrolling stays smooth.
class GlassPanel extends StatelessWidget {
  const GlassPanel({
    super.key,
    required this.child,
    this.blur = 14,
    this.alpha = 0.6,
    this.tint,
    this.borderRadius,
    this.border = true,
    this.padding,
  });

  final Widget child;
  final double blur;
  final double alpha;
  final Color? tint;
  final BorderRadius? borderRadius;
  final bool border;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final radius = borderRadius ?? BorderRadius.circular(t.radiusLg);
    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: (tint ?? Colors.white).withValues(alpha: alpha),
            borderRadius: radius,
            border: border ? Border.all(color: Colors.white.withValues(alpha: 0.5)) : null,
          ),
          child: child,
        ),
      ),
    );
  }
}
