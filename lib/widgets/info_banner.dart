import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// An accent-tinted rounded banner used for tips, notices, and inline hints.
///
/// Shows a leading [icon] or [emoji], a [title], and an optional [subtitle]
/// below the title. Background and text accent are configurable; defaults
/// match the green tip banners seen throughout the app
/// ([AppTheme.accent1] background, [AppTheme.primary] accent).
class InfoBanner extends StatelessWidget {
  /// Bold heading text rendered next to the icon.
  final String title;

  /// Supplementary text rendered below [title] in a lighter style.
  final String? subtitle;

  /// Icon displayed on the leading side of the banner.
  final IconData? icon;

  /// Emoji string used instead of [icon] when set.
  final String? emoji;

  /// Banner background color. Defaults to [AppTheme.accent1].
  final Color? backgroundColor;

  /// Color used for the icon and title text. Defaults to [AppTheme.primary].
  final Color? accentColor;

  /// Inner padding. Defaults to `EdgeInsets.all(14)`.
  final EdgeInsetsGeometry padding;

  /// Corner radius. Defaults to the friendly `radiusMd` (16).
  final double borderRadius;

  const InfoBanner({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.emoji,
    this.backgroundColor,
    this.accentColor,
    this.padding = const EdgeInsets.all(14),
    this.borderRadius = 16,
  });

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final bg = backgroundColor ?? ffTheme.accent1;
    final accent = accentColor ?? ffTheme.primary;

    // The leading mark sits in a soft tinted badge so it reads as a deliberate
    // anchor (one accent moment per banner) rather than a floating glyph.
    Widget leading;
    if (emoji != null) {
      leading = Text(emoji!, style: const TextStyle(fontSize: 18));
    } else {
      leading = Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(ffTheme.radiusXs),
        ),
        alignment: Alignment.center,
        child: Icon(icon ?? Icons.info_outline_rounded, color: accent, size: 18),
      );
    }

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: accent.withValues(alpha: 0.12)),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Row(
        crossAxisAlignment:
            subtitle != null ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: [
          leading,
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: ffTheme.bodySmall.copyWith(
                    color: accent,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle!,
                    style: ffTheme.labelSmall.copyWith(
                      color: accent.withValues(alpha: 0.75),
                      height: 1.35,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
