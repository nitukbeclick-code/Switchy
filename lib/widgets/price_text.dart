import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Renders a money string (`₪` + number, optionally trailed by a Hebrew unit
/// like `לחודש` / `/חודש`) with correct **bidi** ordering.
///
/// ## Why this exists
/// A price like `₪79` mixes a strong-LTR-leaning currency+digit run inside an
/// otherwise RTL (Hebrew) layout. Under the Unicode bidi algorithm the `₪`
/// glyph and the digits can re-order against each other (or against an adjacent
/// Hebrew unit), so a naive `Text('₪79/חודש')` may visually shuffle to
/// `79₪` or push the slash to the wrong side. Wrapping the numeric run in an
/// explicit **LTR isolate** ([Directionality] with [TextDirection.ltr]) pins
/// `₪` immediately before its digits and keeps the money token internally
/// stable, while the surrounding screen stays RTL.
///
/// ## TRUTH-ONLY
/// This widget renders the [text] it is handed **verbatim** — it never computes,
/// formats, rounds or fabricates a figure. Callers pass an already-real,
/// already-formatted money string (e.g. `'₪79'`, `'₪79/חודש'`). The whole
/// string is rendered as a SINGLE [Text] node (not split into spans), so
/// `find.text('₪79')` and `find.textContaining('₪79/חודש')` keep matching.
///
/// ## Theming
/// Defaults to [AppTheme.priceDisplay] (the dedicated tabular price numeral),
/// overridable via [style] (merged with the default so callers can recolor /
/// resize without losing tabular figures). Fully dark-mode-parity — the default
/// style resolves through [AppTheme.of].
class PriceText extends StatelessWidget {
  /// The already-real, already-formatted money string, e.g. `'₪79'` or
  /// `'₪79/חודש'`. Rendered verbatim — never recomputed or reformatted.
  final String text;

  /// Optional style override. When given it is MERGED onto the default
  /// [AppTheme.priceDisplay] (via `copyWith`/`merge`) so a caller can change
  /// just the colour or size while keeping the tabular-figure price treatment.
  /// Pass a full style to fully replace the numeral scale (still rendered LTR).
  final TextStyle? style;

  /// Forwarded to the inner [Text]. Defaults to a single line that ellipsizes.
  final int? maxLines;
  final TextOverflow overflow;

  /// Logical alignment of the money text. Defaults to start (RTL-aware via the
  /// outer context) — the LTR isolate only governs the internal glyph order, not
  /// where the run sits in its parent.
  final TextAlign? textAlign;

  const PriceText(
    this.text, {
    super.key,
    this.style,
    this.maxLines = 1,
    this.overflow = TextOverflow.ellipsis,
    this.textAlign,
  });

  @override
  Widget build(BuildContext context) {
    final base = AppTheme.of(context).priceDisplay;
    final resolved = style == null ? base : base.merge(style);

    // The LTR isolate: `₪` + digits (+ unit) keep a stable internal order even
    // though the surrounding app is RTL. The whole money string stays a single
    // Text node so widget-test `find.text(...)` targets still match.
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Text(
        text,
        style: resolved,
        maxLines: maxLines,
        overflow: overflow,
        textAlign: textAlign,
      ),
    );
  }
}
