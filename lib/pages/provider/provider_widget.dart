import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../services/provider_ratings.dart';
import '../../services/backend/local_backend.dart';

class ProviderWidget extends StatefulWidget {
  const ProviderWidget({super.key, required this.providerName});
  final String providerName;

  @override
  State<ProviderWidget> createState() => _ProviderWidgetState();
}

class _ProviderWidgetState extends State<ProviderWidget> {
  /// When true, only flash-deal plans are shown.
  bool _showOnlyDeals = false;

  // ── Flash deal helpers (inline, not in services) ──────────────────────────

  static final Map<String, double> _catAvgCache = {};

  static double _categoryAvg(String catId) {
    return _catAvgCache.putIfAbsent(catId, () {
      final plans = allPlans.where((p) => p.cat == catId).toList();
      if (plans.isEmpty) return 0;
      return plans.fold<double>(0, (sum, p) => sum + p.priceValue) / plans.length;
    });
  }

  static bool _isFlashDeal(Plan plan) {
    final avg = _categoryAvg(plan.cat);
    if (avg <= 0) return false;
    return plan.priceValue <= avg * 0.80; // ≥20% below average
  }

  static int _flashDiscountPct(Plan plan) {
    final avg = _categoryAvg(plan.cat);
    if (avg <= 0) return 0;
    return ((1 - plan.priceValue / avg) * 100).round().clamp(0, 99);
  }

  /// Build a MatchProfile tuned to a given plan's category.
  MatchProfile _profileFor(Plan p, AppState appState) =>
      MatchProfile.fromAppState(appState, p.cat);

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final allProviderPlans = plansByProvider(widget.providerName);
    final rating = ProviderRatings.forProvider(widget.providerName, appState: appState);

    // Compute score map once — plan.id → PlanMatch
    final scoreMap = <String, PlanMatch>{};
    for (final p in allProviderPlans) {
      scoreMap[p.id] = RecommendationEngine.scorePlan(p, _profileFor(p, appState));
    }

    // Find best-scoring plan across all categories
    PlanMatch? bestMatch;
    for (final match in scoreMap.values) {
      if (bestMatch == null || match.score > bestMatch.score) {
        bestMatch = match;
      }
    }

    // Whether this provider has any flash deals at all (drives filter chip visibility)
    final hasAnyFlashDeals = allProviderPlans.any(_isFlashDeal);

    // The plans shown (filtered when the chip is active)
    final plans = _showOnlyDeals
        ? allProviderPlans.where(_isFlashDeal).toList()
        : allProviderPlans;

    // Plans grouped by category (only categories this provider has in the current view)
    final presentCatIds = plans.map((p) => p.cat).toSet();
    final catGroups = categories
        .where((c) => presentCatIds.contains(c.id))
        .map((c) => (cat: c, plans: plans.where((p) => p.cat == c.id).toList()))
        .toList();

    // Community posts relevant to this provider (for section visibility check)
    final relevantPostMaps = appState.communityPosts
        .where((m) =>
            (m['text'] as String? ?? '').contains(widget.providerName) ||
            (m['channel'] as String? ?? '') == 'המלצות')
        .toList();
    final hasCommunity = relevantPostMaps.isNotEmpty;

    final catCount = allProviderPlans.map((p) => p.cat).toSet().length;

