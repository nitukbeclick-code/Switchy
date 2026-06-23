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

    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final valueStyle = ffTheme.labelSmall.copyWith(
      color: fg,
      fontWeight: FontWeight.w800,
    );
    // The value pops with a brief scale-up when it changes (e.g. a recomputed
    // savings figure). Keyed on [value] so the switcher cross-fades+scales the
    // new text in; flat under reduced-motion.
    final valueText = reduceMotion
        ? Text(value, style: valueStyle)
        : AnimatedSwitcher(
            duration: ffTheme.motionMedium,
            switchInCurve: ffTheme.spring,
            switchOutCurve: ffTheme.easeOut,
            transitionBuilder: (child, anim) => ScaleTransition(
              scale: anim,
              child: FadeTransition(opacity: anim, child: child),
            ),
            child: Text(value, key: ValueKey(value), style: valueStyle),
          );

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(borderRadius),
        // A faint contact shadow + a low-opacity ink hairline lift the chip off
        // the surface — the premium-2026 polish — without altering its layout.
        border: Border.all(color: fg.withValues(alpha: 0.08)),
        boxShadow: ffTheme.shadowXs,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          valueText,
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
