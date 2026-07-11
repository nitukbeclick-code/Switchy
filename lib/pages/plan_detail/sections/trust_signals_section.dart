// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Trust signals row ─────────────────────────────────────────────────────────
//
// A compact card with up to TWO quiet trust rows under the price breakdown:
//   • Street price — the median ₪ real users report ACTUALLY paying for this
//     provider+category. Sourced from [StreetPriceService.aggregateFor], which
//     is null below [kStreetPriceMinReports] accepted reports, so a rendered
//     figure is always real, sufficient, screened data. Tap → the street-price
//     page prefilled for this provider/category.
//   • Rating — the provider's real star average + real review count
//     ([ProviderRatings.forProvider]; hasData is false until ≥1 real review).
//     Tap → the ratings page.
// A row with no data simply doesn't exist (the parent hides the whole card when
// both are empty) — never a placeholder, never an invented figure. Bank
// language: ink text on the standard card surface; green is spent only on the
// affordance chevron.

class _TrustSignalsRow extends StatelessWidget {
  const _TrustSignalsRow({
    required this.plan,
    required this.agg,
    required this.rating,
  });

  final Plan plan;
  final StreetPriceAggregate? agg;
  final ProviderRating rating;

  /// Real star average for display — whole number when whole ("4"), else one
  /// decimal ("4.5"). Formatting only; the figure is the aggregate's own.
  static String _starsText(double stars) => stars == stars.roundToDouble()
      ? stars.toInt().toString()
      : stars.toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final agg = this.agg;
    final ink = t.labelSmall.copyWith(
      color: t.primaryText,
      fontWeight: FontWeight.w600,
    );

    final rows = <Widget>[];

    if (agg != null) {
      rows.add(_trustRow(
        context,
        t,
        icon: Icons.receipt_long_rounded,
        semanticLabel:
            'משלמים בפועל ₪${agg.typicalText} — חציון של ${agg.reportCount} דיווחים אמיתיים. פתיחת מחיר הרחוב',
        onTap: () => context.pushNamed('StreetPrice', queryParameters: {
          'provider': plan.provider,
          'category': plan.cat,
        }),
        content: Row(
          children: [
            Text('משלמים בפועל: ', style: ink),
            // Money goes through PriceText — the LTR isolate keeps ₪ + digits
            // stable inside the RTL sentence.
            PriceText('₪${agg.typicalText}', style: ink),
            Flexible(
              child: Text(
                ' (חציון, ${agg.reportCount} דיווחים)',
                style: t.labelSmall.copyWith(color: t.secondaryText),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ));
    }

    if (rating.hasData) {
      final stars = _starsText(rating.stars);
      rows.add(_trustRow(
        context,
        t,
        icon: Icons.rate_review_outlined,
        semanticLabel:
            'דירוג $stars מתוך 5, ${rating.reviewCount} ביקורות אמיתיות. פתיחת עמוד הדירוגים',
        onTap: () => context.pushNamed('Ratings'),
        content: Text(
          '★ $stars · ${rating.reviewCount} ביקורות אמיתיות',
          style: ink,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ));
    }

    // Defensive — the call site already gates on data, but stay truthful if a
    // future caller forgets: no data → nothing at all.
    if (rows.isEmpty) return const SizedBox.shrink();

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: t.cardDecoration(radius: t.radiusCard),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.alternate),
            rows[i],
          ],
        ],
      ),
    );
  }

  Widget _trustRow(
    BuildContext context,
    AppTheme t, {
    required IconData icon,
    required String semanticLabel,
    required VoidCallback onTap,
    required Widget content,
  }) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(icon, size: 18, color: t.secondaryText),
                const SizedBox(width: 10),
                Expanded(child: content),
                // The single green element on the row — the tap affordance.
                Icon(Icons.chevron_left_rounded,
                    size: 18, color: t.brandAccent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
