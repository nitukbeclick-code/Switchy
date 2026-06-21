import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../services/backend/local_backend.dart';

/// Ink read out on the amber VALUE surface — amber is fixed-hue in both
/// themes, so this deep-amber ink stays legible on light AND dark.
const Color _onSaving = Color(0xFF3A2900);

class PlanDetailWidget extends StatefulWidget {
  const PlanDetailWidget({super.key, required this.planId});
  final String planId;

  @override
  State<PlanDetailWidget> createState() => _PlanDetailWidgetState();
}

class _PlanDetailWidgetState extends State<PlanDetailWidget> {
  @override
  void initState() {
    super.initState();
    // Track this plan view for demand analytics
    final viewedPlan = planById(widget.planId);
    if (viewedPlan != null) {
      appBackend.trackPlanView(
        planId: widget.planId,
        provider: viewedPlan.provider,
        category: viewedPlan.cat,
      ).catchError((_) {});
    }
    // Record the view once per visit, after the first frame so the
    // notifyListeners doesn't fire mid-build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) AppState().viewPlan(widget.planId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final plan = planById(widget.planId);

    if (plan == null) {
      return Scaffold(
        appBar: AppBar(
          backgroundColor: ffTheme.primary,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
            tooltip: 'חזרה',
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline_rounded, size: 64, color: ffTheme.alternate),
              const SizedBox(height: 16),
              Text('מסלול לא נמצא', style: ffTheme.titleMedium),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => context.pop(),
                child: Text('חזרה', style: ffTheme.bodyMedium.copyWith(color: ffTheme.primary)),
              ),
            ],
          ),
        ),
      );
    }

    final bill = appState.currentBill(plan.cat);
    final saveYear = planSaveYear(plan, bill);
    final cost24 = plan.price * 24;
    final inCompare = appState.isInCompare(plan.id);

    // Compute match once for this plan
    final matchProfile = MatchProfile.fromAppState(appState, plan.cat);
    final planMatch = RecommendationEngine.scorePlan(plan, matchProfile);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              // SliverAppBar with green gradient
              SliverAppBar(
                expandedHeight: 200,
                pinned: true,
                backgroundColor: ffTheme.primary,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
                  tooltip: 'חזרה',
                  onPressed: () => context.pop(),
                ),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.share_rounded, color: Colors.white),
                    tooltip: 'שתף מסלול',
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      final unit = priceUnitShort(plan);
                      Share.share('${plan.provider} — ${plan.plan}\n₪${plan.priceText}/$unit\n\nמצאתי בחוסך');
                    },
                  ),
                  IconButton(
                    icon: Icon(
                      inCompare ? Icons.compare_arrows_rounded : Icons.add,
                      color: inCompare ? ffTheme.secondary : Colors.white,
                    ),
                    tooltip: inCompare ? 'הסר מהשוואה' : 'הוסף להשוואה',
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      appState.toggleCompare(plan.id);
                    },
                  ),
                  const SizedBox(width: 8),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [ffTheme.primary, ffTheme.primaryDark],
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                      ),
                    ),
                    child: SafeArea(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(height: 32),
                          // Logo sits on a soft white chip so per-provider brand
                          // colours stay legible over the green hero (we never
                          // recolour the logo itself).
                          Hero(
                            tag: 'plan_logo_${plan.id}',
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.12),
                                    blurRadius: 14,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: LogoWidget(provider: plan.provider, size: 64),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Semantics(
                            button: true,
                            label: 'עבור לעמוד הספק ${plan.provider}',
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                onTap: () => context.pushNamed('Provider', pathParameters: {'name': plan.provider}),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(plan.provider,
                                          style: ffTheme.titleLarge.copyWith(color: Colors.white)),
                                      const SizedBox(width: 4),
                                      Icon(Icons.chevron_left_rounded,
                                          size: 18,
                                          color: Colors.white.withValues(alpha: 0.85)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 40),
                            child: Text(
                              plan.plan,
                              style: ffTheme.bodySmall
                                  .copyWith(color: Colors.white.withValues(alpha: 0.85)),
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Price hero card
                      _Card(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      '₪${plan.priceText}',
                                      style: ffTheme.displaySmall.copyWith(
                                          color: ffTheme.primary,
                                          fontWeight: FontWeight.w800),
                                    ),
                                    const SizedBox(width: 4),
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: Text('/${priceUnitShort(plan)}',
                                          style: ffTheme.bodySmall.copyWith(
                                              color: ffTheme.secondaryText)),
                                    ),
                                  ],
                                ),
                                if (plan.hasPromo)
                                  Text(
                                    '₪${plan.after} אחרי ${plan.intro ?? 'המבצע'}',
                                    style: ffTheme.bodySmall
                                        .copyWith(color: ffTheme.secondaryText),
                                  ),
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: ffTheme.background,
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(color: ffTheme.alternate),
                                  ),
                                  child: Text(plan.commitmentLabel,
                                      style: ffTheme.labelSmall),
                                ),
                              ],
                            ),
                            const Spacer(),
                            if (saveYear > 0)
                              // Savings wear the VALUE accent (amber) — same
                              // treatment as the plan cards and the site.
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: ffTheme.saving,
                                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                ),
                                child: Text(
                                  'חוסך ₪$saveYear בשנה',
                                  style: ffTheme.labelMedium.copyWith(
                                    color: _onSaving,
                                    fontWeight: FontWeight.w700,
                                    fontFeatures: const [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.1),

                      const SizedBox(height: 14),

                      // Features card
                      _Card(
                        title: 'מה כלול',
                        child: Column(
                          children: plan.feats
                              .map((feat) => Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: Row(
                                      children: [
                                        Icon(Icons.check_circle_rounded,
                                            color: ffTheme.primary, size: 20),
                                        const SizedBox(width: 10),
                                        Expanded(
                                            child: Text(feat,
                                                style: ffTheme.bodyMedium)),
                                      ],
                                    ),
                                  ))
                              .toList(),
                        ),
                      )
                          .animate(delay: 80.ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08),

                      const SizedBox(height: 14),

                      // Pricing breakdown card
                      _Card(
                        title: 'פירוט מחיר',
                        child: Column(
                          children: [
                            _PriceRow(
                                label: 'מחיר מבצע',
                                value: '₪${plan.priceText}',
                                ffTheme: ffTheme),
                            if (plan.hasPromo)
                              _PriceRow(
                                label: 'מחיר לאחר מבצע',
                                value: '₪${plan.after}',
                                valueColor: ffTheme.warning,
                                ffTheme: ffTheme,
                              ),
                            _PriceRow(
                                label: 'התחייבות',
                                value: plan.commitmentLabel,
                                ffTheme: ffTheme,
                                isLast: plan.cat == 'abroad'),
                            if (plan.cat != 'abroad')
                              _PriceRow(
                                label: 'עלות ל-24 חודשים',
                                value: '₪$cost24',
                                ffTheme: ffTheme,
                                isLast: true),
                          ],
                        ),
                      )
                          .animate(delay: 120.ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08),

                      // Warning card (promo)
                      if (plan.hasPromo) ...[
                        const SizedBox(height: 14),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: ffTheme.warning.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                                color: ffTheme.warning.withValues(alpha: 0.4)),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.warning_amber_rounded,
                                  color: ffTheme.warning, size: 22),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'המחיר יעלה ל-₪${plan.after} לאחר ${plan.intro ?? 'תקופת המבצע'}',
                                  style: ffTheme.bodySmall.copyWith(
                                      color: ffTheme.warning,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ).animate(delay: 160.ms).fadeIn(duration: 300.ms),
                      ],

                      const SizedBox(height: 14),

                      // Rate provider CTA — honest entry point to leave the
                      // first real review (no fabricated rating shown).
                      GestureDetector(
                        onTap: () => context.pushNamed('Ratings'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: ffTheme.accent1,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.rate_review_rounded, size: 16, color: ffTheme.primary),
                              const SizedBox(width: 6),
                              Text(
                                appState.hasReviewedProvider(plan.provider) ? 'עדכן דירוג עבור ${plan.provider}' : 'דרג את ${plan.provider}',
                                style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700),
                              ),
                              const Spacer(),
                              Icon(Icons.chevron_left_rounded, size: 16, color: ffTheme.primary),
                            ],
                          ),
                        ),
                      ).animate(delay: 250.ms).fadeIn(duration: 300.ms),

                      // ── "למה המסלול הזה מתאים לך" — fit panel ──────────────
                      const SizedBox(height: 14),
                      _FitPanel(
                        match: planMatch,
                        annualSaving: saveYear,
                        billsPersonalized: appState.billsPersonalized,
                        inCompare: inCompare,
                        onCompare: () {
                          HapticFeedback.selectionClick();
                          appState.toggleCompare(plan.id);
                        },
                      )
                          .animate(delay: 270.ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08),

                      // ── Quick-spec grid ─────────────────────────────────
                      if (plan.specs.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        _SpecGrid(plan: plan)
                            .animate(delay: 285.ms)
                            .fadeIn(duration: 300.ms)
                            .slideY(begin: 0.08),
                      ],

                      // ── Detailed cost breakdown ──────────────────────────
                      const SizedBox(height: 14),
                      _CostBreakdownCard(plan: plan)
                          .animate(delay: 295.ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08),

                      // Fine print
                      if (plan.fine != null) ...[
                        const SizedBox(height: 14),
                        Container(
                          decoration: BoxDecoration(
                            color: ffTheme.cardSurface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: ffTheme.alternate),
                            boxShadow: ffTheme.shadowSoft,
                          ),
                          child: ExpansionTile(
                            title: Text('אותיות קטנות', style: ffTheme.titleSmall),
                            iconColor: ffTheme.secondaryText,
                            collapsedIconColor: ffTheme.secondaryText,
                            tilePadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 4),
                            childrenPadding:
                                const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            children: [
                              Text(plan.fine!, style: ffTheme.bodySmall),
                            ],
                          ),
                        ).animate(delay: 240.ms).fadeIn(duration: 300.ms),
                      ],

                      // ── מידע נוסף / אותיות קטנות (progressive disclosure) ──
                      if (plan.hasExtraInfo) ...[
                        const SizedBox(height: 14),
                        _ExtraInfoSection(plan: plan)
                            .animate(delay: 305.ms)
                            .fadeIn(duration: 300.ms)
                            .slideY(begin: 0.08),
                      ],

                      // Savings timeline
                      if (saveYear > 0) ...[
                        const SizedBox(height: 14),
                        _Card(
                          title: 'חיסכון לאורך זמן',
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _SavingsPeriod(months: 6, saveYear: saveYear, ffTheme: ffTheme),
                              Container(width: 1, height: 48, color: ffTheme.alternate),
                              _SavingsPeriod(months: 12, saveYear: saveYear, ffTheme: ffTheme),
                              Container(width: 1, height: 48, color: ffTheme.alternate),
                              _SavingsPeriod(months: 24, saveYear: saveYear, ffTheme: ffTheme),
                            ],
                          ),
                        ).animate(delay: 260.ms).fadeIn(duration: 300.ms).slideY(begin: 0.08),
                      ],

                      const SizedBox(height: 14),

                      // Video-meeting cross-sell — a quote over Zoom with a rep.
                      _Card(
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () => context.pushNamed('Meeting', queryParameters: {
                              'provider': plan.provider,
                              'planId': plan.id,
                              'source': 'plan',
                            }),
                            child: Row(
                              children: [
                                Icon(Icons.videocam_rounded, color: ffTheme.brandAccent, size: 22),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('פגישת וידאו עם נציג', style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                                      Text('הצעת מחיר אישית בשיחת Zoom של 30 דקות',
                                          style: ffTheme.labelSmall),
                                    ],
                                  ),
                                ),
                                Icon(Icons.chevron_left_rounded, size: 20, color: ffTheme.secondaryText),
                              ],
                            ),
                          ),
                        ),
                      ).animate(delay: 270.ms).fadeIn(duration: 300.ms).slideY(begin: 0.08),

                      const SizedBox(height: 14),

                      // Price alert card
                      _Card(
                        child: Row(
                          children: [
                            Icon(Icons.notifications_outlined,
                                color: ffTheme.primary, size: 22),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'עקוב אחר שינויי מחיר',
                                style: ffTheme.bodyMedium,
                              ),
                            ),
                            Switch(
                              value: appState.isWatching(plan.id),
                              onChanged: (v) {
                                HapticFeedback.selectionClick();
                                appState.toggleWatch(plan.id);
                              },
                              activeThumbColor: ffTheme.primary,
                            ),
                          ],
                        ),
                      )
                          .animate(delay: 280.ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08),

                      // Similar plans section
                      Builder(builder: (_) {
                        final similar = allPlans
                            .where((p) => p.cat == plan.cat && p.id != plan.id)
                            .toList()
                          ..sort((a, b) => (a.price - plan.price).abs().compareTo((b.price - plan.price).abs()));
                        final topSimilar = similar.take(4).toList();
                        if (topSimilar.isEmpty) return const SizedBox();
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 20),
                            Text('מסלולים דומים', style: ffTheme.titleLarge),
                            const SizedBox(height: 12),
                            SizedBox(
                              height: 110,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: topSimilar.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 10),
                                itemBuilder: (ctx, i) {
                                  final p = topSimilar[i];
                                  final pSave = planSaveYear(p, bill);
                                  return GestureDetector(
                                    onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': p.id}),
                                    child: Container(
                                      width: 160,
                                      padding: const EdgeInsets.all(14),
                                      decoration: BoxDecoration(
                                        color: ffTheme.cardSurface,
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(color: ffTheme.alternate),
                                        boxShadow: ffTheme.shadowSoft,
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              LogoWidget(provider: p.provider, size: 28),
                                              const SizedBox(width: 8),
                                              Expanded(child: Text(p.provider, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                                            ],
                                          ),
                                          const SizedBox(height: 6),
                                          Text('₪${p.priceText}/${priceUnitShort(p)}', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary)),
                                          const SizedBox(height: 3),
                                          if (pSave > 0)
                                            Text('חוסך ₪$pSave/שנה', style: ffTheme.labelSmall.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w700))
                                          else
                                            Text(p.plan, style: ffTheme.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                                        ],
                                      ),
                                    ),
                                  ).animate(delay: (i * 60).ms).fadeIn(duration: 250.ms);
                                },
                              ),
                            ),
                          ],
                        );
                      }),

                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Sticky bottom bar
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                decoration: BoxDecoration(
                  color: ffTheme.cardSurface,
                  borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(22)),
                  border: Border(
                      top: BorderSide(
                          color: ffTheme.lineColor, width: 1)),
                  boxShadow: [
                    BoxShadow(
                      color: ffTheme.dark
                          ? const Color(0x66060A12)
                          : Colors.black.withValues(alpha: 0.08),
                      blurRadius: 20,
                      offset: const Offset(0, -6),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        text: 'עברו למסלול הזה ←',
                        onPressed: () async => context.pushNamed('Lead',
                            pathParameters: {'planId': plan.id}, queryParameters: {'source': 'plan'}),

                          height: 56,
                          // Const brand ink → AppButton lifts this into the green
                          // ACTION gradient + glow in BOTH themes (white-on-green).
                          color: AppColors.primary,
                          textStyle:
                              ffTheme.titleSmall.copyWith(color: Colors.white),
                          borderRadius: BorderRadius.circular(16),

                      ),
                    ),
                    const SizedBox(width: 12),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        appState.toggleCompare(plan.id);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: inCompare
                              ? ffTheme.primary
                              : ffTheme.secondaryBackground,
                          border: Border.all(
                              color: inCompare
                                  ? ffTheme.primary
                                  : ffTheme.alternate,
                              width: 1.5),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Icon(
                          inCompare ? Icons.check_rounded : Icons.add_rounded,
                          color: inCompare
                              ? (ffTheme.dark ? ffTheme.background : Colors.white)
                              : ffTheme.primary,
                          size: 24,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

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
        color: t.cardSurface.withValues(alpha: t.dark ? 0.85 : 0.72),
        borderRadius: BorderRadius.circular(t.radiusLg),
        border: Border.all(color: t.brandAccent.withValues(alpha: 0.22)),
        boxShadow: t.shadowGlass,
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
                    Text('למה המסלול הזה מתאים לך', style: t.titleMedium),
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: inCompare
                        ? t.primary
                        : t.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(t.radiusSm),
                    border: Border.all(
                      color: inCompare
                          ? t.primary
                          : t.primary.withValues(alpha: 0.28),
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
                        color: inCompare
                            ? (t.dark ? t.background : Colors.white)
                            : t.primary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        inCompare ? 'נוסף להשוואה' : 'הוסף להשוואה',
                        style: t.titleSmall.copyWith(
                          color: inCompare
                              ? (t.dark ? t.background : Colors.white)
                              : t.primary,
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
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        'הערכה',
        style: t.labelSmall.copyWith(
          color: t.warning,
          fontSize: 10,
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
    return Semantics(
      label: 'ציון התאמה $percent אחוז',
      child: ExcludeSemantics(
        child: SizedBox(
          width: 64,
          height: 64,
          child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: (percent / 100).clamp(0.0, 1.0)),
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

// ── Helper widgets ────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.child, this.title});
  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(title!, style: ffTheme.titleSmall),
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
        Text(
          '₪$amount',
          style: ffTheme.titleMedium.copyWith(
            color: ffTheme.savingDark,
            fontWeight: FontWeight.w800,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 4),
        Text('$months חודשים', style: ffTheme.labelSmall),
      ],
    );
  }
}

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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('מפרט', style: ffTheme.titleSmall),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: entries.map((e) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: ffTheme.background,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ffTheme.alternate),
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
                          style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.secondaryText,
                            fontSize: 11,
                          ),
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('עלות כוללת', style: ffTheme.titleSmall),
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
              value: '₪${plan.after}',
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

// ── Extra info / fine print (expandable) ─────────────────────────────────────

class _ExtraInfoSection extends StatelessWidget {
  const _ExtraInfoSection({required this.plan});
  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: ffTheme.shadowSoft,
      ),
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
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
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
                  GestureDetector(
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
                    child: Text(
                      'מקור',
                      style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.primary,
                        fontWeight: FontWeight.w700,
                        decoration: TextDecoration.underline,
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
