import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../widgets/app_button.dart';
import '../../widgets/pressable.dart';
import '../../widgets/whatsapp_button.dart';
import '../../services/recommendation_engine.dart';
import '../../services/provider_ratings.dart';
import '../../services/street_price.dart';
import '../../services/backend/local_backend.dart';

class ProviderWidget extends StatelessWidget {
  const ProviderWidget({super.key, required this.providerName});
  final String providerName;

  /// Build a MatchProfile tuned to a given plan's category.
  MatchProfile _profileFor(Plan p, AppState appState) =>
      MatchProfile.fromAppState(appState, p.cat);

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final plans = plansByProvider(providerName);
    final rating = ProviderRatings.forProvider(providerName, appState: appState);

    // Compute score map once — plan.id → PlanMatch
    final scoreMap = <String, PlanMatch>{};
    for (final p in plans) {
      scoreMap[p.id] = RecommendationEngine.scorePlan(p, _profileFor(p, appState));
    }

    // Find best-scoring plan across all categories
    PlanMatch? bestMatch;
    for (final match in scoreMap.values) {
      if (bestMatch == null || match.score > bestMatch.score) {
        bestMatch = match;
      }
    }

    // Plans grouped by category (only categories this provider has)
    final presentCatIds = plans.map((p) => p.cat).toSet();
    final catGroups = categories
        .where((c) => presentCatIds.contains(c.id))
        .map((c) => (cat: c, plans: plans.where((p) => p.cat == c.id).toList()))
        .toList();

    // Community posts mentioning this provider
    final seedMatches = communityPosts
        .where((post) => post.text.contains(providerName))
        .toList();
    final userPostMaps = appState.communityPosts
        .where((m) => (m['text'] as String? ?? '').contains(providerName))
        .toList();
    final hasCommunity = seedMatches.isNotEmpty || userPostMaps.isNotEmpty;

    final catCount = presentCatIds.length;

