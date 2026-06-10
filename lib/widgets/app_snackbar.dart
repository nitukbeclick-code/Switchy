import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Unified floating SnackBars used across the app.
///
/// One look everywhere: floating behavior, 12-radius rounded shape, ~3s on
/// screen. [error] → [AppTheme.error] background, [success] → [AppTheme.success],
/// [info] → the SnackBar theme default (neutral). Copy stays Hebrew/RTL — the
/// [Text] inherits the app's RTL [Directionality], so no extra handling here.
///
/// The caller owns the `context.mounted` / `if (!mounted) return` guard before
/// calling these — the helper just forwards to [ScaffoldMessenger].
class AppSnackBar {
  AppSnackBar._();

  static void error(
    BuildContext context,
    String message, {
    Duration duration = const Duration(seconds: 3),
    SnackBarAction? action,
  }) {
    _show(context, message, AppTheme.of(context).error, duration, action);
  }

  static void success(
    BuildContext context,
    String message, {
    Duration duration = const Duration(seconds: 3),
    SnackBarAction? action,
  }) {
    _show(context, message, AppTheme.of(context).success, duration, action);
  }

  /// Neutral message (validation prompts, "coming soon", gated actions). Uses
  /// the default SnackBar background so it reads as informational, not alarming.
  static void info(
    BuildContext context,
    String message, {
    Duration duration = const Duration(seconds: 3),
    SnackBarAction? action,
  }) {
    _show(context, message, null, duration, action);
  }

  static void _show(
    BuildContext context,
    String message,
    Color? background,
    Duration duration,
    SnackBarAction? action,
  ) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: background,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      duration: duration,
      action: action,
    ));
  }
}
