// Extracted verbatim from ../plan_detail_widget.dart — a mechanical
// per-section split (zero visual change). `part of` keeps every section in
// the SAME library: the underscore widgets stay private, imports live in the
// page file, and all page state stays in _PlanDetailWidgetState
// (CLAUDE.md: page-local state lives in the State class; no _model.dart).
part of '../plan_detail_widget.dart';

// ── "למה המסלול הזה מתאים לך" — fit panel ────────────────────────────────────
//
// A tasteful glass panel that explains, honestly, why this plan fits the user.
// Everything shown is real: the match score + reasons + caveats come straight
// from RecommendationEngine.scorePlan (no re-derived math), and the annual
// saving is the engine's own figure — marked "הערכה" whenever the user hasn't
// personalised their bill, so we never imply a precise number we can't back.

class _FitPanel extends StatelessWidget {
  const _FitPanel({
    required this.match,
    required this.annualSaving,
    required this.billsPersonalized,
    required this.inCompare,
    required this.onCompare,
  });

  final PlanMatch match;
  final int annualSaving;
  final bool billsPersonalized;
  final bool inCompare;
  final VoidCallback onCompare;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final hasSaving = annualSaving > 0;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        // GEIST: flat bordered content card — solid surface + neutral hairline
        // (was a translucent glass with a decorative green-tinted border + glass
        // shadow). The match-score ring carries the emphasis, not the frame.
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusLg),
        border: Border.all(color: t.lineColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: title + score ring/meter
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                        header: true,
                        child: Text('למה המסלול הזה מתאים לך',
                            style: t.titleMedium)),
                    const SizedBox(height: 4),
                    Text(
                      match.label,
                      style: t.bodySmall.copyWith(
                        color: t.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _ScoreRing(percent: match.scorePct),
            ],
          ),

          // Real annual saving — honest estimate framing.
          if (hasSaving) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: t.accent1,
                borderRadius: BorderRadius.circular(t.radiusSm),
                border: Border.all(color: t.primary.withValues(alpha: 0.12)),
              ),
              child: Row(
                children: [
                  Icon(Icons.savings_rounded, size: 18, color: t.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        style: t.bodySmall.copyWith(color: t.primaryText),
                        children: [
                          const TextSpan(text: 'חיסכון שנתי מול החשבון שלך: '),
                          TextSpan(
                            text: '₪$annualSaving',
                            style: t.bodyMedium.copyWith(
                              color: t.primary,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (!billsPersonalized) ...[
                    const SizedBox(width: 6),
                    _EstimateTag(t: t),
                  ],
                ],
              ),
            ),
          ],

          // Reasons (real ✓ list from the engine)
          if (match.reasons.isNotEmpty) ...[
            const SizedBox(height: 14),
            ...match.reasons.map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.check_circle_rounded,
                          color: t.success, size: 18),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                          r,
                          style: t.bodyMedium.copyWith(
                              fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                )),
          ],

          // Caveats (honest cons)
          if (match.caveats.isNotEmpty) ...[
            const SizedBox(height: 4),
            ...match.caveats.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 7),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline_rounded,
                          color: t.secondaryText, size: 16),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                          c,
                          style: t.bodySmall.copyWith(
                              color: t.secondaryText),
                        ),
                      ),
                    ],
                  ),
                )),
          ],

          // Honest empty state — when the engine has nothing concrete to say
          // (no bill set, no standout features) we don't fabricate praise.
          if (match.reasons.isEmpty && match.caveats.isEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'הוסיפו את החשבון הנוכחי שלכם כדי לראות עד כמה המסלול מתאים ומה ניתן לחסוך.',
              style: t.bodySmall.copyWith(color: t.secondaryText),
            ),
          ],

          // "השוואה" CTA — toggles this plan in/out of the compare tray.
          // Active = the ONE green active language (tint + green border + green
          // ink); resting = a quiet neutral tile — replaces the solid-ink fill
          // with its per-theme pinned-white gymnastics and raw ink-alpha washes.
          const SizedBox(height: 16),
          Semantics(
            button: true,
            label: inCompare ? 'הסר מההשוואה' : 'הוסף להשוואה',
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onCompare,
                borderRadius: BorderRadius.circular(t.radiusSm),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: double.infinity,
                  constraints:
                      const BoxConstraints(minHeight: kMinTapTarget),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: inCompare ? t.brandAccentTint : t.accent1,
                    borderRadius: BorderRadius.circular(t.radiusSm),
                    border: Border.all(
                      color: inCompare ? t.brandAccent : t.alternate,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        inCompare
                            ? Icons.check_rounded
                            : Icons.compare_arrows_rounded,
                        size: 18,
                        color: inCompare ? t.brandAccentText : t.primary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        inCompare ? 'נוסף להשוואה' : 'הוסף להשוואה',
                        style: t.titleSmall.copyWith(
                          color: inCompare ? t.brandAccentText : t.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Small "הערכה" pill, used to mark figures that aren't personalised yet.
class _EstimateTag extends StatelessWidget {
  const _EstimateTag({required this.t});
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: t.warning.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(t.radiusSm),
      ),
      child: Text(
        'הערכה',
        style: t.labelSmall.copyWith(
          color: t.warning,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// A circular match-score meter — the engine's real 0–100 score drawn as a
/// teal progress ring with the percentage in the centre.
class _ScoreRing extends StatelessWidget {
  const _ScoreRing({required this.percent});
  final int percent;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final target = (percent / 100).clamp(0.0, 1.0);
    return Semantics(
      label: 'ציון התאמה $percent אחוז',
      child: ExcludeSemantics(
        // RepaintBoundary: the ring's 700ms sweep repaints per frame — keep it
        // from invalidating the whole fit panel.
        child: RepaintBoundary(
        child: SizedBox(
          width: 64,
          height: 64,
          child: TweenAnimationBuilder<double>(
          // Reduced motion: land on the final value with no sweep.
          tween: Tween(begin: reduceMotion ? target : 0, end: target),
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeOutCubic,
          builder: (context, value, _) {
            return CustomPaint(
              painter: _RingPainter(
                progress: value,
                track: t.primary.withValues(alpha: 0.12),
                fill: t.primary,
                cap: t.primary.withValues(alpha: 0.55),
              ),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '${(value * 100).round()}%',
                      style: t.titleSmall.copyWith(
                        color: t.primary,
                        fontWeight: FontWeight.w800,
                        height: 1,
                      ),
                    ),
                    Text(
                      'התאמה',
                      style: t.labelSmall.copyWith(
                        color: t.secondaryText,
                        fontSize: 9,
                        height: 1.1,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
      ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.progress,
    required this.track,
    required this.fill,
    required this.cap,
  });

  final double progress; // 0..1
  final Color track;
  final Color fill;
  final Color cap;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 6.0;
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = (size.shortestSide - stroke) / 2;

    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = track;
    canvas.drawCircle(center, radius, trackPaint);

    if (progress <= 0) return;

    final sweep = 2 * math.pi * progress;
    final arcRect = Rect.fromCircle(center: center, radius: radius);
    final fillPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        startAngle: 0,
        endAngle: 2 * math.pi,
        colors: [fill, cap],
        transform: const GradientRotation(-math.pi / 2),
      ).createShader(arcRect);
    // Start at 12 o'clock, sweep clockwise.
    canvas.drawArc(arcRect, -math.pi / 2, sweep, false, fillPaint);
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress ||
      old.fill != fill ||
      old.track != track ||
      old.cap != cap;
}
