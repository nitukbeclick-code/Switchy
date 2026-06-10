import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Wraps any [child] so it gently scales down while pressed, then springs back
/// on release — the tactile feedback the app's design language calls for.
///
/// Pure presentation: it forwards the tap to [onTap] (when given) and adds no
/// semantics of its own, so callers keep wrapping their own [Semantics]/labels.
/// Honours the platform's reduced-motion setting by skipping the scale. Cheap
/// enough for list rows: one [AnimatedScale] per instance, no controllers.
class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.scale,
    this.behavior = HitTestBehavior.opaque,
    this.enableFeedback = true,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Pressed-state scale. Defaults to [AppTheme.pressScale].
  final double? scale;
  final HitTestBehavior behavior;
  final bool enableFeedback;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final pressedScale = reduceMotion ? 1.0 : (widget.scale ?? t.pressScale);

    return GestureDetector(
      behavior: widget.behavior,
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      child: AnimatedScale(
        scale: _down ? pressedScale : 1.0,
        duration: _down ? t.motionFast : t.motionMedium,
        curve: _down ? t.easeOut : t.spring,
        child: widget.child,
      ),
    );
  }
}
