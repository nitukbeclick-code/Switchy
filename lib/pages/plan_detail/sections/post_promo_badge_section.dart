// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Post-promo price badge ────────────────────────────────────────────────────
//
// A compact, honest "price now → price after the promo" badge. Every figure is
// real: the current price is the plan's headline, the after-price is its own
// after/afterExact (via afterText), and the timeframe is the plan's intro. It
// is only ever built when plan.hasPromo, so we never imply a jump that the data
// doesn't carry.

class _PostPromoBadge extends StatelessWidget {
  const _PostPromoBadge({required this.plan});
  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final unit = priceUnitShort(plan);
    final after = plan.afterText;
    // Defensive: hasPromo already guarantees a value, but stay null-safe.
    if (after == null) return const SizedBox.shrink();

    return Semantics(
      label:
          'מחיר עכשיו ₪${plan.priceText} ל$unit, יעלה ל-₪$after ל$unit אחרי ${plan.intro ?? 'תקופת המבצע'}',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: t.warning.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(t.radiusMd),
            border: Border.all(color: t.warning.withValues(alpha: 0.35)),
          ),
          child: Row(
            children: [
              Icon(Icons.timelapse_rounded, size: 20, color: t.warning),
              const SizedBox(width: 10),
              // "עכשיו" price (the value the user pays today).
              _PromoSide(
                caption: 'מחיר עכשיו',
                value: '₪${plan.priceText}',
                unit: unit,
                valueColor: t.primary,
                t: t,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Icon(Icons.arrow_back_rounded,
                    size: 18, color: t.secondaryText),
              ),
              // "אחרי המבצע" price — the real post-promo figure.
              _PromoSide(
                caption: 'אחרי ${plan.intro ?? 'המבצע'}',
                value: '₪$after',
                unit: unit,
                valueColor: t.warning,
                t: t,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PromoSide extends StatelessWidget {
  const _PromoSide({
    required this.caption,
    required this.value,
    required this.unit,
    required this.valueColor,
    required this.t,
  });
  final String caption;
  final String value;
  final String unit;
  final Color valueColor;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          caption,
          style: t.labelSmall.copyWith(color: t.secondaryText),
        ),
        const SizedBox(height: 2),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Money via PriceText (bidi-safe LTR isolate + tabular figures).
            PriceText(
              value,
              style: t.titleMedium.copyWith(
                color: valueColor,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(width: 2),
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text('/$unit',
                  style: t.labelSmall.copyWith(color: t.secondaryText)),
            ),
          ],
        ),
      ],
    );
  }
}
