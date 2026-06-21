import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../services/savings_summary.dart';
import '../../services/backend/local_backend.dart';

class BillsWidget extends StatefulWidget {
  const BillsWidget({super.key});

  @override
  State<BillsWidget> createState() => _BillsWidgetState();
}

/// A single category's "are you overpaying?" benchmark, derived ONLY from the
/// user's own entered bill and the REAL catalogue. [cheapest] is the cheapest
/// comparable (regular, monthly-priced) plan in the category; [annualSaving] is
/// the recommendation engine's figure for that category so every savings surface
/// agrees. Pure — no fabricated benchmarks.
class _Overpay {
  const _Overpay({
    required this.category,
    required this.bill,
    required this.cheapest,
    required this.annualSaving,
  });

  final Category category;
  final int bill;
  final Plan cheapest;
  final int annualSaving;

  /// ₪/month the user pays above the cheapest real plan (never negative).
  int get monthlyGap => (bill - cheapest.priceValue).round().clamp(0, 999999);

  /// How much higher the bill is than the cheapest plan, as a percentage.
  int get overPct =>
      cheapest.priceValue <= 0 ? 0 : ((monthlyGap / cheapest.priceValue) * 100).round();
}

/// Build the overpay benchmark for every category where the user has entered a
/// bill and a cheaper REAL, comparable (regular + monthly) plan exists. Abroad
/// (per-day / per-package pricing) is naturally excluded because its plans
/// aren't monthly — comparing a monthly bill to a per-day rate would mislead.
/// Sorted by annual saving, biggest opportunity first.
List<_Overpay> _overpaysFor(AppState appState, Map<String, int> savingByCat) {
  final out = <_Overpay>[];
  for (final cat in categories) {
    final bill = appState.currentBill(cat.id);
    if (bill <= 0) continue;
    // Cheapest comparable real plan: an ordinary monthly subscriber line.
    Plan? cheapest;
    for (final p in plansByCat(cat.id)) {
      if (!p.isRegular || p.unit != 'month') continue;
      if (cheapest == null || p.priceValue < cheapest.priceValue) cheapest = p;
    }
    if (cheapest == null || cheapest.priceValue >= bill) continue;
    out.add(_Overpay(
      category: cat,
      bill: bill,
      cheapest: cheapest,
      annualSaving: savingByCat[cat.id] ?? 0,
    ));
  }
  out.sort((a, b) => b.annualSaving.compareTo(a.annualSaving));
  return out;
}

class _BillsWidgetState extends State<BillsWidget> {
  int _touchedIndex = -1;

  /// A formal monochrome ramp (ink → grey → light) for the per-category bars so
  /// each category reads as a distinct shade in greyscale. Indexed by position;
  /// wraps if there are more categories than steps.
  static const List<Color> _barRamp = [
    Color(0xFF111827), // ink black
    Color(0xFF374151), // slate
    Color(0xFF6B7280), // grey
    Color(0xFF9CA3AF), // light grey
    Color(0xFFCBD2D9), // pale grey
  ];

