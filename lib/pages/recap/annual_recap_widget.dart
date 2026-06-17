import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../app_state.dart';
import '../../data.dart' show categoryById;
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../services/savings_summary.dart';
import '../../widgets/empty_state.dart';

/// Shareable yearly savings recap. Renders the output of [computeSavings] and
/// the user's running [AppState.totalSavings]; it never re-derives the saving
/// formulas itself.
class AnnualRecapWidget extends StatelessWidget {
  const AnnualRecapWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final summary = computeSavings(appState);
    final saved = appState.totalSavings;
    final opportunities = summary.opportunities; // largest first
    final potential = summary.totalAnnualPotential;
    final trackedCount = appState.myPlans.length;
    final categoriesSaved = opportunities.length;

    final isEmpty = saved <= 0 && opportunities.isEmpty;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('הסיכום השנתי שלי'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
      ),
      body: isEmpty
          ? EmptyState(
              icon: Icons.celebration_rounded,
              headline: 'עדיין אין חיסכון לסיכום',
              subtitle: 'מלאו את החשבונות שלכם ומצאו מסלול משתלם — ונכין לכם סיכום שנתי לשתף.',
              ctaLabel: 'מצאו מסלול →',
              onCtaTap: () async => context.goNamed('Results'),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _HeroCard(ffTheme: ffTheme, saved: saved)
                      .animate()
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: 0.08, end: 0),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _StatTile(
                          ffTheme: ffTheme,
                          icon: Icons.sync_alt_rounded,
                          value: '$trackedCount',
                          label: 'מסלולים במעקב',
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _StatTile(
                          ffTheme: ffTheme,
                          icon: Icons.category_rounded,
                          value: '$categoriesSaved',
                          label: 'קטגוריות לחיסכון',
                        ),
                      ),
                    ],
                  ).animate().fadeIn(delay: 120.ms, duration: 400.ms),
                  if (opportunities.isNotEmpty) ...[
                    const SizedBox(height: 28),
                    Text('פוטנציאל החיסכון שלכם',
                        style: ffTheme.titleLarge.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text('₪$potential נוספים בשנה אם תעברו למסלולים שמצאנו',
                        style: ffTheme.bodySmall.copyWith(
                            color: ffTheme.secondaryText,
                            height: 1.4,
                            fontFeatures: const [FontFeature.tabularFigures()])),
                    const SizedBox(height: 14),
                    ...List.generate(opportunities.length, (i) {
                      final cs = opportunities[i];
                      final cat = categoryById(cs.categoryId);
                      return _OpportunityRow(
                        ffTheme: ffTheme,
                        icon: cat?.icon ?? '💡',
                        name: cat?.name ?? cs.categoryId,
                        annualSaving: cs.annualSaving,
                      ).animate().fadeIn(delay: (160 + i * 70).ms).slideX(begin: 0.06, end: 0);
                    }),
                  ],
                  const SizedBox(height: 28),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: ffTheme.accentGradient,
                      borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                      boxShadow: ffTheme.shadowAccent,
                    ),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.transparent,
                          foregroundColor: Colors.white,
                          shadowColor: Colors.transparent,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusMd)),
                        ),
                        onPressed: () => _share(saved, potential),
                        icon: const Icon(Icons.ios_share_rounded, size: 20),
                        label: Text('שיתוף הסיכום',
                            style: ffTheme.titleSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ).animate().fadeIn(delay: 240.ms),
                  const SizedBox(height: 16),
                ],
              ),
            ),
    );
  }

  void _share(int saved, int potential) {
    final lines = <String>['📊 הסיכום השנתי שלי בחוסך'];
    if (saved > 0) lines.add('חסכתי כבר ₪$saved בשנה 🎉');
    if (potential > 0) lines.add('ויש לי עוד ₪$potential פוטנציאל חיסכון!');
    lines.add('כדאי לכם לבדוק כמה אתם יכולים לחסוך.');
    Share.share(lines.join('\n'));
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.ffTheme, required this.saved});
  final AppTheme ffTheme;
  final int saved;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusLg),
        boxShadow: ffTheme.shadowLifted,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('חסכת עם חוסך',
              style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.8))),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('₪$saved',
                  style: ffTheme.displayLarge.copyWith(
                      color: ffTheme.saving,
                      fontWeight: FontWeight.w900,
                      fontFeatures: const [FontFeature.tabularFigures()])),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text('בשנה',
                    style: ffTheme.titleSmall.copyWith(color: Colors.white.withValues(alpha: 0.85))),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('כל הכבוד — זה מה שצברת עד עכשיו 🎉',
              style: ffTheme.bodyMedium.copyWith(color: Colors.white.withValues(alpha: 0.85), height: 1.4)),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.ffTheme,
    required this.icon,
    required this.value,
    required this.label,
  });
  final AppTheme ffTheme;
  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.lineColor),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: ffTheme.primary),
          const SizedBox(height: 12),
          Text(value,
              style: ffTheme.headlineSmall.copyWith(
                  fontWeight: FontWeight.w900,
                  fontFeatures: const [FontFeature.tabularFigures()])),
          const SizedBox(height: 2),
          Text(label, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
        ],
      ),
    );
  }
}

class _OpportunityRow extends StatelessWidget {
  const _OpportunityRow({
    required this.ffTheme,
    required this.icon,
    required this.name,
    required this.annualSaving,
  });
  final AppTheme ffTheme;
  final String icon;
  final String name;
  final int annualSaving;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.lineColor),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 12),
          Expanded(child: Text(name, style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700))),
          Text('₪$annualSaving',
              style: ffTheme.titleMedium.copyWith(
                  color: ffTheme.savingDark,
                  fontWeight: FontWeight.w900,
                  fontFeatures: const [FontFeature.tabularFigures()])),
          const SizedBox(width: 4),
          Padding(
            padding: const EdgeInsets.only(bottom: 1),
            child: Text('בשנה', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
          ),
        ],
      ),
    );
  }
}
