import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';
import '../models.dart';
import '../widgets/logo_widget.dart';

class CompareScreen extends StatelessWidget {
  const CompareScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final compareIds = appState.comparePlans;
    final plans = compareIds.map((id) => planById(id)).whereType<Plan>().toList();

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Column(
        children: [
          _buildHeader(context, appState),
          Expanded(
            child: plans.length < 2
                ? _buildEmpty(context)
                : _buildTable(context, plans, appState),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, AppState appState) {
    final statusH = MediaQuery.of(context).padding.top;
    return Container(
      color: AppColors.green,
      padding: EdgeInsets.fromLTRB(16, statusH + 12, 16, 16),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'השוואת מסלולים',
              style: TextStyle(
                fontFamily: 'Rubik',
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
          if (appState.comparePlans.isNotEmpty)
            TextButton(
              onPressed: () => appState.clearCompare(),
              child: const Text(
                'נקה',
                style: TextStyle(color: Colors.white70, fontSize: 14),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('📊', style: TextStyle(fontSize: 56)),
            const SizedBox(height: 20),
            const Text(
              'בחרו 2–3 מסלולים להשוואה',
              style: TextStyle(
                fontFamily: 'Rubik',
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'לחצו על כפתור + בכרטיס מסלול כדי להוסיף להשוואה',
              style: TextStyle(
                fontSize: 15,
                color: AppColors.inkMuted,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: () => context.push('/results'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                    vertical: 14, horizontal: 28),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'עיין במסלולים',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTable(
      BuildContext context, List<Plan> plans, AppState appState) {
    final cat = plans.isNotEmpty
        ? kCategories.firstWhere((c) => c.id == plans.first.cat,
            orElse: () => kCategories.first)
        : kCategories.first;
    final bill = appState.currentBills[cat.id] ?? 0;

    final rows = [
      'מחיר חודשי',
      'אחרי מבצע',
      'התחייבות',
      'חיסכון שנתי',
      'דירוג',
      'רשת',
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SingleChildScrollView(
        child: Column(
          children: [
            // Header row
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 120,
                  child: Container(
                    height: 100,
                    color: AppColors.paper,
                  ),
                ),
                ...plans.map((p) => _buildPlanColumn(context, p, bill)),
              ],
            ),
            // Data rows
            ...rows.asMap().entries.map((entry) {
              final i = entry.key;
              final rowLabel = entry.value;
              return _buildDataRow(rowLabel, plans, bill, i.isEven);
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildPlanColumn(BuildContext context, Plan plan, int bill) {
    final savings = plan.savingsPerYear(bill);
    return Container(
      width: 160,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: plan.best ? AppColors.lime.withOpacity(0.1) : AppColors.card,
        border: Border(
          left: BorderSide(color: AppColors.border),
          bottom: BorderSide(color: AppColors.border),
        ),
      ),
      child: Column(
        children: [
          LogoWidget(provider: plan.provider, size: 44),
          const SizedBox(height: 8),
          Text(
            plan.provider,
            style: const TextStyle(
              fontFamily: 'Rubik',
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
            textAlign: TextAlign.center,
          ),
          Text(
            plan.plan,
            style: const TextStyle(fontSize: 11, color: AppColors.inkMuted),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: () => context.push('/lead/${plan.id}'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.green,
              foregroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 32),
              padding: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
            child: const Text('בחירה'),
          ),
        ],
      ),
    );
  }

  Widget _buildDataRow(
      String label, List<Plan> plans, int bill, bool shaded) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 120,
          padding: const EdgeInsets.all(14),
          color: shaded ? AppColors.paper : Colors.white,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkMuted,
            ),
          ),
        ),
        ...plans.map((p) {
          final value = _getValue(p, label, bill);
          return Container(
            width: 160,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: shaded
                  ? AppColors.paper.withOpacity(0.5)
                  : Colors.white,
              border: const Border(
                left: BorderSide(color: AppColors.border),
              ),
            ),
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
              textAlign: TextAlign.center,
            ),
          );
        }),
      ],
    );
  }

  String _getValue(Plan p, String row, int bill) {
    switch (row) {
      case 'מחיר חודשי':
        return p.displayPrice;
      case 'אחרי מבצע':
        return p.displayAfter ?? '—';
      case 'התחייבות':
        return p.term != null ? '${p.term} חודש' : 'ללא';
      case 'חיסכון שנתי':
        final s = p.savingsPerYear(bill);
        return s > 0 ? '₪$s' : '—';
      case 'דירוג':
        return '${p.rating} ⭐';
      case 'רשת':
        return p.net;
      default:
        return '—';
    }
  }
}
