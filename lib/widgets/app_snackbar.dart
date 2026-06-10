import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Unified error/success SnackBars for the lead/callback/porting forms.
///
/// Replaces the hand-rolled `SnackBar(... behavior: floating, shape: rounded 12,
/// backgroundColor: error ...)` blocks that each page used to build inline.
/// The look is the established one: floating behavior, 12-radius rounded shape,
/// error → [AppTheme.error] background, success → [AppTheme.success] background,
/// ~3s on screen. Copy stays Hebrew/RTL — the [Text] inherits the app's RTL
/// [Directionality], so no extra direction handling is needed here.
///
/// The caller owns the `context.mounted` / `if (!mounted) return` guard before
/// calling these — the helper just forwards to [ScaffoldMessenger].
class AppSnackBar {
  AppSnackBar._();

  static void error(
    BuildContext context,
    String message, {
    Duration duration = const Duration(seconds: 3),
  }) {
    _show(context, message, AppTheme.of(context).error, duration);
  }

  static void success(
    BuildContext context,
    String message, {
    Duration duration = const Duration(seconds: 3),
  }) {
    _show(context, message, AppTheme.of(context).success, duration);
  }

  static void _show(
    BuildContext context,
    String message,
    Color background,
    Duration duration,
  ) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: background,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      duration: duration,
    ));
  }
}
