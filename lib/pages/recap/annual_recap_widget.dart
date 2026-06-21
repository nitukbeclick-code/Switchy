import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/savings_summary.dart';
import '../../widgets/empty_state.dart';

/// A polished, shareable yearly savings recap: the headline ₪ the user could
/// save this year, how many plans they're tracking, which categories carry an
/// opportunity, and a per-category breakdown — all rendered straight from
/// [computeSavings] so no figure is re-derived here.
class AnnualRecapWidget extends StatelessWidget {
  const AnnualRecapWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final summary = computeSavings(appState);
    final opportunities = summary.opportunities; // sorted, positive only
    final total = summary.totalAnnualPotential;
    final realized = appState.totalSavings;
    final trackedCount = appState.myPlans.length;
    final personalized = appState.billsPersonalized;

    // Nothing to recap when there's neither a potential figure nor anything
    // already saved — show the empty state and route the user to enter bills.
    final hasAnything = total > 0 || realized > 0;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_forward_ios_rounded, color: ffTheme.primaryText, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text('הסיכום השנתי שלי',
            style: GoogleFonts.rubik(
                fontSize: 18, fontWeight: FontWeight.w800, color: ffTheme.primaryText)),
        centerTitle: true,
        actions: [
          if (hasAnything)
            IconButton(
              icon: Icon(Icons.ios_share_rounded, color: ffTheme.primaryText, size: 22),
              tooltip: 'שתף את הסיכום',
              onPressed: () => Share.share(_shareText(
                total: total,
                realized: realized,
                personalized: personalized,
              )),
            ),
        ],
      ),
      body: hasAnything
          ? _RecapBody(
              total: total,
              realized: realized,
              trackedCount: trackedCount,
              personalized: personalized,
              opportunities: opportunities,
              ffTheme: ffTheme,
            )
          : EmptyRecap(ffTheme: ffTheme, onCta: () {
              appState.setCategory('cellular');
              context.pushNamed('Bills');
            }),
    );
  }

  /// Build the share copy from the rendered figures — never re-derives savings.
  String _shareText({
    required int total,
    required int realized,
    required bool personalized,
  }) {
    final buf = StringBuffer('הסיכום השנתי שלי בחוסך 📊\n');
    if (total > 0) {
      buf.write(personalized
          ? 'גיליתי שאפשר לחסוך עד ₪$total בשנה על חשבונות התקשורת'
          : 'גיליתי שאפשר לחסוך עד ~₪$total בשנה על חשבונות התקשורת');
    }
    if (realized > 0) {
      if (total > 0) buf.write('\n');
      buf.write('וכבר חסכתי ₪$realized דרך חוסך');
    }
    buf.write('\nבדקו גם אתם עם חוסך!');
    return buf.toString();
  }
}

// ── Empty state ──────────────────────────────────────────────────────────────

/// Shown when there is no potential and nothing realized yet.
class EmptyRecap extends StatelessWidget {
  const EmptyRecap({super.key, required this.ffTheme, required this.onCta});
  final AppTheme ffTheme;
  final VoidCallback onCta;

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.celebration_outlined,
      headline: 'הסיכום שלך עוד נכתב',
      subtitle: 'הזינו את חשבונות התקשורת שלכם ונבנה לכם סיכום שנתי של כמה אפשר לחסוך.',
      ctaLabel: 'הזנת חשבונות',
      onCtaTap: () async => onCta(),
    );
  }
}

// ── Body ─────────────────────────────────────────────────────────────────────

class _RecapBody extends StatelessWidget {
  const _RecapBody({
    required this.total,
    required this.realized,
    required this.trackedCount,
    required this.personalized,
    required this.opportunities,
    required this.ffTheme,
  });
  final int total;
  final int realized;
  final int trackedCount;
  final bool personalized;
  final List<CategorySaving> opportunities;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _HeroCard(total: total, personalized: personalized, ffTheme: ffTheme)
            .animate().fadeIn(duration: 320.ms).slideY(begin: 0.08),
        const SizedBox(height: 16),

        // At-a-glance stats: plans tracked + categories with an opportunity.
        Row(
          children: [
            Expanded(
              child: _StatTile(
                icon: Icons.sync_alt_rounded,
                value: '$trackedCount',
                label: 'מסלולים במעקב',
                ffTheme: ffTheme,
              ).animate(delay: 80.ms).fadeIn(duration: 300.ms).slideY(begin: 0.1),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatTile(
                icon: Icons.category_rounded,
                value: '${opportunities.length}',
                label: 'קטגוריות לחיסכון',
                ffTheme: ffTheme,
              ).animate(delay: 140.ms).fadeIn(duration: 300.ms).slideY(begin: 0.1),
            ),
          ],
        ),