    // Cheapest plan price (guard against empty) for the share growth hook.
    final cheapest = plans.isEmpty
        ? 0
        : plans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    final shareText =
        'בדקו את $providerName ב-Switchy AI — ${plans.length} מסלולים מ-₪$cheapest.';

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: plans.isEmpty
          ? _EmptyState(providerName: providerName, ffTheme: ffTheme)
          : RefreshIndicator(
              color: ffTheme.primary,
              backgroundColor: ffTheme.cardSurface,
              // Pull-to-refresh: re-reads the provider catalogue, ratings and
              // street-price aggregates (all in-memory, synchronous). A short
              // awaited tick gives the spinner an honest beat; AppState is a
              // listenable so the page already rebuilds on its changes.
              onRefresh: () async {
                HapticFeedback.selectionClick();
                await Future<void>.delayed(const Duration(milliseconds: 350));
              },
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                slivers: [
                // Track the best-matching plan once per page view.
                if (bestMatch != null)
                  SliverToBoxAdapter(
                    child: _PlanViewTracker(
                      planId: bestMatch.plan.id,
                      provider: providerName,
                      category: bestMatch.plan.cat,
                    ),
                  ),

                // ── Hero header ──────────────────────────────────────────────
                SliverToBoxAdapter(
                  child: _HeroHeader(
                    providerName: providerName,
                    planCount: plans.length,
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
                            providerName: providerName,
                            onTap: () => context.pushNamed(
                              'PlanDetail',
                              pathParameters: {'planId': bestMatch!.plan.id},
                            ),
                          ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.1),
                          const SizedBox(height: 12),

                          // ── Quick actions: Compare / Renewal / WhatsApp ──────
                          _ProviderActions(
                            providerName: providerName,
                            bestPlanId: bestMatch.plan.id,
                            shareText: shareText,
                            ffTheme: ffTheme,
                          ).animate(delay: 60.ms).fadeIn(duration: 320.ms),
                          const SizedBox(height: 12),

                          // Primary "talk to us" channel — the reusable green CTA.
                          WhatsAppButton(
                            source: 'provider',
                            width: double.infinity,
                            prefillText: shareText,
                          ).animate(delay: 90.ms).fadeIn(duration: 320.ms),
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

                        // ── Street price (מחיר הרחוב) ────────────────────────
                        // The honest "what people actually pay" panel: an
                        // aggregate ONLY above the real report threshold, else a
                        // plain "report yours" CTA. Never a fabricated figure.
                        _StreetPricePanel(
                          providerName: providerName,
                          ffTheme: ffTheme,
                        ).animate(delay: 90.ms).fadeIn(duration: 320.ms),
                        const SizedBox(height: 20),

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
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _PlanCard(
                                  plan: p,
                                  match: match,
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
                          Text(
                            'מהקהילה על $providerName',
                            style: ffTheme.titleLarge,
                          ).animate().fadeIn(duration: 300.ms),
                          const SizedBox(height: 12),
                          ...seedMatches.take(3).toList().asMap().entries.map(
                            (e) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _CommunityCard(
                                text: e.value.text,
                                author: e.value.author,
                                ffTheme: ffTheme,
                              ).animate(delay: (e.key * 60).ms).fadeIn(duration: 280.ms),
                            ),
                          ),
                          ...userPostMaps.take(3 - seedMatches.take(3).length).toList().asMap().entries.map(
                            (e) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _CommunityCard(
                                text: e.value['text'] as String? ?? '',
                                author: e.value['author'] as String? ?? 'משתמש',
                                ffTheme: ffTheme,
                              ).animate(delay: ((seedMatches.length + e.key) * 60).ms).fadeIn(duration: 280.ms),
                            ),
                          ),
                        ],

                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
                ),
              ],
              ),
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
      // Geist flat white header: a near-white surface with a 1px bottom hairline
      // (no more dark green hero block). Header content flips to dark ink.
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        border: Border(
          bottom: BorderSide(color: ffTheme.lineColor),
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
                  icon: Icon(Icons.arrow_back_ios_rounded,
                      color: ffTheme.primaryText),
                  tooltip: 'חזרה',
                  onPressed: onBack,
                ),
                const Spacer(),
                IconButton(
                  icon: Icon(Icons.ios_share_rounded,
                      color: ffTheme.primaryText),
                  tooltip: 'שתף',
                  onPressed: () => Share.share(shareText),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Logo on a Geist white chip so per-provider brand colours read
            // cleanly (the logo itself is never recoloured). On the white header
            // we rely on a 1px border instead of a bespoke heavy shadow.
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: ffTheme.cardSurface,
                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                border: Border.all(color: ffTheme.lineColor),
              ),
              child: LogoWidget(provider: providerName, size: 56),
            )
                .animate()
                .scale(begin: const Offset(0.7, 0.7), duration: 400.ms, curve: Curves.easeOut),
            const SizedBox(height: 14),
            Text(
              providerName,
              style: ffTheme.headlineMedium.copyWith(
                  color: ffTheme.primaryText, fontWeight: FontWeight.w800),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              '$planCount מסלולים ב-$catCount קטגוריות',
              style: ffTheme.bodyMedium
                  .copyWith(color: ffTheme.secondaryText),
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
                      // Amber stars on the now-white header → dark amber (AA).
                      color: ffTheme.savingText,
                    );
                  }),
                  const SizedBox(width: 6),
                  Text(
                    rating.stars.toStringAsFixed(1),
                    style: ffTheme.titleSmall.copyWith(
                        color: ffTheme.primaryText, fontWeight: FontWeight.w800),
                  ),
                  if (rating.reviewCount > 0)
                    Text(
                      ' · ${rating.reviewCount} ביקורות',
                      style: ffTheme.labelSmall
                          .copyWith(color: ffTheme.secondaryText),
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
        // Geist white header: white surface, dark ink, 1px bottom hairline.
        backgroundColor: ffTheme.cardSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        shape: Border(bottom: BorderSide(color: ffTheme.lineColor)),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_rounded, color: ffTheme.primaryText),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text(providerName,
            style: ffTheme.titleMedium.copyWith(color: ffTheme.primaryText)),
      ),
      body: Center(
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
                child: Icon(Icons.search_off_rounded,
                    size: 48, color: ffTheme.secondaryText),
              )
                  .animate()
                  .fadeIn(duration: 400.ms)
                  .scale(begin: const Offset(0.7, 0.7)),
              const SizedBox(height: 20),
              Text('לא נמצאו מסלולים', style: ffTheme.titleMedium)
                  .animate()
                  .fadeIn(delay: 120.ms),
              const SizedBox(height: 8),
              Text(
                'אין מסלולים זמינים עבור $providerName כרגע',
                style: ffTheme.bodyMedium
                    .copyWith(color: ffTheme.secondaryText),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 180.ms),
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: () => context.safePop(),
                icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                label: const Text('חזרה'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: ffTheme.primary,
                  side: BorderSide(
                      color: ffTheme.primary.withValues(alpha: 0.4)),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 20, vertical: 12),
                ),
              ).animate().fadeIn(delay: 240.ms),
            ],
          ),
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

    return Pressable(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        // The recommendation hero — a bento tile wearing the green ACTION ring.
        decoration: ffTheme.bentoDecoration(
          borderColor: ffTheme.brandAccent.withValues(alpha: 0.30),
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
                    // Match score is an ACTION signal → green, legible in both
                    // themes (white ink on green).
                    gradient: ffTheme.accentGradient,
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
                      // Focal price of the recommendation — tabular figures keep
                      // it crisp and aligned with the app's ₪ figure treatment.
                      style: ffTheme.titleLarge.copyWith(
                          color: ffTheme.primary,
                          fontWeight: FontWeight.w800,
                          fontFeatures: const [FontFeature.tabularFigures()]),
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
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: ffTheme.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle_rounded,
                        color: ffTheme.primary, size: 16),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        topReason,
                        style: ffTheme.bodySmall.copyWith(
                            color: ffTheme.primaryText,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
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

// ── Quick actions row ──────────────────────────────────────────────────────────
//
// Three honest next steps from a provider page: add the provider's best plan to
// the compare tray, open the renewal radar (so we can alert before a price jump),
// and reach out over WhatsApp with a pre-filled message. The WhatsApp action
// never invents a phone number — it opens WhatsApp's own share/contact sheet via
// `wa.me?text=…`, and falls back to the native share sheet when WhatsApp isn't
// installed (web/desktop), so the button always does *something* useful.

class _ProviderActions extends StatelessWidget {
  const _ProviderActions({
    required this.providerName,
    required this.bestPlanId,
    required this.shareText,
    required this.ffTheme,
  });

  final String providerName;
  final String bestPlanId;
  final String shareText;
  final AppTheme ffTheme;

  Future<void> _openWhatsApp() async {
    final text = Uri.encodeComponent(shareText);
    final uri = Uri.parse('https://wa.me/?text=$text');
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        return;
      }
    } catch (_) {/* fall through to the native share sheet */}
    await Share.share(shareText);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'פעולות מהירות',
      child: Row(
      children: [
        Expanded(
          child: _ActionButton(
            icon: Icons.compare_arrows_rounded,
            label: 'השוואה',
            ffTheme: ffTheme,
            onTap: () {
              // Haptic fires centrally in _ActionButton's InkWell.
              final app = Provider.of<AppState>(context, listen: false);
              if (!app.isInCompare(bestPlanId)) app.toggleCompare(bestPlanId);
              context.pushNamed('Compare');
            },
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionButton(
            icon: Icons.event_repeat_rounded,
            label: 'מעקב חידוש',
            ffTheme: ffTheme,
            onTap: () {
              // Haptic fires centrally in _ActionButton's InkWell.
              context.pushNamed('Renewal');
            },
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionButton(
            icon: Icons.chat_rounded,
            label: 'וואטסאפ',
            // WhatsApp green is the brand-accent ACTION colour here.
            primary: true,
            ffTheme: ffTheme,
            onTap: () {
              // Haptic fires centrally in _ActionButton's InkWell.
              _openWhatsApp();
            },
          ),
        ),
      ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.ffTheme,
    required this.onTap,
    this.primary = false,
  });

  final IconData icon;
  final String label;
  final AppTheme ffTheme;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final fg = primary ? Colors.white : ffTheme.primaryText;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          // Centralised selection haptic on every quick-action tap; the
          // callbacks keep their own intent-specific feedback intact.
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          child: Container(
            // Comfortable tap target — never below the 48px minimum.
            constraints: const BoxConstraints(minHeight: kMinTapTarget),
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
            decoration: BoxDecoration(
              gradient: primary ? ffTheme.accentGradient : null,
              color: primary ? null : ffTheme.cardSurface,
              borderRadius: BorderRadius.circular(ffTheme.radiusMd),
              border: Border.all(
                  color: primary ? Colors.transparent : ffTheme.alternate),
              boxShadow: primary ? ffTheme.shadowAccent : null,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 20, color: fg),
                const SizedBox(height: 5),
                Text(
                  label,
                  style: ffTheme.labelSmall
                      .copyWith(color: fg, fontWeight: FontWeight.w700),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
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
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
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
  });

  final Plan plan;
  final PlanMatch? match;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final unit = priceUnitLabel(plan);
    final specEntries = plan.specs.entries.take(2).toList();
    // kamaze-parity detail: surface equipment/setup fees and the headline
    // benefit so the card answers "what does it really cost / include" without
    // a tap. Fees are real (plan.fees); the benefit is the first real feature.
    final feeEntries = plan.fees.entries.take(2).toList();
    final benefit = plan.feats.isNotEmpty ? plan.feats.first : null;

    return Semantics(
      button: true,
      label: 'פתח את פרטי המסלול ${plan.plan}',
      child: Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(ffTheme.radiusLg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(ffTheme.radiusLg),
        child: Container(
        padding: const EdgeInsets.all(16),
        decoration: ffTheme.cardDecoration(),
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
                  Flexible(
                    child: Text(
                      '← ₪${plan.afterText} אחרי ${plan.intro ?? 'המבצע'}',
                      style: ffTheme.labelSmall
                          .copyWith(color: ffTheme.secondaryText),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
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
                runSpacing: 6,
                children: specEntries.map((e) {
                  return Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: ffTheme.background,
                      borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                      border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.6)),
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
            // Equipment / setup fees — real plan.fees, the kamaze "ציוד" parity.
            if (feeEntries.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.receipt_long_rounded,
                      size: 13, color: ffTheme.secondaryText),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      feeEntries.map((e) => '${e.key} ${e.value}').join(' · '),
                      style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.secondaryText, fontSize: 11),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
            // Headline benefit — the first real feature, "מה כלול" at a glance.
            if (benefit != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.check_circle_outline_rounded,
                      size: 13, color: ffTheme.brandAccent),
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
          ],
        ),
        ),
      ),
      ),
    );
  }
}

