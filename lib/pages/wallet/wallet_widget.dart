import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../services/wallet_summary.dart';
import '../../services/savings_summary.dart';
import '../../widgets/app_sliver_header.dart';
import '../../widgets/refreshable_scroll.dart';

/// "ארנק התקשורת" (Telecom Wallet) — a PERSONAL realized-savings view plus an
/// HONEST aggregate social-proof block.
///
///   • Realized savings (the hero): the user's OWN running total — the ₪/year
///     credited when they actually moved through a lead. Framed as an estimate
///     based on the plans they chose, never a guarantee.
///   • Social proof: shown ONLY above a real publish threshold
///     ([kSocialProofMinMembers], mirroring the web). Below it — the default
///     until a genuine aggregate is wired — a neutral, claim-free fallback.
///
/// All view logic comes from the pure [computeWallet]; this widget only renders.
class WalletWidget extends StatelessWidget {
  const WalletWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    // The aggregate is 0/0 until a real /wallet-stats fetch is wired — so the
    // social-proof block stays honestly hidden (neutral fallback) by default.
    final wallet = computeWallet(appState);
    // The forward-looking potential (still-available opportunity) — a separate,
    // honest figure from the realized total, used only as an onward nudge.
    final potential = computeSavings(appState);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: RefreshableScroll(
        // Pull-to-refresh re-derives the wallet view (realized total, social-proof
        // gate, onward potential) from AppState on rebuild.
        onRefresh: () async {
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        slivers: [
          AppSliverHeader(
            title: 'ארנק התקשורת',
            subtitle: wallet.hasRealizedSaving ? 'כבר חסכת' : 'הארנק שלך',
            expandedHeight: 208,
            // Keep the app's own "חזרה" back affordance (the framework default
            // localizes to "הקודם").
            showBack: false,
            actions: [
              IconButton(
                icon: Icon(Icons.arrow_forward_ios_rounded, color: ffTheme.primaryText, size: 20),
                tooltip: 'חזרה',
                onPressed: () => context.safePop(),
              ),
            ],
            // The realized-savings figure is the screen's hero.
            flexibleChild: _RealizedHeroFigure(wallet: wallet, ffTheme: ffTheme),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Honest aggregate social proof — gated above the threshold;
                // neutral, claim-free fallback otherwise.
                _SocialProof(wallet: wallet, ffTheme: ffTheme)
                    .animate()
                    .fadeIn(delay: 120.ms, duration: 350.ms),
                const SizedBox(height: 16),

                // Onward nudge: still-available potential → savings dashboard.
                if (potential.totalAnnualPotential > 0)
                  _PotentialNudge(
                    potential: potential.totalAnnualPotential,
                    ffTheme: ffTheme,
                    onTap: () => context.pushNamed('Savings'),
                  ).animate().fadeIn(delay: 200.ms, duration: 350.ms),

                const SizedBox(height: 20),

                // Honesty footnote — the realized figure is an estimate, not a
                // promise.
                Text(
                  'הסכום מבוסס על המסלולים שבחרת דרכנו והחשבון שהזנת — הערכה, לא הבטחה. '
                  'המחירים בקטלוג עשויים להשתנות.',
                  style: ffTheme.labelSmall.copyWith(
                      color: ffTheme.secondaryText, height: 1.45),
                ).animate().fadeIn(delay: 260.ms),
              ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Realized savings hero figure ───────────────────────────────────────────────

/// The realized-savings figure that rides inside the collapsing [AppSliverHeader]
/// expanded state: the user's own running ₪/year total (amber VALUE) with its
/// monthly-equivalent caption, or the honest "not yet saved" framing.
class _RealizedHeroFigure extends StatelessWidget {
  const _RealizedHeroFigure({required this.wallet, required this.ffTheme});
  final WalletSummary wallet;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    if (wallet.hasRealizedSaving) {
      // The hero figure rides on the flat WHITE Geist header. The big numeral
      // is the amber [saving] (amber 500/400) — a strong VALUE read that holds
      // at display size; the savings figure uses the AA-safe [savingText] ink
      // for small chrome. The eyebrow/caption read in ink tokens so they clear
      // AA on the white header, keeping amber reserved for the focal figure.
      final valueAmber = ffTheme.saving;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // A small eyebrow so the figure reads as a realized win, not a
          // forecast — ink on the white header; the icon carries the warm VALUE
          // tint at icon size. NB: the header subtitle already prints
          // "כבר חסכת", so this uses a distinct phrase to avoid duplicating it.
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.savings_rounded, size: 14,
                  color: ffTheme.savingText),
              const SizedBox(width: 6),
              Text(
                'החיסכון שלך עד היום',
                style: GoogleFonts.assistant(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                    color: ffTheme.secondaryText),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // The realized figure is the VALUE headline → amber.
              Text(
                '₪${wallet.realizedSaving}',
                style: GoogleFonts.rubik(
                  fontSize: 44,
                  fontWeight: FontWeight.w800,
                  color: valueAmber,
                  letterSpacing: -1,
                  height: 1,
                ),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 7),
                child: Text('לשנה',
                    style: GoogleFonts.assistant(
                        fontSize: 15,
                        color: ffTheme.secondaryText)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'כ-₪${wallet.monthlyEquivalent} בחודש שנשארים אצלך',
            style: GoogleFonts.assistant(
                fontSize: 13,
                color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ),
        ],
      );
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'עוד לא חסכת דרכנו',
          style: GoogleFonts.rubik(
              fontSize: 22, fontWeight: FontWeight.w800, color: ffTheme.primaryText),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(
          'כשתעברו למסלול משתלם דרך Switchy AI, החיסכון השנתי יופיע כאן.',
          style: GoogleFonts.assistant(
              fontSize: 13,
              height: 1.4,
              color: ffTheme.secondaryText),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

// ── Honest aggregate social proof ──────────────────────────────────────────────

class _SocialProof extends StatelessWidget {
  const _SocialProof({required this.wallet, required this.ffTheme});
  final WalletSummary wallet;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    // Above the threshold → publish the REAL aggregate.
    if (wallet.showSocialProof) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('חיסכון אמיתי, לא הבטחות',
                style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              '${wallet.aggregateMembers} משקי בית כבר עברו דרכנו וחסכו — '
              'חיסכון שנתי טיפוסי של ₪${wallet.aggregateTypicalSaving} '
              '(מבוסס דיווח של נציגים, לא הבטחה).',
              style: ffTheme.bodySmall.copyWith(
                  color: ffTheme.secondaryText, height: 1.45),
            ),
          ],
        ),
      );
    }
    // Below the threshold (the default) → a neutral, claim-free fallback. We
    // state only verifiable facts and never a fabricated "X users saved ₪Y".
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: Row(
        children: [
          Icon(Icons.handshake_outlined, size: 22, color: ffTheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'השוואה חינמית, שקופה וללא התחייבות — אנחנו מראים את המספרים '
              'האמיתיים, גם כשאין עדיין מספיק נתונים לפרסם ממוצע.',
              style: ffTheme.bodySmall.copyWith(
                  color: ffTheme.secondaryText, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Onward potential nudge ─────────────────────────────────────────────────────

class _PotentialNudge extends StatelessWidget {
  const _PotentialNudge({
    required this.potential,
    required this.ffTheme,
    required this.onTap,
  });
  final int potential;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'יש לך עוד פוטנציאל חיסכון של ₪$potential בשנה. הצג פירוט',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: ffTheme.saving.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(ffTheme.radiusMd),
              border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
            ),
            child: Row(
              children: [
                Icon(Icons.savings_outlined, size: 22, color: ffTheme.savingDark),
                const SizedBox(width: 12),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: ffTheme.bodySmall.copyWith(
                          color: ffTheme.primaryText,
                          fontWeight: FontWeight.w700,
                          height: 1.4),
                      children: [
                        const TextSpan(text: 'יש לך עוד פוטנציאל חיסכון של '),
                        TextSpan(
                          text: '₪$potential/שנה',
                          style: ffTheme.bodySmall.copyWith(
                              color: ffTheme.savingText,
                              fontWeight: FontWeight.w800),
                        ),
                        const TextSpan(text: ' — בוא נראה איפה'),
                      ],
                    ),
                  ),
                ),
                Icon(Icons.arrow_back_ios_rounded,
                    size: 12, color: ffTheme.savingDark),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
