import 'package:flutter/foundation.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One-shot in-app review prompt.
///
/// Fired only at the genuine win moment — the completed switch (tracker step
/// 4, 'המעבר הושלם') — never on app open, never on a timer. A persisted
/// once-flag ('askedForReview') guarantees the OS review sheet is requested
/// AT MOST ONCE ever per install, so call sites may fire-and-forget: every
/// later call is a cheap no-op. Fail-soft: any plugin/storage error is
/// swallowed — a review prompt must never break the win screen.
Future<void> maybeAskForReview() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool('askedForReview') ?? false) return;

    final review = InAppReview.instance;
    if (await review.isAvailable()) {
      // Persist the flag BEFORE requesting: the OS gives no completion
      // signal, and asking twice is worse than occasionally asking zero
      // times. Unavailable platforms (e.g. web) don't burn the flag.
      await prefs.setBool('askedForReview', true);
      await review.requestReview();
    }
  } catch (e) {
    // Fail-soft by design — log in debug, stay silent in release.
    if (kDebugMode) debugPrint('review prompt skipped: $e');
  }
}
