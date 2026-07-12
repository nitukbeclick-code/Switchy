// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Helper widgets ────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.child, this.title});
  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      // Premium-2026 opaque card: low-opacity ink hairline + soft shadow + the
      // 1px top glass-glint, at the canonical card radius.
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            // Card titles are section headings for screen-reader navigation.
            Semantics(header: true, child: Text(title!, style: ffTheme.titleSmall)),
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.label,
    required this.value,
    required this.ffTheme,
    this.valueColor,
    this.isLast = false,
  });
  final String label;
  final String value;
  final AppTheme ffTheme;
  final Color? valueColor;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: ffTheme.bodyMedium
                    .copyWith(color: ffTheme.secondaryText)),
            // ₪-values go through PriceText (bidi-safe + tabular); plain
            // labels (e.g. commitment) stay ordinary ink text.
            if (value.startsWith('₪'))
              PriceText(value,
                  style: ffTheme.bodyMedium.copyWith(
                      color: valueColor ?? ffTheme.primaryText,
                      fontWeight: FontWeight.w600))
            else
              Text(value,
                  style: ffTheme.bodyMedium.copyWith(
                      color: valueColor ?? ffTheme.primaryText,
                      fontWeight: FontWeight.w600)),
          ],
        ),
        if (!isLast) ...[
          const SizedBox(height: 8),
          Divider(height: 1, color: ffTheme.alternate),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _SavingsPeriod extends StatelessWidget {
  const _SavingsPeriod({required this.months, required this.saveYear, required this.ffTheme});
  final int months;
  final int saveYear;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final amount = (saveYear * months / 12).round();
    return Column(
      children: [
        // Timeline figures are DATA → ink via PriceText (tabular keeps the
        // three columns aligned); the page's green savings moment is the
        // SavingPill in the price hero.
        PriceText(
          '₪$amount',
          style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text('$months חודשים', style: ffTheme.labelSmall),
      ],
    );
  }
}
