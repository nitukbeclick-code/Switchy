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
          const SizedBox(width: 8),
        ] else if (icon != null) ...[
          icon!,
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Text(
            title,
            style: ffTheme.titleLarge,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (trailingLabel != null)
          // A real touch target + ripple around the link; the trailing action
          // carries the indigo ACTION accent and a directional chevron so it
          // reads as "see more" rather than plain text.
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTrailingTap,
              borderRadius: BorderRadius.circular(ffTheme.radiusSm),
              child: Padding(
                padding: const EdgeInsetsDirectional.only(start: 8, top: 4, bottom: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      trailingLabel!,
                      style: ffTheme.labelMedium.copyWith(
                        color: ffTheme.brandAccent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Icon(Icons.chevron_left_rounded,
                        size: 16, color: ffTheme.brandAccent),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
