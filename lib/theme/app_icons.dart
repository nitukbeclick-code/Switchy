import 'package:flutter/material.dart';

/// Canonical semantic icon map for Switchy AI — the Flutter mirror of
/// web/components/Icon.tsx. One ROUNDED Material variant per semantic name for a
/// single consistent, friendly weight that matches the white-glass + green
/// brand. Theme each icon at the CALL SITE (size + color) so dark-mode and the
/// green=ACTION / amber=VALUE system are preserved — never bake a color or size
/// here.
///
/// Web parity (site `<Icon name=…>` ⇄ `AppIcons.…`):
///   check⇄check · chevron⇄chevron · arrow⇄forward · close⇄close · search⇄search
///   star⇄star · info⇄info · alert⇄alert · lock⇄lock · spark⇄spark · sun⇄sun · moon⇄moon
///
/// a11y: an [IconData] is decorative on its own — wrap interactive controls in a
/// `Semantics(button: true, label: …)` or `IconButton(tooltip: …)`. RTL uses the
/// LOGICAL chevron/back (chevron_left reads as "forward" in an RTL layout); use
/// [back]/[forward] semantics, not physical left/right.
///
/// Examples:
///   Icon(AppIcons.spark, color: theme.brandAccent)            // decorative, themed
///   IconButton(icon: const Icon(AppIcons.back), tooltip: 'חזרה', onPressed: …)
///   Icon(filled ? AppIcons.star : AppIcons.starOutline)        // state toggle
abstract final class AppIcons {
  // ── web-parity set (12) ───────────────────────────────────────────────────
  static const IconData check = Icons.check_rounded;
  static const IconData chevron = Icons.chevron_left_rounded; // RTL "forward"
  static const IconData forward = Icons.arrow_forward_rounded;
  static const IconData close = Icons.close_rounded;
  static const IconData search = Icons.search_rounded;
  static const IconData star = Icons.star_rounded;
  static const IconData info = Icons.info_rounded;
  static const IconData alert = Icons.warning_amber_rounded;
  static const IconData lock = Icons.lock_rounded;
  static const IconData spark = Icons.auto_awesome_rounded; // AI / agent
  static const IconData sun = Icons.light_mode_rounded;
  static const IconData moon = Icons.dark_mode_rounded;

  // ── app-only high-frequency glyphs (no web twin) ──────────────────────────
  static const IconData back = Icons.arrow_back_rounded;
  static const IconData forwardChevron = Icons.chevron_right_rounded;
  static const IconData starHalf = Icons.star_half_rounded;
  static const IconData starOutline = Icons.star_border_rounded;
  static const IconData success = Icons.check_circle_rounded;
  static const IconData successOutline = Icons.check_circle_outline_rounded;
  static const IconData error = Icons.error_rounded;
  static const IconData savings = Icons.savings_rounded;
  static const IconData bill = Icons.receipt_long_rounded;
  static const IconData bell = Icons.notifications_rounded;
  static const IconData bellOutline = Icons.notifications_none_rounded;
  static const IconData share = Icons.ios_share_rounded;
  static const IconData send = Icons.send_rounded;
  static const IconData chat = Icons.chat_bubble_rounded;
  static const IconData supportAgent = Icons.support_agent_rounded;
  static const IconData compare = Icons.compare_arrows_rounded;
  static const IconData verified = Icons.verified_rounded;
  static const IconData person = Icons.person_rounded;
  static const IconData edit = Icons.edit_rounded;
  static const IconData delete = Icons.delete_rounded;
  static const IconData filter = Icons.filter_list_rounded;
  static const IconData settings = Icons.settings_rounded;
  static const IconData schedule = Icons.schedule_rounded;
  static const IconData insights = Icons.insights_rounded;
  static const IconData bolt = Icons.bolt_rounded;
  static const IconData trendingDown = Icons.trending_down_rounded;
  static const IconData award = Icons.workspace_premium_rounded;
  static const IconData bookmark = Icons.bookmark_rounded;
  static const IconData bookmarkOutline = Icons.bookmark_border_rounded;
  static const IconData add = Icons.add_rounded;
  static const IconData copy = Icons.content_copy_rounded;
  static const IconData home = Icons.home_rounded;
  static const IconData phone = Icons.phone_rounded;
  static const IconData refresh = Icons.refresh_rounded;
}
