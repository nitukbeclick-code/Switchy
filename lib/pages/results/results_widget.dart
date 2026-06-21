import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/recommendation_engine.dart';

class ResultsWidget extends StatefulWidget {
  const ResultsWidget({super.key});

  @override
  State<ResultsWidget> createState() => _ResultsWidgetState();
}

class _ResultsWidgetState extends State<ResultsWidget> {
  final _searchController = TextEditingController();
  String _providerFilter = '';
  bool _smartSort = false;

  // Memo for the per-plan recommendation scores: scoring is pure over the
  // (profile, plan list) pair, so a rebuild with identical inputs (e.g. an
  // unrelated AppState notify) reuses the previous map instead of re-ranking
  // the whole catalogue.
  String? _matchKey;
  Map<String, PlanMatch>? _matchMemo;

  static String _profileKey(MatchProfile p) =>
      '${p.category}|${p.currentBill}|${p.budget}|${p.priority}|${p.lines}|'
      '${p.wants5G}|${p.wantsAbroad}|${p.wantsNoCommit}';

  static const _categories = [
    ('cellular', 'סלולר'),
    ('internet', 'אינטרנט'),
    ('tv', 'טלוויזיה'),
    ('triple', 'משולב'),
    ('abroad', 'חו"ל'),
  ];

