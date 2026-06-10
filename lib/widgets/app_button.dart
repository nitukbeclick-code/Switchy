import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Primary call-to-action button used across the app.
///
/// Wraps [ElevatedButton] with the app's rounded styling and a built-in async
/// loading state: while [onPressed] is awaiting, the label is swapped for a
/// spinner and taps are ignored. Pass an [icon] to render it before the label.
///
/// When [color] is the brand ink ([AppColors.primary]) and no [borderSide] is
/// supplied, the button reads as the primary CTA: it is filled with the
/// ink→slate [AppTheme.freshGradient] and lifted by the soft ink
/// [AppTheme.shadowPrimary] glow. Any other [color] (or an outlined/ghost
/// variant with a [borderSide]) keeps the calm solid-fill styling. Either way it
/// gains a subtle tactile scale-down while pressed.
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
  bool _pressed = false;

  Future<void> _handleTap() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      await widget.onPressed();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setPressed(bool v) {
    if (_pressed != v) setState(() => _pressed = v);
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

    final sized = SizedBox(
      width: widget.width,
      height: widget.height,
      child: useGradient
          ? DecoratedBox(
              decoration: BoxDecoration(
                gradient: ffTheme.accentGradient,
                borderRadius: borderRadius,
                boxShadow: ffTheme.shadowAccent,
              ),
              child: button,
            )
          : button,
    );

    // Tactile press feedback — a subtle scale-down while held. Kept on a
    // Listener (not a GestureDetector) so it never swallows the underlying
    // ElevatedButton's tap, and it goes flat under reduced-motion.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion || _loading) return sized;
    return Listener(
      onPointerDown: (_) => _setPressed(true),
      onPointerUp: (_) => _setPressed(false),
      onPointerCancel: (_) => _setPressed(false),
      child: AnimatedScale(
        scale: _pressed ? ffTheme.pressScale : 1.0,
        duration: _pressed ? ffTheme.motionFast : ffTheme.motionMedium,
        curve: _pressed ? ffTheme.easeOut : ffTheme.spring,
        child: sized,
      ),
    );
  }
}
