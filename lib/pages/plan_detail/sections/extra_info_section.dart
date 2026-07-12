// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Extra info / fine print (expandable) ─────────────────────────────────────

class _ExtraInfoSection extends StatelessWidget {
  const _ExtraInfoSection({required this.plan});
  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
      child: ExpansionTile(
        title: Text('מידע נוסף ואותיות קטנות', style: ffTheme.titleSmall),
        iconColor: ffTheme.secondaryText,
        collapsedIconColor: ffTheme.secondaryText,
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          // Terms bullets
          if (plan.terms.isNotEmpty) ...[
            _ExtraSubheading(label: 'תנאי התחייבות', ffTheme: ffTheme),
            ...plan.terms.map((t) => _BulletRow(
              text: t,
              icon: Icons.check_circle_outline_rounded,
              ffTheme: ffTheme,
            )),
            const SizedBox(height: 10),
          ],
          // Fine print bullets
          if (plan.allFinePrint.isNotEmpty) ...[
            _ExtraSubheading(label: 'אותיות קטנות', ffTheme: ffTheme),
            ...plan.allFinePrint.map((f) => _BulletRow(
              text: f,
              icon: Icons.info_outline_rounded,
              ffTheme: ffTheme,
            )),
            const SizedBox(height: 10),
          ],
          // Eligibility
          if (plan.eligibility != null && plan.eligibility!.trim().isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                // Tokenized 1px hairline (was a raw ink-alpha border).
                border: Border.all(color: ffTheme.lineColor),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.person_outline_rounded, size: 16, color: ffTheme.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'למי זה מתאים: ${plan.eligibility!.trim()}',
                      style: ffTheme.bodySmall.copyWith(
                        color: ffTheme.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
          // Notes
          if (plan.notes != null && plan.notes!.trim().isNotEmpty) ...[
            Text(
              plan.notes!.trim(),
              style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
            ),
            const SizedBox(height: 10),
          ],
          // Footer: updatedAt + source link
          if (plan.updatedAt != null || plan.sourceUrl != null)
            Row(
              children: [
                if (plan.updatedAt != null)
                  Expanded(
                    child: Text(
                      'עודכן: ${plan.updatedAt!}',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                    ),
                  ),
                if (plan.sourceUrl != null)
                  // Accessible name + link role for the tiny "מקור" text link,
                  // and a >=48dp hit area (the visible text stays the same
                  // size — only the invisible tap zone grows).
                  Semantics(
                    link: true,
                    label: 'פתיחת מקור המחיר בדפדפן',
                    child: Pressable(
                    onTap: () async {
                      try {
                        final uri = Uri.parse(plan.sourceUrl!);
                        // Only ever follow http(s) source links. sourceUrl is
                        // developer-authored today, but guard the sink so a
                        // future data source can't smuggle in a javascript:/
                        // file:/intent: scheme. Anything else is ignored.
                        final scheme = uri.scheme.toLowerCase();
                        if (scheme != 'http' && scheme != 'https') return;
                        if (!await canLaunchUrl(uri)) return;
                        await launchUrl(
                          uri,
                          mode: LaunchMode.externalApplication,
                        );
                      } catch (_) {}
                    },
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                          minWidth: kMinTapTarget, minHeight: kMinTapTarget),
                      child: Center(
                        child: Text(
                          'מקור',
                          style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.primary,
                            fontWeight: FontWeight.w700,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                    ),
                  ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _ExtraSubheading extends StatelessWidget {
  const _ExtraSubheading({required this.label, required this.ffTheme});
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        label,
        style: ffTheme.labelSmall.copyWith(
          color: ffTheme.secondaryText,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _BulletRow extends StatelessWidget {
  const _BulletRow({required this.text, required this.icon, required this.ffTheme});
  final String text;
  final IconData icon;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: ffTheme.secondaryText),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
            ),
          ),
        ],
      ),
    );
  }
}
