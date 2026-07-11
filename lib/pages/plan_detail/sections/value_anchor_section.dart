// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── Above-the-fold VALUE anchor ───────────────────────────────────────────────
//
// The first thing the user sees under the hero: the ₪ they save vs THEIR OWN
// bill (the figure already computed in the build method — never fabricated),
// framed as an estimate when the bill isn't personalised, plus three honest
// "why this plan" bullets derived from the real plan spec + the engine reasons.

class _ValueAnchor extends StatelessWidget {
  const _ValueAnchor({
    required this.plan,
    required this.saveYear,
    required this.bill,
    required this.match,
    required this.billsPersonalized,
  });

  final Plan plan;
  final int saveYear;
  final int bill;
  final PlanMatch match;
  final bool billsPersonalized;

  /// Three honest, plan-specific reasons. We prefer the engine's own reasons
  /// (already explainable + real), then top up from the plan's real spec —
  /// budget fit, 5G, and the promo caveat — never inventing claims.
  List<_ValueBullet> _bullets() {
    final out = <_ValueBullet>[];

    // 1) Budget — only when there's a real saving vs the user's own bill.
    if (saveYear > 0 && bill > 0) {
      out.add(_ValueBullet(
        icon: Icons.account_balance_wallet_rounded,
        text: 'בתוך התקציב — זול ב-₪${(bill - plan.price).clamp(0, bill)} בחודש מהחשבון הנוכחי שלכם',
      ));
    }

    // 2) 5G / speed — straight from the plan's real features or specs.
    final hay = [
      ...plan.feats,
      ...plan.specs.values,
      ...plan.specs.keys,
    ].join(' ').toLowerCase();
    if (hay.contains('5g')) {
      out.add(const _ValueBullet(
        icon: Icons.network_cell_rounded,
        text: 'כולל רשת 5G מהירה',
      ));
    }

    // 3) Engine reasons — real, explainable; fill remaining slots.
    for (final r in match.reasons) {
      if (out.length >= 3) break;
      if (out.any((b) => b.text == r)) continue;
      out.add(_ValueBullet(icon: Icons.check_circle_rounded, text: r));
    }

    // Honest promo caveat — surface it up-front rather than burying it.
    if (out.length < 3 && plan.hasPromo) {
      out.add(_ValueBullet(
        icon: Icons.schedule_rounded,
        text: 'מחיר מבצע — יעלה ל-₪${plan.afterText} אחרי ${plan.intro ?? 'תקופת המבצע'}',
      ));
    }

    return out.take(3).toList();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final bullets = _bullets();
    final hasSaving = saveYear > 0;

    return Container(
      padding: const EdgeInsets.all(20),
      // The above-the-fold VALUE anchor reads as the page's hero bento tile.
      decoration: t.bentoDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Bold ₪ saving anchor vs the user's real bill, in the ONE canonical
          // SavingPill treatment (green tint + glyph + tabular figures) at the
          // guardian-hero numeral size. De-push: framed as an honest noun
          // statement ("חיסכון שנתי") rather than the imperative promise
          // "תחסכו". The number itself stays the REAL engine figure.
          if (hasSaving) ...[
            Text(
              'חיסכון שנתי',
              style: t.bodyMedium.copyWith(
                color: t.secondaryText,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: SavingPill(
                text: '₪$saveYear/שנה',
                textStyle: t.numericMedium.copyWith(
                  color: t.savingText,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Text(
                  'מול ₪$bill/חודש שאתם משלמים היום',
                  style: t.bodySmall.copyWith(color: t.secondaryText),
                ),
                if (!billsPersonalized) ...[
                  const SizedBox(width: 6),
                  _EstimateTag(t: t),
                ],
              ],
            ),
          ] else ...[
            // No personalised saving — anchor on the price + match, honestly.
            Text(
              'למה המסלול הזה',
              style: t.titleMedium.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              bill > 0
                  ? 'במחיר דומה לחשבון הנוכחי שלכם — הנה מה שמייחד אותו'
                  // De-push: honest helper, not "כמה תחסכו". We invite the
                  // comparison rather than promise a saving we can't yet back.
                  : 'הוסיפו את החשבון הנוכחי כדי להשוות אותו למסלול הזה',
              style: t.bodySmall.copyWith(color: t.secondaryText),
            ),
          ],

          if (bullets.isNotEmpty) ...[
            const SizedBox(height: 14),
            Divider(height: 1, color: t.alternate),
            const SizedBox(height: 14),
            ...bullets.asMap().entries.map((e) {
              final isLast = e.key == bullets.length - 1;
              final b = e.value;
              return Padding(
                padding: EdgeInsets.only(bottom: isLast ? 0 : 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(b.icon, size: 19, color: t.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        b.text,
                        style: t.bodyMedium
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

/// A single honest "why this plan" bullet for the above-the-fold anchor.
class _ValueBullet {
  const _ValueBullet({required this.icon, required this.text});
  final IconData icon;
  final String text;
}
