import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';

class ProviderWidget extends StatelessWidget {
  const ProviderWidget({super.key, required this.providerName});
  final String providerName;

  /// Build a MatchProfile tuned to a given plan's category.
  MatchProfile _profileFor(Plan p, AppState appState) {
    return MatchProfile(
      category: p.cat,
      currentBill: appState.currentBill(p.cat),
      budget: (appState.quizCompleted && appState.quizCat == p.cat)
          ? appState.quizBudget
          : 0,
      priority: priorityFromId(appState.quizPriority),
      lines: appState.quizLines,
      wants5G: appState.wants5G,
      wantsAbroad: appState.wantsAbroad,
      wantsNoCommit: appState.wantsNoCommit,
    );
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final plans = plansByProvider(providerName);

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

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: plans.isEmpty
          ? _EmptyState(providerName: providerName, ffTheme: ffTheme)
          : CustomScrollView(
              slivers: [
                // ── Hero header ──────────────────────────────────────────────
                SliverToBoxAdapter(
                  child: _HeroHeader(
                    providerName: providerName,
                    planCount: plans.length,
                    catCount: catCount,
                    ffTheme: ffTheme,
                    onBack: () => context.safePop(),
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
                          const SizedBox(height: 20),
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
                                    .animate(
                                        delay: ((i * 4 + pi) * 50 + 100).ms)
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
    );
  }
}

// ── Hero header ───────────────────────────────────────────────────────────────

class _HeroHeader extends StatelessWidget {
  const _HeroHeader({
    required this.providerName,
    required this.planCount,
    required this.catCount,
    required this.ffTheme,
    required this.onBack,
  });

  final String providerName;
  final int planCount;
  final int catCount;
  final AppTheme ffTheme;
  final VoidCallback onBack;

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
            // Back button row
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: IconButton(
                icon: const Icon(Icons.arrow_back_ios_rounded,
                    color: Colors.white),
                onPressed: onBack,
              ),
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
                  .copyWith(color: Colors.white.withOpacity(0.85)),
              textAlign: TextAlign.center,
            ),
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
    final unit = plan.cat == 'abroad' ? 'לחבילה' : 'לחודש';
    final topReason =
        match.reasons.isNotEmpty ? match.reasons.first : match.plan.plan;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: ffTheme.primary.withOpacity(0.25)),
          boxShadow: [
            BoxShadow(
              color: ffTheme.primary.withOpacity(0.08),
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
                      '₪${plan.price}',
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

// ── Category section header ────────────────────────────────────────────────────

class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.cat, required this.ffTheme});
  final Category cat;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(cat.icon, style: const TextStyle(fontSize: 18)),
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
    final unit = plan.cat == 'abroad' ? 'לחבילה' : 'לחודש';
    final specEntries = plan.specs.entries.take(2).toList();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
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
                          color: ffTheme.primary.withOpacity(0.2)),
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
                  '₪${plan.price} $unit',
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
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: ffTheme.primary.withOpacity(0.1),
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
