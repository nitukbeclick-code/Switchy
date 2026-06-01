import 'package:flutter/material.dart';

class FFButtonWidget extends StatefulWidget {
  const FFButtonWidget({super.key, required this.text, required this.onPressed, required this.options, this.icon});
  final String text;
  final Future<void> Function() onPressed;
  final FFButtonOptions options;
  final Widget? icon;

  @override
  State<FFButtonWidget> createState() => _FFButtonWidgetState();
}

class _FFButtonWidgetState extends State<FFButtonWidget> {
  bool _loading = false;

  @override
  Widget build(BuildContext context) {
    final o = widget.options;
    return SizedBox(
      width: o.width,
      height: o.height,
      child: ElevatedButton(
        onPressed: _loading ? null : () async {
          setState(() => _loading = true);
          try { await widget.onPressed(); } finally { if (mounted) setState(() => _loading = false); }
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: _loading ? (o.disabledColor ?? o.color.withOpacity(0.6)) : o.color,
          foregroundColor: o.textStyle?.color ?? Colors.white,
          elevation: o.elevation ?? 0,
          shape: RoundedRectangleBorder(borderRadius: o.borderRadius ?? BorderRadius.circular(16), side: o.borderSide ?? BorderSide.none),
          padding: o.padding ?? const EdgeInsets.symmetric(horizontal: 20),
        ),
        child: _loading
            ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(o.textStyle?.color ?? Colors.white)))
            : Row(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
                if (widget.icon != null) ...[widget.icon!, SizedBox(width: o.iconPadding ?? 8)],
                Text(widget.text, style: o.textStyle),
              ]),
      ),
    );
  }
}

class FFButtonOptions {
  const FFButtonOptions({this.width, this.height = 52, required this.color, required this.textStyle, this.elevation, this.borderRadius, this.borderSide, this.disabledColor, this.disabledTextColor, this.iconPadding, this.padding});
  final double? width;
  final double height;
  final Color color;
  final TextStyle? textStyle;
  final double? elevation;
  final BorderRadius? borderRadius;
  final BorderSide? borderSide;
  final Color? disabledColor;
  final Color? disabledTextColor;
  final double? iconPadding;
  final EdgeInsetsGeometry? padding;
}
