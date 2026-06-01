import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';

class ResultsWidget extends StatefulWidget {
  const ResultsWidget({super.key});

  @override
  State<ResultsWidget> createState() => _ResultsWidgetState();
}

class _ResultsWidgetState extends State<ResultsWidget> {
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
      budget: appState.quizBudget > 0 ? appState.quizBudget : 9999,
      currentBill: bill,
    );

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: Text(catData?.name ?? 'תוצאות'),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune_rounded),
            onPressed: () => _showFilters(context, appState, ffTheme),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextField(
              onChanged: appState.setSearch,
              decoration: InputDecoration(
                hintText: 'חיפוש ספק או חבילה...',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: appState.searchQuery.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.clear_rounded), onPressed: () => appState.setSearch(''))
                    : null,
              ),
            ),
          ),

          // Sort chips
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                ('match', 'הכי מתאים'),
                ('price', 'מחיר'),
                ('save', 'חיסכון'),
              ].map((s) => Padding(
                padding: const EdgeInsets.only(left: 8),
                child: _SortChip(
                  label: s.$2,
                  selected: appState.sortMode == s.$1,
                  onTap: () => appState.setSortMode(s.$1),
                  ffTheme: ffTheme,
                ),
              )).toList(),
            ),
          ),

          // Results count
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                Text('${plans.length} חבילות', style: ffTheme.labelMedium),
                const Spacer(),
                if (appState.activeFilters.isNotEmpty)
                  TextButton(
                    onPressed: appState.clearFilters,
                    child: Text('נקה פילטרים', style: ffTheme.labelMedium.override(color: ffTheme.error)),
                  ),
              ],
            ),
          ),

          // Plan list
          Expanded(
            child: plans.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text('😔', style: TextStyle(fontSize: 48)),
                        const SizedBox(height: 16),
                        Text('לא נמצאו חבילות', style: ffTheme.titleMedium),
                        TextButton(onPressed: appState.clearFilters, child: const Text('נקה פילטרים')),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: plans.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => _PlanCard(plan: plans[i], bill: bill, ffTheme: ffTheme),
                  ),
          ),
        ],
      ),
    );
  }

  void _showFilters(BuildContext context, FFAppState appState, FlutterFlowTheme ffTheme) {
    final filters = [
      ('5g', '5G'),
      ('nocommit', 'ללא התחייבות'),
      ('fixed', 'מחיר קבוע'),
      ('abroad', 'חו"ל'),
    ];
    showModalBottomSheet(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('סינון', style: ffTheme.titleLarge),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: filters.map((f) => FilterChip(
                label: Text(f.$2),
                selected: appState.activeFilters.contains(f.$1),
                onSelected: (_) => appState.toggleFilter(f.$1),
                selectedColor: ffTheme.accent1,
                checkmarkColor: ffTheme.primary,
              )).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _SortChip extends StatelessWidget {
  const _SortChip({required this.label, required this.selected, required this.onTap, required this.ffTheme});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? ffTheme.primary : ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? ffTheme.primary : ffTheme.alternate),
        ),
        child: Text(label, style: ffTheme.labelMedium.override(color: selected ? Colors.white : ffTheme.primaryText)),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.bill, required this.ffTheme});
  final Plan plan;
  final int bill;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<FFAppState>(context);
    final savings = planSaveYear(plan, bill);
    final inCompare = appState.isInCompare(plan.id);

    return GestureDetector(
      onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: plan.highlight ? ffTheme.primary.withOpacity(0.4) : ffTheme.alternate,
            width: plan.highlight ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (plan.highlight)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: ffTheme.secondary, borderRadius: BorderRadius.circular(8)),
                child: Text('מומלץ', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
              ),

            Row(
              children: [
                LogoWidget(provider: plan.provider, size: 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plan.provider, style: ffTheme.titleSmall),
                      Text(plan.plan, style: ffTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('₪${plan.price}', style: ffTheme.headlineSmall.override(color: ffTheme.primary)),
                    Text('/חודש', style: ffTheme.labelSmall),
                  ],
                ),
              ],
            ),

            if (savings > 0) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(8)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.savings_rounded, size: 14, color: ffTheme.success),
                    const SizedBox(width: 6),
                    Text('חסכו ${formatPrice(savings)} בשנה', style: ffTheme.labelSmall.override(color: ffTheme.success, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => appState.toggleCompare(plan.id),
                    icon: Icon(inCompare ? Icons.check_rounded : Icons.compare_arrows_rounded, size: 16),
                    label: Text(inCompare ? 'בהשוואה' : 'השווה', style: ffTheme.labelSmall),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: inCompare ? ffTheme.primary : ffTheme.secondaryText,
                      side: BorderSide(color: inCompare ? ffTheme.primary : ffTheme.alternate),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => context.pushNamed('Lead', pathParameters: {'planId': plan.id}),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: ffTheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                    child: Text('בחרו', style: ffTheme.labelSmall.override(color: Colors.white)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
