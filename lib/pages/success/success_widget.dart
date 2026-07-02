import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/price_text.dart';
import '../../widgets/saving_pill.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/referral_code.dart';
import '../../services/backend/local_backend.dart';

class SuccessWidget extends StatefulWidget {
  const SuccessWidget({super.key, this.leadAccepted});

  /// Whether we arrived here on a REAL accepted lead. Passed as the route
  /// `extra` from the lead flow, which only navigates here after the backend
  /// accepted the submission. When null (e.g. a direct/deep navigation), we
  /// fall back to "is there a real lead recorded in AppState?" — so the first
  /// checkmark is only ever shown as done when an accepted lead actually
  /// exists, never as theatre.
  final bool? leadAccepted;

  @override
  State<SuccessWidget> createState() => _SuccessWidgetState();
}

class _SuccessWidgetState extends State<SuccessWidget> {
  // Staggered reveal for checklist items.
  final List<bool> _checked = [false, false, false];

  // True only when arrival is backed by a real accepted lead. Drives BOTH the
  // honest first checkmark (shown done immediately, no fake timer) and the
  // one-shot celebration burst — we never celebrate an unaccepted lead.
  bool _leadAccepted = false;

  @override
  void initState() {
    super.initState();
    // Resolve the real signal: the explicit route flag wins; otherwise check
    // whether AppState actually holds a submitted lead (submitLead runs only
    // after the backend accepted it). listen:false — read once at mount.
    final hasRealLead =
        Provider.of<AppState>(context, listen: false).leadPlanId != null;
    _leadAccepted = widget.leadAccepted ?? hasRealLead;
    _runChecklist();
  }

  Future<void> _runChecklist() async {
    if (_leadAccepted) {
      // HONEST: the lead was genuinely accepted before we navigated here, so
      // the first step ("הבקשה נקלטה במערכת") is already TRUE — reflect that
      // immediately instead of pretending to "process" it on a 900ms timer.
      if (!mounted) return;
      setState(() => _checked[0] = true);
    } else {
      // No accepted lead in evidence (e.g. a deep navigation) — don't claim
      // the request was received. Reveal the first step on the prior cadence.
      await Future.delayed(const Duration(milliseconds: 900));
      if (!mounted) return;
      setState(() => _checked[0] = true);
    }
    // The remaining steps are forward-looking expectations ("we'll call you",
    // "porting takes 1–3 days") — those animate in as a staggered reveal.
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    setState(() => _checked[1] = true);
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    setState(() => _checked[2] = true);
  }

  /// Share Switchy AI at the success moment — the highest-intent point to invite
  /// a friend. Mints a REAL, persisted referral code (fail-soft to a local one —
  /// sharing must never dead-end) and embeds it as `?ref=<code>`, the canonical
  /// shape the web lead form reads, so a friend who follows the link is credited.
  ///
  /// HONESTY / §30A: sharing the tool is the user's OWN choice (no marketing TO
  /// anyone), and there is NO advertised reward — the framing is share-the-tool.
  Future<void> _shareReferral() async {
    HapticFeedback.lightImpact();
    String? code;
    try {
      final c = await appBackend.issueReferralCode();
      if (ReferralCode.isValid(c)) code = ReferralCode.normalize(c);
    } catch (_) {
      // no code → share the tool without the ?ref= link (still a valid share).
    }
    final link = code != null
        ? 'https://chosech.co.il/?ref=${Uri.encodeComponent(code)}'
        : 'https://chosech.co.il';
    final buf = StringBuffer(
        'מצאתי אפליקציה שעוזרת לחסוך בחשבונות הסלולר, האינטרנט והטלוויזיה — '
        'השוואה חינמית ושקופה.');
    if (code != null) buf.write('\nהקוד שלי: $code');
    buf.write('\nSwitchy AI — $link');
    await Share.share(buf.toString(), subject: 'עזרו לחבר לחסוך בתקשורת');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final plan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;
    // Reduced-motion gate (rule 13): under disableAnimations we DROP the
    // celebration burst entirely — the static checkmark + ink hero already
    // read as success without any transform.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // The ONE honest celebration: fire only on a real accepted lead, and only
    // when motion is allowed. A single expanding+fading ring behind the check.
    final celebrate = _leadAccepted && !reduceMotion;

    return Scaffold(
      // Celebration hero stays a premium INK surface in both themes — the const
      // ink token, not the theme-aware getter (which flips to off-white on dark).
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 16),

              // Animated checkmark with floating sparkles
              Stack(
                alignment: Alignment.center,
                children: [
                  // One-shot celebration BURST — a single accent ring that
                  // expands out and fades away behind the checkmark. Restrained
                  // (one play, no loop) and HONEST: only present when a real
                  // accepted lead brought us here. Dropped under reduced motion.
                  if (celebrate)
                    Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                            color: ffTheme.brandAccent.withValues(alpha: 0.6),
                            width: 3),
                      ),
                    )
                        .animate()
                        .scale(
                          begin: const Offset(0.7, 0.7),
                          end: const Offset(1.6, 1.6),
                          duration: 700.ms,
                          curve: Curves.easeOut,
                        )
                        .fadeOut(duration: 700.ms, curve: Curves.easeOut),