        // Already realized through the app.
        if (realized > 0) ...[
          const SizedBox(height: 16),
          _RealizedCard(amount: realized, ffTheme: ffTheme)
              .animate(delay: 200.ms).fadeIn(duration: 300.ms),
        ],

        // Opportunity breakdown — straight from computeSavings, largest first.
        if (opportunities.isNotEmpty) ...[
          const SizedBox(height: 24),
          Row(
            children: [
              Container(
                width: 4,
                height: 18,
                decoration: BoxDecoration(
                  color: ffTheme.primary,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 8),
              Text('פירוט ההזדמנויות',
                  style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            personalized
                ? 'לפי המסלולים שאנחנו ממליצים עבורכם'
                : 'הערכה — עדכנו את החשבונות לחישוב מדויק',
            style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
          ),
          const SizedBox(height: 12),
          ...opportunities.asMap().entries.map((e) {
            final i = e.key;
            final cs = e.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _OpportunityRow(
                saving: cs,
                name: categoryById(cs.categoryId)?.name ?? cs.categoryId,
                personalized: personalized,
                ffTheme: ffTheme,
              ).animate(delay: (i * 60 + 240).ms).fadeIn(duration: 260.ms).slideX(begin: 0.05),
            );
          }),
        ],

        const SizedBox(height: 8),
      ],
    );
  }
}

// ── Hero card (stays ink) ────────────────────────────────────────────────────

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.total, required this.personalized, required this.ffTheme});
  final int total;
  final bool personalized;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      decoration: BoxDecoration(
        // A premium ink hero: soft wash + a pronounced lift so the headline
        // figure floats off the page.
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(24),
        boxShadow: ffTheme.shadowLifted,
      ),
      child: Column(
        children: [
          // The celebratory mark breathes gently — honest, not confetti-loud.
          Icon(Icons.celebration_rounded, color: ffTheme.saving, size: 30)
              .animate(onPlay: (c) => c.repeat(reverse: true))
              .scale(
                begin: const Offset(1, 1),
                end: const Offset(1.12, 1.12),
                duration: 1600.ms,
                curve: Curves.easeInOut,
              ),
          const SizedBox(height: 12),
          Text(
            'החיסכון הפוטנציאלי שלך לשנה',
            style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.6)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          TweenAnimationBuilder<int>(
            tween: IntTween(begin: 0, end: total),
            duration: const Duration(milliseconds: 1400),
            curve: Curves.easeOutCubic,
            builder: (_, value, __) => Text(
              personalized ? '₪$value' : '~₪$value',
              style: ffTheme.displaySmall.copyWith(
                color: ffTheme.saving,
                fontWeight: FontWeight.bold,
                // Fixed-width digits — the count-up doesn't jitter sideways.
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            personalized
                ? 'על בסיס המסלולים שאנחנו ממליצים עבורכם'
                : 'הערכה — עדכנו את החשבונות שלכם לחישוב מדויק',
            style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.55)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ── Stat tile ────────────────────────────────────────────────────────────────

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.value,
    required this.label,
    required this.ffTheme,
  });
  final IconData icon;
  final String value;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: ffTheme.glassDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 20, color: ffTheme.primary),
          ),
          const SizedBox(height: 12),
          Text(value,
              style: GoogleFonts.rubik(
                  fontSize: 24, fontWeight: FontWeight.w800, color: ffTheme.primaryText)),
          const SizedBox(height: 2),
          Text(label,
              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

// ── Realized card ────────────────────────────────────────────────────────────

class _RealizedCard extends StatelessWidget {
  const _RealizedCard({required this.amount, required this.ffTheme});
  final int amount;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    // Realised savings = a banked win → green ACTION tint, distinct from the
    // amber "potential" figures elsewhere on the recap.
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ffTheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.primary.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: ffTheme.primary.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.savings_rounded, color: ffTheme.primary, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700),
                children: [
                  const TextSpan(text: 'כבר חסכת '),
                  TextSpan(
                      text: '₪$amount',
                      style: ffTheme.titleSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800)),
                  const TextSpan(text: ' דרך חוסך השנה'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Opportunity row ──────────────────────────────────────────────────────────

class _OpportunityRow extends StatelessWidget {
  const _OpportunityRow({
    required this.saving,
    required this.name,
    required this.personalized,
    required this.ffTheme,
  });
  final CategorySaving saving;
  final String name;
  final bool personalized;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(categoryIconData(saving.categoryId), size: 20, color: ffTheme.primaryText),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                Text('משלם ₪${saving.currentBill}/חודש היום',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: ffTheme.saving.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              personalized ? '₪${saving.annualSaving}/שנה' : '~₪${saving.annualSaving}/שנה',
              style: GoogleFonts.rubik(
                  fontSize: 12, fontWeight: FontWeight.w800, color: ffTheme.saving),
            ),
          ),
        ],
      ),
    );
  }
}
