import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import '../theme/app_theme.dart';

/// Wraps any [child] so it gently scales down while pressed, then springs back
/// on release — the tactile feedback the app's design language calls for.
///
/// Pure presentation: it forwards the tap to [onTap] (when given) and adds no
/// semantics of its own, so callers keep wrapping their own [Semantics]/labels.
/// Honours the platform's reduced-motion setting by skipping the scale. Cheap
/// enough for list rows: one [AnimatedScale] per instance, no controllers.
///
/// KEYBOARD: a bare [GestureDetector] cannot be reached with Tab, cannot be
/// activated with Enter/Space and paints no focus ring — which made every
/// Pressable card, chip and row unusable for keyboard and switch-access users
/// on the web target (`flutter build web` is a release gate). It is therefore
/// wrapped in a [FocusableActionDetector] that maps Activate to [onTap] and
/// paints the same halo [AppButton] uses. Focus is only taken when the widget
/// actually does something — a Pressable with no handler stays out of the tab
/// order rather than becoming a focus stop that does nothing.
class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.scale,
    this.behavior = HitTestBehavior.opaque,
    this.enableFeedback = true,
    this.haptic = true,
    this.focusRadius,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Pressed-state scale. Defaults to [AppTheme.pressScale].
  final double? scale;
  final HitTestBehavior behavior;
  final bool enableFeedback;

  /// Fire a light selection haptic when [onTap] fires (default on). Set false
  /// for controls that emit their own feedback (e.g. wrapping an [AppButton])
  /// or that should stay silent.
  final bool haptic;

  /// Corner radius of the keyboard-focus halo. Defaults to [AppTheme.radiusLg]
  /// (the card corner), which is the shape most Pressables wrap; pass the
  /// child's own radius where it differs so the ring hugs it.
  final double? focusRadius;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;
  bool _focusVisible = false;

  void _set(bool v) {
    if (_down != v) setState(() => _down = v);
  }

  /// The single activation path, shared by tap and by Enter/Space, so a keyboard
  /// user gets exactly what a tap gives — haptic included.
  void _activate() {
    if (widget.onTap == null) return;
    if (widget.haptic) HapticFeedback.selectionClick();
    widget.onTap!();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final pressedScale = reduceMotion ? 1.0 : (widget.scale ?? t.pressScale);
    // A Pressable with no handler (e.g. an onTap that is conditionally null)
    // must not scale on touch — feedback without a resulting action reads as
    // a broken button.
    final tappable = widget.onTap != null || widget.onLongPress != null;

    final gesture = GestureDetector(
      behavior: widget.behavior,
      onTap: widget.onTap == null ? null : _activate,
      onLongPress: widget.onLongPress,
      onTapDown: tappable ? (_) => _set(true) : null,
      onTapUp: tappable ? (_) => _set(false) : null,
      onTapCancel: tappable ? () => _set(false) : null,
      // Press is a HIGH-FREQUENCY action (every list row, every tap), so the
      // feedback stays calm and fast: a subtle scale-down in the 100-160ms press
      // band on the way down, and a slightly longer ease-out settle on release —
      // no bouncy overshoot (that delight belongs to rare/first-time surfaces,
      // not something seen on every row). Both legs use ease-out: pressing in and
      // releasing back are each "entering/settling" motion, never ease-in.
      child: AnimatedScale(
        scale: _down ? pressedScale : 1.0,
        duration: _down ? t.motionPress : t.motionMedium,
        curve: t.easeOut,
        child: widget.child,
      ),
    );

    // Nothing to activate -> stay out of the tab order entirely. A focus stop
    // that does nothing is worse than no focus stop.
    if (!tappable) return gesture;

    return FocusableActionDetector(
      mouseCursor: SystemMouseCursors.click,
      onShowFocusHighlight: (visible) {
        if (_focusVisible != visible) setState(() => _focusVisible = visible);
      },
      // Enter and Space both arrive as an Activate intent through the default
      // WidgetsApp shortcut map; ButtonActivateIntent is the button-flavoured
      // variant some platforms send for Space.
      actions: <Type, Action<Intent>>{
        ActivateIntent: CallbackAction<ActivateIntent>(
          onInvoke: (_) {
            _activate();
            return null;
          },
        ),
        ButtonActivateIntent: CallbackAction<ButtonActivateIntent>(
          onInvoke: (_) {
            _activate();
            return null;
          },
        ),
      },
      // foregroundDecoration, so the halo is drawn OVER the child without
      // changing its layout or clipping it — identical treatment to AppButton.
      child: AnimatedContainer(
        duration: t.motionFast,
        curve: t.easeOut,
        foregroundDecoration: _focusVisible
            ? t.focusRingDecoration(radius: widget.focusRadius ?? t.radiusLg)
            : null,
        child: gesture,
      ),
    );
  }
}
