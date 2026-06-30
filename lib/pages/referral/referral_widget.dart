import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/sticky_cta_scaffold.dart';
import '../../services/referral_code.dart';
import '../../services/backend/local_backend.dart';

/// "הזמינו חבר" (Refer a friend) — share Switchy AI with a REAL, shareable code in the
/// same `SW-XXXXXX` shape the backend issues.
///
/// HONESTY / §30A: there is NO advertised cash reward — the framing is
/// share-the-tool ("עזרו לחבר לחסוך"), value-based. Sharing a code is the
/// referrer's own choice, so no marketing-consent gate is needed.
class ReferralWidget extends StatefulWidget {
  const ReferralWidget({super.key});

  @override
  State<ReferralWidget> createState() => _ReferralWidgetState();
}

class _ReferralWidgetState extends State<ReferralWidget> {
  // Shown immediately so the UI is never empty; replaced by the persisted code
  // (attributable in public.referral_codes) once the backend responds.
  String _code = ReferralCode.make();

  @override
  void initState() {
    super.initState();
    _issuePersistedCode();
  }

  /// Mint a REAL, persisted code via the backend (channel='app') so a friend's
  /// redemption can be attributed — matching the website. Fail-soft: the local
  /// code from the field initializer stays if the backend is unreachable.
  Future<void> _issuePersistedCode() async {
    final code = await appBackend.issueReferralCode();
    if (!mounted) return;
    if (code != _code && ReferralCode.isValid(code)) {
      setState(() => _code = code);
    }
  }

  /// The invite link carries the referral code as `?ref=<code>` (the canonical
  /// shape the web lead form reads → leads.referrer_code) so a friend arriving
  /// from the link is attributable, not just those who paste the plain code.
  String get _shareLink =>
      'https://chosech.co.il/?ref=${Uri.encodeComponent(_code)}';

  String get _shareText =>
      'מצאתי אפליקציה שעוזרת לחסוך בחשבונות הסלולר, האינטרנט והטלוויזיה — '
      'השוואה חינמית ושקופה. הקוד שלי: $_code\nSwitchy AI — $_shareLink';

  void _copyCode() {
    Clipboard.setData(ClipboardData(text: _code));
    AppSnackBar.success(context, 'הקוד הועתק');
  }

  void _share() {
    HapticFeedback.lightImpact();
    Share.share(_shareText, subject: 'עזרו לחבר לחסוך בתקשורת');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);

    return StickyCtaScaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
        title: Text('הזמינו חבר',
            style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
      ),
      // The single primary action — share the code — is pinned to the bottom so
      // it stays one tap away while the "how it works" steps scroll.
      cta: AppButton(
        text: 'שתפו את הקוד',
        icon: const Icon(Icons.share_rounded, color: Colors.white, size: 18),
        color: ffTheme.primary,
        height: 52,
        width: double.infinity,
        textStyle: GoogleFonts.rubik(
            fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
        onPressed: () async => _share(),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          // Hero
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              gradient: ffTheme.brandGradient,
              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
              boxShadow: ffTheme.shadowLifted,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                  ),
                  child: const Icon(Icons.card_giftcard_rounded,
                      color: Colors.white, size: 24),
                ),
                const SizedBox(height: 16),
                Text('עזרו לחבר לחסוך',
                    style: GoogleFonts.rubik(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
                const SizedBox(height: 8),
                Text(
                  'שתפו את Switchy AI עם מי שמשלם יותר מדי על תקשורת. השוואה חינמית, '
                  'שקופה וללא התחייבות — מתנה אמיתית, בלי אותיות קטנות.',
                  style: GoogleFonts.assistant(
                      fontSize: 14,
                      height: 1.5,
                      color: Colors.white.withValues(alpha: 0.85)),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.06),

          const SizedBox(height: 20),

          // The code
          Text('הקוד שלך', style: ffTheme.labelMedium)
              .animate()
              .fadeIn(delay: 100.ms),
          const SizedBox(height: 8),
          Semantics(
            label: 'קוד ההזמנה שלך: $_code. הקש להעתקה',
            button: true,
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: _copyCode,
                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
                  decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _code,
                          style: GoogleFonts.rubik(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            color: ffTheme.primary,
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                      Icon(Icons.copy_rounded,
                          size: 20, color: ffTheme.secondaryText),
                    ],
                  ),
                ),
              ),
            ),
          ).animate().fadeIn(delay: 140.ms).slideY(begin: 0.05),

          const SizedBox(height: 24),

          // The primary "share the code" action is pinned as the sticky bottom
          // CTA (see StickyCtaScaffold above), so it stays reachable while the
          // steps below scroll.

          // How it works
          Text('איך זה עובד', style: ffTheme.titleLarge)
              .animate()
              .fadeIn(delay: 240.ms),
          const SizedBox(height: 12),
          ..._steps.asMap().entries.map((e) => _HowStep(
                index: e.key + 1,
                text: e.value,
                ffTheme: ffTheme,
              ).animate().fadeIn(delay: (260 + e.key * 70).ms).slideX(begin: 0.05)),

          const SizedBox(height: 16),

          // Honesty footnote — no fabricated reward.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.verified_user_outlined,
                  size: 15, color: ffTheme.secondaryText),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'אנחנו לא מבטיחים תשלום על שיתוף — השווי הוא בעצם החיסכון שחבר '
                  'שלך יכול למצוא. אם תהיה תוכנית תגמול, היא תופיע כאן במפורש.',
                  style: ffTheme.labelSmall.copyWith(
                      color: ffTheme.secondaryText, height: 1.45),
                ),
              ),
            ],
          ).animate().fadeIn(delay: 460.ms),
        ],
      ),
    );
  }

  static const List<String> _steps = [
    'שתפו את הקוד עם חבר שמשלם יותר מדי על סלולר, אינטרנט או טלוויזיה.',
    'הם מזינים את החשבון ומקבלים השוואה חינמית למסלולים זולים יותר.',
    'הם עוברים למסלול משתלם — וחוסכים בכל חודש.',
  ];
}

// ── One numbered how-it-works step ─────────────────────────────────────────────

class _HowStep extends StatelessWidget {
  const _HowStep(
      {required this.index, required this.text, required this.ffTheme});
  final int index;
  final String text;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: ffTheme.primary,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text('$index',
                  style: GoogleFonts.rubik(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.white)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text,
                style: ffTheme.bodyMedium
                    .copyWith(height: 1.45, color: ffTheme.primaryText)),
          ),
        ],
      ),
    );
  }
}
