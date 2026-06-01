import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';

class BillsWidget extends StatelessWidget {
  const BillsWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);

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
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Monthly total hero
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [const Color(0xFF0E3A26), ffTheme.primary]),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('הוצאה חודשית כוללת', style: GoogleFonts.assistant(fontSize: 13, color: ffTheme.secondary, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text('₪$total', style: GoogleFonts.rubik(fontSize: 44, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1)),
                  Text('לחודש בכל הקטגוריות', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white60)),
                ],
              ),
            ).animate().fadeIn(duration: 400.ms),

            const SizedBox(height: 20),

            // Savings estimate
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  const Text('💡', style: TextStyle(fontSize: 24)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('פוטנציאל חיסכון שנתי', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w700, color: const Color(0xFF0E3A26))),
                        Text('₪$totalSavings בשנה על כלל הקטגוריות', style: GoogleFonts.assistant(fontSize: 12, color: const Color(0xFF0E3A26).withOpacity(0.8))),
                      ],
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 100.ms),

            const SizedBox(height: 24),

            Text('עדכן חשבונות', style: ffTheme.titleLarge),
            const SizedBox(height: 4),
            Text('הכנס את הסכום שאתה משלם כיום', style: ffTheme.bodySmall),
            const SizedBox(height: 16),

            // Category bills
            ...categories.asMap().entries.map((entry) {
              final i = entry.key;
              final cat = entry.value;
              final bill = appState.currentBill(cat.id);
              return _BillStepper(
                category: cat,
                currentBill: bill,
                onDecrease: () => appState.setCurrentBill(cat.id, (bill - 10).clamp(0, 2000)),
                onIncrease: () => appState.setCurrentBill(cat.id, (bill + 10).clamp(0, 2000)),
                ffTheme: ffTheme,
              ).animate(delay: (i * 80).ms).fadeIn(duration: 350.ms).slideX(begin: 0.05, end: 0);
            }),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _BillStepper extends StatelessWidget {
  const _BillStepper({required this.category, required this.currentBill, required this.onDecrease, required this.onIncrease, required this.ffTheme});
  final Category category;
  final int currentBill;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 8)],
      ),
      child: Row(
        children: [
          Text(category.icon, style: const TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(category.name, style: ffTheme.titleSmall),
                Text('₪$currentBill/חודש', style: ffTheme.bodySmall),
              ],
            ),
          ),
          Row(
            children: [
              GestureDetector(
                onTap: onDecrease,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: ffTheme.background,
                    shape: BoxShape.circle,
                    border: Border.all(color: ffTheme.alternate),
                  ),
                  child: const Icon(Icons.remove, size: 18),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text('₪$currentBill', style: ffTheme.titleSmall.override(color: ffTheme.primary)),
              ),
              GestureDetector(
                onTap: onIncrease,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: ffTheme.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.add, size: 18, color: Colors.white),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