// ── Community quote card ───────────────────────────────────────────────────────

class _CommunityCard extends StatelessWidget {
  const _CommunityCard({
    required this.text,
    required this.author,
    required this.ffTheme,
  });

  final String text;
  final String author;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.cardDecoration(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: ffTheme.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                author.isNotEmpty
                    ? String.fromCharCode(author.runes.first)
                    : '?',
                style: ffTheme.labelMedium.copyWith(
                    color: ffTheme.primary, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  author,
                  style: ffTheme.labelSmall
                      .copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  text,
                  style: ffTheme.bodySmall
                      .copyWith(color: ffTheme.primaryText),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Street price (מחיר הרחוב) ──────────────────────────────────────────────────
//
// "What people actually pay" — the real Israeli truth that the advertised price
// is a starting point and retention/deal prices land lower. We surface a per-
// category aggregate ONLY above the real report threshold (StreetPriceService's
// kStreetPriceMinReports); below that there is nothing honest to show, so the
// panel shows a plain "report your price" CTA instead of an invented number.
//
// TRUTH-ONLY: every figure here comes from StreetPriceService.aggregateFor (real
// user reports, screened) and the provider's real catalogue baseline. A user
// report passes a deterministic sanity gate before it can count, mirroring the
// community-moderate pre-screen. We never auto-anything and never fabricate a
// count — "מבוסס על N דיווחים" always states the real N.

class _StreetPricePanel extends StatefulWidget {
  const _StreetPricePanel({required this.providerName, required this.ffTheme});
  final String providerName;
  final AppTheme ffTheme;

  @override
  State<_StreetPricePanel> createState() => _StreetPricePanelState();
}

class _StreetPricePanelState extends State<_StreetPricePanel> {
  Future<void> _openReportSheet() async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: widget.ffTheme.cardSurface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ReportPriceSheet(
        providerName: widget.providerName,
        ffTheme: widget.ffTheme,
      ),
    );
    // Refresh so a just-accepted report that crosses the threshold appears, and
    // the "reports needed" counters tick down — all from real session data.
    if (submitted == true && mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = widget.ffTheme;
    final aggregates =
        StreetPriceService.aggregatesForProvider(widget.providerName);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.storefront_rounded, color: ffTheme.primary, size: 18),
              const SizedBox(width: 6),
              Expanded(child: Text('מחיר הרחוב', style: ffTheme.titleSmall)),
              // VALUE chip — amber — only when at least one category beats catalogue.
              if (aggregates.any((a) => a.beatsCatalogue))
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: ffTheme.saving.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    'נמוך מהמחירון',
                    style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.savingText, fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'מה לקוחות מדווחים שהם משלמים בפועל — לא מחיר המחירון.',
            style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
          ),
          const SizedBox(height: 14),

          if (aggregates.isEmpty)
            // Below the threshold across the board → no fabricated figure, just
            // an honest invitation to contribute the first real data point.
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: ffTheme.background,
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                border:
                    Border.all(color: ffTheme.alternate.withValues(alpha: 0.7)),
              ),
              child: Row(
                children: [
                  Icon(Icons.insights_rounded,
                      size: 18, color: ffTheme.secondaryText),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'עדיין אין מספיק דיווחים על ${widget.providerName} כדי להציג מחיר רחוב. היו הראשונים לדווח.',
                      style: ffTheme.bodySmall
                          .copyWith(color: ffTheme.primaryText),
                    ),
                  ),
                ],
              ),
            )
          else
            ...aggregates.asMap().entries.map((e) {
              final agg = e.value;
              return Padding(
                padding: EdgeInsets.only(bottom: e.key == aggregates.length - 1 ? 0 : 10),
                child: _StreetPriceRow(agg: agg, ffTheme: ffTheme),
              );
            }),

          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _openReportSheet,
              icon: const Icon(Icons.add_chart_rounded, size: 18),
              label: const Text('דווח/י את המחיר שלך'),
              style: OutlinedButton.styleFrom(
                foregroundColor: ffTheme.primary,
                side: BorderSide(color: ffTheme.primary.withValues(alpha: 0.4)),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'הדיווחים אנונימיים ומשמשים רק לחישוב ממוצע. מוצג רק כשיש מספיק דיווחים אמיתיים.',
            style: ffTheme.labelSmall.copyWith(
                color: ffTheme.secondaryText, fontSize: 11, height: 1.4),
          ),
        ],
      ),
    );
  }
}

