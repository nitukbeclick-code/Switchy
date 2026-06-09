import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/savings_summary.dart';
import '../../services/renewal_report.dart';

/// A whole-app savings dashboard: total potential, the biggest opportunity, a
/// per-category breakdown, near renewals, and what the user has already saved.
class SavingsWidget extends StatelessWidget {
  const SavingsWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final summary = computeSavings(appState);
    final top = summary.topOpportunity;

    // Tracked plans with a real saver available (near or not).
    final renewals = appState.myPlans
        .map((tp) => (tp: tp, saver: RenewalReport.bestSaver(tp, appState)))
        .where((e) => e.saver != null)
        .toList();

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: _Hero(total: summary.totalAnnualPotential, hasBill: summary.hasAnyBill, ffTheme: ffTheme, onBack: () => context.safePop()),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Already saved with us
                  if (appState.totalSavings > 0) ...[
                    _RealizedCard(amount: appState.totalSavings, ffTheme: ffTheme)
                        .animate().fadeIn(duration: 300.ms),
                    const SizedBox(height: 16),
                  ],

                  // Biggest opportunity
                  if (top != null && top.best != null) ...[
                    _TopOpportunityCard(
                      saving: top.annualSaving,
                      categoryName: categoryById(top.categoryId)?.name ?? top.categoryId,
                      providerAndPlan: '${top.best!.plan.provider} · ${top.best!.plan.plan}',
                      ffTheme: ffTheme,
                      onTap: () => context.pushNamed('PlanDetail',
                          pathParameters: {'planId': top.best!.plan.id}),
                    ).animate().fadeIn(duration: 320.ms).slideY(begin: 0.08),
                    const SizedBox(height: 20),
                  ],

                  // Per-category breakdown
                  Text('לפי קטגוריה', style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  ...summary.categories.asMap().entries.map((e) {
                    final cs = e.value;
                    final cat = categoryById(cs.categoryId);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _CategoryRow(
                        saving: cs,
                        icon: cat?.icon ?? '•',
                        name: cat?.name ?? cs.categoryId,
                        ffTheme: ffTheme,
                        onTap: () {
                          appState.setCategory(cs.categoryId);
                          if (cs.hasBill) {
                            context.pushNamed('Results');
                          } else {
                            context.pushNamed('Bills');
                          }
                        },
                      ).animate(delay: (e.key * 50 + 80).ms).fadeIn(duration: 260.ms),
                    );
                  }),

                  // Renewals
                  if (renewals.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text('חידושים מתקרבים', style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 10),
                    ...renewals.map((e) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _RenewalRow(
                            provider: e.tp.provider,
                            planName: e.tp.planName,
                            saving: e.saver!.annualSaving,
                            days: e.tp.daysUntilRenewal,
                            ffTheme: ffTheme,
                            onTap: () => context.pushNamed('RenewalReport',
                                pathParameters: {'trackedId': e.tp.id}),
                          ),
                        )),
                  ],

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Hero ────────────────────────────────────────────────────────────────────

