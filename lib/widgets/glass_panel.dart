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
    final dark = t.dark;
    final radius = borderRadius ?? BorderRadius.circular(t.radiusLg);
    final fillBase = tint ?? (dark ? AppColors.darkCard : Colors.white);
    final borderColor = dark
        ? AppColors.darkBorder.withValues(alpha: 0.9)
        : Colors.white.withValues(alpha: 0.5);

    // The inner surface, shared by both paths. The 1px glass-glint top edge is
    // baked into the fill as a vertical gradient (a non-uniform border colour is
    // incompatible with a rounded radius).
    final surface = Container(
      padding: padding,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.alphaBlend(
              t.glassGlint.withValues(alpha: t.glassGlint.a * 0.5),
              fillBase.withValues(alpha: alpha),
            ),
            fillBase.withValues(alpha: alpha),
          ],
          stops: const [0, 0.08],
        ),
        borderRadius: radius,
        border: border ? Border.all(color: borderColor) : null,
      ),
      child: child,
    );

    // Capability gate: only spend a live BackdropFilter blur where it's cheap.
    // On weak platforms fall back to a SOLID (more opaque) fill so the surface
    // still reads as a frosted panel without the GPU cost.
    if (!AppTheme.realGlass) {
      final solid = Container(
        padding: padding,
        decoration: BoxDecoration(
          color: fillBase.withValues(alpha: (alpha + 0.3).clamp(0.0, 1.0)),
          borderRadius: radius,
          border: border ? Border.all(color: borderColor) : null,
        ),
        child: child,
      );
      return ClipRRect(borderRadius: radius, child: solid);
    }

    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: surface,
      ),
    );
  }
}