/// One category's street-price line: the typical (median) figure, the real
/// report count, the range when there's spread, and the honest VALUE delta vs
/// the provider's cheapest catalogue plan when the street beats the sticker.
class _StreetPriceRow extends StatelessWidget {
  const _StreetPriceRow({required this.agg, required this.ffTheme});
  final StreetPriceAggregate agg;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final cat = categoryById(agg.category);
    final catName = cat?.name ?? agg.category;
    final saving = agg.savingVsCatalogueText;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
        border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(categoryIconData(agg.category),
                  size: 16, color: ffTheme.primaryText),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  catName,
                  style: ffTheme.labelMedium
                      .copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₪${agg.typicalText}',
                    style: ffTheme.titleMedium.copyWith(
                        color: ffTheme.primary, fontWeight: FontWeight.w800),
                  ),
                  Text('בממוצע לחודש',
                      style: ffTheme.labelSmall
                          .copyWith(color: ffTheme.secondaryText, fontSize: 10)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              // Real report count — never fabricated.
              _MiniChip(
                icon: Icons.groups_rounded,
                label: 'מבוסס על ${agg.reportCount} דיווחים',
                ffTheme: ffTheme,
              ),
              if (agg.hasSpread)
                _MiniChip(
                  icon: Icons.straighten_rounded,
                  label: '₪${agg.lowText}–₪${agg.highText}',
                  ffTheme: ffTheme,
                ),
              // VALUE: street beats catalogue → amber, the honest "pay less" win.
              if (saving != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: ffTheme.saving.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.trending_down_rounded,
                          size: 13, color: ffTheme.savingText),
                      const SizedBox(width: 4),
                      Text(
                        '₪$saving מתחת למחירון (₪${agg.catalogueLowestText})',
                        style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.savingText,
                            fontWeight: FontWeight.w700,
                            fontSize: 11),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniChip extends StatelessWidget {
  const _MiniChip(
      {required this.icon, required this.label, required this.ffTheme});
  final IconData icon;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.7)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: ffTheme.secondaryText),
          const SizedBox(width: 4),
          Text(
            label,
            style: ffTheme.labelSmall
                .copyWith(color: ffTheme.secondaryText, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

// ── Report-your-price bottom sheet ─────────────────────────────────────────────
//
// The user picks a real (provider, category) the provider actually serves, types
// the monthly ₪ they pay, and optionally the plan name. On submit we screen the
// number through StreetPriceService's deterministic sanity gate: a typo/out-of-
// range value is REJECTED (held out of the aggregate) with an honest Hebrew note;
// an accepted value counts. We never auto-send anything; the user taps submit.

class _ReportPriceSheet extends StatefulWidget {
  const _ReportPriceSheet(
      {required this.providerName, required this.ffTheme});
  final String providerName;
  final AppTheme ffTheme;

  @override
  State<_ReportPriceSheet> createState() => _ReportPriceSheetState();
}

class _ReportPriceSheetState extends State<_ReportPriceSheet> {
  final _priceCtrl = TextEditingController();
  final _planCtrl = TextEditingController();
  late List<String> _catIds;
  String? _catId;
  String? _error;

  @override
  void initState() {
    super.initState();
    _catIds = providerCategoryIds(widget.providerName);
    if (_catIds.isNotEmpty) _catId = _catIds.first;
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _planCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    final ffTheme = widget.ffTheme;
    final catId = _catId;
    final price = double.tryParse(_priceCtrl.text.trim().replaceAll(',', '.'));
    if (catId == null) {
      setState(() => _error = 'בחרו קטגוריה');
      return;
    }
    if (price == null || price <= 0) {
      setState(() => _error = 'הזינו מחיר חודשי תקין');
      return;
    }

    final report = StreetPriceService.submitReport(
      provider: widget.providerName,
      category: catId,
      monthlyPrice: price,
      planName: _planCtrl.text,
    );

    if (!report.accepted) {
      // Honest rejection: the number is held out of the aggregate, and we say so
      // — we never silently fabricate or silently drop.
      setState(() => _error =
          'המחיר שהוזן חורג מהטווח הסביר ולכן לא ייכלל בממוצע. בדקו את הסכום ונסו שוב.');
      return;
    }

    final catName = categoryById(catId)?.name ?? catId;
    final needed = StreetPriceService.reportsNeeded(widget.providerName, catId);
    final msg = needed > 0
        ? 'תודה! נדרשים עוד $needed דיווחים ב$catName כדי להציג מחיר רחוב.'
        : 'תודה! הדיווח נכלל במחיר הרחוב של $catName.';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: ffTheme.primary,
        behavior: SnackBarBehavior.floating,
      ),
    );
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = widget.ffTheme;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: ffTheme.alternate,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: ffTheme.brandAccent.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.storefront_rounded,
                      size: 22, color: ffTheme.brandAccent),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('דווח/י את המחיר שלך', style: ffTheme.titleMedium),
                      const SizedBox(height: 2),
                      Text(
                        widget.providerName,
                        style: ffTheme.labelSmall
                            .copyWith(color: ffTheme.secondaryText),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),

            if (_catIds.isEmpty)
              Text(
                'אין קטגוריות זמינות לדיווח עבור ספק זה.',
                style: ffTheme.bodyMedium,
              )
            else ...[
              Text('קטגוריה',
                  style: ffTheme.labelMedium
                      .copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _catIds.map((id) {
                  final selected = id == _catId;
                  final name = categoryById(id)?.name ?? id;
                  return ChoiceChip(
                    label: Text(name),
                    selected: selected,
                    onSelected: (_) => setState(() {
                      _catId = id;
                      _error = null;
                    }),
                    showCheckmark: false,
                    labelStyle: ffTheme.labelMedium.copyWith(
                      color: selected ? Colors.white : ffTheme.primaryText,
                      fontWeight: FontWeight.w700,
                    ),
                    backgroundColor: ffTheme.background,
                    selectedColor: AppColors.primary,
                    side: BorderSide(
                        color: selected
                            ? Colors.transparent
                            : ffTheme.alternate),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              Text('כמה אתם משלמים בחודש? (₪)',
                  style: ffTheme.labelMedium
                      .copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              TextField(
                controller: _priceCtrl,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                ],
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
                decoration: InputDecoration(
                  prefixText: '₪ ',
                  hintText: 'לדוגמה: 49',
                  filled: true,
                  fillColor: ffTheme.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    borderSide: BorderSide(color: ffTheme.alternate),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    borderSide: BorderSide(color: ffTheme.alternate),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('שם המסלול (לא חובה)',
                  style: ffTheme.labelMedium
                      .copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              TextField(
                controller: _planCtrl,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  hintText: 'לדוגמה: 100GB + שיחות',
                  filled: true,
                  fillColor: ffTheme.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    borderSide: BorderSide(color: ffTheme.alternate),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    borderSide: BorderSide(color: ffTheme.alternate),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.error_outline_rounded,
                        size: 16, color: ffTheme.error),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _error!,
                        style: ffTheme.labelSmall
                            .copyWith(color: ffTheme.error),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: AppButton(
                  text: 'שליחת דיווח',
                  color: AppColors.primary,
                  width: double.infinity,
                  onPressed: () async => _submit(),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'הדיווח אנונימי ומשמש רק לחישוב ממוצע מחיר הרחוב. מספרים חריגים מסוננים אוטומטית.',
                style: ffTheme.labelSmall.copyWith(
                    color: ffTheme.secondaryText, fontSize: 11, height: 1.4),
              ),
            ],
          ],
        ),
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
