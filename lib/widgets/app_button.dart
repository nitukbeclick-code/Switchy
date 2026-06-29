import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

/// Primary call-to-action button used across the app.
///
/// Wraps [ElevatedButton] with the app's rounded styling and a built-in async
/// loading state: while [onPressed] is awaiting, the label is swapped for a
/// spinner and taps are ignored. Pass an [icon] to render it before the label.
///
/// When [color] is the brand ink ([AppColors.primary]) and no [borderSide] is
/// supplied, the button reads as the primary CTA: it is filled with the green
/// ACTION [AppTheme.accentGradient] and lifted by the soft green
/// [AppTheme.shadowAccent] glow. Any other [color] (or an outlined/ghost
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
  /// next to a primary without competing for the green.
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
  // Drives the brief overshoot on release: held → 0.98, release → 1.02, then
  // settles to 1.0 — a tactile "spring-back" instead of a flat snap.
  bool _overshoot = false;
  Timer? _overshootTimer;

  // Keyboard-focus ring: shown only when the control is focused AND the user is
  // navigating with a keyboard/directional input (never on a plain tap). Lets
  // desktop/web keyboard users see where they are — the green ACTION halo from
  // the shared [AppTheme.focusRingDecoration] token.
  final FocusNode _focusNode = FocusNode();
  bool _focusVisible = false;

  void _onFocusChange(bool hasFocus) {
    final visible = hasFocus &&
        FocusManager.instance.highlightMode == FocusHighlightMode.traditional;
    if (_focusVisible != visible) setState(() => _focusVisible = visible);
  }

  /// Wraps [child] in the shared green keyboard-focus halo when the button is
  /// focus-visible. The ring is an inset [BoxDecoration] over the same rounded
  /// shape (drawn just inside the bounds so it never clips against tight
  /// parents), animated so focus fades in rather than snapping.
  Widget _withFocusRing(Widget child, BorderRadius radius, AppTheme t) {
    return AnimatedContainer(
      duration: t.motionFast,
      curve: t.easeOut,
      foregroundDecoration: BoxDecoration(
        borderRadius: radius,
        border: Border.all(
          color: _focusVisible ? t.focusRing : Colors.transparent,
          width: t.focusRingWidth,
        ),
        boxShadow: _focusVisible
            ? [
                BoxShadow(
                  color: t.focusRing.withValues(alpha: t.dark ? 0.35 : 0.28),
                  blurRadius: 10,
                ),
              ]
            : null,
      ),
      child: child,
    );
  }

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
    if (_pressed == v) return;
    setState(() => _pressed = v);
    if (!v) {
      // On release, briefly overshoot above rest before settling back to 1.0.
      _overshootTimer?.cancel();
      setState(() => _overshoot = true);
      _overshootTimer = Timer(const Duration(milliseconds: 120), () {
        if (mounted) setState(() => _overshoot = false);
      });
    }
  }

  @override
  void dispose() {
    _overshootTimer?.cancel();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // The "quiet" variants (white secondary / tinted ghost) default to an ink
    // label; everything else stays white-on-fill.
    final lightFill = widget.color == Colors.white || widget.color == AppColors.accent1;
    // The const .secondary constructor pins a light-only white fill (and a
    // light hairline border) that can't see the theme; remap it to the
    // themable surface/line tokens here so it flips in dark mode.
    final resolvedColor = widget.color == Colors.white
        ? ffTheme.secondaryBackground
        : (widget.color == AppColors.accent1 ? ffTheme.accent1 : widget.color);
    final resolvedBorderSide =
        widget.borderSide?.color == AppColors.alternate
            ? widget.borderSide!.copyWith(color: ffTheme.lineColor)
            : widget.borderSide;
    final foreground =
        widget.textStyle?.color ?? (lightFill ? ffTheme.primaryText : Colors.white);
    final labelStyle = widget.textStyle ??
        GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w700, color: foreground);
    final borderRadius = widget.borderRadius ?? BorderRadius.circular(ffTheme.radiusMd);

    // The primary CTA: brand ink colour, no outline → it earns the green
    // ACTION gradient + glow. Any other colour (or an outlined/ghost variant)
    // stays on the calm solid-fill path.
    final isPrimaryCta =
        (widget.borderSide == null || widget.borderSide == BorderSide.none) &&
            widget.color == AppColors.primary;
    final useGradient = isPrimaryCta;

    final button = ElevatedButton(
      focusNode: _focusNode,
      onFocusChange: _onFocusChange,
      onPressed: (_loading || !widget.enabled)
          ? null
          : () {
              HapticFeedback.selectionClick();
              _handleTap();
            },
      style: ElevatedButton.styleFrom(
        backgroundColor: useGradient
            ? Colors.transparent
            : (_loading ? (widget.disabledColor ?? resolvedColor.withValues(alpha: 0.6)) : resolvedColor),
        disabledBackgroundColor: useGradient
            ? Colors.transparent
            : (widget.disabledColor ?? resolvedColor.withValues(alpha: 0.55)),
        disabledForegroundColor: foreground.withValues(alpha: 0.7),
        foregroundColor: foreground,
        // Hover/press wash: a light veil over the gradient, an ink veil over
        // the quiet fills — distinct states on web/desktop too.
        overlayColor: useGradient ? Colors.white : ffTheme.primaryText,
        elevation: useGradient ? 0 : (widget.elevation ?? 0),
        shadowColor: useGradient ? Colors.transparent : null,
        shape: RoundedRectangleBorder(
          borderRadius: borderRadius,
          side: resolvedBorderSide ?? BorderSide.none,
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
                  // The "live" green glow: a 1px accent ring + a soft accent
                  // drop (the Flutter mirror of the site's --glow-accent), so the
                  // primary CTA reads energised rather than just lifted. Replaces
                  // the older shadowAccent here to avoid double-stacking drops.
                  boxShadow:
                      (_loading || !widget.enabled) ? null : ffTheme.glowAccent,
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
    if (reduceMotion || _loading || !widget.enabled) {
      return _withFocusRing(sized, borderRadius, ffTheme);
    }
    // Held → 0.98 (pressScale), released → a brief 1.02 overshoot, then 1.0.
    final scale = _pressed
        ? ffTheme.pressScale
        : (_overshoot ? 1.02 : 1.0);
    return Listener(
      onPointerDown: (_) => _setPressed(true),
      onPointerUp: (_) => _setPressed(false),
      onPointerCancel: (_) => _setPressed(false),
      // Press-down lands in the 100-160ms press band (ease-out); the release
      // settles a touch longer with the subtle [spring] overshoot — a primary
      // CTA is a lower-frequency, higher-intent control than a list row, so a
      // hint of "spring-back" reads as "action committed" rather than noise.
      child: AnimatedScale(
        scale: scale,
        duration: _pressed ? ffTheme.motionPress : ffTheme.motionMedium,
        curve: _pressed ? ffTheme.easeOut : ffTheme.spring,
        child: _withFocusRing(sized, borderRadius, ffTheme),
      ),
    );
  }
}