    // Cheapest plan price (guard against empty) for the share growth hook.
    final cheapest = allProviderPlans.isEmpty
        ? 0
        : allProviderPlans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    final shareText =
        'בדקו את ${widget.providerName} בחוסך — ${allProviderPlans.length} מסלולים מ-₪$cheapest.';

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: allProviderPlans.isEmpty
          ? _EmptyState(providerName: widget.providerName, ffTheme: ffTheme)
          : CustomScrollView(
              slivers: [
                // Track the best-matching plan once per page view.
                if (bestMatch != null)
                  SliverToBoxAdapter(
                    child: _PlanViewTracker(
                      planId: bestMatch.plan.id,
                      provider: widget.providerName,
                      category: bestMatch.plan.cat,
                    ),
                  ),

                // ── Hero header ──────────────────────────────────────────────
                SliverToBoxAdapter(
                  child: _HeroHeader(
                    providerName: widget.providerName,
                    planCount: allProviderPlans.length,
                    catCount: catCount,
                    rating: rating,
                    ffTheme: ffTheme,
                    onBack: () => context.safePop(),
                    shareText: shareText,
                  ),
                ),

                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // ── Best match card ──────────────────────────────────
                        if (bestMatch != null) ...[
                          _BestMatchCard(
                            match: bestMatch,
                            ffTheme: ffTheme,
                            providerName: widget.providerName,
                            onTap: () => context.pushNamed(
                              'PlanDetail',
                              pathParameters: {'planId': bestMatch!.plan.id},
                            ),
                          ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.1),
                          const SizedBox(height: 20),
                        ],

                        // ── Ratings panel ────────────────────────────────────
                        if (rating.hasData) ...[
                          _RatingPanel(
                            rating: rating,
                            ffTheme: ffTheme,
                            onRate: () => context.pushNamed('Ratings'),
                          ).animate(delay: 80.ms).fadeIn(duration: 320.ms),
                          const SizedBox(height: 20),
                        ],

                        // ── Filter chips ─────────────────────────────────────
                        if (hasAnyFlashDeals) ...[
                          Row(
                            children: [
                              GestureDetector(
                                onTap: () => setState(() => _showOnlyDeals = !_showOnlyDeals),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 200),
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                                  decoration: BoxDecoration(
                                    color: _showOnlyDeals ? AppColors.saving : Colors.white,
                                    borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                    border: Border.all(
                                      color: _showOnlyDeals
                                          ? AppColors.saving
                                          : ffTheme.alternate.withValues(alpha: 0.35),
                                      width: 1.5,
                                    ),
                                    boxShadow: ffTheme.shadowSoft,
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Text('🔥', style: TextStyle(fontSize: 13)),
                                      const SizedBox(width: 5),
                                      Text(
                                        'מבצעים',
                                        style: ffTheme.labelMedium.copyWith(
                                          color: _showOnlyDeals ? Colors.white : ffTheme.primaryText,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                        ],

                        // ── Plans by category ────────────────────────────────
                        ...catGroups.asMap().entries.expand((entry) {
                          final i = entry.key;
                          final group = entry.value;
                          return [
                            if (i > 0) const SizedBox(height: 20),
                            _CategoryHeader(cat: group.cat, ffTheme: ffTheme)
                                .animate(delay: (i * 60).ms)
                                .fadeIn(duration: 300.ms),
                            const SizedBox(height: 10),
                            ...group.plans.asMap().entries.map((pe) {
                              final pi = pe.key;
                              final p = pe.value;
                              final match = scoreMap[p.id];
                              final isFlash = _isFlashDeal(p);
                              final discountPct = isFlash ? _flashDiscountPct(p) : 0;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _PlanCard(
                                  plan: p,
                                  match: match,
                                  isFlashDeal: isFlash,
                                  flashDiscountPct: discountPct,
                                  ffTheme: ffTheme,
                                  onTap: () => context.pushNamed(
                                    'PlanDetail',
                                    pathParameters: {'planId': p.id},
                                  ),
                                )
                                    // cap the stagger: with a large catalogue an
                                    // unbounded delay outlives the page (and the
                                    // fixed pumps in the widget tests)
                                    .animate(
                                        delay: (((i * 4 + pi) * 50 + 100)
                                                .clamp(0, 600))
                                            .ms)
                                    .fadeIn(duration: 280.ms)
                                    .slideY(begin: 0.08),
                              );
                            }),
                          ];
                        }),

                        // ── Community section ────────────────────────────────
                        if (hasCommunity) ...[
                          const SizedBox(height: 24),
                          _ProviderCommunitySection(
                            providerName: widget.providerName,
                            ffTheme: ffTheme,
                          ).animate().fadeIn(duration: 320.ms),
                        ],

                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

// ── Hero header ───────────────────────────────────────────────────────────────

class _HeroHeader extends StatelessWidget {
  const _HeroHeader({
    required this.providerName,
    required this.planCount,
    required this.catCount,
    required this.rating,
    required this.ffTheme,
    required this.onBack,
    required this.shareText,
  });

  final String providerName;
  final int planCount;
  final int catCount;
  final ProviderRating rating;
  final AppTheme ffTheme;
  final VoidCallback onBack;
  final String shareText;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [ffTheme.primary, ffTheme.tertiary],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // Back + share row
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_rounded,
                      color: Colors.white),
                  tooltip: 'חזרה',
                  onPressed: onBack,
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.ios_share_rounded,
                      color: Colors.white),
                  tooltip: 'שתף',
                  onPressed: () => Share.share(shareText),
                ),
              ],
            ),
            const SizedBox(height: 8),
            LogoWidget(provider: providerName, size: 64)
                .animate()
                .scale(begin: const Offset(0.7, 0.7), duration: 400.ms, curve: Curves.easeOut),
            const SizedBox(height: 12),
            Text(
              providerName,
              style: ffTheme.headlineMedium
                  .copyWith(color: Colors.white, fontWeight: FontWeight.w800),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              '$planCount מסלולים ב-$catCount קטגוריות',
              style: ffTheme.bodyMedium
                  .copyWith(color: Colors.white.withValues(alpha: 0.85)),
              textAlign: TextAlign.center,
            ),
            if (rating.hasData) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ...List.generate(5, (j) {
                    final s = rating.stars;
                    return Icon(
                      j < s.floor()
                          ? Icons.star_rounded
                          : j < s
                              ? Icons.star_half_rounded
                              : Icons.star_outline_rounded,
                      size: 18,
                      color: ffTheme.secondary,
                    );
                  }),
                  const SizedBox(width: 6),
                  Text(
                    rating.stars.toStringAsFixed(1),
                    style: ffTheme.titleSmall.copyWith(
                        color: Colors.white, fontWeight: FontWeight.w800),
                  ),
                  if (rating.reviewCount > 0)
                    Text(
                      ' · ${rating.reviewCount} ביקורות',
                      style: ffTheme.labelSmall
                          .copyWith(color: Colors.white.withValues(alpha: 0.8)),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 20),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 400.ms);
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState(
      {required this.providerName, required this.ffTheme});
  final String providerName;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text(providerName,
            style: ffTheme.titleMedium.copyWith(color: Colors.white)),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off_rounded, size: 64, color: ffTheme.alternate),
            const SizedBox(height: 16),
            Text('לא נמצאו מסלולים', style: ffTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              'אין מסלולים זמינים עבור $providerName',
              style: ffTheme.bodyMedium
                  .copyWith(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Best match card ────────────────────────────────────────────────────────────

class _BestMatchCard extends StatelessWidget {
  const _BestMatchCard({
    required this.match,
    required this.ffTheme,
    required this.providerName,
    required this.onTap,
  });

  final PlanMatch match;
  final AppTheme ffTheme;
  final String providerName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final plan = match.plan;
    final unit = priceUnitLabel(plan);
    final topReason =
        match.reasons.isNotEmpty ? match.reasons.first : match.plan.plan;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
          boxShadow: [
            BoxShadow(
              color: ffTheme.primary.withValues(alpha: 0.08),
              blurRadius: 12,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Icon(Icons.auto_awesome_rounded,
                    color: ffTheme.primary, size: 18),
                const SizedBox(width: 6),
                Text(
                  'ההמלצה אצל $providerName',
                  style: ffTheme.titleSmall
                      .copyWith(color: ffTheme.primary),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: ffTheme.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${match.scorePct}% · ${match.label}',
                    style: ffTheme.labelSmall.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 11),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            // Plan name + price row
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Text(
                    plan.plan,
                    style: ffTheme.titleMedium
                        .copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '₪${plan.priceText}',
                      style: ffTheme.titleLarge.copyWith(
                          color: ffTheme.primary,
                          fontWeight: FontWeight.w800),
                    ),
                    Text(
                      unit,
                      style: ffTheme.labelSmall
                          .copyWith(color: ffTheme.secondaryText),
                    ),
                  ],
                ),
              ],
            ),
            if (topReason.isNotEmpty) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(Icons.check_circle_rounded,
                      color: ffTheme.success, size: 16),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      topReason,
                      style: ffTheme.bodySmall.copyWith(
                          color: ffTheme.primaryText,
                          fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(
                  'לפרטים',
                  style: ffTheme.labelSmall.copyWith(
                      color: ffTheme.primary, fontWeight: FontWeight.w700),
                ),
                const SizedBox(width: 4),
                Icon(Icons.chevron_left_rounded,
                    size: 16, color: ffTheme.primary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Ratings panel ──────────────────────────────────────────────────────────────

class _RatingPanel extends StatelessWidget {
  const _RatingPanel({
    required this.rating,
    required this.ffTheme,
    required this.onRate,
  });

  final ProviderRating rating;
  final AppTheme ffTheme;
  final VoidCallback onRate;

  @override
  Widget build(BuildContext context) {
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
          Row(
            children: [
              Icon(Icons.reviews_rounded, color: ffTheme.primary, size: 18),
              const SizedBox(width: 6),
              Text('דירוג הלקוחות', style: ffTheme.titleSmall),
              const Spacer(),
              if (rating.ratedByUser)
                Row(
                  children: [
                    Icon(Icons.check_circle_rounded,
                        color: ffTheme.success, size: 14),
                    const SizedBox(width: 4),
                    Text('דירגת',
                        style: ffTheme.labelSmall
                            .copyWith(color: ffTheme.success)),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 14),
          ...ProviderRatings.subKeys.map((k) {
            final v = rating.sub[k] ?? 0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 48,
                    child: Text(ProviderRatings.subLabels[k] ?? k,
                        style: ffTheme.labelSmall),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (v / 5).clamp(0.0, 1.0),
                        backgroundColor: ffTheme.alternate,
                        valueColor: AlwaysStoppedAnimation(
                            ffTheme.primary.withValues(alpha: 0.75)),
                        minHeight: 6,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(v.toStringAsFixed(1),
                      style: ffTheme.labelSmall
                          .copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
            );
          }),
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onRate,
              icon: Icon(
                rating.ratedByUser
                    ? Icons.edit_rounded
                    : Icons.star_rounded,
                size: 18,
              ),
              label: Text(rating.ratedByUser
                  ? 'עדכנו את הדירוג'
                  : 'דרגו את ${rating.provider}'),
              style: OutlinedButton.styleFrom(
                foregroundColor: ffTheme.primary,
                side: BorderSide(color: ffTheme.primary.withValues(alpha: 0.4)),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Category section header ────────────────────────────────────────────────────

class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.cat, required this.ffTheme});
  final Category cat;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(categoryIconData(cat.id), size: 18, color: ffTheme.primaryText),
        const SizedBox(width: 8),
        Text(
          cat.name,
          style:
              ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

// ── Plan card (compact) ────────────────────────────────────────────────────────

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.match,
    required this.ffTheme,
    required this.onTap,
    this.isFlashDeal = false,
    this.flashDiscountPct = 0,
  });

  final Plan plan;
  final PlanMatch? match;
  final AppTheme ffTheme;
  final VoidCallback onTap;
  final bool isFlashDeal;
  final int flashDiscountPct;

  @override
  Widget build(BuildContext context) {
    final unit = priceUnitLabel(plan);
    final specEntries = plan.specs.entries.take(2).toList();

    return GestureDetector(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isFlashDeal
                    ? AppColors.saving.withValues(alpha: 0.55)
                    : ffTheme.alternate,
                width: isFlashDeal ? 1.5 : 1,
              ),
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
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        plan.plan,
                        style: ffTheme.bodyMedium
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Score chip
                    if (match != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: ffTheme.primary.withValues(alpha: 0.2)),
                        ),
                        child: Text(
                          '${match!.scorePct}% התאמה',
                          style: ffTheme.labelSmall.copyWith(
                              color: ffTheme.primary,
                              fontWeight: FontWeight.w700,
                              fontSize: 11),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      '₪${plan.priceText} $unit',
                      style: ffTheme.titleSmall.copyWith(
                          color: ffTheme.primary, fontWeight: FontWeight.w700),
                    ),
                    if (plan.hasPromo) ...[
                      const SizedBox(width: 8),
                      Text(
                        '← ₪${plan.after} אחרי',
                        style: ffTheme.labelSmall
                            .copyWith(color: ffTheme.secondaryText),
                      ),
                    ],
                    const Spacer(),
                    Icon(Icons.chevron_left_rounded,
                        size: 16, color: ffTheme.secondaryText),
                  ],
                ),
                if (specEntries.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    children: specEntries.map((e) {
                      return Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: ffTheme.background,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: ffTheme.alternate),
                        ),
                        child: Text(
                          '${e.key}: ${e.value}',
                          style: ffTheme.labelSmall
                              .copyWith(color: ffTheme.primaryText, fontSize: 11),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),
          // Flash deal badge — overlaid top-left corner
          if (isFlashDeal)
            Positioned(
              top: -1,
              right: 10,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.saving,
                  borderRadius: const BorderRadius.only(
                    bottomLeft: Radius.circular(8),
                    bottomRight: Radius.circular(8),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.saving.withValues(alpha: 0.35),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🔥', style: TextStyle(fontSize: 10)),
                    const SizedBox(width: 3),
                    Text(
                      'מבצע · $flashDiscountPct% הנחה',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        height: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Full provider community section ───────────────────────────────────────────

class _ProviderCommunitySection extends StatefulWidget {
  const _ProviderCommunitySection({
    required this.providerName,
    required this.ffTheme,
  });

  final String providerName;
  final AppTheme ffTheme;

  @override
  State<_ProviderCommunitySection> createState() =>
      _ProviderCommunitySectionState();
}

class _ProviderCommunitySectionState
    extends State<_ProviderCommunitySection> {
  String? _activeChannel;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final ffTheme = widget.ffTheme;

    // All posts mentioning the provider or in the 'המלצות' channel.
    final allRelevant = appState.communityPosts
        .where((m) =>
            (m['text'] as String? ?? '').contains(widget.providerName) ||
            (m['channel'] as String? ?? '') == 'המלצות')
        .toList();

    // Collect unique channels from relevant posts (max 5 chips).
    final channelSet = <String>{};
    for (final m in allRelevant) {
      final ch = m['channel'] as String? ?? '';
      if (ch.isNotEmpty) channelSet.add(ch);
    }
    final chips = channelSet.take(5).toList();

    // Apply active channel filter.
    final filtered = _activeChannel == null
        ? allRelevant
        : allRelevant
            .where((m) => (m['channel'] as String? ?? '') == _activeChannel)
            .toList();

    // Sort by likes descending (likes key may be absent → 0).
    final sorted = [...filtered]
      ..sort((a, b) =>
          ((b['likes'] as int?) ?? 0).compareTo((a['likes'] as int?) ?? 0));

    final topPosts = sorted.take(5).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Section header ──────────────────────────────────────────────────
        Row(
          children: [
            Expanded(
              child: Text(
                'מה אומרת הקהילה',
                style: ffTheme.titleLarge,
              ),
            ),
            GestureDetector(
              onTap: () => context.pushNamed('Community'),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'ראה עוד בקהילה',
                    style: ffTheme.labelSmall.copyWith(
                      color: AppColors.brandAccent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 2),
                  const Icon(Icons.arrow_back_ios_rounded,
                      size: 12, color: AppColors.brandAccent),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // ── Channel filter chips ────────────────────────────────────────────
        if (chips.isNotEmpty) ...[
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                // "הכל" chip
                _ChannelChip(
                  label: 'הכל',
                  active: _activeChannel == null,
                  ffTheme: ffTheme,
                  onTap: () => setState(() => _activeChannel = null),
                ),
                ...chips.map(
                  (ch) => _ChannelChip(
                    label: ch,
                    active: _activeChannel == ch,
                    ffTheme: ffTheme,
                    onTap: () => setState(
                      () => _activeChannel = _activeChannel == ch ? null : ch,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // ── Post cards ──────────────────────────────────────────────────────
        ...topPosts.asMap().entries.map((entry) {
          final i = entry.key;
          final m = entry.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _ProviderPostCard(
              postMap: m,
              ffTheme: ffTheme,
              onLikeTap: () {
                HapticFeedback.lightImpact();
                appState.toggleLike(m['id'] as String? ?? '');
              },
              isLiked: appState.hasLiked(m['id'] as String? ?? ''),
              onReplyTap: () => context.pushNamed('Community'),
            )
                .animate(delay: (i * 55).ms)
                .fadeIn(duration: 280.ms)
                .slideY(begin: 0.06),
          );
        }),

        // ── Bottom CTA ──────────────────────────────────────────────────────
        const SizedBox(height: 4),
        OutlinedButton.icon(
          onPressed: () => context.pushNamed('Community'),
          icon: const Icon(Icons.forum_rounded, size: 16, color: AppColors.brandAccent),
          label: const Text('ראה עוד בקהילה'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.brandAccent,
            side: BorderSide(color: AppColors.brandAccent.withValues(alpha: 0.5)),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
      ],
    );
  }
}

// ── Channel filter chip ────────────────────────────────────────────────────────

class _ChannelChip extends StatelessWidget {
  const _ChannelChip({
    required this.label,
    required this.active,
    required this.ffTheme,
    required this.onTap,
  });

  final String label;
  final bool active;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(left: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.brandAccent : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active
                ? AppColors.brandAccent
                : ffTheme.alternate.withValues(alpha: 0.5),
          ),
        ),
        child: Text(
          label,
          style: ffTheme.labelSmall.copyWith(
            color: active ? Colors.white : ffTheme.secondaryText,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

// ── Provider community post card ───────────────────────────────────────────────

class _ProviderPostCard extends StatelessWidget {
  const _ProviderPostCard({
    required this.postMap,
    required this.ffTheme,
    required this.onLikeTap,
    required this.onReplyTap,
    required this.isLiked,
  });

  final Map<String, dynamic> postMap;
  final AppTheme ffTheme;
  final VoidCallback onLikeTap;
  final VoidCallback onReplyTap;
  final bool isLiked;

  @override
  Widget build(BuildContext context) {
    final author = postMap['author'] as String? ?? 'משתמש';
    final avatarStr = postMap['avatar'] as String? ?? '';
    final text = postMap['text'] as String? ?? '';
    final channel = postMap['channel'] as String? ?? '';
    final likes = (postMap['likes'] as int?) ?? 0;
    final replies = (postMap['replies'] as int?) ?? 0;
    final mediaType = postMap['mediaType'] as String?;
    final mediaData = postMap['mediaData'] as String?;
    final isVerified = (postMap['isVerified'] as bool?) ?? false;

    // Avatar initial: use the stored avatar string (first char) or derive from author.
    final avatarChar = avatarStr.isNotEmpty
        ? avatarStr[0]
        : (author.isNotEmpty ? author[0] : '?');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Author row
          Row(
            children: [
              // Avatar circle
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: ffTheme.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    avatarChar,
                    style: ffTheme.labelMedium.copyWith(
                      color: ffTheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: Text(
                        author,
                        style: ffTheme.labelMedium.copyWith(
                            fontWeight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (isVerified) ...[
                      const SizedBox(width: 4),
                      Icon(Icons.verified_rounded,
                          size: 13, color: ffTheme.info),
                    ],
                  ],
                ),
              ),
              if (channel.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: ffTheme.background,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    channel,
                    style: ffTheme.labelSmall.copyWith(
                      color: ffTheme.secondaryText,
                      fontSize: 10,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),

          // Post text
          Text(
            text,
            style: ffTheme.bodySmall.copyWith(
              color: ffTheme.primaryText,
              height: 1.45,
            ),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),

          // Media thumbnail (image only; audio/video show a compact placeholder)
          if (mediaType != null && mediaData != null) ...[
            const SizedBox(height: 10),
            _MediaThumbnail(
              mediaType: mediaType,
              mediaData: mediaData,
              ffTheme: ffTheme,
            ),
          ],

          const SizedBox(height: 10),

          // Action row: likes + replies
          Row(
            children: [
              // Like button
              Semantics(
                button: true,
                label: isLiked ? 'הסר לייק' : 'תן לייק',
                child: GestureDetector(
                  onTap: onLikeTap,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 200),
                        child: Icon(
                          isLiked
                              ? Icons.favorite_rounded
                              : Icons.favorite_border_rounded,
                          key: ValueKey(isLiked),
                          size: 18,
                          color:
                              isLiked ? Colors.red.shade400 : ffTheme.secondaryText,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${isLiked ? likes + 1 : likes}',
                        style: ffTheme.labelSmall.copyWith(
                          color: isLiked
                              ? Colors.red.shade400
                              : ffTheme.secondaryText,
                          fontWeight:
                              isLiked ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 16),
              // Reply button
              Semantics(
                button: true,
                label: 'עבור לדיון בקהילה',
                child: GestureDetector(
                  onTap: onReplyTap,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.chat_bubble_outline_rounded,
                          size: 16, color: ffTheme.secondaryText),
                      const SizedBox(width: 4),
                      Text(
                        '$replies',
                        style: ffTheme.labelSmall
                            .copyWith(color: ffTheme.secondaryText),
                      ),
                    ],
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

// ── Media thumbnail helper ─────────────────────────────────────────────────────

class _MediaThumbnail extends StatelessWidget {
  const _MediaThumbnail({
    required this.mediaType,
    required this.mediaData,
    required this.ffTheme,
  });

  final String mediaType;
  final String mediaData;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    if (mediaType == 'image') {
      // mediaData is a base64 data-URI: "data:image/...;base64,<data>"
      try {
        final commaIdx = mediaData.indexOf(',');
        final bytes = base64Decode(
            commaIdx >= 0 ? mediaData.substring(commaIdx + 1) : mediaData);
        return ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.memory(
            bytes,
            height: 140,
            width: double.infinity,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _MediaPlaceholder(
              icon: Icons.image_rounded,
              label: 'תמונה',
              ffTheme: ffTheme,
            ),
          ),
        );
      } catch (_) {
        return _MediaPlaceholder(
          icon: Icons.image_rounded,
          label: 'תמונה',
          ffTheme: ffTheme,
        );
      }
    }

    if (mediaType == 'audio') {
      return _MediaPlaceholder(
        icon: Icons.mic_rounded,
        label: 'הודעה קולית',
        ffTheme: ffTheme,
      );
    }

    if (mediaType == 'video') {
      return _MediaPlaceholder(
        icon: Icons.videocam_rounded,
        label: 'וידאו',
        ffTheme: ffTheme,
      );
    }

    return const SizedBox.shrink();
  }
}

class _MediaPlaceholder extends StatelessWidget {
  const _MediaPlaceholder({
    required this.icon,
    required this.label,
    required this.ffTheme,
  });

  final IconData icon;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 60,
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 20, color: ffTheme.secondaryText),
          const SizedBox(width: 8),
          Text(label,
              style: ffTheme.labelSmall
                  .copyWith(color: ffTheme.secondaryText)),
        ],
      ),
    );
  }
}

// ── Plan-view analytics tracker (zero-size, fires once on mount) ───────────────

class _PlanViewTracker extends StatefulWidget {
  const _PlanViewTracker({
    required this.planId,
    required this.provider,
    required this.category,
  });
  final String planId;
  final String provider;
  final String category;
  @override
  State<_PlanViewTracker> createState() => _PlanViewTrackerState();
}

class _PlanViewTrackerState extends State<_PlanViewTracker> {
  @override
  void initState() {
    super.initState();
    appBackend
        .trackPlanView(
          planId: widget.planId,
          provider: widget.provider,
          category: widget.category,
        )
        .catchError((_) {});
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
