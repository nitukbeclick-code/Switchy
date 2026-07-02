import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../data.dart';

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

class OnboardingWidget extends StatefulWidget {
  const OnboardingWidget({super.key});

  @override
  State<OnboardingWidget> createState() => _OnboardingWidgetState();
}

class _OnboardingWidgetState extends State<OnboardingWidget> {
  int _page = 0;
  bool _animating = false;
  final _controller = PageController();

  void _next() {
    if (_animating) return;
    if (_page < 2) {
      _animating = true;
      _controller.nextPage(duration: const Duration(milliseconds: 350), curve: AppTheme.of(context).easeDrawer);
    } else {
      AppState().markOnboardingSeen();
      context.goNamed('Auth');
    }
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
                        // Skip stays available through the first two pages; on the
                        // last page the primary CTA *is* the finish, so a second
                        // "skip" would only add noise.
                        AnimatedOpacity(
                          opacity: _page < 2 ? 1 : 0,
                          duration: ffTheme.motionMedium,
                          child: IgnorePointer(
                            ignoring: _page >= 2,
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
                    _Page1(ffTheme: ffTheme),
                    _Page2(ffTheme: ffTheme),
                    _Page3(ffTheme: ffTheme),
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
                  label: 'שלב ${_page + 1} מתוך 3',
                  liveRegion: true,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(3, (i) => ExcludeSemantics(
                      // Page-dot spring: the active dot stretches into the green
                      // ACTION pill with a hair of overshoot — a premium
                      // first-impression flourish on a RARE, spatial indicator
                      // (where am I in 3 steps). The width morph is the deliberate
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
                  text: _page == 2 ? 'בואו נתחיל לחסוך!' : 'הבא →',
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

// ── Page 1: Savings value proposition ────────────────────────────────────────

class _Page1 extends StatelessWidget {
  const _Page1({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          _HeroBadge(icon: Icons.savings_outlined, ffTheme: ffTheme),
          const SizedBox(height: 20),
          Semantics(
            header: true,
            child: Text(
              'כל המחירים\nבמקום אחד',
              style: ffTheme.displayLarge.copyWith(fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 0, height: 1.15),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 150.ms).settleY(context),
          const SizedBox(height: 12),
          Text(
            'סלולר, אינטרנט וטלוויזיה — כל החבילות מכל הספקים, מסודרות במקום אחד וברורות להשוואה.',
            style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          // Real catalogue counts — never fabricated. Sourced from data.dart so
          // the figures stay honest and update with the catalogue.
          Row(
            children: [
              _StatChip(value: '${allPlans.length}', label: 'מסלולים', ffTheme: ffTheme),
              const SizedBox(width: 10),
              _StatChip(value: '${allProviders.length}', label: 'ספקים', ffTheme: ffTheme),
              const SizedBox(width: 10),
              _StatChip(value: '${categories.length}', label: 'קטגוריות', ffTheme: ffTheme),
            ],
          ).animate().fadeIn(delay: 350.ms).settleY(context, begin: 0.1),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.circular(ffTheme.radiusLg),
              border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.18)),
              boxShadow: ffTheme.shadowXs,
            ),
            child: Row(
              children: [
                ExcludeSemantics(child: Icon(Icons.verified_outlined, size: 24, color: ffTheme.brandAccent)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'מחירים שקופים, בלי עמלות נסתרות — אתם משווים ומחליטים בעצמכם.',
                    style: ffTheme.bodyMedium.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(delay: 450.ms),
        ],
      ),
    );
  }
}

// ── Page 2: Compare all providers ────────────────────────────────────────────

class _Page2 extends StatelessWidget {
  const _Page2({required this.ffTheme});
  final AppTheme ffTheme;

  static const _providers = [
    ('פלאפון', Color(0xFFE07034), Color(0xFFFFF3EC)),
    ('סלקום', Color(0xFFCC2244), Color(0xFFFFECF0)),
    ('פרטנר', Color(0xFF2255CC), Color(0xFFEEF2FF)),
    ('הוט', Color(0xFF8B1A1A), Color(0xFFFFECEC)),
    ('yes', Color(0xFF1A3A7A), Color(0xFFEEF0FF)),
    ('בזק', Color(0xFF007B8A), Color(0xFFECFAFB)),
    ('גולן', Color(0xFF15603E), Color(0xFFE8F5EE)),
    ('019', Color(0xFF6B35C8), Color(0xFFF3EEFF)),
    ('רמי לוי', Color(0xFF0D47A1), Color(0xFFE3F2FD)),
    ('Airalo', Color(0xFF00897B), Color(0xFFE0F2F1)),
  ];

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          _HeroBadge(icon: Icons.search_rounded, ffTheme: ffTheme),
          const SizedBox(height: 20),
          Semantics(
            header: true,
            child: Text(
              'כל הספקים\nבמקום אחד',
              style: ffTheme.displayLarge.copyWith(fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 0, height: 1.15),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 150.ms).settleY(context),
          const SizedBox(height: 12),
          Text(
            'מחירים, תנאים וביקורות של כל מובילי התקשורת — צד לצד, בלי הפתעות.',
            style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            alignment: WrapAlignment.center,
            children: _providers.asMap().entries.map((e) {
              final i = e.key;
              final p = e.value;
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                  border: Border.all(color: p.$2.withValues(alpha: 0.25)),
                ),
                child: Text(p.$1, style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700, color: p.$2)),
              ).animate(delay: (300 + i * 60).ms).fadeIn(duration: 300.ms).settleScale(context, begin: const Offset(0.8, 0.8));
            }).toList(),
          ),
          const SizedBox(height: 20),
          _FeatureRow(icon: Icons.compare_arrows_rounded, text: 'השוואה ויזואלית צד לצד', ffTheme: ffTheme)
              .animate().fadeIn(delay: 600.ms),
          const SizedBox(height: 8),
          _FeatureRow(icon: Icons.filter_list_rounded, text: 'סינון לפי 5G, ללא התחייבות ועוד', ffTheme: ffTheme)
              .animate().fadeIn(delay: 680.ms),
          const SizedBox(height: 8),
          _FeatureRow(icon: Icons.auto_awesome_rounded, text: 'המלצות AI מותאמות אישית', ffTheme: ffTheme)
              .animate().fadeIn(delay: 760.ms),
        ],
      ),
    );
  }
}