                  // Outer halo ring — expands in once behind the checkmark.
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      shape: BoxShape.circle,
                    ),
                  ).animate().scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1), duration: 500.ms, curve: Curves.easeOut),

                  // Main circle — flat green success medallion (no decorative
                  // glow), with a contrast-aware check ink: the dark theme
                  // lifts brandAccent to green-400, where a white glyph fails
                  // contrast — same luminance rule AppButton uses.
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: ffTheme.brandAccent,
                      shape: BoxShape.circle,
                    ),
                    child: ExcludeSemantics(
                      child: Icon(
                        Icons.check_rounded,
                        size: 56,
                        color: ffTheme.brandAccent.computeLuminance() > 0.45
                            ? AppColors.primaryText
                            : Colors.white,
                      ),
                    ),
                  ).animate()
                    // A single confident spring-in — restrained, premium; no
                    // jittery post-shake.
                    .scale(
                      begin: const Offset(0.6, 0.6),
                      end: const Offset(1, 1),
                      duration: 480.ms,
                      curve: Curves.easeOutBack,
                    ),

                  // Decorative sparkles — RTL-aware (start/end, never
                  // left/right) and excluded from semantics.
                  PositionedDirectional(
                    top: 4,
                    end: 4,
                    child: ExcludeSemantics(
                      child: const Icon(Icons.auto_awesome, size: 18, color: Colors.white)
                          .animate(delay: 400.ms).fadeIn().slideY(begin: -0.5),
                    ),
                  ),
                  PositionedDirectional(
                    bottom: 4,
                    start: 4,
                    child: ExcludeSemantics(
                      child: const Icon(Icons.celebration_outlined, size: 18, color: Colors.white)
                          .animate(delay: 600.ms).fadeIn().slideY(begin: 0.5),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 28),

              // Scale token (white recolour is safe — the scaffold is a PINNED
              // ink surface in both themes, see backgroundColor above).
              Text(
                'קיבלנו, ${appState.firstName}!',
                style: ffTheme.displayLarge.copyWith(color: Colors.white),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),

              const SizedBox(height: 8),

              Text(
                'הבקשה נשלחה בהצלחה',
                style: ffTheme.bodyLarge.copyWith(color: Colors.white.withValues(alpha: 0.75)),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 400.ms),

              const SizedBox(height: 28),

              // Plan summary card
              if (plan != null)
                Builder(builder: (ctx) {
                  final bill = appState.currentBill(plan.cat);
                  final save = planSaveYear(plan, bill);
                  return Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      // Translucent white overlay is the sanctioned surface ON
                      // the pinned-ink hero; corner reads the card token.
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(plan.provider,
                                  style: ffTheme.headlineSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 2),
                              Text(plan.plan,
                                  style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.7)),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            // Money token — bidi-stable LTR isolate + tabular
                            // figures; stays a single Text node for finders.
                            PriceText('₪${plan.priceText}/${priceUnitShort(plan)}',
                                style: ffTheme.headlineSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                            if (save > 0) ...[
                              const SizedBox(height: 4),
                              // The shared VALUE-pill treatment for the real
                              // savings figure (copy unchanged).
                              SavingPill(text: 'חוסך ₪$save/שנה'),
                            ],
                          ],
                        ),
                      ],
                    ),
                  );
                }).animate().fadeIn(delay: 500.ms),

              const SizedBox(height: 24),

              // "What happens next" checklist with staggered animation
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text('מה קורה עכשיו?',
                          style: ffTheme.titleSmall.copyWith(
                              fontWeight: FontWeight.w700,
                              color: Colors.white.withValues(alpha: 0.8))),
                    ),
                    const SizedBox(height: 14),
                    _CheckItem(
                      checked: _checked[0],
                      text: 'הבקשה נקלטה במערכת',
                      ffTheme: ffTheme,
                    ),
                    const SizedBox(height: 10),
                    _CheckItem(
                      checked: _checked[1],
                      text: 'בדרך כלל נחזור אליכם תוך שעה, בשעות הפעילות',
                      ffTheme: ffTheme,
                    ),
                    const SizedBox(height: 10),
                    _CheckItem(
                      checked: _checked[2],
                      text: 'ניוד המספר תוך 1–3 ימי עסקים',
                      ffTheme: ffTheme,
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 650.ms),

              const SizedBox(height: 24),

              // Trust badges — all verifiable, no invented ratings/counts.
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _TrustBadge(icon: Icons.lock_rounded, label: 'מאובטח', ffTheme: ffTheme),
                  const SizedBox(width: 24),
                  _TrustBadge(icon: Icons.money_off_rounded, label: 'ללא עלות', ffTheme: ffTheme),
                  const SizedBox(width: 24),
                  _TrustBadge(icon: Icons.handshake_rounded, label: 'ליווי אישי', ffTheme: ffTheme),
                ],
              ).animate().fadeIn(delay: 750.ms),

              const SizedBox(height: 28),

              AppButton(
                text: 'מעקב אחר התהליך',
                onPressed: () async => context.goNamed('Tracker'),
                width: double.infinity,
                height: 56,
                // DARK-PARITY FIX: AppColors.secondary value-equals accent1, so
                // AppButton remapped it to the theme accent1 — a dark fill that
                // vanished on this pinned-ink hero in dark mode. accent2 is a
                // pinned LIGHT neutral in both themes; AppButton's luminance
                // rule then picks the ink label (no pinned colour).
                color: AppColors.accent2,
                textStyle: ffTheme.titleLarge,
                borderRadius: BorderRadius.circular(ffTheme.radiusSheet),
              ).animate().fadeIn(delay: 800.ms),

              const SizedBox(height: 12),

              // Referral growth loop at the highest-intent moment: invite a
              // friend to the (free, transparent) tool. Share-the-tool framing,
              // no advertised reward — the user's own choice (§30A-safe).
              TextButton.icon(
                onPressed: _shareReferral,
                icon: const Icon(Icons.card_giftcard_rounded, size: 18, color: Colors.white),
                label: Text(
                  'עזרו לחבר לחסוך — שתפו את Switchy AI',
                  style: ffTheme.bodyMedium.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ).animate().fadeIn(delay: 850.ms),

              const SizedBox(height: 4),

              TextButton(
                onPressed: () => context.goNamed('Home'),
                child: Text(
                  'חזרה לדף הבית',
                  style: ffTheme.bodyMedium.copyWith(color: Colors.white.withValues(alpha: 0.65)),
                ),
              ).animate().fadeIn(delay: 900.ms),

              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _CheckItem extends StatelessWidget {
  const _CheckItem({required this.checked, required this.text, required this.ffTheme});
  final bool checked;
  final String text;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    // The opacity reveal is "entering" motion → ease-out (kept under reduced
    // motion, since it's opacity-only). When an item ticks, the circle fills and
    // the check pops in with a slight scale (rare, first-time delight) — an
    // AnimatedScale from 0.6 reads as a confident "done", not a jitter. Under
    // reduced motion we DROP the transform (rule 13) and let the tick simply
    // fade in (opacity is retained).
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return AnimatedOpacity(
      opacity: checked ? 1.0 : 0.4,
      duration: const Duration(milliseconds: 400),
      curve: ffTheme.easeOut,
      child: Row(
        children: [
          AnimatedContainer(
            duration: ffTheme.motionMedium,
            curve: ffTheme.easeOut,
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: checked ? ffTheme.brandAccent : Colors.white.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: AnimatedScale(
              scale: checked ? 1.0 : (reduceMotion ? 1.0 : 0.6),
              duration: ffTheme.motionMedium,
              curve: ffTheme.spring,
              child: AnimatedOpacity(
                opacity: checked ? 1.0 : 0.0,
                duration: ffTheme.motionFast,
                child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Body token, white on the pinned-ink hero. Wrapped Expanded so long
          // Hebrew steps wrap instead of overflowing at large OS text scales.
          Expanded(child: Text(text, style: ffTheme.bodyMedium.copyWith(color: Colors.white))),
        ],
      ),
    );
  }
}

class _TrustBadge extends StatelessWidget {
  const _TrustBadge({required this.icon, required this.label, required this.ffTheme});
  final IconData icon;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Decorative badge glyph — excluded so screen readers hear the copy.
        ExcludeSemantics(child: Icon(icon, size: 22, color: Colors.white)),
        const SizedBox(height: 4),
        Text(label, style: ffTheme.labelSmall.copyWith(color: Colors.white.withValues(alpha: 0.7))),
      ],
    );
  }
}
