import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'app_button.dart';

/// A centered empty-state layout for pages with no data to display.
///
/// Renders a large circular icon badge (soft green [AppTheme.brandAccentTint]
/// wash with a green-tinted ring), a [headline] in [AppTheme.headlineSmall], a
/// centered [subtitle] in [AppTheme.bodyMedium]/secondaryText, and an optional
/// CTA via [AppButton].
class EmptyState extends StatefulWidget {
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
  State<EmptyState> createState() => _EmptyStateState();
}

class _EmptyStateState extends State<EmptyState>
    with SingleTickerProviderStateMixin {
  // A gentle idle float that gives the badge a quiet sense of life. It is
  // self-limiting: a fixed number of slow up/down breaths, then it STOPS — so a
  // `pumpAndSettle` (which waits for every animation to quiesce) still settles
  // rather than hanging on a perpetual loop, and we never leave an idle pulse
  // running indefinitely on a frequently-mounted surface. Off under
  // reduced-motion.
  late final AnimationController _float = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  static const int _floatBreaths = 3; // up+down cycles before it rests
  int _breathsDone = 0;
  bool _floatStarted = false;

  void _onFloatStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed) {
      _breathsDone++;
      if (_breathsDone >= _floatBreaths) {
        _float.animateTo(0, duration: const Duration(milliseconds: 600));
        _float.removeStatusListener(_onFloatStatus);
      } else {
        _float.reverse();
      }
    } else if (status == AnimationStatus.dismissed &&
        _breathsDone < _floatBreaths) {
      _float.forward();
    }
  }

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (!reduceMotion && !_floatStarted) {
      _floatStarted = true;
      _float.addStatusListener(_onFloatStatus);
      _float.forward();
    }

    Widget badge = Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        color: ffTheme.brandAccentTint,
        shape: BoxShape.circle,
        border: Border.all(
          color: ffTheme.brandAccent.withValues(alpha: 0.18),
        ),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Icon(widget.icon, size: 46, color: ffTheme.brandAccent),
    );

    if (!reduceMotion) {
      // Idle float — a small vertical drift driven off the breathing controller.
      badge = AnimatedBuilder(
        animation: _float,
        builder: (context, child) {
          final t = Curves.easeInOut.transform(_float.value);
          return Transform.translate(offset: Offset(0, -4 * t), child: child);
        },
        child: badge,
      );
      // Scale-in on first appearance.
      badge = TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.6, end: 1),
        duration: ffTheme.motionSlow,
        curve: ffTheme.spring,
        builder: (context, v, child) => Transform.scale(scale: v, child: child),
        child: badge,
      );
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            badge,
            const SizedBox(height: 24),
            Text(
              widget.headline,
              style: ffTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              widget.subtitle,
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ),
            if (widget.ctaLabel != null && widget.onCtaTap != null) ...[
              const SizedBox(height: 32),
              AppButton(
                // AppColors.primary (the const ink) is the sentinel that earns
                // the green ACTION gradient inside AppButton — which is itself
                // theme-aware (lifted on dark) — so the CTA stays vivid in both
                // modes rather than collapsing to a flat off-white on dark.
                text: widget.ctaLabel!,
                onPressed: widget.onCtaTap!,
                color: AppColors.primary,
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