// ── Page 3: Easy switch ───────────────────────────────────────────────────────

class _Page3 extends StatelessWidget {
  const _Page3({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          _HeroBadge(icon: Icons.handshake_outlined, ffTheme: ffTheme),
          const SizedBox(height: 20),
          Semantics(
            header: true,
            child: Text(
              'מעבר קל\nוחלק',
              style: ffTheme.displayLarge.copyWith(fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 0, height: 1.15),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 150.ms).settleY(context),
          const SizedBox(height: 12),
          Text(
            'ליווי אישי בכל שלב — מהבחירה ועד ניוד הקו. אתם בוחרים, אנחנו מסדרים את השאר.',
            style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          _StepTimeline(ffTheme: ffTheme).animate().fadeIn(delay: 350.ms),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: ffTheme.brandGradient,
              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
              boxShadow: ffTheme.shadowLifted,
            ),
            child: Column(
              children: [
                const Icon(Icons.verified_rounded, color: Colors.white, size: 26),
                const SizedBox(height: 8),
                Text(
                  'שירות חינמי לחלוטין',
                  style: ffTheme.titleLarge.copyWith(fontSize: 16, color: Colors.white),
                ),
                const SizedBox(height: 4),
                Text('אין עמלות נסתרות · המספר נשמר · ליווי עד סיום הניוד',
                    style: ffTheme.bodySmall.copyWith(color: Colors.white60), textAlign: TextAlign.center),
              ],
            ),
          ).animate().fadeIn(delay: 550.ms).settleScale(context, begin: const Offset(0.95, 0.95)),
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

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({required this.icon, required this.text, required this.ffTheme});
  final IconData icon;
  final String text;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: ffTheme.brandAccentTint,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          ExcludeSemantics(child: Icon(icon, color: ffTheme.brandAccent, size: 20)),
          const SizedBox(width: 10),
          Text(text, style: ffTheme.bodyMedium.copyWith(color: ffTheme.primaryText)),
        ],
      ),
    );
  }
}

class _StepTimeline extends StatelessWidget {
  const _StepTimeline({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    const steps = [
      ('השאלון', 'מה מחפשים? 2 דקות', Icons.assignment_rounded),
      ('ההשוואה', 'בחרו את המסלול הטוב ביותר', Icons.search_rounded),
      ('הנציג', 'נחזור אליכם תוך שעה', Icons.call_rounded),
      ('הניוד', 'מספר שמור, 1–3 ימי עסקים', Icons.check_rounded),
    ];

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.bentoDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: steps.asMap().entries.map((e) {
          final i = e.key;
          final s = e.value;
          final isLast = i == steps.length - 1;
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      gradient: ffTheme.accentGradient,
                      shape: BoxShape.circle,
                      boxShadow: ffTheme.shadowAccent,
                    ),
                    child: Center(child: ExcludeSemantics(child: Icon(s.$3, size: 16, color: Colors.white))),
                  ),
                  if (!isLast) Container(width: 2, height: 24, color: ffTheme.brandAccent.withValues(alpha: 0.25), margin: const EdgeInsets.symmetric(vertical: 3)),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(top: 4, bottom: isLast ? 0 : 22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.$1, style: ffTheme.titleSmall.copyWith(fontSize: 13)),
                      Text(s.$2, style: ffTheme.labelSmall),
                    ],
                  ),
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }
}
