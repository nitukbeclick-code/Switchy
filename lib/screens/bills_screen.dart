import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';

class BillsScreen extends StatelessWidget {
  const BillsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final bills = appState.currentBills;
    final total = bills.values.fold(0, (s, v) => s + v);

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildTotalHero(total),
                    const SizedBox(height: 20),
                    _buildChart(),
                    const SizedBox(height: 20),
                    _buildCategorySteppers(context, appState),
                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      color: AppColors.green,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: const Icon(Icons.arrow_back_ios_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          const Text(
            'חשבונות',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTotalHero(int total) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0E3A26), Color(0xFF15603E)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'סה"כ הוצאה חודשית',
            style: TextStyle(
              fontSize: 13,
              color: Colors.white.withOpacity(0.7),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '₪$total',
            style: const TextStyle(
              fontFamily: 'Rubik',
              fontSize: 44,
              fontWeight: FontWeight.w800,
              color: Color(0xFFC9EC4B),
              letterSpacing: -2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '₪${total * 12} בשנה',
            style: TextStyle(
              fontSize: 14,
              color: Colors.white.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChart() {
    // Simulated 6-month bar chart with decreasing trend
    final months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני'];
    final values = [420, 410, 395, 380, 360, 340];
    final maxVal = values.reduce((a, b) => a > b ? a : b).toDouble();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'מגמת הוצאות',
                style: TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.green.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  '↓ 19% ↓',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.green,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 120,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(months.length, (i) {
                final ratio = values[i] / maxVal;
                final isLast = i == months.length - 1;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          '₪${values[i]}',
                          style: TextStyle(
                            fontSize: 9,
                            color: isLast ? AppColors.green : AppColors.inkMuted,
                            fontWeight: isLast ? FontWeight.w800 : FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Container(
                          height: 90 * ratio,
                          decoration: BoxDecoration(
                            color: isLast
                                ? AppColors.green
                                : AppColors.green.withOpacity(0.3),
                            borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(4)),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          months[i],
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.inkMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategorySteppers(BuildContext context, AppState appState) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'חשבון לפי קטגוריה',
          style: TextStyle(
            fontFamily: 'Rubik',
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 12),
        ...kCategories.map((cat) {
          final bill = appState.currentBills[cat.id] ?? 0;
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Text(cat.icon, style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    cat.name,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () {
                    final newBill = (bill - 10).clamp(0, 1000);
                    appState.setCurrentBill(cat.id, newBill);
                  },
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.paper,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.border),
                    ),
                    child: const Icon(Icons.remove_rounded,
                        size: 16, color: AppColors.ink),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  '₪$bill',
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(width: 10),
                GestureDetector(
                  onTap: () {
                    appState.setCurrentBill(cat.id, bill + 10);
                  },
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.green,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.add_rounded,
                        size: 16, color: Colors.white),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
