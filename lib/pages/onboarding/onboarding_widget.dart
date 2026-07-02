import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../legal.dart';

/// Reduced-motion-aware transforms for the carousel's entrance chains: each is
/// a drop-in for its flutter_animate counterpart that KEEPS the fade already on
/// the chain but DROPS the slide/scale transform when the OS asks for reduced
/// motion (`MediaQuery.disableAnimations`).
extension _OnboardSettleX on Animate {
  Animate settleY(BuildContext context, {double begin = 0.2}) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion) return this;
    return slideY(begin: begin, end: 0);
  }

  Animate settleScale(BuildContext context,
      {Offset begin = const Offset(0.9, 0.9),
      Duration? duration,
      Curve? curve}) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion) return this;
    return scale(begin: begin, duration: duration, curve: curve);
  }
}

/// ONE-QUESTION ONBOARDING (Guardian Wave, pillar 2): two slides instead of a
/// three-slide brochure. Slide 1 asks the single question that makes the whole
/// app truthful — "what do you pay for cellular?" — and commits the answer via
/// [AppState.setCurrentBill] (which also marks the category personalized, the
/// pillar-0 TRUTH gate). Slide 2 is the §7b trust disclosure with the LIVE
/// catalogue counts. Finishing lands on Home ("guardian hero"); a guest who
/// skips (or answers "לא יודע") lands on Home with NO personalized bills and
/// therefore sees NO ₪ figures anywhere.
class OnboardingWidget extends StatefulWidget {
  const OnboardingWidget({super.key});

  @override
  State<OnboardingWidget> createState() => _OnboardingWidgetState();
}

class _OnboardingWidgetState extends State<OnboardingWidget> {
  int _page = 0;
  bool _animating = false;
  final _controller = PageController();

  /// The cellular monthly bill chosen on slide 1. Null = no answer (fresh, or
  /// "לא יודע") — nothing is committed and the user stays a TRUTH-clean guest.
  int? _selectedAmount;

  void _next() {
    if (_animating) return;
    if (_page < 1) {
      // COMMIT-ON-ADVANCE: leaving the question slide with a chosen amount
      // records the user's own figure. setCurrentBill also marks the category
      // personalized (pillar 0), unlocking real ₪ figures downstream. No
      // backend call here — persistence rides the normal AppState flow.
      if (_selectedAmount != null) {
        AppState().setCurrentBill('cellular', _selectedAmount!);
      }
      _animating = true;
      _controller.nextPage(duration: const Duration(milliseconds: 350), curve: AppTheme.of(context).easeDrawer);
    } else {
      AppState().markOnboardingSeen();
      // Approved routing change: land straight on Home (the guardian hero).
      // The kAuthGateRequired redirect still forces /auth if the owner flips
      // the gate on — this does NOT weaken auth.
      context.goNamed('Home');
    }
  }

