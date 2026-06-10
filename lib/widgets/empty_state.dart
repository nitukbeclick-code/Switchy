import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'app_button.dart';

/// A centered empty-state layout for pages with no data to display.
///
/// Renders a large circular icon badge ([AppTheme.accent1] background), a
/// [headline] in [AppTheme.headlineSmall], a centered [subtitle] in
/// [AppTheme.bodyMedium]/secondaryText, and an optional CTA via [AppButton].
class EmptyState extends StatelessWidget {
  /// Icon rendered inside the circular badge.
  final IconData icon;

  /// Large heading shown below the icon badge.
  final String headline;

  /// Descriptive text shown below the headline in a muted style.
  final String subtitle;

  /// Label for the optional call-to-action button.
  final String? ctaLabel;

  /// Callback for the optional CTA button. Must be provided when [ctaLabel] is set.
  final Future<void> Function()? onCtaTap;

  const EmptyState({
    super.key,
    required this.icon,
    required this.headline,
    required this.subtitle,
    this.ctaLabel,
    this.onCtaTap,
  }) : assert(
          ctaLabel == null || onCtaTap != null,
          'onCtaTap must be provided when ctaLabel is set',
        );

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: ffTheme.mint,
                shape: BoxShape.circle,
                boxShadow: ffTheme.shadowSoft,
              ),
              child: Icon(icon, size: 48, color: ffTheme.tertiary),
            ),
            const SizedBox(height: 24),
            Text(
              headline,
              style: ffTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ),
            if (ctaLabel != null && onCtaTap != null) ...[
              const SizedBox(height: 32),
              AppButton(
                text: ctaLabel!,
                onPressed: onCtaTap!,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                width: double.infinity,
                height: 52,
                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
