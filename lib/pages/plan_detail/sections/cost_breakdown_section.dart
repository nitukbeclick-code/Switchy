// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Cost breakdown ────────────────────────────────────────────────────────────

class _CostBreakdownCard extends StatelessWidget {
  const _CostBreakdownCard({required this.plan});
  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final isAbroad = plan.cat == 'abroad';
    final unit = priceUnitLabel(plan);
    final estimateMonths = (plan.term != null && plan.term! > 0) ? plan.term! : 12;
    final estimatedTotal = plan.price * estimateMonths;
    final feeEntries = plan.fees.entries.toList();

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('עלות כוללת', style: ffTheme.titleSmall)),
          const SizedBox(height: 12),
          // Monthly/package price row
          _PriceRow(
            label: 'מחיר $unit',
            value: '₪${plan.priceText}',
            ffTheme: ffTheme,
          ),
          // Promo info
          if (plan.hasPromo) ...[
            _PriceRow(
              label: 'מחיר לאחר מבצע',
              value: '₪${plan.afterText}',
              valueColor: ffTheme.warning,
              ffTheme: ffTheme,
            ),
          ],
          // Commitment label
          _PriceRow(
            label: 'התחייבות',
            value: plan.commitmentLabel,
            ffTheme: ffTheme,
          ),
          // Estimated cost
          if (!isAbroad) ...[
            _PriceRow(
              label: 'עלות מוערכת ל-$estimateMonths חודשים',
              value: '₪$estimatedTotal',
              ffTheme: ffTheme,
              isLast: feeEntries.isEmpty,
            ),
          ],
          // Fee rows
          if (feeEntries.isNotEmpty) ...[
            const SizedBox(height: 8),
            Divider(height: 1, color: ffTheme.alternate),
            const SizedBox(height: 8),
            Text(
              'עמלות ותשלומים נוספים',
              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
            ),
            const SizedBox(height: 8),
            ...feeEntries.asMap().entries.map((entry) {
              final isLast = entry.key == feeEntries.length - 1;
              return _PriceRow(
                label: entry.value.key,
                value: entry.value.value,
                ffTheme: ffTheme,
                isLast: isLast,
              );
            }),
          ],
        ],
      ),
    );
  }
}
