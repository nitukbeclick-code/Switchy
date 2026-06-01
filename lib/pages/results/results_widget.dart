import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../components/shimmer_card/shimmer_card_widget.dart';

class ResultsWidget extends StatefulWidget {
  const ResultsWidget({super.key});

  @override
  State<ResultsWidget> createState() => _ResultsWidgetState();
}

class _ResultsWidgetState extends State<ResultsWidget> {
  final _searchController = TextEditingController();
  bool _loading = false;

  static const _categories = [
    ('cellular', '📱 סלולר'),
    ('internet', '🌐 אינטרנט'),
    ('tv', '📺 טלוויזיה'),
    ('triple', '🏠 משולב'),
    ('abroad', '✈️ חו"ל'),
  ];

  static const _sorts = [
    ('match', 'מומלץ'),
    ('price', 'הכי זול'),
    ('save', 'מקסימום חיסכון'),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _switchCategory(FFAppState appState, String cat) async {
    setState(() => _loading = true);
    appState.setCategory(cat);
    _searchController.clear();
    await Future.delayed(const Duration(milliseconds: 700));
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final cat = appState.selectedCat;
    final catData = categoryById(cat);
    final bill = appState.currentBill(cat);

    final plans = filteredPlans(
      cat: cat,
      sort: appState.sortMode,
      filters: appState.activeFilters,
      query: appState.searchQuery,
      budget: 9999,
      currentBill: bill,
    );

    final topPlan = plans.isNotEmpty ? plans.first : null;
    final topSave = topPlan != null ? planSaveYear(topPlan, bill) : 0;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(catData?.name ?? 'תוצאות',
            style: ffTheme.titleLarge.override(color: Colors.white)),
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
                              : Colors.white.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: active
                                ? Colors.white
                                : Colors.white.withOpacity(0.35),
                          ),
                        ),
                        child: Text(
                          c.$2,
                          style: ffTheme.labelMedium.override(
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
                                  color: ffTheme.primary.withOpacity(0.2)),
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
                                    style: ffTheme.labelSmall.override(
                                        color: ffTheme.primary,
                                        fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
                          const Spacer(),
                          Text('${plans.length} מסלולים',
                              style: ffTheme.labelMedium
                                  .override(color: ffTheme.secondaryText)),
                          if (appState.activeFilters.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            GestureDetector(
                              onTap: appState.clearFilters,
                              child: Text('נקה',
                                  style: ffTheme.labelMedium.override(
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
                              color: Colors.black.withOpacity(0.04),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Row(
                          children: [
                            Text('החשבון שלך:',
                                style: ffTheme.bodyMedium
                                    .override(color: ffTheme.secondaryText)),
                            const SizedBox(width: 8),
                            Text('₪$bill',
                                style: ffTheme.titleMedium
                                    .override(color: ffTheme.primary)),
                            const Spacer(),
                            _StepButton(
                              icon: Icons.remove,
                              onTap: () =>
                                  appState.setCurrentBill(cat, bill - 10),
                              ffTheme: ffTheme,
                            ),
                            const SizedBox(width: 8),
                            _StepButton(
                              icon: Icons.add,
                              onTap: () =>
                                  appState.setCurrentBill(cat, bill + 10),
                              ffTheme: ffTheme,
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

              // Sort chips
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 52,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    children: _sorts.map((s) {
                      final active = appState.sortMode == s.$1;
                      return Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: GestureDetector(
                          onTap: () => appState.setSortMode(s.$1),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              color: active
                                  ? ffTheme.primary
                                  : ffTheme.secondaryBackground,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                  color: active
                                      ? ffTheme.primary
                                      : ffTheme.alternate),
                            ),
                            child: Text(
                              s.$2,
                              style: ffTheme.labelMedium.override(
                                color: active
                                    ? Colors.white
                                    : ffTheme.primaryText,
                                fontWeight: active
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
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
                            Text('💡', style: const TextStyle(fontSize: 20)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${topPlan.provider} מומלץ לך',
                                    style: ffTheme.titleSmall
                                        .override(color: Colors.white),
                                  ),
                                  Text(
                                    'תחסוך ₪$topSave בשנה',
                                    style: ffTheme.bodySmall.override(
                                        color: ffTheme.secondary,
                                        fontWeight: FontWeight.w700),
                                  ),
                                ],
                              ),
                            ),
                            Icon(Icons.arrow_forward_ios_rounded,
                                color: Colors.white.withOpacity(0.7), size: 16),
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
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.search_off_rounded,
                            size: 64, color: ffTheme.alternate),
                        const SizedBox(height: 16),
                        Text('לא נמצאו מסלולים',
                            style: ffTheme.titleMedium
                                .override(color: ffTheme.secondaryText)),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: () {
                            appState.clearFilters();
                            _searchController.clear();
                          },
                          child: Text('נקה סינונים',
                              style: ffTheme.bodyMedium
                                  .override(color: ffTheme.primary)),
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
                      (context, index) => PlanCardWidget(
                        plan: plans[index],
                        currentBill: bill,
                      )
                          .animate(delay: (index * 60).ms)
                          .fadeIn(duration: 300.ms)
                          .slideX(begin: 0.05),
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
                      color: ffTheme.primary.withOpacity(0.4),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Text(
                      'השווה ${appState.comparePlans.length} מסלולים',
                      style: ffTheme.titleSmall.override(color: Colors.white),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: () => context.goNamed('Compare'),
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
                          style: ffTheme.labelMedium.override(
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

  Widget _buildQuickFilters(BuildContext context, FFAppState appState, FlutterFlowTheme ffTheme, String cat) {
    const quickFilters = <String, List<(String, String)>>{
      'cellular': [('5G', '5g'), ('ללא התחייבות', 'nocommit'), ('מחיר קבוע', 'fixed'), ('כולל חו"ל', 'abroad')],
      'internet': [('ללא התחייבות', 'nocommit'), ('סיב אופטי', 'fiber'), ('1Gb+', '1g')],
      'tv': [('סטרימינג', 'streaming'), ('ספורט', 'sport'), ('לוויין', 'satellite')],
      'triple': [('כולל Netflix', 'netflix'), ('5G', '5g')],
      'abroad': [('eSIM', 'esim'), ('ללא מנוי', 'nocommit')],
    };
    final chips = quickFilters[cat] ?? const [];
    if (chips.isEmpty) return const SizedBox();

    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        children: chips.map((chip) {
          final active = appState.activeFilters.contains(chip.$2);
          return Padding(
            padding: const EdgeInsets.only(left: 8),
            child: GestureDetector(
              onTap: () => appState.toggleFilter(chip.$2),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: active ? ffTheme.primary.withOpacity(0.1) : Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (active) ...[
                      Icon(Icons.check_rounded, size: 12, color: ffTheme.primary),
                      const SizedBox(width: 4),
                    ],
                    Text(chip.$1, style: ffTheme.labelSmall.override(color: active ? ffTheme.primary : ffTheme.primaryText, fontWeight: active ? FontWeight.w700 : FontWeight.w600)),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  void _showFilters(
      BuildContext context, FFAppState appState, FlutterFlowTheme ffTheme) {
    final Map<String, List<String>> catFilters = {
      'cellular': ['5G', 'ללא התחייבות', 'מחיר קבוע', 'גלישה לחו"ל'],
      'internet': ['ללא התחייבות', 'סיב אופטי', '1000Mb+'],
      'tv': ['סטרימינג', 'לוויין', 'כבלים'],
      'triple': ['כולל סלולר', 'Netflix'],
      'abroad': ['ללא מנוי', 'eSIM'],
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
                          ffTheme.bodyMedium.override(color: ffTheme.error)),
                ),
              ]),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final f in catFilters[appState.selectedCat] ?? [])
                    Builder(builder: (ctx) {
                      final key = f.toLowerCase().replaceAll(' ', '').replaceAll('"', '');
                      final selected = appState.activeFilters.contains(key);
                      return FilterChip(
                        label: Text(f),
                        selected: selected,
                        onSelected: (_) {
                          appState.toggleFilter(key);
                          setModalState(() {});
                        },
                        selectedColor: ffTheme.primary,
                        backgroundColor: ffTheme.background,
                        labelStyle: ffTheme.bodyMedium.override(
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
                          ffTheme.titleSmall.override(color: Colors.white)),
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

class _StepButton extends StatelessWidget {
  const _StepButton(
      {required this.icon, required this.onTap, required this.ffTheme});
  final IconData icon;
  final VoidCallback onTap;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: ffTheme.accent1,
          shape: BoxShape.circle,
          border: Border.all(color: ffTheme.primary.withOpacity(0.25)),
        ),
        child: Icon(icon, size: 18, color: ffTheme.primary),
      ),
    );
  }
}
