// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Spec grid ─────────────────────────────────────────────────────────────────

IconData _specIcon(String label) {
  final l = label.toLowerCase();
  if (l.contains('נתונים') || l.contains('גלישה')) return Icons.data_usage_rounded;
  if (l.contains('דקות')) return Icons.call_rounded;
  if (l.contains('sms') || l.contains('הודעות')) return Icons.sms_rounded;
  if (l.contains('מהירות')) return Icons.speed_rounded;
  if (l.contains('ערוצים')) return Icons.tv_rounded;
  if (l.contains('חו"ל') || l.contains('חול') || l.contains('בינלאומי')) return Icons.public_rounded;
  return Icons.info_outline_rounded;
}

class _SpecGrid extends StatelessWidget {
  const _SpecGrid({required this.plan});
  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final entries = plan.specs.entries.toList();
    return Container(
      padding: const EdgeInsets.all(18),
      // Anchor bento tile for the spec cluster.
      decoration: ffTheme.bentoDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('מפרט', style: ffTheme.titleSmall)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: entries.map((e) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  // Resting spec tile: flat + 1px hairline token (no shadow —
                  // one elevation story).
                  color: ffTheme.background,
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                  border: Border.all(color: ffTheme.lineColor),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_specIcon(e.key), size: 16, color: ffTheme.primary),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          e.value,
                          style: ffTheme.bodySmall.copyWith(
                            fontWeight: FontWeight.w700,
                            color: ffTheme.primaryText,
                          ),
                        ),
                        Text(
                          e.key,
                          style: ffTheme.labelSmall
                              .copyWith(color: ffTheme.secondaryText),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
