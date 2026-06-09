import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A small rounded chip for displaying a stat value alongside a label.
///
/// Used for savings badges, quick-stat callouts, and category counters.
/// Background and text colors are fully configurable; defaults use
/// [AppTheme.secondary] background with [AppTheme.primary] text, matching
/// the lime savings badges seen on plan cards.
class StatPill extends StatelessWidget {
  /// The primary value displayed prominently (e.g. '₪850').
  final String value;

  /// Descriptive label shown after [value] (e.g. 'לשנה').
  final String label;

  /// Pill background color. Defaults to [AppTheme.secondary].
  final Color? backgroundColor;

  /// Text color for both [value] and [label]. Defaults to [AppTheme.primary].
  final Color? textColor;

  /// Horizontal/vertical padding around the content.
  final EdgeInsetsGeometry padding;

  /// Corner radius. Defaults to `20` for a fully-rounded pill shape.
  final double borderRadius;

  const StatPill({
    super.key,
    required this.value,
    required this.label,
    this.backgroundColor,
    this.textColor,
    this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    this.borderRadius = 20,
  });

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final bg = backgroundColor ?? ffTheme.secondary;
    final fg = textColor ?? ffTheme.primary;

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: ffTheme.labelSmall.copyWith(
              color: fg,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 3),
          Text(
            label,
            style: ffTheme.labelSmall.copyWith(
              color: fg.withValues(alpha: 0.85),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
