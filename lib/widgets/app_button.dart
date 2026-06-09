import 'package:flutter/material.dart';

/// Primary call-to-action button used across the app.
///
/// Wraps [ElevatedButton] with the app's rounded styling and a built-in async
/// loading state: while [onPressed] is awaiting, the label is swapped for a
/// spinner and taps are ignored. Pass an [icon] to render it before the label.
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
    final foreground = widget.textStyle?.color ?? Colors.white;
    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: ElevatedButton(
        onPressed: _loading ? null : _handleTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: _loading ? (widget.disabledColor ?? widget.color.withValues(alpha: 0.6)) : widget.color,
          foregroundColor: foreground,
          elevation: widget.elevation ?? 0,
          shape: RoundedRectangleBorder(
            borderRadius: widget.borderRadius ?? BorderRadius.circular(16),
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
      ),
    );
  }
}
