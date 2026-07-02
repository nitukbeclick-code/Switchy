import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/savings_summary.dart';
import '../../services/referral_code.dart';
import '../../services/backend/local_backend.dart';
import '../../widgets/app_button.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/saving_pill.dart';
import '../../widgets/price_text.dart';

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
            // Sourced from the headline scale (Rubik 18); the heavier w800 is
            // the genuine delta, carried via copyWith — no raw GoogleFonts.
            style: ffTheme.headlineMedium.copyWith(fontWeight: FontWeight.w800)),
        centerTitle: true,
        actions: [
          if (hasAnything)
            IconButton(
              icon: Icon(Icons.ios_share_rounded, color: ffTheme.primaryText, size: 22),
              tooltip: 'שתף את הסיכום',
              onPressed: () => _share(
                total: total,
                realized: realized,
                personalized: personalized,
              ),
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
              onShare: () => _share(
                total: total,
                realized: realized,
                personalized: personalized,
              ),
              onActOnTop: opportunities.isNotEmpty
                  ? () {
                      // Jump to the largest opportunity's category so the user
                      // can act on the headline figure, not just read it.
                      appState.setCategory(opportunities.first.categoryId);
                      context.pushNamed('Results');
                    }
                  : null,
            )
          : EmptyRecap(ffTheme: ffTheme, onCta: () {
              appState.setCategory('cellular');
              context.pushNamed('Bills');
            }),
    );
  }

  /// Mint a REAL, persisted referral code (fail-soft to a local one — sharing
  /// must never dead-end) and share the recap with an attributable invite link.
  /// Mirrors the /referral screen so a friend arriving from the link is credited.
  Future<void> _share({
    required int total,
    required int realized,
    required bool personalized,
  }) async {
    String? code;
    try {
      final c = await appBackend.issueReferralCode();
      if (ReferralCode.isValid(c)) code = ReferralCode.normalize(c);
    } catch (_) {
      // no code → share without the ?ref= link (still a valid recap share).
    }
    await Share.share(_shareText(
      total: total,
      realized: realized,
      personalized: personalized,
      refCode: code,
    ));
  }

  /// Build the share copy from the rendered figures — never re-derives savings.
  /// When a [refCode] is supplied, an attributable invite link (`?ref=<code>`,
  /// the canonical shape the web lead form reads) is appended so a friend who
  /// follows the link is credited.
  String _shareText({
    required int total,
    required int realized,
    required bool personalized,
    String? refCode,
  }) {
    final buf = StringBuffer('הסיכום השנתי שלי ב-Switchy AI 📊\n');
    if (total > 0) {
      buf.write(personalized
          ? 'גיליתי שאפשר לחסוך עד ₪$total בשנה על חשבונות התקשורת'
          : 'גיליתי שאפשר לחסוך עד ~₪$total בשנה על חשבונות התקשורת');
    }
    if (realized > 0) {
      if (total > 0) buf.write('\n');
      buf.write('וכבר חסכתי ₪$realized דרך Switchy AI');
    }
    buf.write('\nבדקו גם אתם עם Switchy AI!');
    if (refCode != null) {
      buf.write('\nhttps://chosech.co.il/?ref=${Uri.encodeComponent(refCode)}');
    }
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
    required this.onShare,
    this.onActOnTop,
  });
  final int total;
  final int realized;
  final int trackedCount;
  final bool personalized;
  final List<CategorySaving> opportunities;
  final AppTheme ffTheme;
  final VoidCallback onShare;
  final VoidCallback? onActOnTop;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _HeroCard(total: total, personalized: personalized, ffTheme: ffTheme)
            .animate().fadeIn(duration: 320.ms).slideY(begin: 0.08, end: 0, curve: ffTheme.easeOut),
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
              // Announced as a section heading so screen-reader users can jump
              // between the recap's sections.
              Semantics(
                header: true,
                child: Text('פירוט ההזדמנויות',
                    style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
              ),
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

        const SizedBox(height: 24),

        // Bottom actions — act on the biggest opportunity (green ACTION) and a
        // prominent share affordance so the recap never dead-ends.
        if (onActOnTop != null) ...[
          AppButton(
            text: 'התחילו לחסוך עכשיו',
            // Contrast-aware ink ON the solid-green ACTION fill (pinned white
            // fell to ~1.7:1 on the lifted dark-mode green-400); AppButton
            // already picks the matching label ink itself.
            icon: Icon(Icons.bolt_rounded, color: ffTheme.onSaving, size: 20),
            onPressed: () async => onActOnTop!(),
            color: AppColors.primary,
            textStyle: ffTheme.titleSmall,
            width: double.infinity,
            height: 52,
            borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          ).animate(delay: 320.ms).fadeIn(duration: 300.ms),
          const SizedBox(height: 12),
        ],
        // Share affordance — the shared SECONDARY variant (surface fill +
        // hairline + ink label) so the recap's two actions read as one system:
        // green ACTION primary above, calm secondary below.
        AppButton.secondary(
          text: 'שתפו את הסיכום שלי',
          icon: Icon(Icons.ios_share_rounded, size: 18, color: ffTheme.primaryText),
          onPressed: () async => onShare(),
          textStyle: ffTheme.titleSmall,
          width: double.infinity,
          height: 52,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        ).animate(delay: 380.ms).fadeIn(duration: 300.ms),

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
    final year = DateTime.now().year;
    // Reduced motion: the count-up starts (and stays) at the real total.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
      decoration: BoxDecoration(
        // The ink hero — flat, per the one-elevation story (resting content
        // carries no float; only sheets/FABs/sticky bars lift).
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
      ),
      child: Column(
        children: [
          // A year badge frames the recap as a specific "year in review" — a warm
          // amber VALUE chip with the celebratory mark, so the card reads as a
          // shareable moment, not a generic stat panel.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: ffTheme.saving.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
              border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Decorative glyph (the badge text carries the meaning); the
                // small settle is skipped under reduced motion.
                if (reduceMotion)
                  ExcludeSemantics(
                      child: Icon(Icons.celebration_rounded,
                          color: ffTheme.saving, size: 16))
                else
                  ExcludeSemantics(
                    child: Icon(Icons.celebration_rounded,
                            color: ffTheme.saving, size: 16)
                        .animate()
                        .scale(
                          begin: const Offset(0.8, 0.8),
                          end: const Offset(1, 1),
                          duration: 450.ms,
                          curve: Curves.easeOutBack,
                        ),
                  ),
                const SizedBox(width: 6),
                Text('הסיכום של $year',
                    style: ffTheme.labelMedium.copyWith(
                        color: ffTheme.saving, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'החיסכון הפוטנציאלי שלך לשנה',
            style: ffTheme.labelMedium.copyWith(color: ffTheme.white.withValues(alpha: 0.7)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 10),
          // The VALUE figure is the single dominant focal point of the whole
          // recap. Flat under Geist — no glow halo — and sourced from the
          // numeric scale (tabular figures so the count-up doesn't jitter);
          // PriceText pins the ₪+digits run LTR (bidi-safe money).
          TweenAnimationBuilder<int>(
            tween: IntTween(begin: reduceMotion ? total : 0, end: total),
            duration: const Duration(milliseconds: 1400),
            curve: Curves.easeOutCubic,
            builder: (_, value, __) => PriceText(
              personalized ? '₪$value' : '~₪$value',
              textAlign: TextAlign.center,
              style: ffTheme.numericLarge.copyWith(
                fontSize: 28,
                color: ffTheme.saving,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            personalized
                ? 'על בסיס המסלולים שאנחנו ממליצים עבורכם'
                : 'הערכה — עדכנו את החשבונות שלכם לחישוב מדויק',
            style: ffTheme.bodySmall.copyWith(color: ffTheme.white.withValues(alpha: 0.65)),
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      // Bento data tile — generous corners + soft elevation so each stat reads
      // as an anchored grouped surface in the recap grid.
      decoration: ffTheme.bentoDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(ffTheme.radiusSm),
            ),
            child: Icon(icon, size: 20, color: ffTheme.primary),
          ),
          const SizedBox(height: 14),
          Text(value,
              // Stat numeral sourced from the numeric scale (numericMedium is
              // exactly Rubik 24, + tabular figures); only the heavier w800
              // rides via copyWith — no raw GoogleFonts.
              style: ffTheme.numericMedium.copyWith(fontWeight: FontWeight.w800)),
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
    // Realised savings = a banked win — a SUCCESS confirmation, so it earns
    // the designed VALUE tint token + green hairline, mirroring the /savings
    // realized card so the two read as the same surface.
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ffTheme.brandAccentTint,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              // Card-surface medallion so the tile stays visible ON the tint.
              color: ffTheme.secondaryBackground,
              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
            ),
            child: Icon(Icons.savings_rounded, color: ffTheme.brandAccent, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            // Text.rich (not raw RichText): it inherits the ambient MediaQuery
            // textScaler, so the sentence grows with the user's OS text size.
            child: Text.rich(
              TextSpan(
                style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700),
                children: [
                  const TextSpan(text: 'כבר חסכת '),
                  TextSpan(
                      text: '₪$amount',
                      style: ffTheme.titleSmall.copyWith(
                          color: ffTheme.brandAccentText,
                          fontWeight: FontWeight.w800,
                          // Tabular figures — aligns with the shared savings
                          // treatment.
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  const TextSpan(text: ' דרך Switchy AI השנה'),
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
      padding: const EdgeInsets.all(15),
      // Standard opaque card — a low-opacity ink hairline + soft shadow lifts the
      // row off the page (vs. the old harsh full-strength border).
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(ffTheme.radiusSm),
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
          // The shared VALUE pill (tint bg + savings glyph + tabular figures)
          // replaces the hand-rolled green badge, so the recap's per-category
          // savings read as the same category as every other savings surface.
          // TRUTH-ONLY: the real annual figure is unchanged.
          SavingPill(
              text: personalized
                  ? '₪${saving.annualSaving}/שנה'
                  : '~₪${saving.annualSaving}/שנה'),
        ],
      ),
    );
  }
}
