import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';

class BillsWidget extends StatefulWidget {
  const BillsWidget({super.key});

  @override
  State<BillsWidget> createState() => _BillsWidgetState();
}

class _BillsWidgetState extends State<BillsWidget> {
  int _touchedIndex = -1;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);

    final activeCats = categories.where((c) => appState.currentBill(c.id) > 0).toList();
    final total = categories.fold<int>(0, (sum, c) => sum + appState.currentBill(c.id));
    final totalSavings = categories.fold<int>(0, (sum, c) {
      final bill = appState.currentBill(c.id);
      if (bill <= 0) return sum;
      final plans = plansByCat(c.id);
      if (plans.isEmpty) return sum;
      final minPrice = plans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
      return sum + ((bill - minPrice) * 12).clamp(0, 999999);
    });

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('החשבונות שלי'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
        actions: [
          TextButton(
            onPressed: () => context.pushNamed('Results'),
            child: Text('השווה עכשיו', style: ffTheme.labelMedium.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Hero total card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [Color(0xFF0E3A26), Color(0xFF15603E)],
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('הוצאה חודשית כוללת', style: GoogleFonts.assistant(fontSize: 13, color: const Color(0xFFC9EC4B), fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Text('₪$total', style: GoogleFonts.rubik(fontSize: 48, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1.5)),
                  Text('לחודש בכל הקטגוריות', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white60)),
                  if (totalSavings > 0) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('💡', style: TextStyle(fontSize: 16)),
                          const SizedBox(width: 8),
                          Text('חיסכון פוטנציאלי: ₪$totalSavings/שנה',
                              style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: const Color(0xFFC9EC4B))),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.97, 0.97), end: const Offset(1, 1)),

            const SizedBox(height: 20),

            // Bar chart
            if (activeCats.isNotEmpty) ...[
              Text('פילוח לפי קטגוריה', style: ffTheme.titleMedium),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(12, 20, 12, 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ffTheme.alternate),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 12)],
                ),
                child: Column(
                  children: [
                    SizedBox(
                      height: 160,
                      child: BarChart(
                        BarChartData(
                          alignment: BarChartAlignment.spaceAround,
                          maxY: activeCats.map((c) => appState.currentBill(c.id).toDouble()).reduce((a, b) => a > b ? a : b) * 1.3,
                          barTouchData: BarTouchData(
                            touchCallback: (event, response) {
                              setState(() {
                                _touchedIndex = response?.spot?.touchedBarGroupIndex ?? -1;
                              });
                            },
                            touchTooltipData: BarTouchTooltipData(
                              getTooltipColor: (_) => const Color(0xFF0E3A26),
                              getTooltipItem: (group, groupIndex, rod, rodIndex) {
                                return BarTooltipItem(
                                  '₪${rod.toY.toInt()}',
                                  GoogleFonts.rubik(color: const Color(0xFFC9EC4B), fontWeight: FontWeight.w700, fontSize: 13),
                                );
                              },
                            ),
                          ),
                          titlesData: FlTitlesData(
                            show: true,
                            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                            bottomTitles: AxisTitles(
                              sideTitles: SideTitles(
                                showTitles: true,
                                getTitlesWidget: (value, meta) {
                                  final i = value.toInt();
                                  if (i >= activeCats.length) return const SizedBox();
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(activeCats[i].icon, style: const TextStyle(fontSize: 18)),
                                  );
                                },
                              ),
                            ),
                          ),
                          borderData: FlBorderData(show: false),
                          gridData: FlGridData(
                            show: true,
                            horizontalInterval: 50,
                            getDrawingHorizontalLine: (v) => FlLine(color: ffTheme.alternate, strokeWidth: 1, dashArray: [4, 4]),
                            drawVerticalLine: false,
                          ),
                          barGroups: activeCats.asMap().entries.map((entry) {
                            final i = entry.key;
                            final cat = entry.value;
                            final bill = appState.currentBill(cat.id).toDouble();
                            final isTouch = i == _touchedIndex;
                            return BarChartGroupData(
                              x: i,
                              barRods: [
                                BarChartRodData(
                                  toY: bill,
                                  color: isTouch ? const Color(0xFF0E3A26) : const Color(0xFF15603E),
                                  width: isTouch ? 28 : 24,
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                                  backDrawRodData: BackgroundBarChartRodData(
                                    show: true,
                                    toY: activeCats.map((c) => appState.currentBill(c.id).toDouble()).reduce((a, b) => a > b ? a : b) * 1.3,
                                    color: const Color(0xFFF4F0E8),
                                  ),
                                ),
                              ],
                            );
                          }).toList(),
                        ),
                        duration: const Duration(milliseconds: 500),
                        curve: Curves.easeInOut,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Legend
                    Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: activeCats.map((c) => Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(c.icon, style: const TextStyle(fontSize: 14)),
                          const SizedBox(width: 4),
                          Text(c.name, style: ffTheme.labelSmall),
                          const SizedBox(width: 4),
                          Text('₪${appState.currentBill(c.id)}', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                        ],
                      )).toList(),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 150.ms),

              const SizedBox(height: 24),
            ],

            Text('עדכן חשבונות', style: ffTheme.titleMedium),
            const SizedBox(height: 4),
            Text('הכנס את הסכום שאתה משלם כיום', style: ffTheme.bodySmall),
            const SizedBox(height: 14),

            ...categories.asMap().entries.map((entry) {
              final i = entry.key;
              final cat = entry.value;
              final bill = appState.currentBill(cat.id);
              final plans = plansByCat(cat.id);
              final minPrice = plans.isEmpty ? 0 : plans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
              final yearlySave = bill > 0 ? ((bill - minPrice) * 12).clamp(0, 999999) : 0;

              return _BillCard(
                category: cat,
                currentBill: bill,
                yearlySave: yearlySave,
                onDecrease: () => appState.setCurrentBill(cat.id, (bill - 10).clamp(0, 2000)),
                onIncrease: () => appState.setCurrentBill(cat.id, (bill + 10).clamp(0, 2000)),
                onSetValue: (v) => appState.setCurrentBill(cat.id, v),
                onTap: () {
                  appState.setCategory(cat.id);
                  context.pushNamed('Results');
                },
                ffTheme: ffTheme,
              ).animate(delay: (i * 70).ms).fadeIn(duration: 350.ms).slideX(begin: 0.05, end: 0);
            }),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _BillCard extends StatelessWidget {
  const _BillCard({
    required this.category,
    required this.currentBill,
    required this.yearlySave,
    required this.onDecrease,
    required this.onIncrease,
    required this.onSetValue,
    required this.onTap,
    required this.ffTheme,
  });
  final Category category;
  final int currentBill;
  final int yearlySave;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;
  final ValueChanged<int> onSetValue;
  final VoidCallback onTap;
  final FlutterFlowTheme ffTheme;

  static const Map<String, List<int>> _presets = {
    'cellular': [29, 49, 89, 129],
    'internet': [79, 99, 149, 199],
    'tv': [49, 89, 149, 199],
    'triple': [199, 279, 349, 449],
    'abroad': [19, 39, 69, 99],
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: currentBill > 0 ? ffTheme.primary.withOpacity(0.2) : ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10)],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(child: Text(category.icon, style: const TextStyle(fontSize: 22))),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(category.name, style: ffTheme.titleSmall),
                    if (currentBill > 0 && yearlySave > 0)
                      Text('חיסכון פוטנציאלי: ₪$yearlySave/שנה',
                          style: ffTheme.labelSmall.override(color: ffTheme.success, fontWeight: FontWeight.w600)),
                    if (currentBill == 0)
                      Text('לא בשימוש', style: ffTheme.labelSmall),
                  ],
                ),
              ),
              // Stepper
              Row(
                children: [
                  _RoundBtn(icon: Icons.remove, color: ffTheme.alternate, iconColor: ffTheme.secondaryText, onTap: onDecrease),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Text(
                      '₪$currentBill',
                      style: ffTheme.titleSmall.override(
                        color: currentBill > 0 ? ffTheme.primary : ffTheme.secondaryText,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  _RoundBtn(icon: Icons.add, color: ffTheme.primary, iconColor: Colors.white, onTap: onIncrease),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Quick-preset chips
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: (_presets[category.id] ?? [49, 99, 149, 199]).map((preset) {
              final isActive = currentBill == preset;
              return GestureDetector(
                onTap: () => onSetValue(preset),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: isActive ? ffTheme.primary : ffTheme.background,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: isActive ? ffTheme.primary : ffTheme.alternate),
                  ),
                  child: Text(
                    '₪$preset',
                    style: ffTheme.labelSmall.override(
                      color: isActive ? Colors.white : ffTheme.secondaryText,
                      fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          if (currentBill > 0 && yearlySave > 0) ...[
            const SizedBox(height: 10),
            GestureDetector(
              onTap: onTap,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ffTheme.primary.withOpacity(0.15)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.search_rounded, size: 14, color: ffTheme.primary),
                    const SizedBox(width: 6),
                    Text('חפש חבילות זולות יותר', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RoundBtn extends StatelessWidget {
  const _RoundBtn({required this.icon, required this.color, required this.iconColor, required this.onTap});
  final IconData icon;
  final Color color;
  final Color iconColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: Icon(icon, size: 17, color: iconColor),
      ),
    );
  }
}
