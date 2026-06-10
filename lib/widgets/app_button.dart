import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Primary call-to-action button used across the app.
///
/// Wraps [ElevatedButton] with the app's rounded styling and a built-in async
/// loading state: while [onPressed] is awaiting, the label is swapped for a
/// spinner and taps are ignored. Pass an [icon] to render it before the label.
///
/// When [color] is the brand green ([AppColors.primary]) and no [borderSide]
/// is supplied, the button reads as the primary CTA: it is filled with the
/// fresh green→leaf [AppTheme.freshGradient] and lifted by the lime-green
/// [AppTheme.shadowPrimary] glow. Any other [color] (or an outlined/ghost
/// variant with a [borderSide]) keeps the calm solid-fill styling.
class AppButton extends StatefulWidget {
  const AppButton({
    super.key,
    required this.text,
    required this.onPressed,
    required this.color,
    this.textStyle,
    this.icon,
    this.width,
    this.height = 52,
    this.elevation,
    this.borderRadius,
    this.borderSide,
    this.disabledColor,
    this.padding,
    this.iconPadding,
  });

  final String text;
  final Future<void> Function() onPressed;
  final Color color;
  final TextStyle? textStyle;
  final Widget? icon;
  final double? width;
  final double height;
  final double? elevation;
  final BorderRadius? borderRadius;
  final BorderSide? borderSide;
  final Color? disabledColor;
  final EdgeInsetsGeometry? padding;
  final double? iconPadding;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _loading = false;

  Future<void> _handleTap() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      await widget.onPressed();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final foreground = widget.textStyle?.color ?? Colors.white;
    final borderRadius = widget.borderRadius ?? BorderRadius.circular(ffTheme.radiusMd);

    // The primary CTA: brand green, no outline. Give it the fresh gradient
    // wash and the lime-green glow so it reads tappable. Any other colour, or
    // an outlined/ghost variant, stays on the calm solid-fill path.
    final isPrimaryCta = widget.borderSide == null && widget.color == AppColors.primary;
    final useGradient = isPrimaryCta && !_loading;

    final button = ElevatedButton(
      onPressed: _loading ? null : _handleTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: useGradient
            ? Colors.transparent
            : (_loading ? (widget.disabledColor ?? widget.color.withValues(alpha: 0.6)) : widget.color),
        foregroundColor: foreground,
        elevation: useGradient ? 0 : (widget.elevation ?? 0),
        shadowColor: useGradient ? Colors.transparent : null,
        shape: RoundedRectangleBorder(
          borderRadius: borderRadius,
          side: widget.borderSide ?? BorderSide.none,
        ),
        padding: widget.padding ?? const EdgeInsets.symmetric(horizontal: 20),
      ),
      child: _loading
          ? SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(foreground)),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.icon != null) ...[widget.icon!, SizedBox(width: widget.iconPadding ?? 8)],
                Text(widget.text, style: widget.textStyle),
              ],
            ),
    );

    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: useGradient
          ? DecoratedBox(
              decoration: BoxDecoration(
                gradient: ffTheme.freshGradient,
                borderRadius: borderRadius,
                boxShadow: ffTheme.shadowPrimary,
              ),
              child: button,
            )
          : button,
    );
  }
}
