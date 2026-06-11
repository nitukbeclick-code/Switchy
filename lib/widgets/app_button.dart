import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
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
    this.enabled = true,
  });

  /// Secondary action: white fill, hairline border, ink label — sits quietly
  /// next to a primary without competing for the indigo.
  const AppButton.secondary({
    super.key,
    required this.text,
    required this.onPressed,
    this.textStyle,
    this.icon,
    this.width,
    this.height = 52,
    this.elevation,
    this.borderRadius,
    this.disabledColor,
    this.padding,
    this.iconPadding,
    this.enabled = true,
  })  : color = Colors.white,
        borderSide = const BorderSide(color: AppColors.alternate);

  /// Tertiary/ghost action: soft tinted fill, ink label, no shadow — for
  /// in-card and low-emphasis actions.
  const AppButton.ghost({
    super.key,
    required this.text,
    required this.onPressed,
    this.textStyle,
    this.icon,
    this.width,
    this.height = 48,
    this.elevation,
    this.borderRadius,
    this.disabledColor,
    this.padding,
    this.iconPadding,
    this.enabled = true,
  })  : color = AppColors.accent1,
        borderSide = BorderSide.none;

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

  /// When false the button renders dimmed and ignores taps — for CTAs that
  /// unlock later (e.g. the Zoom join button before T-15).
  final bool enabled;

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
    // The "quiet" variants (white secondary / tinted ghost) default to an ink
    // label; everything else stays white-on-fill.
    final lightFill = widget.color == Colors.white || widget.color == AppColors.accent1;
    final foreground =
        widget.textStyle?.color ?? (lightFill ? AppColors.primaryText : Colors.white);
    final labelStyle = widget.textStyle ??
        GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w700, color: foreground);
    final borderRadius = widget.borderRadius ?? BorderRadius.circular(ffTheme.radiusMd);

    // The primary CTA: brand ink colour, no outline → it earns the indigo
    // ACTION gradient + glow. Any other colour (or an outlined/ghost variant)
    // stays on the calm solid-fill path.
    final isPrimaryCta =
        (widget.borderSide == null || widget.borderSide == BorderSide.none) &&
            widget.color == AppColors.primary;
    final useGradient = isPrimaryCta;

    final button = ElevatedButton(
      onPressed: (_loading || !widget.enabled) ? null : _handleTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: useGradient
            ? Colors.transparent
            : (_loading ? (widget.disabledColor ?? widget.color.withValues(alpha: 0.6)) : widget.color),
        disabledBackgroundColor: useGradient
            ? Colors.transparent
            : (widget.disabledColor ?? widget.color.withValues(alpha: 0.55)),
        disabledForegroundColor: foreground.withValues(alpha: 0.7),
        foregroundColor: foreground,
        // Hover/press wash: a light veil over the gradient, an ink veil over
        // the quiet fills — distinct states on web/desktop too.
        overlayColor: useGradient ? Colors.white : AppColors.primaryText,
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
                Text(widget.text, style: labelStyle),
              ],
            ),
    );

    final sized = SizedBox(
      width: widget.width,
      height: widget.height,
      child: useGradient
          // The gradient survives the loading state (dimmed) instead of
          // snapping to a flat grey — the button keeps its identity while busy.
          ? AnimatedOpacity(
              opacity: !widget.enabled ? 0.55 : (_loading ? 0.72 : 1),
              duration: ffTheme.motionFast,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: ffTheme.accentGradient,
                  borderRadius: borderRadius,
                  boxShadow: (_loading || !widget.enabled) ? null : ffTheme.shadowAccent,
                ),
                // Glass edge: a faint top light over the gradient — the same
                // dimensional tell the site's primaries carry.
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: borderRadius,
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.white.withValues(alpha: 0.14),
                        Colors.white.withValues(alpha: 0),
                      ],
                      stops: const [0, 0.42],
                    ),
                  ),
                  child: button,
                ),
              ),
            )
          : button,
    );

    // Tactile press feedback — a subtle scale-down while held. Kept on a
    // Listener (not a GestureDetector) so it never swallows the underlying
    // ElevatedButton's tap, and it goes flat under reduced-motion.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion || _loading || !widget.enabled) return sized;
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
