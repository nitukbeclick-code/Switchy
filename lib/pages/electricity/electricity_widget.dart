import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';

/// חשמל — the private-electricity-supplier comparison screen.
///
/// Renders the REAL [electricityPlans] seed (5 suppliers) reusing the brand's
/// category/provider card + AppTheme patterns. Israel's electricity market is a
/// % discount off the regulated tariff (not a flat subscription), so the price
/// shown is an INDICATIVE monthly figure — the page makes that explicit with a
/// persistent "אינדיקטיבי — לאימות מול הספק" caveat, and the headline offer (the
/// real % off + time window) is surfaced from each plan's specs, never invented.
///
/// No fabricated savings: the electricity category's currentBill is 0, so we do
/// not crown an indicative figure as a head-to-head saving. We sort by the
/// catalogue's own price sort and present each supplier's real discount.
class ElectricityWidget extends StatelessWidget {
  const ElectricityWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final cat = categoryById('electricity');

    // Real catalogue, ascending by the indicative monthly figure (uses the
    // shared filteredPlans sort — no re-derived formula).
    final plans = filteredPlans(
      cat: 'electricity',
      sort: 'price',
      filters: const [],
      query: '',
      budget: 0,
    );

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: _Header(
              ffTheme: ffTheme,
              supplierCount: plans.map((p) => p.provider).toSet().length,
              planCount: plans.length,
              description: cat?.description ?? 'ספקי חשמל פרטיים',
              onBack: () => context.safePop(),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: _IndicativeNotice(ffTheme: ffTheme)
                  .animate()
                  .fadeIn(duration: 350.ms)
                  .slideY(begin: -0.06, end: 0),
            ),
          ),
          if (plans.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: _EmptyState(ffTheme: ffTheme),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, i) {
                    final plan = plans[i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _ElectricityCard(
                        plan: plan,
                        ffTheme: ffTheme,
                        onTap: () => context.pushNamed(
                          'PlanDetail',
                          pathParameters: {'planId': plan.id},
                        ),
                      )
                          // Cap the stagger so the last card still animates within
                          // a bounded window (and the widget-test pumps).
                          .animate(delay: ((i * 70).clamp(0, 500)).ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08, end: 0),
                    );
                  },
                  childCount: plans.length,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Header ──────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({
    required this.ffTheme,
    required this.supplierCount,
    required this.planCount,
    required this.description,
    required this.onBack,
  });

  final AppTheme ffTheme;
  final int supplierCount;
  final int planCount;
  final String description;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Container(
      // The big premium hero stays ink (never coloured) per the brand rule.
      decoration: BoxDecoration(gradient: ffTheme.freshGradient),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
                  tooltip: 'חזרה',
                  onPressed: onBack,
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                        ),
                        child: const ExcludeSemantics(
                          child: Icon(Icons.bolt_rounded, color: Colors.white, size: 26),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'חשמל',
                          style: ffTheme.headlineMedium.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    description,
                    style: ffTheme.bodyMedium
                        .copyWith(color: Colors.white.withValues(alpha: 0.85)),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '$supplierCount ספקים · $planCount מסלולים',
                    style: ffTheme.labelMedium
                        .copyWith(color: Colors.white.withValues(alpha: 0.70)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.06, end: 0, curve: Curves.easeOutCubic);
  }
}

// ── Indicative caveat ─────────────────────────────────────────────────────────
//
// The honesty gate: electricity offers are a % off the regulated tariff, so any
// shekel figure here is a representative monthly bill, NOT a fixed price. This
// notice is always visible so the indicative figures are never mistaken for a
// confirmed quote — verify with the supplier.

