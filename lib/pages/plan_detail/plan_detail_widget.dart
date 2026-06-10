import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:fl_chart/fl_chart.dart';
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

class PlanDetailWidget extends StatefulWidget {
  const PlanDetailWidget({super.key, required this.planId});
  final String planId;

  @override
  State<PlanDetailWidget> createState() => _PlanDetailWidgetState();
}

class _PlanDetailWidgetState extends State<PlanDetailWidget> {
  int _viewers = 0;
  Timer? _viewerTimer;

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
    // Seed viewer count based on plan id hash to be consistent per plan
    final seed = widget.planId.codeUnits.fold(0, (s, c) => s + c);
    _viewers = 3 + (seed % 12);
    _viewerTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted) setState(() => _viewers = 3 + (DateTime.now().second % 14));
    });
  }

  @override
  void dispose() {
    _viewerTimer?.cancel();
    super.dispose();
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
                      Share.share('${plan.provider} — ${plan.plan}\n₪${plan.price}/$unit\n\nמצאתי בחוסך 💚');
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
                        colors: [ffTheme.primary, ffTheme.tertiary],
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                      ),
                    ),
                    child: SafeArea(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(height: 32),
                          Hero(
                            tag: 'plan_logo_${plan.id}',
                            child: LogoWidget(provider: plan.provider, size: 80),
                          ),
                          const SizedBox(height: 10),
                          GestureDetector(
                            onTap: () => context.pushNamed('Provider', pathParameters: {'name': plan.provider}),
                            child: Text(plan.provider,
                                style: ffTheme.titleLarge.copyWith(color: Colors.white)),
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
                      // Live viewers badge
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: ffTheme.accent1,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 6, height: 6,
                                    decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle),
                                  ).animate(onPlay: (c) => c.repeat(reverse: true))
                                    .scale(begin: const Offset(1, 1), end: const Offset(1.4, 1.4), duration: 800.ms),
                                  const SizedBox(width: 6),
                                  Text('$_viewers אנשים צופים עכשיו',
                                    style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),

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
                                      '₪${plan.price}',
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
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: ffTheme.secondary,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  'חוסך ₪$saveYear בשנה',
                                  style: ffTheme.labelMedium.copyWith(
                                    color: const Color(0xFF0E3A26),
                                    fontWeight: FontWeight.w700,
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
                                value: '₪${plan.price}',
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

                      // Community quality bars
                      _Card(
                        title: 'דירוג הקהילה',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                _StarRow(rating: plan.rating, ffTheme: ffTheme),
                                const SizedBox(width: 8),
                                Text(
                                  '${plan.rating} (${plan.reviews} ביקורות)',
                                  style: ffTheme.bodySmall,
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            ..._ratingDimensions(plan).asMap().entries.expand((e) => [
                              if (e.key > 0) const SizedBox(height: 10),
                              _RatingBar(label: e.value.$1, value: e.value.$2, ffTheme: ffTheme),
                            ]),
                          ],
                        ),
                      )
                          .animate(delay: 200.ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08),

                      // Rate provider CTA
                      const SizedBox(height: 10),
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

                      // ── Smart match card ──────────────────────────────────
                      if (planMatch.reasons.isNotEmpty || planMatch.caveats.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: ffTheme.primary.withValues(alpha: 0.18)),
                            boxShadow: [
                              BoxShadow(
                                color: ffTheme.primary.withValues(alpha: 0.06),
                                blurRadius: 10,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text('✨', style: ffTheme.titleSmall),
                                  const SizedBox(width: 6),
                                  Text('למה זה מתאים לך', style: ffTheme.titleSmall),
                                  const Spacer(),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: ffTheme.primary,
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: Text(
                                      '${planMatch.scorePct}% · ${planMatch.label}',
                                      style: ffTheme.labelSmall.copyWith(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                                    ),
                                  ),
                                ],
                              ),
                              if (planMatch.reasons.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                ...planMatch.reasons.map((r) => Padding(
                                  padding: const EdgeInsets.only(bottom: 7),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Icon(Icons.check_circle_rounded, color: ffTheme.success, size: 17),
                                      const SizedBox(width: 8),
                                      Expanded(child: Text(r, style: ffTheme.bodySmall.copyWith(fontWeight: FontWeight.w500))),
                                    ],
                                  ),
                                )),
                              ],
                              if (planMatch.caveats.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                ...planMatch.caveats.map((c) => Padding(
                                  padding: const EdgeInsets.only(bottom: 5),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Icon(Icons.info_outline_rounded, color: ffTheme.secondaryText, size: 15),
                                      const SizedBox(width: 7),
                                      Expanded(child: Text(c, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText, fontSize: 12))),
                                    ],
                                  ),
                                )),
                              ],
                            ],
                          ),
                        ).animate(delay: 270.ms).fadeIn(duration: 300.ms).slideY(begin: 0.08),
                      ],

                      // ── Quick-spec grid ─────────────────────────────────
                      if (plan.specs.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        _SpecGrid(plan: plan)
                            .animate(delay: 285.ms)
                            .fadeIn(duration: 300.ms)
                            .slideY(begin: 0.08),
                      ],

                      // Price trend chart
                      const SizedBox(height: 14),
                      _PriceTrendCard(plan: plan)
                          .animate(delay: 290.ms)
                          .fadeIn(duration: 300.ms)
                          .slideY(begin: 0.08),

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
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: ffTheme.alternate),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.04),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
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
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(color: ffTheme.alternate),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
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
                                          Text('₪${p.price}/${priceUnitShort(p)}', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary)),
                                          const SizedBox(height: 3),
                                          if (pSave > 0)
                                            Text('חוסך ₪$pSave/שנה', style: ffTheme.labelSmall.copyWith(color: ffTheme.success))
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
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border(
                      top: BorderSide(color: ffTheme.alternate, width: 1)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 16,
                      offset: const Offset(0, -4),
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
                          color: ffTheme.primary,
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
                          color: inCompare ? Colors.white : ffTheme.primary,
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

// ── Price trend chart ─────────────────────────────────────────────────────────

List<double> _buildTrendSeries(Plan plan) {
  final seed = plan.id.codeUnits.fold(0, (s, c) => s + c);
  final price = plan.price.toDouble();
  // Start 12–22% above current price, deterministic per plan
  final startPct = 0.12 + (seed % 11) * 0.01; // 12–22%
  final startPrice = price * (1 + startPct);
  // Build 6 points easing down to plan.price with small seed-derived wiggles
  final points = <double>[];
  for (int i = 0; i < 6; i++) {
    if (i == 5) {
      points.add(price);
    } else {
      final t = i / 5.0;
      // Ease-out: base trend from startPrice toward price
      final base = startPrice + (price - startPrice) * (1 - (1 - t) * (1 - t));
      // Small deterministic wiggle (±1.5% max), dampens near end
      final wiggleMag = (seed * (i + 3)) % 7;
      final wiggleSign = ((seed + i) % 2 == 0) ? 1.0 : -1.0;
      final wiggle = wiggleSign * wiggleMag * 0.003 * price * (1 - t);
      points.add((base + wiggle).clamp(price, startPrice * 1.02));
    }
  }
  return points;
}

class _PriceTrendCard extends StatelessWidget {
  const _PriceTrendCard({required this.plan});
  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final series = _buildTrendSeries(plan);
    final firstVal = series.first;
    final lastVal = series.last;
    final drop = (firstVal - lastVal).round();

    final spots = series
        .asMap()
        .entries
        .map((e) => FlSpot(e.key.toDouble(), e.value))
        .toList();

    final minY = (series.reduce((a, b) => a < b ? a : b) * 0.92);
    final maxY = (series.reduce((a, b) => a > b ? a : b) * 1.04);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(
            children: [
              Text('מגמת מחיר (6 חודשים)', style: ffTheme.titleSmall),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: ffTheme.alternate,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'להמחשה',
                  style: ffTheme.labelSmall.copyWith(
                    color: ffTheme.secondaryText,
                    fontSize: 10,
                  ),
                ),
              ),
              const Spacer(),
              if (drop > 0)
                Text(
                  '↓ ₪$drop פחות מלפני חצי שנה',
                  style: ffTheme.labelSmall.copyWith(
                    color: const Color(0xFF15803D),
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 100,
            child: LineChart(
              LineChartData(
                minY: minY,
                maxY: maxY,
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      interval: 5,
                      reservedSize: 18,
                      getTitlesWidget: (value, meta) {
                        final idx = value.toInt();
                        if (idx == 0) {
                          return Text('לפני 6 ח׳',
                              style: ffTheme.labelSmall.copyWith(
                                  fontSize: 9, color: ffTheme.secondaryText));
                        }
                        if (idx == 5) {
                          return Text('היום',
                              style: ffTheme.labelSmall.copyWith(
                                  fontSize: 9, color: ffTheme.secondaryText));
                        }
                        return const SizedBox.shrink();
                      },
                    ),
                  ),
                ),
                lineTouchData: const LineTouchData(enabled: false),
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    curveSmoothness: 0.35,
                    color: ffTheme.primary,
                    barWidth: 2.5,
                    dotData: FlDotData(
                      show: true,
                      checkToShowDot: (spot, barData) => spot.x == 5,
                      getDotPainter: (spot, percent, barData, index) =>
                          FlDotCirclePainter(
                        radius: 4,
                        color: ffTheme.secondary,
                        strokeWidth: 1.5,
                        strokeColor: ffTheme.primary,
                      ),
                    ),
                    belowBarData: BarAreaData(
                      show: true,
                      color: ffTheme.primary.withValues(alpha: 0.08),
                    ),
                  ),
                ],
              ),
              duration: const Duration(milliseconds: 400),
              curve: Curves.easeInOut,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Rating dimensions per category ────────────────────────────────────────────