  static const _sorts = [
    ('smart', 'התאמה חכמה'),
    ('match', 'מומלץ'),
    ('price', 'הכי זול'),
    ('save', 'מקסימום חיסכון'),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _switchCategory(AppState appState, String cat) {
    HapticFeedback.selectionClick();
    setState(() { _providerFilter = ''; });
    appState.setCategory(cat);
    _searchController.clear();
    appState.setSearch('');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final appState = Provider.of<AppState>(context);
    final cat = appState.selectedCat;
    final catData = categoryById(cat);
    final bill = appState.currentBill(cat);

    // The header is a permanently-ink band on light; on dark it must become the
    // raised dark surface (ffTheme.primary resolves to off-white INK on dark, so
    // using it as a fill would paint a near-white bar). On-header content reads
    // light in both modes since the band stays dark.
    final headerColor = isDark ? AppColors.darkSurface : ffTheme.primary;
    final onHeader = ffTheme.white;

    // The quiz-budget gate (budget applies only when the quiz was taken for this
    // same category) lives in the factory — matching the filteredPlans budget
    // gate below.
    final profile = MatchProfile.fromAppState(appState, cat);

    final effectiveSort = _smartSort ? 'match' : appState.sortMode;

    final rawPlans = filteredPlans(
      cat: cat,
      sort: effectiveSort,
      filters: appState.activeFilters,
      query: appState.searchQuery,
      budget: (appState.quizCompleted && appState.quizCat == cat) ? appState.quizBudget : 9999,
      currentBill: bill,
    );
    final filteredByProvider = _providerFilter.isEmpty
        ? rawPlans
        : rawPlans.where((p) => p.provider == _providerFilter).toList();

    // Compute scores once per (profile, plan-list) — see the memo above.
    final memoKey =
        '${_profileKey(profile)}#${filteredByProvider.map((p) => p.id).join(',')}';
    final Map<String, PlanMatch> matchMap;
    if (memoKey == _matchKey && _matchMemo != null) {
      matchMap = _matchMemo!;
    } else {
      matchMap = {
        for (final p in filteredByProvider)
          p.id: RecommendationEngine.scorePlan(p, profile),
      };
      _matchKey = memoKey;
      _matchMemo = matchMap;
    }

    final plans = _smartSort
        ? (List.of(filteredByProvider)
          ..sort((a, b) =>
              (matchMap[b.id]?.score ?? 0).compareTo(matchMap[a.id]?.score ?? 0)))
        : filteredByProvider;

    final allCatProviders = plansByCat(cat).map((p) => p.provider).toSet().toList();

    final topPlanMatch = plans.isNotEmpty ? matchMap[plans.first.id] : null;
    final topPlan = topPlanMatch?.plan;
    final topSave = topPlan != null ? planSaveYear(topPlan, bill) : 0;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: headerColor,
        foregroundColor: onHeader,
        elevation: 0,
        title: Text(catData?.name ?? 'תוצאות',
            style: ffTheme.titleLarge.copyWith(color: onHeader)),
        actions: [
          IconButton(
            icon: Stack(children: [
              Icon(Icons.tune_rounded, color: onHeader),
              if (appState.activeFilters.isNotEmpty)
                PositionedDirectional(
                  top: 0, end: 0,
                  child: Container(
                    width: 8, height: 8,
                    // Amber attention dot — filters are active. Pops on the ink
                    // header in both themes.
                    decoration: BoxDecoration(
                        color: ffTheme.saving, shape: BoxShape.circle),
                  ),
                ),
            ]),
            tooltip: 'סינון',
            onPressed: () => _showFilters(context, appState, ffTheme),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Container(
            color: headerColor,
            child: SizedBox(
              height: 52,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                children: _categories.map((c) {
                  final active = appState.selectedCat == c.$1;
                  // Active = green ACTION fill (the brand's active-state cue);
                  // inactive = a faint glass chip on the ink header.
                  return Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: GestureDetector(
                      onTap: () => _switchCategory(appState, c.$1),
                      child: AnimatedContainer(
                        duration: ffTheme.motionFast,
                        curve: ffTheme.easeOut,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: active
                              ? ffTheme.brandAccent
                              : onHeader.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: active
                                ? ffTheme.brandAccent
                                : onHeader.withValues(alpha: 0.30),
                          ),
                          boxShadow: active ? ffTheme.shadowAccent : null,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(categoryIconData(c.$1), size: 14,
                                color: active ? Colors.white : onHeader),
                            const SizedBox(width: 5),
                            Text(
                              c.$2,
                              style: ffTheme.labelMedium.copyWith(
                                color: active ? Colors.white : onHeader,
                                fontWeight:
                                    active ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              // Search bar
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: TextField(
                    controller: _searchController,
                    onChanged: appState.setSearch,
                    textDirection: TextDirection.rtl,
                    decoration: InputDecoration(
                      hintText: 'חיפוש ספק או חבילה...',
                      filled: true,
                      fillColor: ffTheme.cardSurface,
                      prefixIcon: appState.searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear_rounded),
                              tooltip: 'נקה חיפוש',
                              onPressed: () {
                                _searchController.clear();
                                appState.setSearch('');
                              })
                          : const Icon(Icons.search_rounded),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                    ),
                  ),
                ),
              ),

              // Info row + bill stepper
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Info row
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              // Green "fresh/live" cue — the catalogue is current.
                              color: ffTheme.brandAccent.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                  color: ffTheme.brandAccent.withValues(alpha: 0.25)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  decoration: BoxDecoration(
                                    color: ffTheme.brandAccent,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 5),
                                Text('עודכן היום',
                                    style: ffTheme.labelSmall.copyWith(
                                        color: ffTheme.brandAccentText,
                                        fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                          const Spacer(),
                          Text('${plans.length} מסלולים',
                              style: ffTheme.labelMedium.copyWith(
                                  color: ffTheme.secondaryText,
                                  fontFeatures: const [FontFeature.tabularFigures()])),
                          if (appState.activeFilters.isNotEmpty || _providerFilter.isNotEmpty) ...[
                            const SizedBox(width: 2),
                            // Padded InkWell — a comfortable target with press
                            // feedback instead of a bare 24px text tap.
                            Material(
                              color: Colors.transparent,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(8),
                                onTap: () { appState.clearFilters(); setState(() => _providerFilter = ''); },
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                  child: Text('נקה',
                                      style: ffTheme.labelMedium.copyWith(
                                          color: ffTheme.error,
                                          fontWeight: FontWeight.w700)),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),

                      const SizedBox(height: 12),

                      // Bill stepper
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: ffTheme.cardSurface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: ffTheme.alternate),
                          boxShadow: ffTheme.shadowSoft,
                        ),
                        child: Row(
                          children: [
                            Text('החשבון שלך:',
                                style: ffTheme.bodyMedium
                                    .copyWith(color: ffTheme.secondaryText)),
                            const SizedBox(width: 8),
                            Semantics(
                              button: true,
                              label: 'ערוך את החשבון החודשי',
                              child: Material(
                                color: ffTheme.accent1,
                                borderRadius: BorderRadius.circular(8),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(8),
                                  onTap: () => _showBillEditor(context, appState, cat, bill, ffTheme),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text('₪$bill',
                                            style: ffTheme.titleMedium
                                                .copyWith(color: ffTheme.primary, fontFeatures: const [FontFeature.tabularFigures()])),
                                        const SizedBox(width: 4),
                                        Icon(Icons.edit_rounded, size: 12, color: ffTheme.primary),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const Spacer(),
                            _StepButton(
                              icon: Icons.remove,
                              onTap: () =>
                                  appState.setCurrentBill(cat, bill - 10),
                              ffTheme: ffTheme,
                              semanticLabel: 'הפחת ₪10 מהחשבון',
                            ),
                            const SizedBox(width: 8),
                            _StepButton(
                              icon: Icons.add,
                              onTap: () =>
                                  appState.setCurrentBill(cat, bill + 10),
                              ffTheme: ffTheme,
                              semanticLabel: 'הוסף ₪10 לחשבון',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Quick filter chips per category
              SliverToBoxAdapter(
                child: _buildQuickFilters(context, appState, ffTheme, cat),
              ),

              // Provider chips
              SliverToBoxAdapter(
                child: _buildProviderChips(ffTheme, allCatProviders),
              ),

              // Sort chips
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 52,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    children: _sorts.map((s) {
                      final isSmart = s.$1 == 'smart';
                      final active = isSmart
                          ? _smartSort
                          : (!_smartSort && appState.sortMode == s.$1);
                      return Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        child: GestureDetector(
                          onTap: () {
                            HapticFeedback.selectionClick();
                            if (isSmart) {
                              setState(() => _smartSort = true);
                            } else {
                              setState(() => _smartSort = false);
                              appState.setSortMode(s.$1);
                            }
                          },
                          child: AnimatedContainer(
                            duration: ffTheme.motionFast,
                            curve: ffTheme.easeOut,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              // Active sort = green ACTION fill (works on both
                              // themes); smart-sort wears the accent gradient +
                              // glow as the AI-pick affordance.
                              color: active
                                  ? (isSmart ? null : ffTheme.brandAccent)
                                  : ffTheme.cardSurface,
                              gradient: active && isSmart ? ffTheme.accentGradient : null,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                  color: active
                                      ? ffTheme.brandAccent
                                      : ffTheme.alternate),
                              boxShadow: active ? ffTheme.shadowAccent : null,
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (isSmart) ...[
                                  Icon(Icons.adjust,
                                      size: active ? 13 : 12,
                                      color: active ? Colors.white : ffTheme.brandAccent),
                                  const SizedBox(width: 4),
                                ],
                                Text(
                                  s.$2,
                                  style: ffTheme.labelMedium.copyWith(
                                    color: active ? Colors.white : ffTheme.primaryText,
                                    fontWeight: active
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),

              // Quiz context banner (only for the matching quiz category)
              if (appState.quizCompleted && appState.quizCat == cat)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: ffTheme.accent1,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.filter_alt_rounded, size: 18, color: ffTheme.primary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              cat == 'cellular' && appState.quizLines > 1
                                  ? 'שאלון: ${appState.quizLines} קווים, עד ₪${appState.quizBudget}'
                                  : 'שאלון: עד ₪${appState.quizBudget}${cat == 'abroad' ? '/חבילה' : '/חודש'}',
                              style: ffTheme.labelMedium.copyWith(color: ffTheme.primary),
                            ),
                          ),
                          Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(8),
                              onTap: () => context.pushNamed('Quiz'),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                child: Text('עריכה', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                              ),
                            ),
                          ),
                          IconButton(
                            icon: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
                            tooltip: 'הסתר את סינון השאלון',
                            visualDensity: VisualDensity.compact,
                            onPressed: () => appState.setQuizCompleted(false),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(duration: 250.ms),
                  ),
                ),

              // AI banner
              if (topPlan != null && topSave > 0)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                    child: Container(
                      decoration: BoxDecoration(
                        // Const ink→slate wash — a premium dark band that stays
                        // ink in BOTH themes (the theme-aware getters would turn
                        // near-white on dark).
                        gradient: ffTheme.freshGradient,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: ffTheme.shadowCard,
                      ),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          splashColor: Colors.white.withValues(alpha: 0.12),
                          highlightColor: Colors.white.withValues(alpha: 0.06),
                          onTap: () => context.pushNamed('PlanDetail',
                              pathParameters: {'planId': topPlan.id}),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.14),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.auto_awesome_rounded, size: 20, color: Colors.white),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${topPlan.provider} מומלץ לך',
                                        style: ffTheme.titleSmall
                                            .copyWith(color: Colors.white),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        'תחסוך ₪$topSave בשנה',
                                        style: ffTheme.bodySmall.copyWith(
                                            color: ffTheme.savingText,
                                            fontWeight: FontWeight.w800),
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.arrow_forward_ios_rounded,
                                    color: Colors.white.withValues(alpha: 0.7), size: 16),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.05),
                  ),
                ),

              // Plan list or empty state
              if (plans.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 96,
                          height: 96,
                          decoration: BoxDecoration(
                            color: ffTheme.accent1,
                            shape: BoxShape.circle,
                            border: Border.all(color: ffTheme.primary.withValues(alpha: 0.12), width: 1.5),
                          ),
                          child: Icon(Icons.search_off_rounded, size: 44, color: ffTheme.primary.withValues(alpha: 0.55)),
                        ).animate().fadeIn(duration: 350.ms).scale(
                              begin: const Offset(0.85, 0.85),
                              end: const Offset(1, 1),
                              duration: 350.ms,
                              curve: Curves.easeOutBack,
                            ),
                        const SizedBox(height: 20),
                        Text(
                          appState.searchQuery.isNotEmpty ? 'אין תוצאות לחיפוש' : 'לא נמצאו מסלולים',
                          style: ffTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          appState.searchQuery.isNotEmpty
                            ? 'לא מצאנו תוצאות עבור "${appState.searchQuery}"'
                            : appState.activeFilters.isNotEmpty
                              ? 'הסינונים שבחרת מצמצמים מדי — נסה להסיר חלקם'
                              : 'אין מסלולים בקטגוריה זו כרגע',
                          style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 28),
                        if (appState.searchQuery.isNotEmpty)
                          _ActionChip(
                            label: 'נקה חיפוש',
                            icon: Icons.clear_rounded,
                            onTap: () { _searchController.clear(); appState.setSearch(''); },
                            ffTheme: ffTheme,
                          ),
                        if (appState.activeFilters.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          _ActionChip(
                            label: 'נקה את כל הסינונים',
                            icon: Icons.filter_alt_off_rounded,
                            onTap: appState.clearFilters,
                            ffTheme: ffTheme,
                          ),
                        ],
                        const SizedBox(height: 28),
                        Text('נסה קטגוריה אחרת', style: ffTheme.labelMedium.copyWith(color: ffTheme.secondaryText)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          alignment: WrapAlignment.center,
                          children: _categories
                            .where((c) => c.$1 != cat)
                            .map((c) => Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: ffTheme.shadowSoft,
                              ),
                              child: Material(
                                color: ffTheme.cardSurface,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(20),
                                  side: BorderSide(color: ffTheme.brandAccent.withValues(alpha: 0.35)),
                                ),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(20),
                                  onTap: () => _switchCategory(appState, c.$1),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(categoryIconData(c.$1), size: 13, color: ffTheme.primary),
                                        const SizedBox(width: 5),
                                        Text(c.$2, style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            )).toList(),
                        ),
                      ],
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final plan = plans[index];
                        final match = matchMap[plan.id];
                        // The engine's top pick wears the in-card "best match"
                        // treatment; the match score renders inside the card —
                        // overlaying badges collided with the header controls.
                        final isTopMatch = _smartSort && index == 0 && match != null && match.scorePct >= 70;
                        return PlanCardWidget(
                          plan: plan,
                          currentBill: bill,
                          matchPct: match?.scorePct,
                          bestMatch: isTopMatch || plan.highlight,
                        )
                            .animate(delay: (index * 60).ms)
                            .fadeIn(duration: 300.ms)
                            .slideX(begin: 0.05);
                      },
                      childCount: plans.length,
                    ),
                  ),
                ),
            ],
          ),

          // Compare sticky bar
          Positioned(
            bottom: 80,
            left: 16,
            right: 16,
            child: AnimatedSlide(
              offset: appState.comparePlans.isEmpty
                  ? const Offset(0, 2)
                  : Offset.zero,
              duration: ffTheme.motionMedium,
              curve: ffTheme.emphasized,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  // Green ACTION band — the compare CTA, vivid on both themes.
                  gradient: ffTheme.accentGradient,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: ffTheme.shadowAccent,
                ),
                child: Row(
                  children: [
                    Text(
                      'השווה ${appState.comparePlans.length} מסלולים',
                      style: ffTheme.titleSmall.copyWith(color: Colors.white),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        context.goNamed('Compare');
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        // Fixed deep-green (#15803D, 5:1 on white) — the pill is
                        // always white, so a theme-aware color would fail in dark.
                        foregroundColor: AppColors.brandAccentDark,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                      ),
                      child: Text('השוואה ←',
                          style: ffTheme.labelMedium.copyWith(
                              color: AppColors.brandAccentDark,
                              fontWeight: FontWeight.w700)),
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

  Widget _buildProviderChips(AppTheme ffTheme, List<String> providers) {
    if (providers.length <= 1) return const SizedBox();
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
        children: [
          _providerChip('הכל', ffTheme),
          ...providers.map((p) => _providerChip(p, ffTheme)),
        ],
      ),
    );
  }

  Widget _providerChip(String label, AppTheme ffTheme) {
    final isAll = label == 'הכל';
    final active = isAll ? _providerFilter.isEmpty : _providerFilter == label;
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: GestureDetector(
        onTap: () => setState(() => _providerFilter = isAll ? '' : label),
        child: AnimatedContainer(
          duration: ffTheme.motionFast,
          curve: ffTheme.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: active
                ? ffTheme.brandAccent.withValues(alpha: 0.12)
                : ffTheme.cardSurface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active ? ffTheme.brandAccent : ffTheme.alternate,
              width: active ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: ffTheme.labelSmall.copyWith(
              color: active ? ffTheme.brandAccent : ffTheme.primaryText,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildQuickFilters(BuildContext context, AppState appState, AppTheme ffTheme, String cat) {
    const quickFilters = <String, List<(String, String)>>{
      'cellular': [('5G', '5g'), ('ללא התחייבות', 'nocommit'), ('מחיר קבוע', 'fixed'), ('כולל חו"ל', 'abroad'), ('כשר', 'kosher')],
      'internet': [('סיב אופטי', 'fiber'), ('מחיר קבוע', 'fixed'), ('ללא התחייבות', 'nocommit')],
      'tv': [('ספורט', 'sport'), ('Netflix', 'netflix'), ('סטרימינג', 'streaming')],
      'triple': [('Netflix', 'netflix'), ('ספורט', 'sport'), ('ללא התחייבות', 'nocommit')],
      'abroad': [('eSIM', 'esim'), ('ללא התחייבות', 'nocommit')],
    };
    final chips = quickFilters[cat] ?? const [];
    if (chips.isEmpty) return const SizedBox();

    final hasActiveFilters = appState.activeFilters.isNotEmpty;

    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        children: [
          // "נקה" clear button — shown only when any filter is active
          if (hasActiveFilters)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  appState.clearFilters();
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: ffTheme.error,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: ffTheme.error),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.close_rounded, size: 12, color: Colors.white),
                      const SizedBox(width: 4),
                      Text('נקה',
                          style: ffTheme.labelSmall.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ),
            ),
          ...chips.map((chip) {
            final active = appState.activeFilters.contains(chip.$2);
            return Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  appState.toggleFilter(chip.$2);
                },
                child: AnimatedContainer(
                  duration: ffTheme.motionFast,
                  curve: ffTheme.easeOut,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    // Selected filter = green ACTION fill (consistent active cue).
                    color: active ? ffTheme.brandAccent : ffTheme.cardSurface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: active ? ffTheme.brandAccent : ffTheme.alternate),
                    boxShadow: active ? ffTheme.shadowAccent : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (active) ...[
                        const Icon(Icons.check_rounded, size: 12, color: Colors.white),
                        const SizedBox(width: 4),
                      ],
                      Text(chip.$1,
                          style: ffTheme.labelSmall.copyWith(
                              color: active ? Colors.white : ffTheme.primaryText,
                              fontWeight: active
                                  ? FontWeight.w700
                                  : FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  void _showBillEditor(BuildContext context, AppState appState, String cat, int currentBill, AppTheme ffTheme) {
    final ctrl = TextEditingController(text: currentBill > 0 ? '$currentBill' : '');
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(cat == 'abroad' ? 'עדכן תקציב לחבילה' : 'עדכן חשבון חודשי', style: ffTheme.titleLarge),
            const SizedBox(height: 6),
            Text(cat == 'abroad' ? 'הכניסו את התקציב שלכם לחבילת חו"ל' : 'הכניסו את הסכום שאתם משלמים כרגע', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              autofocus: true,
              textDirection: TextDirection.ltr,
              style: ffTheme.displaySmall.copyWith(color: ffTheme.primaryText),
              decoration: InputDecoration(
                prefixText: '₪',
                prefixStyle: ffTheme.displaySmall.copyWith(color: ffTheme.brandAccent),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.brandAccent, width: 2)),
                filled: true, fillColor: ffTheme.accent1,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final v = int.tryParse(ctrl.text);
                  if (v != null && v > 0) appState.setCurrentBill(cat, v);
                  Navigator.pop(ctx);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: ffTheme.brandAccent,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('עדכן', style: ffTheme.titleSmall.copyWith(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    ).then((_) => ctrl.dispose());
  }

  void _showFilters(
      BuildContext context, AppState appState, AppTheme ffTheme) {
    const Map<String, List<(String, String)>> catFilters = {
      'cellular': [('5G', '5g'), ('ללא התחייבות', 'nocommit'), ('מחיר קבוע', 'fixed'), ('כולל חו"ל', 'abroad'), ('כשר', 'kosher')],
      'internet': [('ללא התחייבות', 'nocommit'), ('סיב אופטי', 'fiber'), ('1,000Mb+', '1g'), ('מחיר קבוע', 'fixed')],
      'tv': [('סטרימינג', 'streaming'), ('ספורט', 'sport'), ('Netflix', 'netflix')],
      'triple': [('Netflix', 'netflix'), ('ספורט', 'sport'), ('ללא התחייבות', 'nocommit')],
      'abroad': [('eSIM', 'esim'), ('ללא התחייבות', 'nocommit')],
    };
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Text('סינון', style: ffTheme.titleLarge),
                const Spacer(),
                TextButton(
                  onPressed: () {
                    appState.clearFilters();
                    Navigator.pop(ctx);
                  },
                  child: Text('נקה הכל',
                      style:
                          ffTheme.bodyMedium.copyWith(color: ffTheme.error)),
                ),
              ]),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final chip in catFilters[appState.selectedCat] ?? [])
                    Builder(builder: (ctx) {
                      final selected = appState.activeFilters.contains(chip.$2);
                      return FilterChip(
                        label: Text(chip.$1),
                        selected: selected,
                        onSelected: (_) {
                          appState.toggleFilter(chip.$2);
                          setModalState(() {});
                        },
                        selectedColor: ffTheme.brandAccent,
                        backgroundColor: ffTheme.accent1,
                        side: BorderSide(color: selected ? ffTheme.brandAccent : ffTheme.alternate),
                        labelStyle: ffTheme.bodyMedium.copyWith(
                            color: selected ? Colors.white : ffTheme.primaryText),
                        checkmarkColor: Colors.white,
                      );
                    }),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ffTheme.brandAccent,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text('הצג תוצאות',
                      style:
                          ffTheme.titleSmall.copyWith(color: Colors.white)),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.label, required this.icon, required this.onTap, required this.ffTheme});
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        boxShadow: ffTheme.shadowAccent,
      ),
      child: Material(
        // Green ACTION — the empty-state recovery CTA.
        color: ffTheme.brandAccent,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 16, color: Colors.white),
                const SizedBox(width: 8),
                Text(label, style: ffTheme.labelMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton(
      {required this.icon, required this.onTap, required this.ffTheme, this.semanticLabel});
  final IconData icon;
  final VoidCallback onTap;
  final AppTheme ffTheme;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    // 44×44 tap area around the 32px visual circle + ripple feedback.
    return Semantics(
      button: true,
      label: semanticLabel,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Center(
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  shape: BoxShape.circle,
                  border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
                ),
                child: Icon(icon, size: 18, color: ffTheme.primary),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
