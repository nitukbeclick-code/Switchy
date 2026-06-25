import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

/// A standard section header row used throughout the app.
///
/// Renders an optional leading [emoji] or [icon], a [title] in
/// [AppTheme.titleLarge], and an optional trailing action chip
/// ([trailingLabel] + [onTrailingTap]). Fully RTL-aware via [Row].
///
/// The trailing action renders as a soft [TextButton] chip: the green
/// [AppTheme.brandAccentText] label followed by a leading-side
/// [Icons.chevron_left] (which points toward the start of the row in RTL),
/// with a [kMinTapTarget]-tall hit area and a [HapticFeedback.selectionClick]
/// on tap — replacing the older underlined "see all" text-link.
///
/// ```dart
/// SectionHeader(
///   emoji: '💬',
///   title: 'שיחות אחרונות',
///   trailingLabel: 'הכל',
///   onTrailingTap: () => context.goNamed('Conversations'),
/// )
/// ```
class SectionHeader extends StatelessWidget {
  /// Main heading text displayed in titleLarge.
  final String title;

  /// Optional emoji string rendered before the title (e.g. '💬').
  final String? emoji;

  /// Optional icon widget rendered before the title (used when [emoji] is null).
  final Widget? icon;

  /// Label for the trailing action (e.g. 'הכל'). Shown only when non-null,
  /// rendered as a chip with a trailing [Icons.chevron_left] affordance — no
  /// need to bake an arrow glyph into the string.
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
            // A soft "see all" chip in place of the old underlined text-link:
            // the green ACTION label plus a chevron that points toward the
            // start of the row (leading-side in RTL). [Icons.chevron_left] is
            // direction-agnostic glyph-wise, so we place it AFTER the label and
            // let the RTL [Row] flip it to the leading edge.
            child: TextButton(
              onPressed: onTrailingTap == null
                  ? null
                  : () {
                      // Light tactile tick on tap — matches the app's other
                      // primary affordances (AppButton / nav).
                      HapticFeedback.selectionClick();
                      onTrailingTap!.call();
                    },
              style: TextButton.styleFrom(
                // Keep the chip comfortably tappable (>= 48px) without forcing
                // it to grow wider than its content.
                minimumSize: const Size(0, kMinTapTarget),
                padding: const EdgeInsetsDirectional.only(start: 10, end: 6),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                foregroundColor: ffTheme.brandAccentText,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    trailingLabel!,
                    style: ffTheme.labelMedium.copyWith(
                      // Green = ACTION: the trailing chip reads as the tappable
                      // affordance in the row. Uses the AA-safe text shade so
                      // the small label clears 4.5:1 on glass.
                      color: ffTheme.brandAccentText,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  // Decorative directional cue — the label already carries the
                  // semantics, so hide the glyph from the a11y tree.
                  ExcludeSemantics(
                    child: Icon(
                      Icons.chevron_left,
                      size: 18,
                      color: ffTheme.brandAccentText,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
