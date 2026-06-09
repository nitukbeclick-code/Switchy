import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../components/shimmer_card/shimmer_card_widget.dart';
import '../../services/recommendation_engine.dart';

class ResultsWidget extends StatefulWidget {
  const ResultsWidget({super.key});

  @override
  State<ResultsWidget> createState() => _ResultsWidgetState();
}

class _ResultsWidgetState extends State<ResultsWidget> {
  final _searchController = TextEditingController();
  bool _loading = false;
  String _providerFilter = '';
  bool _smartSort = false;

  static const _categories = [
    ('cellular', '📱 סלולר'),
    ('internet', '🌐 אינטרנט'),
    ('tv', '📺 טלוויזיה'),
    ('triple', '🏠 משולב'),
    ('abroad', '✈️ חו"ל'),
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

  Future<void> _switchCategory(AppState appState, String cat) async {
    HapticFeedback.selectionClick();
    setState(() { _loading = true; _providerFilter = ''; });
    appState.setCategory(cat);
    _searchController.clear();
    appState.setSearch('');
    await Future.delayed(const Duration(milliseconds: 700));
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final cat = appState.selectedCat;
    final catData = categoryById(cat);
    final bill = appState.currentBill(cat);

    final profile = MatchProfile(
      category: cat,
      currentBill: appState.currentBill(cat),
      // Only apply the quiz budget to the category the quiz was taken for —
      // matching the filteredPlans budget gate below.
      budget: (appState.quizCompleted && appState.quizCat == cat) ? appState.quizBudget : 0,
      priority: priorityFromId(appState.quizPriority),
      lines: appState.quizLines,
      wants5G: appState.wants5G,
      wantsAbroad: appState.wantsAbroad,
      wantsNoCommit: appState.wantsNoCommit,
    );

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

    // Compute scores once per build; also used for smart-sort ordering.
    final matchMap = {
      for (final p in filteredByProvider)
        p.id: RecommendationEngine.scorePlan(p, profile),
    };

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
        backgroundColor: ffTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(catData?.name ?? 'תוצאות',
            style: ffTheme.titleLarge.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: Stack(children: [
              const Icon(Icons.tune_rounded, color: Colors.white),
              if (appState.activeFilters.isNotEmpty)
                Positioned(
                  top: 0, right: 0,
                  child: Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                        color: ffTheme.secondary, shape: BoxShape.circle),
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
            color: ffTheme.primary,
            child: SizedBox(
              height: 52,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                children: _categories.map((c) {
                  final active = appState.selectedCat == c.$1;
                  return Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: GestureDetector(
                      onTap: () => _switchCategory(appState, c.$1),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: active
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: active
                                ? Colors.white
                                : Colors.white.withValues(alpha: 0.35),
                          ),
                        ),
                        child: Text(
                          c.$2,
                          style: ffTheme.labelMedium.copyWith(
                            color: active ? ffTheme.primary : Colors.white,
                            fontWeight:
                                active ? FontWeight.w700 : FontWeight.w500,
                          ),
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
                      fillColor: Colors.white,
                      prefixIcon: appState.searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear_rounded),
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
                              color: ffTheme.accent1,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                  color: ffTheme.primary.withValues(alpha: 0.2)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  decoration: BoxDecoration(
                                    color: ffTheme.primary,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 5),
                                Text('עודכן היום',
                                    style: ffTheme.labelSmall.copyWith(
                                        color: ffTheme.primary,
                                        fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
                          const Spacer(),
                          Text('${plans.length} מסלולים',
                              style: ffTheme.labelMedium
                                  .copyWith(color: ffTheme.secondaryText)),
                          if (appState.activeFilters.isNotEmpty || _providerFilter.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            GestureDetector(
                              onTap: () { appState.clearFilters(); setState(() => _providerFilter = ''); },
                              child: Text('נקה',
                                  style: ffTheme.labelMedium.copyWith(
                                      color: ffTheme.error,
                                      fontWeight: FontWeight.w700)),
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
                        child: Row(
                          children: [
                            Text('החשבון שלך:',
                                style: ffTheme.bodyMedium
                                    .copyWith(color: ffTheme.secondaryText)),
                            const SizedBox(width: 8),
                            GestureDetector(
                              onTap: () => _showBillEditor(context, appState, cat, bill, ffTheme),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: ffTheme.accent1,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text('₪$bill',
                                        style: ffTheme.titleMedium
                                            .copyWith(color: ffTheme.primary)),
                                    const SizedBox(width: 4),
                                    Icon(Icons.edit_rounded, size: 12, color: ffTheme.primary),
                                  ],
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
                        padding: const EdgeInsets.only(left: 8),
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
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              color: active
                                  ? (isSmart ? ffTheme.secondary : ffTheme.primary)
                                  : ffTheme.secondaryBackground,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                  color: active
                                      ? (isSmart ? ffTheme.secondary : ffTheme.primary)
                                      : ffTheme.alternate),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (isSmart) ...[
                                  Text('🎯', style: TextStyle(fontSize: active ? 13 : 12)),
                                  const SizedBox(width: 4),
                                ],
                                Text(
                                  s.$2,
                                  style: ffTheme.labelMedium.copyWith(
                                    color: active
                                        ? (isSmart ? ffTheme.primary : Colors.white)
                                        : ffTheme.primaryText,
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
                          GestureDetector(
                            onTap: () => context.pushNamed('Quiz'),
                            child: Text('עריכה', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: () => appState.setQuizCompleted(false),
                            child: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
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
                    child: GestureDetector(
                      onTap: () => context.pushNamed('PlanDetail',
                          pathParameters: {'planId': topPlan.id}),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [ffTheme.primary, ffTheme.tertiary],
                            begin: Alignment.centerRight,
                            end: Alignment.centerLeft,
                          ),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            const Text('💡', style: TextStyle(fontSize: 20)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${topPlan.provider} מומלץ לך',
                                    style: ffTheme.titleSmall
                                        .copyWith(color: Colors.white),
                                  ),
                                  Text(
                                    'תחסוך ₪$topSave בשנה',
                                    style: ffTheme.bodySmall.copyWith(
                                        color: ffTheme.secondary,
                                        fontWeight: FontWeight.w700),
                                  ),
                                ],
                              ),
                            ),
                            Icon(Icons.arrow_forward_ios_rounded,
                                color: Colors.white.withValues(alpha: 0.7), size: 16),
                          ],
                        ),
                      ),
                    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.05),
                  ),
                ),

              // Plan list or shimmer or empty state
              if (_loading)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (_, __) => const ShimmerCardWidget(),
                      childCount: 4,
                    ),
                  ),
                )
              else if (plans.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 88,
                          height: 88,
                          decoration: BoxDecoration(
                            color: ffTheme.alternate.withValues(alpha: 0.4),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.search_off_rounded, size: 44, color: ffTheme.secondaryText),
                        ).animate(onPlay: (c) => c.repeat(reverse: true))
                          .scale(begin: const Offset(1, 1), end: const Offset(1.06, 1.06), duration: 1400.ms, curve: Curves.easeInOut),
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
                            .map((c) => GestureDetector(
                              onTap: () => _switchCategory(appState, c.$1),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(color: ffTheme.primary.withValues(alpha: 0.3)),
                                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 4)],
                                ),
                                child: Text(c.$2, style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
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
                        final isTopMatch = _smartSort && index == 0 && match != null && match.scorePct >= 70;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (isTopMatch)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: ffTheme.secondary,
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Text('🎯', style: TextStyle(fontSize: 12)),
                                          const SizedBox(width: 4),
                                          Text(
                                            'ההתאמה הטובה ביותר',
                                            style: ffTheme.labelSmall.copyWith(
                                              color: ffTheme.primary,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            Stack(
                              children: [
                                PlanCardWidget(plan: plan, currentBill: bill),
                                if (match != null)
                                  Positioned(
                                    top: 12,
                                    left: 12,
                                    child: _MatchBadge(match: match, ffTheme: ffTheme),
                                  ),
                              ],
                            ),
                          ],
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
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutCubic,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: ffTheme.primary,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: ffTheme.primary.withValues(alpha: 0.4),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
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
                        backgroundColor: ffTheme.secondary,
                        foregroundColor: ffTheme.primary,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                      ),
                      child: Text('השוואה ←',
                          style: ffTheme.labelMedium.copyWith(
                              color: ffTheme.primary,
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
      padding: const EdgeInsets.only(left: 8),
      child: GestureDetector(
        onTap: () => setState(() => _providerFilter = isAll ? '' : label),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: active ? ffTheme.tertiary.withValues(alpha: 0.1) : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active ? ffTheme.tertiary : ffTheme.alternate,
              width: active ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: ffTheme.labelSmall.copyWith(
              color: active ? ffTheme.tertiary : ffTheme.primaryText,
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
              padding: const EdgeInsets.only(left: 8),
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
              padding: const EdgeInsets.only(left: 8),
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  appState.toggleFilter(chip.$2);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: active ? ffTheme.primary : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: active ? ffTheme.primary : ffTheme.alternate),
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
              style: ffTheme.displaySmall.copyWith(color: ffTheme.primary),
              decoration: InputDecoration(
                prefixText: '₪',
                prefixStyle: ffTheme.displaySmall.copyWith(color: ffTheme.primary),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 2)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 2)),
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
                  backgroundColor: ffTheme.primary,
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
      'tv': [('סטרימינג', 'streaming'), ('לוויין', 'satellite'), ('ספורט', 'sport'), ('Netflix', 'netflix')],
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
                        selectedColor: ffTheme.primary,
                        backgroundColor: ffTheme.background,
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
                    backgroundColor: ffTheme.primary,
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

class _MatchBadge extends StatelessWidget {
  const _MatchBadge({required this.match, required this.ffTheme});
  final PlanMatch match;
  final AppTheme ffTheme;

  Color _badgeColor() {
    if (match.scorePct >= 85) return const Color(0xFFC9EC4B); // secondary-lime
    if (match.scorePct >= 70) return const Color(0xFF15603E); // primary green
    return const Color(0xFF8E9AA0); // muted
  }

  Color _textColor() {
    if (match.scorePct >= 85) return const Color(0xFF15603E);
    return Colors.white;
  }

  @override
  Widget build(BuildContext context) {
    final badgeColor = _badgeColor();
    final textColor = _textColor();
    final topReason = match.reasons.isNotEmpty ? match.reasons.first : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: badgeColor,
            borderRadius: BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Text(
            '${match.scorePct}% התאמה',
            style: ffTheme.labelSmall.copyWith(
              color: textColor,
              fontWeight: FontWeight.w700,
              fontSize: 10,
            ),
          ),
        ),
        if (topReason != null) ...[
          const SizedBox(height: 3),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.88),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              topReason,
              style: ffTheme.labelSmall.copyWith(
                color: ffTheme.primary,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ],
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: ffTheme.primary,
          borderRadius: BorderRadius.circular(22),
          boxShadow: [BoxShadow(color: ffTheme.primary.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: Colors.white),
            const SizedBox(width: 8),
            Text(label, style: ffTheme.labelMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
          ],
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
    return Semantics(
      button: true,
      label: semanticLabel,
      child: GestureDetector(
      onTap: onTap,
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
    );
  }
}
