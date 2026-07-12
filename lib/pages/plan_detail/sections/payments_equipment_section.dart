// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Payments & equipment section ───────────────────────────────────────────────
//
// An expandable card that surfaces the plan's REAL fees dict — installation,
// router and any one-off charges. Labels and values are passed through verbatim
// from the data (e.g. 'התקנה' → 'נחושת ₪49', 'נתב' → '+₪19.9/ח׳'); nothing is
// computed or invented. A per-row icon is chosen heuristically from the label
// (router / installation / SIM / joining), defaulting to a neutral receipt icon.

IconData _feeIcon(String label) {
  final l = label.toLowerCase();
  if (l.contains('נתב') || l.contains('ראוטר') || l.contains('router')) {
    return Icons.router_rounded;
  }
  if (l.contains('התקנה') || l.contains('install')) {
    return Icons.build_rounded;
  }
  if (l.contains('sim') || l.contains('סים')) return Icons.sim_card_rounded;
  if (l.contains('חיבור') || l.contains('הצטרפות') || l.contains('ניתוק')) {
    return Icons.link_rounded;
  }
  if (l.contains('ציוד') || l.contains('מקלט') || l.contains('ממיר')) {
    return Icons.devices_other_rounded;
  }
  return Icons.receipt_long_rounded;
}

class _PaymentsEquipmentSection extends StatelessWidget {
  const _PaymentsEquipmentSection({required this.plan});
  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final feeEntries = plan.fees.entries.toList();

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
      child: ExpansionTile(
        leading: Icon(Icons.payments_outlined,
            size: 20, color: ffTheme.secondaryText),
        title: Text('תשלומים וציוד', style: ffTheme.titleSmall),
        subtitle: Text(
          'התקנה, נתב ותשלומים חד-פעמיים',
          style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
        ),
        iconColor: ffTheme.secondaryText,
        collapsedIconColor: ffTheme.secondaryText,
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          ...feeEntries.asMap().entries.map((entry) {
            final isLast = entry.key == feeEntries.length - 1;
            final label = entry.value.key;
            final value = entry.value.value;
            return Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(_feeIcon(label), size: 18, color: ffTheme.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          style: ffTheme.bodyMedium
                              .copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          value,
                          style: ffTheme.bodySmall
                              .copyWith(color: ffTheme.secondaryText),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