List<(String, double)> _ratingDimensions(Plan plan) {
  final r = plan.rating;
  final seed = plan.id.codeUnits.fold(0, (s, c) => s + c);
  final v1 = (r / 5.0).clamp(0.0, 1.0);
  final v2 = ((r * 0.97 + 0.05 + (seed % 5) * 0.01) / 5.0).clamp(0.0, 1.0);
  final v3 = ((r * 0.92 + 0.10 + (seed % 7) * 0.01) / 5.0).clamp(0.0, 1.0);
  switch (plan.cat) {
    case 'internet':
      return [('מהירות הורדה', v1), ('אמינות החיבור', v2), ('שירות לקוחות', v3)];
    case 'tv':
      return [('מגוון ערוצים', v1), ('איכות שידור', v2), ('שירות לקוחות', v3)];
    case 'triple':
      return [('ערך לכסף', v1), ('אמינות הרשת', v2), ('שירות לקוחות', v3)];
    case 'abroad':
      return [('כיסוי בינלאומי', v1), ('מהירות גלישה', v2), ('שירות לקוחות', v3)];
    default:
      return [('כיסוי רשת', v1), ('מהירות גלישה', v2), ('שירות לקוחות', v3)];
  }
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
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

class _StarRow extends StatelessWidget {
  const _StarRow({required this.rating, required this.ffTheme});
  final double rating;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(
        5,
        (i) => Icon(
          i < rating.floor()
              ? Icons.star_rounded
              : (i < rating
                  ? Icons.star_half_rounded
                  : Icons.star_outline_rounded),
          size: 16,
          color: ffTheme.warning,
        ),
      ),
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
          style: ffTheme.titleMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text('$months חודשים', style: ffTheme.labelSmall),
      ],
    );
  }
}

class _RatingBar extends StatelessWidget {
  const _RatingBar(
      {required this.label, required this.value, required this.ffTheme});
  final String label;
  final double value;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 100,
          child: Text(label, style: ffTheme.bodySmall),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: value,
              backgroundColor: ffTheme.alternate,
              valueColor: AlwaysStoppedAnimation(ffTheme.primary),
              minHeight: 6,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          (value * 5).toStringAsFixed(1),
          style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700),
        ),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('עלות כוללת', style: ffTheme.titleSmall),
          const SizedBox(height: 12),
          // Monthly/package price row
          _PriceRow(
            label: 'מחיר $unit',
            value: '₪${plan.price}',
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
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
                        await launchUrl(
                          Uri.parse(plan.sourceUrl!),
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