class _IndicativeNotice extends StatelessWidget {
  const _IndicativeNotice({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label:
          'אינדיקטיבי — המחירים הם הערכה חודשית אחרי ההנחה, לאימות מול הספק',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          // Amber VALUE-tinted advisory surface — theme-aware so it reads on
          // both the glass-white and the slate-dark canvas.
          color: Color.alphaBlend(
              ffTheme.saving.withValues(alpha: ffTheme.dark ? 0.16 : 0.09),
              ffTheme.cardSurface),
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          border: Border.all(color: ffTheme.saving.withValues(alpha: 0.40)),
          boxShadow: ffTheme.shadowSoft,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ExcludeSemantics(
              child: Icon(Icons.info_outline_rounded, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'אינדיקטיבי — לאימות מול הספק',
                    style: ffTheme.labelLarge.copyWith(
                      color: ffTheme.savingText,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'ההנחה היא אחוז מתעריף רשות החשמל. המחיר המוצג הוא הערכת '
                    'חשבון חודשי אחרי ההנחה למשק בית טיפוסי — לא מחיר קבוע.',
                    style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Electricity supplier card ─────────────────────────────────────────────────

class _ElectricityCard extends StatelessWidget {
  const _ElectricityCard({
    required this.plan,
    required this.ffTheme,
    required this.onTap,
  });

  final Plan plan;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Real offer fields — never fabricated. The headline discount + window come
    // straight from the seed's specs; the price is the indicative monthly figure.
    final discount = plan.specs['הנחה'];
    final window = plan.specs['חלון'];
    final benefit = plan.feats.isNotEmpty ? plan.feats.first : null;

    return Semantics(
      button: true,
      // Announce the whole card as ONE labelled button (the visible fragments
      // are exposed to sighted users; assistive tech reads this single summary).
      excludeSemantics: true,
      label: 'פתח את פרטי המסלול ${plan.provider} — ${plan.plan}',
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Logo + provider + plan name + the discount badge.
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LogoWidget(provider: plan.provider, size: 44),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            plan.provider,
                            style: ffTheme.titleSmall
                                .copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            plan.plan,
                            style: ffTheme.bodySmall,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    if (discount != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          // The discount % is the VALUE here → amber.
                          color: ffTheme.saving,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        ),
                        child: Text(
                          discount,
                          style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.onSaving,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                // Indicative price row — labelled so it's never read as a fixed fee.
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '~₪${plan.priceText}',
                      style: ffTheme.titleLarge.copyWith(
                          color: ffTheme.primary, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(width: 4),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(
                        'לחודש (אינדיקטיבי)',
                        style: ffTheme.labelSmall
                            .copyWith(color: ffTheme.secondaryText),
                      ),
                    ),
                    const Spacer(),
                    const ExcludeSemantics(
                      child: Icon(Icons.chevron_left_rounded, size: 18),
                    ),
                  ],
                ),
                if (window != null) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const ExcludeSemantics(
                        child: Icon(Icons.schedule_rounded, size: 13),
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          'חלון הנחה: $window',
                          style: ffTheme.labelSmall.copyWith(
                              color: ffTheme.primaryText, fontSize: 11),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
                if (benefit != null) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.check_circle_outline_rounded,
                            size: 13, color: ffTheme.brandAccent),
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          benefit,
                          style: ffTheme.labelSmall.copyWith(
                              color: ffTheme.primaryText, fontSize: 11),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
                // The no-commitment chip — a real flag every electricity plan carries.
                if (plan.noCommit) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: ffTheme.brandAccent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                    ),
                    child: Text(
                      'ללא התחייבות',
                      style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.brandAccentText,
                        fontWeight: FontWeight.w700,
                        fontSize: 10.5,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                shape: BoxShape.circle,
              ),
              child: const ExcludeSemantics(
                child: Icon(Icons.bolt_rounded, size: 48),
              ),
            ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.7, 0.7)),
            const SizedBox(height: 20),
            Text('אין מסלולי חשמל זמינים', style: ffTheme.titleMedium)
                .animate()
                .fadeIn(delay: 120.ms),
            const SizedBox(height: 8),
            Text(
              'נעדכן ברגע שספקי חשמל פרטיים יתווספו להשוואה',
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 180.ms),
          ],
        ),
      ),
    );
  }
}
