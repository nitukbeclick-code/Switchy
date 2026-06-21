import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A standard section header row used throughout the app.
///
/// Renders an optional leading [emoji] or [icon], a [title] in
/// [AppTheme.titleLarge], and an optional trailing action chip
/// ([trailingLabel] + [onTrailingTap]). Fully RTL-aware via [Row].
class SectionHeader extends StatelessWidget {
  /// Main heading text displayed in titleLarge.
  final String title;

  /// Optional emoji string rendered before the title (e.g. '💬').
  final String? emoji;

  /// Optional icon widget rendered before the title (used when [emoji] is null).
  final Widget? icon;

  /// Label for the trailing action (e.g. 'הכל ←'). Shown only when non-null.
  final String? trailingLabel;

  /// Callback fired when the trailing action is tapped.
  final VoidCallback? onTrailingTap;

  const SectionHeader({
    super.key,
    required this.title,
    this.emoji,
    this.icon,
    this.trailingLabel,
    this.onTrailingTap,
  });

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Row(
      children: [
        if (emoji != null) ...[
          Text(emoji!, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 6),
        ] else if (icon != null) ...[
          icon!,
          const SizedBox(width: 6),
        ],
        Expanded(child: Text(title, style: ffTheme.titleLarge)),
        if (trailingLabel != null)
          Semantics(
            button: true,
            label: trailingLabel,
            child: GestureDetector(
              onTap: onTrailingTap,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                // A small hit-padding so the inline link is comfortably tappable.
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                // IntrinsicWidth so the underline stretches exactly to the
                // label width — the trailing slot has unbounded width here, so a
                // bare `stretch` Column would force an infinite constraint.
                child: IntrinsicWidth(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        trailingLabel!,
                        style: ffTheme.labelMedium.copyWith(
                          // Green = ACTION: the trailing link reads as the
                          // tappable affordance in the row. Uses the AA-safe
                          // text shade so the small link clears 4.5:1 on glass.
                          color: ffTheme.brandAccentText,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 3),
                      // A short accent underline — the editorial "see all" tell.
                      Container(
                        height: 2,
                        decoration: BoxDecoration(
                          color: ffTheme.brandAccent.withValues(alpha: 0.45),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
