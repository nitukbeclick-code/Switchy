import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The shared **VALUE PILL** — the one recognizable treatment for a savings
/// figure across the app.
///
/// Switchy is mono-accent: green is the single brand hue, used for both ACTION
/// (CTAs/links/focus) and VALUE (savings). To stop a savings figure from
/// reading as "just another green button", VALUE is distinguished by a distinct
/// *treatment* rather than a competing colour:
///
///  • a small rounded pill with a pale-green TINT background
///    ([AppTheme.brandAccentTint]),
///  • the savings text in green ([AppTheme.savingText], AA-safe on the tint),
///  • a small leading savings GLYPH ([Icons.savings_rounded] by default), and
///  • TABULAR figures so ₪/% columns align and don't jitter as values change.
///
/// Primary CTAs stay SOLID green with a white label; this pill is tint+green
/// text, so the two never get confused.
///
/// TRUTH-ONLY: this widget only renders the [text] it is handed — it never
/// computes or formats a savings figure itself. Callers pass an already-real,
/// already-formatted string (e.g. `'חוסך ₪1,452 בשנה'`).
///
/// Fully RTL-aware (uses logical start/end via [Row] + [Directionality]) and
/// dark-mode-parity (all colours resolve through [AppTheme.of]).
class SavingPill extends StatelessWidget {
  /// The already-formatted, real savings copy (Hebrew-first), e.g.
  /// `'חוסך ₪1,452 בשנה'`. Rendered verbatim — never fabricate or recompute.
  final String text;

  /// The leading VALUE glyph. Defaults to [Icons.savings_rounded]; pass
  /// [Icons.trending_down_rounded] for a "cost going down" emphasis.
  final IconData icon;

  const SavingPill({
    super.key,
    required this.text,
    this.icon = Icons.savings_rounded,
  });

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final green = t.savingText;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: t.brandAccentTint,
        borderRadius: BorderRadius.circular(t.radiusPill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: green),
          SizedBox(width: t.space4),
          // [Flexible] so long Hebrew copy ellipsizes instead of overflowing
          // when the pill sits in a constrained row.
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: t.labelMedium.copyWith(
                color: green,
                fontWeight: FontWeight.w700,
                // Tabular figures keep ₪/% columns from shifting as the real
                // value updates (e.g. a recomputed savings number).
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