  @override
  void dispose() {
    appBackend.upsertBills(AppState().currentBills).catchError((_) {});
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final activeCats = categories.where((c) => appState.currentBill(c.id) > 0).toList();
    final total = categories.fold<int>(0, (sum, c) => sum + appState.currentBill(c.id));
    // Use the same recommendation-engine figures as the home hero and the
    // /savings dashboard, so all three savings surfaces agree.
    final summary = computeSavings(appState);
    final savingByCat = {for (final c in summary.categories) c.categoryId: c.annualSaving};
    final totalSavings = summary.totalAnnualPotential;

    // "איפה אתם משלמים יותר מדי" — real catalogue benchmarks, biggest first.
    final overpays = _overpaysFor(appState, savingByCat);
    final worst = overpays.isNotEmpty ? overpays.first : null;
    // Until the user personalises their bills, every saving is an estimate.
    final estimate = !appState.billsPersonalized;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('החשבונות שלי'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
        actions: [
          if (total > 0)
            IconButton(
              icon: Icon(Icons.refresh_rounded, color: ffTheme.secondaryText, size: 20),
              tooltip: 'אפס הכל',
              onPressed: () {
                final appState = Provider.of<AppState>(context, listen: false);
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    title: const Text('איפוס חשבונות', textAlign: TextAlign.center),
                    content: const Text('לאפס את כל הסכומים לאפס?', textAlign: TextAlign.center),
                    actionsAlignment: MainAxisAlignment.center,
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('ביטול')),
                      ElevatedButton(
                        onPressed: () { Navigator.pop(ctx); appState.resetAllBills(); appBackend.upsertBills(AppState().currentBills).catchError((_) {}); },
                        style: ElevatedButton.styleFrom(backgroundColor: ffTheme.error, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                        child: const Text('אפס'),
                      ),
                    ],
                  ),
                );
              },
            ),
          TextButton(
            onPressed: () => context.pushNamed('Results'),
            child: Text('השווה עכשיו', style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
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
                gradient: LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [ffTheme.primaryDark, ffTheme.primary],
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('הוצאה חודשית כוללת', style: GoogleFonts.assistant(fontSize: 13, color: ffTheme.secondary, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Text('₪$total', style: GoogleFonts.rubik(fontSize: 48, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1.5)),
                  Text('לחודש בכל הקטגוריות', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white60)),
                  if (totalSavings > 0) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: ffTheme.saving.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: ffTheme.saving.withValues(alpha: 0.45)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.lightbulb_rounded, size: 16, color: ffTheme.saving),
                          const SizedBox(width: 8),
                          Text('חיסכון פוטנציאלי: ₪$totalSavings/שנה',
                              style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: ffTheme.saving)),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.97, 0.97), end: const Offset(1, 1)),

            const SizedBox(height: 16),

            // Empty state — no bills yet: explain what this screen gives and
            // point at the editor below instead of showing a bare ₪0 page.
            if (total == 0)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: ffTheme.glassDecoration(alpha: 0.72),
                child: Column(
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(16)),
                      child: Icon(Icons.receipt_long_rounded, size: 26, color: ffTheme.primary),
                    ),
                    const SizedBox(height: 12),
                    Text('עוד לא הזנתם חשבונות', style: ffTheme.titleSmall, textAlign: TextAlign.center),
                    const SizedBox(height: 4),
                    Text(
                      'בחרו למטה כמה אתם משלמים היום בכל קטגוריה — ונראה לכם מיד איפה אפשר לחסוך.',
                      style: ffTheme.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 10),
                    Icon(Icons.keyboard_double_arrow_down_rounded, size: 20, color: ffTheme.secondaryText),
                  ],
                ),
              ).animate().fadeIn(delay: 120.ms).slideY(begin: 0.05, end: 0),

            // Savings ring
            if (total > 0 && totalSavings > 0)
              _SavingsRing(
                total: total,
                totalSavings: totalSavings,
                ffTheme: ffTheme,
              ).animate().fadeIn(delay: 200.ms),

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
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12)],
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
                              getTooltipColor: (_) => ffTheme.primaryDark,
                              getTooltipItem: (group, groupIndex, rod, rodIndex) {
                                return BarTooltipItem(
                                  '₪${rod.toY.toInt()}',
                                  GoogleFonts.rubik(color: ffTheme.secondary, fontWeight: FontWeight.w700, fontSize: 13),
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
                                    child: Icon(categoryIconData(activeCats[i].id), size: 16, color: ffTheme.secondaryText),
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
                            final barColor = _barRamp[i % _barRamp.length];
                            return BarChartGroupData(
                              x: i,
                              barRods: [
                                BarChartRodData(
                                  toY: bill,
                                  color: isTouch ? ffTheme.primaryDark : barColor,
                                  width: isTouch ? 28 : 24,
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                                  backDrawRodData: BackgroundBarChartRodData(
                                    show: true,
                                    toY: activeCats.map((c) => appState.currentBill(c.id).toDouble()).reduce((a, b) => a > b ? a : b) * 1.3,
                                    color: ffTheme.accent2,
                                  ),
                                ),
                              ],
                            );
                          }).toList(),
                        ),
                        swapAnimationDuration: const Duration(milliseconds: 500),
                        swapAnimationCurve: Curves.easeInOut,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Legend — swatch matches each bar's ramp shade.
                    Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: activeCats.asMap().entries.map((e) {
                        final i = e.key;
                        final c = e.value;
                        final shade = _barRamp[i % _barRamp.length];
                        return Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                color: shade,
                                borderRadius: BorderRadius.circular(3),
                                border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.25), width: 0.5),
                              ),
                            ),
                            const SizedBox(width: 5),
                            Icon(categoryIconData(c.id), size: 13, color: ffTheme.secondaryText),
                            const SizedBox(width: 4),
                            Text(c.name, style: ffTheme.labelSmall),
                            const SizedBox(width: 4),
                            Text('₪${appState.currentBill(c.id)}', style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
                          ],
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 150.ms),

              const SizedBox(height: 24),
            ],

            // ── "איפה אתם משלמים יותר מדי" — overpay insights ─────────────────
            if (overpays.isNotEmpty) ...[
              Row(
                children: [
                  Text('איפה אתם משלמים יותר מדי', style: ffTheme.titleMedium),
                  const SizedBox(width: 8),
                  Icon(Icons.search_rounded, size: 16, color: ffTheme.primaryText),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                estimate
                    ? 'השוואה לחבילה הזולה ביותר בקטלוג — הערכה עד שתעדכנו את הסכומים'
                    : 'השוואה לחבילה הזולה ביותר בקטלוג בכל קטגוריה',
                style: ffTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              ...overpays.asMap().entries.map((entry) {
                final i = entry.key;
                final o = entry.value;
                return _OverpayCard(
                  overpay: o,
                  isWorst: i == 0,
                  estimate: estimate,
                  ffTheme: ffTheme,
                  onCompare: () {
                    appState.setCategory(o.category.id);
                    context.pushNamed('Results');
                  },
                ).animate(delay: (i * 80).ms).fadeIn(duration: 350.ms).slideY(begin: 0.06, end: 0);
              }),

              // Single strong CTA — fix the worst category.
              if (worst != null && worst.annualSaving > 0) ...[
                const SizedBox(height: 6),
                _WorstCategoryCta(
                  worst: worst,
                  estimate: estimate,
                  ffTheme: ffTheme,
                  onTap: () {
                    appState.setCategory(worst.category.id);
                    context.pushNamed('Results');
                  },
                ).animate().fadeIn(delay: 250.ms).slideY(begin: 0.08, end: 0),
              ],

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
              final yearlySave = savingByCat[cat.id] ?? 0;

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

class _SavingsRing extends StatelessWidget {
  const _SavingsRing({required this.total, required this.totalSavings, required this.ffTheme});
  final int total;
  final int totalSavings;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final savingsPerMonth = (totalSavings / 12).round();
    final pct = ((savingsPerMonth / total) * 100).round().clamp(0, 100);
    final keep = total - savingsPerMonth;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12)],
      ),
      child: Row(
        children: [
          // Donut chart
          SizedBox(
            width: 110,
            height: 110,
            child: Stack(
              alignment: Alignment.center,
              children: [
                PieChart(
                  PieChartData(
                    startDegreeOffset: -90,
                    sectionsSpace: 3,
                    centerSpaceRadius: 34,
                    sections: [
                      // Amber for the saving (the VALUE share), pale grey for the
                      // rest (market price) — the savings slice reads as money.
                      PieChartSectionData(
                        value: savingsPerMonth.toDouble(),
                        color: ffTheme.saving,
                        radius: 20,
                        showTitle: false,
                      ),
                      PieChartSectionData(
                        value: keep.toDouble().clamp(1, double.infinity),
                        color: ffTheme.secondary,
                        radius: 16,
                        showTitle: false,
                      ),
                    ],
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$pct%', style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: ffTheme.savingDark)),
                    Text('חיסכון', style: ffTheme.labelSmall.copyWith(fontSize: 10)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('פוטנציאל החיסכון שלך', style: ffTheme.titleSmall),
                const SizedBox(height: 10),
                _RingLegendRow(color: ffTheme.saving, label: 'אפשר לחסוך', value: '₪$savingsPerMonth/חודש', ffTheme: ffTheme),
                const SizedBox(height: 6),
                _RingLegendRow(color: ffTheme.secondary, label: 'מחיר שוק', value: '₪$keep/חודש', ffTheme: ffTheme),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: ffTheme.saving.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
                  ),
                  child: Text('₪$totalSavings חיסכון שנתי', style: ffTheme.labelMedium.copyWith(color: ffTheme.savingDark, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RingLegendRow extends StatelessWidget {
  const _RingLegendRow({required this.color, required this.label, required this.value, required this.ffTheme});
  final Color color;
  final String label, value;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle, border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.25), width: 0.5))),
        const SizedBox(width: 8),
        Text(label, style: ffTheme.labelSmall),
        const Spacer(),
        Text(value, style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

/// One category's overpay insight: the gap to the cheapest REAL plan, a tidy
/// per-category breakdown bar (your bill vs that plan), the estimated annual
/// saving, and a compare CTA. All numbers are real catalogue prices + the
/// user's own bill; the saving is marked an estimate until bills are personalised.
class _OverpayCard extends StatelessWidget {
  const _OverpayCard({
    required this.overpay,
    required this.isWorst,
    required this.estimate,
    required this.ffTheme,
    required this.onCompare,
  });

  final _Overpay overpay;
  final bool isWorst;
  final bool estimate;
  final AppTheme ffTheme;
  final VoidCallback onCompare;

  @override
  Widget build(BuildContext context) {
    final o = overpay;
    final cat = o.category;
    // Bar fractions: the cheapest plan as a share of the (larger) current bill.
    const billFrac = 1.0;
    final cheapFrac = o.bill > 0 ? (o.cheapest.priceValue / o.bill).clamp(0.04, 1.0) : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.glassDecoration(alpha: 0.72).copyWith(
        border: Border.all(
          color: isWorst ? ffTheme.primary.withValues(alpha: 0.35) : Colors.white.withValues(alpha: 0.55),
          width: isWorst ? 1.4 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(12)),
                child: Center(child: Icon(categoryIconData(cat.id), size: 20, color: ffTheme.primary)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(cat.name, style: ffTheme.titleSmall),
                        if (isWorst) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: ffTheme.saving,
                              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                            ),
                            child: Text('הכי כדאי',
                                style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 10)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('משלמים ₪${o.monthlyGap} יותר מהזולה ביותר${o.overPct > 0 ? ' (+${o.overPct}%)' : ''}',
                        style: ffTheme.labelSmall.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // ── Per-category breakdown: your bill vs the cheapest real plan ──────
          _BenchmarkBar(
            label: 'אתם משלמים',
            amount: '₪${o.bill}',
            frac: billFrac,
            color: ffTheme.warning,
            ffTheme: ffTheme,
          ),
          const SizedBox(height: 8),
          _BenchmarkBar(
            label: 'הזולה בקטלוג',
            sublabel: o.cheapest.provider,
            amount: '₪${o.cheapest.priceText}',
            frac: cheapFrac.toDouble(),
            color: ffTheme.primary,
            ffTheme: ffTheme,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(
                    color: o.annualSaving > 0 ? ffTheme.saving.withValues(alpha: 0.14) : ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    border: Border.all(
                        color: o.annualSaving > 0
                            ? ffTheme.saving.withValues(alpha: 0.4)
                            : ffTheme.primary.withValues(alpha: 0.15)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.savings_rounded, size: 16,
                          color: o.annualSaving > 0 ? ffTheme.savingDark : ffTheme.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          o.annualSaving > 0
                              ? 'חיסכון${estimate ? ' (הערכה)' : ''}: ₪${o.annualSaving} בשנה'
                              : 'בדקו חבילות זולות יותר',
                          style: ffTheme.labelSmall.copyWith(
                              color: o.annualSaving > 0 ? ffTheme.savingDark : ffTheme.primary,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Semantics(
                button: true,
                label: 'השווה חבילות ${cat.name}',
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    boxShadow: ffTheme.shadowPrimary,
                  ),
                  child: Material(
                    color: ffTheme.primary,
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                      onTap: onCompare,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('השווה', style: ffTheme.labelMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                            const SizedBox(width: 4),
                            const Icon(Icons.arrow_back_rounded, size: 14, color: Colors.white),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A labelled proportional bar — the building block of the per-category
/// breakdown ("אתם משלמים" vs "הזולה בקטלוג").
class _BenchmarkBar extends StatelessWidget {
  const _BenchmarkBar({
    required this.label,
    required this.amount,
    required this.frac,
    required this.color,
    required this.ffTheme,
    this.sublabel,
  });

  final String label;
  final String? sublabel;
  final String amount;
  final double frac;
  final Color color;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700, color: ffTheme.primaryText)),
            if (sublabel != null) ...[
              const SizedBox(width: 6),
              Flexible(child: Text('· $sublabel', style: ffTheme.labelSmall, overflow: TextOverflow.ellipsis)),
            ],
            const Spacer(),
            Text(amount, style: ffTheme.labelMedium.copyWith(color: color, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 5),
        ClipRRect(
          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
          child: LayoutBuilder(
            builder: (context, constraints) {
              return Stack(
                children: [
                  Container(height: 9, width: double.infinity, color: ffTheme.accent2),
                  Container(
                    height: 9,
                    width: (constraints.maxWidth * frac).clamp(0.0, constraints.maxWidth),
                    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(ffTheme.radiusPill)),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

/// The single strong call-to-action: switch the worst-overpaying category.
class _WorstCategoryCta extends StatelessWidget {
  const _WorstCategoryCta({
    required this.worst,
    required this.estimate,
    required this.ffTheme,
    required this.onTap,
  });

  final _Overpay worst;
  final bool estimate;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'עברו לחבילה זולה יותר ב${worst.category.name} וחסכו עד ₪${worst.annualSaving} בשנה',
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: ffTheme.brandGradient,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          boxShadow: ffTheme.shadowPrimary,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(ffTheme.radiusLg),
            splashColor: Colors.white.withValues(alpha: 0.12),
            highlightColor: Colors.white.withValues(alpha: 0.06),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(child: Icon(categoryIconData(worst.category.id), size: 22, color: Colors.white)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('התחילו מ${worst.category.name}',
                        style: ffTheme.titleSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(
                      'הקטגוריה שבה משלמים הכי הרבה מעבר לשוק — חיסכון${estimate ? ' מוערך' : ''} עד ₪${worst.annualSaving}/שנה',
                      style: GoogleFonts.assistant(fontSize: 12, color: Colors.white.withValues(alpha: 0.85), height: 1.3),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: ffTheme.secondary, shape: BoxShape.circle),
                child: Icon(Icons.arrow_back_rounded, size: 18, color: ffTheme.primaryDark),
              ),
            ],
              ),
            ),
          ),
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
  final AppTheme ffTheme;

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
        border: Border.all(color: currentBill > 0 ? ffTheme.primary.withValues(alpha: 0.2) : ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10)],
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
                child: Center(child: Icon(categoryIconData(category.id), size: 22, color: ffTheme.primary)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(category.name, style: ffTheme.titleSmall),
                    if (currentBill > 0 && yearlySave > 0)
                      Text('חיסכון פוטנציאלי: ₪$yearlySave/שנה',
                          style: ffTheme.labelSmall.copyWith(color: ffTheme.savingDark, fontWeight: FontWeight.w700)),
                    if (currentBill == 0)
                      Text('לא בשימוש', style: ffTheme.labelSmall),
                  ],
                ),
              ),
              // Stepper
              Row(
                children: [
                  _RoundBtn(icon: Icons.remove, color: ffTheme.alternate, iconColor: ffTheme.secondaryText, onTap: onDecrease, semanticLabel: 'הפחת ₪10 מ${category.name}'),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Text(
                      '₪$currentBill',
                      style: ffTheme.titleSmall.copyWith(
                        color: currentBill > 0 ? ffTheme.primary : ffTheme.secondaryText,
                        fontWeight: FontWeight.w700,
                        // Fixed-width digits so ±10 steps don't nudge the buttons.
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  _RoundBtn(icon: Icons.add, color: ffTheme.primary, iconColor: Colors.white, onTap: onIncrease, semanticLabel: 'הוסף ₪10 ל${category.name}'),
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
                    style: ffTheme.labelSmall.copyWith(
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
            // Shared ghost variant — was a hand-rolled InkWell with a ~34px
            // hit area; now a 44px-tall consistent tertiary button.
            AppButton.ghost(
              text: 'חפש חבילות זולות יותר',
              onPressed: () async => onTap(),
              width: double.infinity,
              height: 44,
              borderRadius: BorderRadius.circular(10),
              icon: Icon(Icons.search_rounded, size: 14, color: ffTheme.primary),
              textStyle: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700),
              iconPadding: 6,
            ),
          ],
        ],
      ),
    );
  }
}

class _RoundBtn extends StatelessWidget {
  const _RoundBtn({required this.icon, required this.color, required this.iconColor, required this.onTap, required this.semanticLabel});
  final IconData icon;
  final Color color;
  final Color iconColor;
  final VoidCallback onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    // 44×44 tap area (touch-target minimum) around the 34px visual circle,
    // with a ripple halo so the press is felt as well as seen.
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
                width: 34,
                height: 34,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: Icon(icon, size: 17, color: iconColor),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