class _Hero extends StatelessWidget {
  const _Hero({required this.total, required this.hasBill, required this.ffTheme, required this.onBack});
  final int total;
  final bool hasBill;
  final AppTheme ffTheme;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0E3A26)),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white, size: 20),
                    tooltip: 'חזרה',
                    onPressed: onBack,
                  ),
                  Text('החיסכון שלי',
                      style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                ],
              ),
              const SizedBox(height: 8),
              Center(
                child: Column(
                  children: [
                    Text(
                      hasBill ? 'חיסכון פוטנציאלי שנתי' : 'גלו כמה אפשר לחסוך',
                      style: ffTheme.labelMedium.copyWith(color: Colors.white.withOpacity(0.6)),
                    ),
                    const SizedBox(height: 6),
                    TweenAnimationBuilder<int>(
                      tween: IntTween(begin: 0, end: total),
                      duration: const Duration(milliseconds: 1400),
                      curve: Curves.easeOutCubic,
                      builder: (_, value, __) => Text(
                        hasBill ? '₪$value' : '₪—',
                        style: ffTheme.displaySmall.copyWith(
                            color: ffTheme.secondary, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      hasBill ? 'לפי המסלולים שאנחנו ממליצים' : 'הזינו את החשבונות שלכם כדי לחשב',
                      style: ffTheme.bodySmall.copyWith(color: Colors.white.withOpacity(0.55)),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Realized savings ────────────────────────────────────────────────────────

class _RealizedCard extends StatelessWidget {
  const _RealizedCard({required this.amount, required this.ffTheme});
  final int amount;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ffTheme.success.withOpacity(0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.success.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.savings_rounded, color: ffTheme.success, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Text('כבר חסכת ₪$amount דרך חוסך',
                style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ── Top opportunity ─────────────────────────────────────────────────────────

class _TopOpportunityCard extends StatelessWidget {
  const _TopOpportunityCard({
    required this.saving,
    required this.categoryName,
    required this.providerAndPlan,
    required this.ffTheme,
    required this.onTap,
  });
  final int saving;
  final String categoryName;
  final String providerAndPlan;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ffTheme.secondary,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            const Text('🚀', style: TextStyle(fontSize: 30)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('ההזדמנות הכי גדולה שלך · $categoryName',
                      style: GoogleFonts.assistant(
                          fontSize: 12, fontWeight: FontWeight.w700, color: const Color(0xFF0E3A26))),
                  const SizedBox(height: 2),
                  Text('חיסכון של ₪$saving בשנה',
                      style: GoogleFonts.rubik(
                          fontSize: 18, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26))),
                  const SizedBox(height: 2),
                  Text(providerAndPlan,
                      style: GoogleFonts.assistant(
                          fontSize: 12, fontWeight: FontWeight.w600, color: const Color(0xFF0E3A26)),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const Icon(Icons.arrow_back_ios_rounded, size: 16, color: Color(0xFF0E3A26)),
          ],
        ),
      ),
    );
  }
}

// ── Category row ────────────────────────────────────────────────────────────

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.saving,
    required this.icon,
    required this.name,
    required this.ffTheme,
    required this.onTap,
  });
  final CategorySaving saving;
  final String icon;
  final String name;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final has = saving.hasBill;
    final opportunity = saving.hasOpportunity;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
        ),
        child: Row(
          children: [
            Text(icon, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                  Text(
                    has ? 'משלם ₪${saving.currentBill}/חודש' : 'לא הוזן חשבון',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ),
            if (opportunity)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: ffTheme.secondary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('₪${saving.annualSaving}/שנה',
                    style: GoogleFonts.rubik(
                        fontSize: 12, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26))),
              )
            else if (has)
              Text('מעולה — מחיר תחרותי',
                  style: ffTheme.labelSmall.copyWith(color: ffTheme.success, fontWeight: FontWeight.w600))
            else
              Row(
                children: [
                  Text('הזן חשבון',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                  Icon(Icons.chevron_left_rounded, size: 16, color: ffTheme.primary),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

// ── Renewal row ─────────────────────────────────────────────────────────────

class _RenewalRow extends StatelessWidget {
  const _RenewalRow({
    required this.provider,
    required this.planName,
    required this.saving,
    required this.days,
    required this.ffTheme,
    required this.onTap,
  });
  final String provider;
  final String planName;
  final int saving;
  final int? days;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
        ),
        child: Row(
          children: [
            Icon(Icons.alarm_rounded, color: ffTheme.warning, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$provider · $planName',
                      style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(
                    days == null
                        ? 'חוסך ₪$saving/שנה במעבר'
                        : days! < 0
                            ? 'המבצע הסתיים — חוסך ₪$saving/שנה'
                            : 'מסתיים בעוד $days ימים — חוסך ₪$saving/שנה',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_left_rounded, size: 18, color: ffTheme.secondaryText),
          ],
        ),
      ),
    );
  }
}
