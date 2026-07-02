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

  /// Optional COMPACT fallback (e.g. `'חוסך ₪1,452'` — the same real figure,
  /// minus the period word). When given, the pill becomes maxWidth-aware:
  ///
  ///  1. if the FULL [text] fits the incoming constraints, it renders as-is;
  ///  2. else, if [shortText] fits, the pill renders the short copy;
  ///  3. else the pill hides entirely (`SizedBox.shrink`) — an unreadable
  ///     half-word pill ('חו…') is worse than none.
  ///
  /// Presentation-only: the figure itself is never altered, and callers keep
  /// the full copy in their Semantics label. `null` (the default) keeps the
  /// legacy ellipsizing behaviour — fully backwards-compatible.
  final String? shortText;

  /// The leading VALUE glyph. Defaults to [Icons.savings_rounded]; pass
  /// [Icons.trending_down_rounded] for a "cost going down" emphasis.
  final IconData icon;

  /// Optional text-style override. `null` (the default) keeps the canonical
  /// pill treatment (labelMedium, [AppTheme.savingText] green, w700, tabular
  /// figures) — fully backwards-compatible. When given, the style is used
  /// VERBATIM, so callers wanting a larger numeral (e.g. the guardian hero's
  /// `numericMedium`) must pass a complete style, ideally one that already
  /// carries tabular figures.
  final TextStyle? textStyle;

  const SavingPill({
    super.key,
    required this.text,
    this.shortText,
    this.icon = Icons.savings_rounded,
    this.textStyle,
  });

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final green = t.savingText;
    final style = textStyle ??
        t.labelMedium.copyWith(
          color: green,
          fontWeight: FontWeight.w700,
          // Tabular figures keep ₪/% columns from shifting as the
          // real value updates (e.g. a recomputed savings number).
          fontFeatures: const [FontFeature.tabularFigures()],
        );

    Widget pill(String copy) => Container(
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
              // [Flexible] so long Hebrew copy ellipsizes instead of
              // overflowing when the pill sits in a constrained row (the
              // last-resort backstop under the compact mode below).
              Flexible(
                child: Text(
                  copy,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: style,
                ),
              ),
            ],
          ),
        );

    // Legacy path — no compact fallback provided, render exactly as before.
    if (shortText == null) return pill(text);

    // COMPACT mode: pick full → short → nothing by what actually fits, using
    // the SAME style + ambient textScaler the pill renders with, so the
    // decision stays honest at any OS text scale.
    return LayoutBuilder(builder: (context, constraints) {
      if (!constraints.hasBoundedWidth) return pill(text);
      final scaler = MediaQuery.maybeTextScalerOf(context) ?? TextScaler.noScaling;
      // Measure with the SAME effective style [Text] renders with — an
      // inherit:true style merges over the ambient DefaultTextStyle (which
      // can contribute letterSpacing etc.), so the raw token under-measures.
      final ambient = DefaultTextStyle.of(context).style;
      final effective = style.inherit ? ambient.merge(style) : style;
      double neededFor(String copy) {
        final painter = TextPainter(
          text: TextSpan(text: copy, style: effective),
          textDirection: Directionality.of(context),
          textScaler: scaler,
          maxLines: 1,
        )..layout();
        // Pill chrome around the text: 2×10 padding + 15 icon + space4 gap.
        return painter.width.ceilToDouble() + 20 + 15 + t.space4;
      }

      if (neededFor(text) <= constraints.maxWidth) return pill(text);
      if (neededFor(shortText!) <= constraints.maxWidth) return pill(shortText!);
      return const SizedBox.shrink();
    });
  }
}
