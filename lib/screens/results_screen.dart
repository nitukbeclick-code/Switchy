import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';
import '../models.dart';
import '../widgets/plan_card.dart';

class ResultsScreen extends StatefulWidget {
  const ResultsScreen({super.key});

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final plans = appState.filteredPlans;
    final bill = appState.currentBill;
    final cat = kCategories.firstWhere((c) => c.id == appState.cat);
    final compareCount = appState.comparePlans.length;
    final bestPlan = appState.bestSavingPlan;

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Stack(
        children: [
          Column(
            children: [
              _buildHeader(appState),
              _buildCategoryChips(appState),
              _buildSearchBar(appState),
              _buildFreshnessAndBill(appState, cat, bill),
              _buildSortAndFilter(appState, cat),
              if (bestPlan != null) _buildAIBanner(bestPlan, bill),
              Expanded(
                child: plans.isEmpty
                    ? _buildEmpty()
                    : ListView.builder(
                        padding: EdgeInsets.fromLTRB(
                            16, 8, 16, compareCount > 0 ? 100 : 32),
                        itemCount: plans.length,
                        itemBuilder: (ctx, i) => PlanCard(
                          plan: plans[i],
                          currentBill: bill,
                        ),
                      ),
              ),
            ],
          ),
          if (compareCount > 0) _buildCompareBar(compareCount),
        ],
      ),
    );
  }

  Widget _buildHeader(AppState appState) {
    final statusH = MediaQuery.of(context).padding.top;
    return Container(
      color: AppColors.green,
      padding: EdgeInsets.fromLTRB(16, statusH + 12, 16, 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: const Icon(Icons.arrow_back_ios_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'מסלולים',
              style: TextStyle(
                fontFamily: 'Rubik',
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
          GestureDetector(
            onTap: () => context.push('/quiz'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.tune_rounded, color: Colors.white, size: 16),
                  SizedBox(width: 4),
                  Text(
                    'שאלון',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
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

  Widget _buildCategoryChips(AppState appState) {
    return Container(
      color: AppColors.green,
      height: 48,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
        itemCount: kCategories.length,
        itemBuilder: (ctx, i) {
          final cat = kCategories[i];
          final active = cat.id == appState.cat;
          return GestureDetector(
            onTap: () => appState.setCat(cat.id),
            child: Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: active ? AppColors.lime : Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(cat.icon, style: const TextStyle(fontSize: 13)),
                  const SizedBox(width: 5),
                  Text(
                    cat.name,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: active ? AppColors.greenDark : Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSearchBar(AppState appState) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: TextField(
        controller: _searchCtrl,
        textDirection: TextDirection.rtl,
        onChanged: appState.setSearchQuery,
        decoration: InputDecoration(
          hintText: 'חפשו ספק או מסלול...',
          hintTextDirection: TextDirection.rtl,
          prefixIcon: const Icon(Icons.search_rounded, color: AppColors.inkMuted),
          suffixIcon: appState.searchQuery.isNotEmpty
              ? GestureDetector(
                  onTap: () {
                    _searchCtrl.clear();
                    appState.setSearchQuery('');
                  },
                  child: const Icon(Icons.close_rounded,
                      color: AppColors.inkMuted, size: 18),
                )
              : null,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        ),
      ),
    );
  }

  Widget _buildFreshnessAndBill(AppState appState, Category cat, int bill) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Row(
        children: [
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.green.withOpacity(0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: AppColors.green,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                const Text(
                  'מחירים עודכנו היום',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.green,
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          const Text(
            'חשבון נוכחי: ',
            style: TextStyle(fontSize: 12, color: AppColors.inkMuted),
          ),
          GestureDetector(
            onTap: () => _showBillEditor(appState, cat, bill),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.paper,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '₪$bill',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.edit_rounded,
                      size: 12, color: AppColors.inkMuted),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showBillEditor(AppState appState, Category cat, int bill) {
    int tempBill = bill;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'החשבון החודשי שלכם',
                style: const TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                cat.name,
                style: const TextStyle(color: AppColors.inkMuted),
              ),
              const SizedBox(height: 24),
              Text(
                '₪$tempBill',
                style: const TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 40,
                  fontWeight: FontWeight.w800,
                  color: AppColors.green,
                ),
              ),
              Slider(
                value: tempBill.toDouble(),
                min: 0,
                max: 500,
                divisions: 50,
                activeColor: AppColors.green,
                onChanged: (v) => setS(() => tempBill = v.round()),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    appState.setCurrentBill(appState.cat, tempBill);
                    Navigator.pop(ctx);
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.green,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  child: const Text('אישור'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSortAndFilter(AppState appState, Category cat) {
    final sortOptions = [
      ('recommended', 'מומלץ'),
      ('cheapest', 'הזול ביותר'),
      ('savings', 'חיסכון מקסימלי'),
    ];

    final filterOptions = _filtersForCat(cat.id);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: sortOptions.map((opt) {
                final active = appState.sortMode == opt.$1;
                return GestureDetector(
                  onTap: () => appState.setSortMode(opt.$1),
                  child: Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? AppColors.green : AppColors.card,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: active ? AppColors.green : AppColors.border,
                      ),
                    ),
                    child: Text(
                      opt.$2,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: active ? Colors.white : AppColors.inkMuted,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          if (filterOptions.isNotEmpty) ...[
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: filterOptions.map((f) {
                  final active = appState.activeFilters.contains(f.$1);
                  return GestureDetector(
                    onTap: () => appState.toggleFilter(f.$1),
                    child: Container(
                      margin: const EdgeInsets.only(left: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: active
                            ? AppColors.lime.withOpacity(0.4)
                            : AppColors.paper,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: active
                              ? AppColors.lime
                              : AppColors.border,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (active)
                            Padding(
                              padding: const EdgeInsets.only(left: 4),
                              child: const Icon(Icons.check_rounded,
                                  size: 12, color: AppColors.green),
                            ),
                          Text(
                            f.$2,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: active
                                  ? AppColors.green
                                  : AppColors.inkMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  List<(String, String)> _filtersForCat(String catId) {
    switch (catId) {
      case 'cellular':
        return [
          ('5g', '5G'),
          ('nocommit', 'ללא התחייבות'),
          ('fixed', 'מחיר קבוע'),
          ('abroad', 'חו"ל כלול'),
          ('family', 'משפחה'),
        ];
      case 'internet':
        return [('fiber', 'סיב אופטי'), ('satellite', 'לווין')];
      case 'tv':
        return [
          ('streaming', 'סטרימינג'),
          ('cable', 'כבל'),
          ('premium', 'פרימיום'),
        ];
      case 'triple':
        return [('fiber', 'סיב'), ('bundle', 'חבילה')];
      case 'abroad':
        return [
          ('europe', 'אירופה'),
          ('worldwide', 'עולמי'),
          ('esim', 'eSIM'),
        ];
      default:
        return [];
    }
  }

  Widget _buildAIBanner(Plan bestPlan, int bill) {
    final savings = bestPlan.savingsPerYear(bill);
    if (savings <= 0) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.green.withOpacity(0.9),
              AppColors.greenLight.withOpacity(0.9)
            ],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.lime,
                shape: BoxShape.circle,
              ),
              child: const Text('✦', style: TextStyle(fontSize: 12)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'ממליצים על ${bestPlan.provider} — תחסכו ₪$savings בשנה',
                style: const TextStyle(
                  fontSize: 13,
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            GestureDetector(
              onTap: () => context.push('/plan/${bestPlan.id}'),
              child: const Text(
                'לפרטים ←',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.lime,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🔍', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 16),
          const Text(
            'לא נמצאו מסלולים',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'נסו לשנות את הפילטרים',
            style: TextStyle(color: AppColors.inkMuted),
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () =>
                context.read<AppState>().clearFilters(),
            child: const Text('נקה פילטרים'),
          ),
        ],
      ),
    );
  }

  Widget _buildCompareBar(int count) {
    return Positioned(
      bottom: 16,
      left: 16,
      right: 16,
      child: GestureDetector(
        onTap: () => context.push('/compare'),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.ink,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.2),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              const Icon(Icons.compare_arrows_rounded,
                  color: AppColors.lime, size: 22),
              const SizedBox(width: 10),
              Text(
                'השווה ($count מסלולים)',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const Spacer(),
              const Text('←',
                  style: TextStyle(color: AppColors.lime, fontSize: 18)),
            ],
          ),
        ),
      ),
    );
  }
}