  /// "לא יודע" — clears any tentative pick and advances WITHOUT personalizing:
  /// an honest non-answer must never fabricate a bill.
  void _dontKnow() {
    setState(() => _selectedAmount = null);
    _next();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: DecoratedBox(
        // A faint top-to-bottom glass wash lifts the carousel off flat white
        // (or flat slate on dark) for premium depth, without adding colour.
        decoration: BoxDecoration(gradient: ffTheme.surfaceWash),
        child: Stack(
        children: [
          Column(
            children: [
              // Top brand strip — formal ink-black hero, white text.
              Container(
                decoration: BoxDecoration(
                  gradient: ffTheme.brandGradient,
                  boxShadow: ffTheme.shadowLifted,
                ),
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                    child: Row(
                      children: [
                        Hero(
                          tag: 'brand-mark',
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                            ),
                            child: Center(
                              child: ExcludeSemantics(
                                child: Text('₪',
                                    style: ffTheme.headlineLarge.copyWith(
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.primaryDark)),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text('Switchy AI', style: ffTheme.displaySmall.copyWith(fontWeight: FontWeight.w800, letterSpacing: 0, color: Colors.white)),
                        const Spacer(),
                        // Skip stays available through the first page; on the
                        // last page the primary CTA *is* the finish, so a second
                        // "skip" would only add noise.
                        AnimatedOpacity(
                          opacity: _page < 1 ? 1 : 0,
                          duration: ffTheme.motionMedium,
                          child: IgnorePointer(
                            ignoring: _page >= 1,
                            child: TextButton(
                              onPressed: () {
                                AppState().markOnboardingSeen();
                                context.goNamed('Home');
                              },
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text('דלג',
                                      style: ffTheme.labelMedium.copyWith(
                                          color: Colors.white
                                              .withValues(alpha: 0.85),
                                          fontWeight: FontWeight.w600)),
                                  const SizedBox(width: 2),
                                  Icon(Icons.arrow_back_ios_new_rounded,
                                      size: 11,
                                      color: Colors.white.withValues(alpha: 0.85)),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Pages
              Expanded(
                child: PageView(
                  controller: _controller,
                  onPageChanged: (i) => setState(() { _page = i; _animating = false; }),
                  children: [
                    _BillQuestionPage(
                      ffTheme: ffTheme,
                      selectedAmount: _selectedAmount,
                      onSelect: (v) => setState(() => _selectedAmount = v),
                      onDontKnow: _dontKnow,
                    ),
                    _TrustPage(ffTheme: ffTheme),
                  ],
                ),
              ),

              // Progress dots — the active dot stretches into a green ACTION
              // pill so the eye reads "where am I" at a glance. Announced as a
              // single progress label for screen readers (the marks themselves
              // are decorative).
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                child: Semantics(
                  label: 'שלב ${_page + 1} מתוך 2',
                  liveRegion: true,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(2, (i) => ExcludeSemantics(
                      // Page-dot spring: the active dot stretches into the green
                      // ACTION pill with a hair of overshoot — a premium
                      // first-impression flourish on a RARE, spatial indicator
                      // (where am I in 2 steps). The width morph is the deliberate
                      // shape of this control, so [spring] gives it life without
                      // the gaudiness that an everyday control would forbid.
                      // Reduced motion: the dot snaps to its new width instantly.
                      child: AnimatedContainer(
                        duration: (MediaQuery.maybeOf(context)?.disableAnimations ?? false)
                            ? Duration.zero
                            : ffTheme.motionMedium,
                        curve: ffTheme.spring,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: i == _page ? 28 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          gradient: i == _page ? ffTheme.accentGradient : null,
                          color: i == _page ? null : ffTheme.alternate.withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(4),
                          boxShadow: i == _page ? ffTheme.shadowAccent : null,
                        ),
                      ),
                    )),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
                child: AppButton(
                  text: _page == 1 ? 'בואו נתחיל לחסוך!' : 'הבא →',
                  onPressed: () async => _next(),
                  width: double.infinity,
                  height: 58,
                  // AppColors.primary (const ink) so the button earns the green
                  // ACTION gradient — using the theme-aware token would break that
                  // detection in dark mode.
                  color: AppColors.primary,
                  textStyle: ffTheme.titleMedium.copyWith(color: Colors.white),
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ],
          ),
        ],
      ),
      ),
    );
  }
}

// ── Page 1: The one question — what do you pay for cellular? ─────────────────

class _BillQuestionPage extends StatelessWidget {
  const _BillQuestionPage({
    required this.ffTheme,
    required this.selectedAmount,
    required this.onSelect,
    required this.onDontKnow,
  });
  final AppTheme ffTheme;
  final int? selectedAmount;
  final ValueChanged<int> onSelect;
  final VoidCallback onDontKnow;

  /// Honest preset amounts. 150 is labelled "₪150+" and commits 150 — a floor,
  /// never an inflated guess.
  static const _amounts = [30, 60, 90, 120, 150];

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          _HeroBadge(icon: Icons.receipt_long_outlined, ffTheme: ffTheme),
          const SizedBox(height: 20),
          Semantics(
            header: true,
            child: Text(
              'כמה אתם משלמים בחודש\nעל סלולר?',
              style: ffTheme.displayLarge.copyWith(fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 0, height: 1.15),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 150.ms).settleY(context),
          const SizedBox(height: 12),
          Text(
            'הערכה מספיקה — תמיד אפשר לדייק אחר כך',
            style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          // Amount chips — the bills-screen preset-chip pattern (solid active
          // fill, hairline idle border) sized up to real tap targets (≥48px
          // tall). Active = solid brandAccent + white text: an allowed ACTIVE
          // state, not decorative green.
          Wrap(
            spacing: 10,
            runSpacing: 10,
            alignment: WrapAlignment.center,
            children: [
              ..._amounts.map((v) {
                final isActive = selectedAmount == v;
                return Semantics(
                  button: true,
                  selected: isActive,
                  label: '₪$v לחודש',
                  child: GestureDetector(
                    onTap: () => onSelect(v),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      decoration: BoxDecoration(
                        color: isActive ? ffTheme.brandAccent : ffTheme.background,
                        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        border: Border.all(color: isActive ? ffTheme.brandAccent : ffTheme.alternate),
                      ),
                      child: Text(
                        v == 150 ? '₪150+' : '₪$v',
                        style: ffTheme.titleSmall.copyWith(
                          color: isActive ? Colors.white : ffTheme.secondaryText,
                          fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                );
              }),
              // Ghost escape hatch — clears any pick and auto-advances. A guest
              // who doesn't know stays TRUTH-clean (no fabricated bill).
              Semantics(
                button: true,
                label: 'לא יודע',
                child: GestureDetector(
                  onTap: onDontKnow,
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                      border: Border.all(color: ffTheme.alternate),
                    ),
                    child: Text(
                      'לא יודע',
                      style: ffTheme.titleSmall.copyWith(
                        color: ffTheme.primaryText,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ).animate().fadeIn(delay: 350.ms).settleY(context, begin: 0.1),
        ],
      ),
    );
  }
}

// ── Page 2: Trust — §7b disclosure + live catalogue counts ──────────────────

class _TrustPage extends StatelessWidget {
  const _TrustPage({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          _HeroBadge(icon: Icons.verified_outlined, ffTheme: ffTheme),
          const SizedBox(height: 20),
          Semantics(
            header: true,
            child: Text(
              'שקוף. הוגן. חינמי.',
              style: ffTheme.displayLarge.copyWith(fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 0, height: 1.15),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 150.ms).settleY(context),
          const SizedBox(height: 12),
          // §7b commission disclosure — the approved wording from lib/legal.dart,
          // verbatim. No new legal copy is authored here.
          Text(
            kCommissionDisclosureBody,
            style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          // Real catalogue counts — never fabricated. Sourced from data.dart so
          // the figures stay honest and update with the catalogue. No ₪ savings
          // figure appears here: nothing has been computed for this user yet.
          Row(
            children: [
              _StatChip(value: '${allPlans.length}', label: 'מסלולים', ffTheme: ffTheme),
              const SizedBox(width: 10),
              _StatChip(value: '${allProviders.length}', label: 'ספקים', ffTheme: ffTheme),
              const SizedBox(width: 10),
              _StatChip(value: '${categories.length}', label: 'קטגוריות', ffTheme: ffTheme),
            ],
          ).animate().fadeIn(delay: 350.ms).settleY(context, begin: 0.1),
        ],
      ),
    );
  }
}

// ── Helper widgets ────────────────────────────────────────────────────────────

/// The slide's focal mark — BANK-GRADE: a compact 68px medallion on the card
/// surface with a thin 1px hairline ring (no big filled disc, no glow), so the
/// slide leads with the headline instead of an oversized illustration.
/// Decorative: the headline below carries the meaning.
class _HeroBadge extends StatelessWidget {
  const _HeroBadge({required this.icon, required this.ffTheme});
  final IconData icon;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 68,
      height: 68,
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        shape: BoxShape.circle,
        border: Border.all(color: ffTheme.alternate),
      ),
      child: ExcludeSemantics(child: Icon(icon, size: 30, color: ffTheme.brandAccent)),
    ).animate().settleScale(context, begin: const Offset(0.9, 0.9), duration: 500.ms, curve: ffTheme.spring);
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.value, required this.label, required this.ffTheme});
  final String value;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
        child: Column(
          children: [
            // BANK-GRADE: data is INK, never green — the dedicated stat-numeral
            // token (24/w700/tabular, primaryText). Green stays reserved for
            // CTAs / SavingPill / active accents.
            Text(value, style: ffTheme.numericMedium),
            Text(label, style: ffTheme.labelSmall),
          ],
        ),
      ),
    );
  }
}
