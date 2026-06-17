import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';

class OnboardingWidget extends StatefulWidget {
  const OnboardingWidget({super.key});

  @override
  State<OnboardingWidget> createState() => _OnboardingWidgetState();
}

class _OnboardingWidgetState extends State<OnboardingWidget>
    with TickerProviderStateMixin {
  int _page = 0;
  final _controller = PageController();
  late final AnimationController _dotController;

  @override
  void initState() {
    super.initState();
    _dotController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    );
  }

  void _goToQuiz() {
    AppState().markOnboardingSeen();
    context.goNamed('Quiz');
  }

  void _next() {
    if (_page < 2) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOutCubic,
      );
    } else {
      _goToQuiz();
    }
  }

  void _prev() {
    if (_page > 0) {
      _controller.previousPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOutCubic,
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _dotController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final isLast = _page == 2;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.background,
              AppColors.brandAccentTint.withValues(alpha: 0.35),
              AppColors.background,
            ],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // ── Top bar ──────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                child: Row(
                  children: [
                    // Back arrow (hidden on step 0)
                    AnimatedOpacity(
                      opacity: _page > 0 ? 1 : 0,
                      duration: t.motionMedium,
                      child: Semantics(
                        button: true,
                        label: 'חזרה',
                        child: GestureDetector(
                          onTap: _page > 0 ? _prev : null,
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: t.secondaryBackground,
                              borderRadius:
                                  BorderRadius.circular(t.radiusSm),
                              border: Border.all(
                                  color: t.lineColor, width: 1.5),
                              boxShadow: t.shadowSoft,
                            ),
                            child: Icon(Icons.arrow_forward_ios_rounded,
                                size: 16, color: t.primaryText),
                          ),
                        ),
                      ),
                    ),

                    const Spacer(),

                    // Brand logo mark
                    Row(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            gradient: t.accentGradient,
                            borderRadius: BorderRadius.circular(t.radiusXs),
                            boxShadow: t.shadowAccent,
                          ),
                          child: Center(
                            child: Text(
                              '₪',
                              style: GoogleFonts.rubik(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'חוסך',
                          style: GoogleFonts.rubik(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primaryText),
                        ),
                      ],
                    ),

                    const Spacer(),

                    // Skip link
                    Semantics(
                      button: true,
                      label: 'דלג לשאלון',
                      child: TextButton(
                        onPressed: _goToQuiz,
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 8),
                        ),
                        child: Text(
                          'דלג',
                          style: t.labelMedium.copyWith(
                              color: AppColors.brandAccent,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // ── Pages ────────────────────────────────────────────────────
              Expanded(
                child: PageView(
                  controller: _controller,
                  onPageChanged: (i) => setState(() => _page = i),
                  children: const [
                    _Step1(),
                    _Step2(),
                    _Step3(),
                  ],
                ),
              ),

              // ── Dots indicator ───────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 16),
                child: Semantics(
                  label: 'שלב ${_page + 1} מתוך 3',
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(3, (i) {
                      final active = i == _page;
                      return ExcludeSemantics(
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOut,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: active ? 28 : 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: active
                                ? AppColors.brandAccent
                                : AppColors.brandAccent.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ),

              // ── CTA button ───────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
                child: AppButton(
                  key: ValueKey(isLast),
                  text: isLast ? '!יאלה, מתחילים' : 'הבא ←',
                  onPressed: () async => _next(),
                  color: AppColors.primary,
                  width: double.infinity,
                  height: 58,
                  textStyle: GoogleFonts.rubik(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white),
                  borderRadius: BorderRadius.circular(t.radiusLg),
                ).animate(key: ValueKey('btn_$_page')).fadeIn(duration: 300.ms),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — ברוכים הבאים לחוסך
// ─────────────────────────────────────────────────────────────────────────────

class _Step1 extends StatelessWidget {
  const _Step1();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 12),
      child: Column(
        children: [
          // Illustration — geometric coin stack / savings motif
          const _IllustrationStep1()
              .animate()
              .fadeIn(duration: 600.ms, curve: Curves.easeOut)
              .slideY(begin: 0.15, end: 0, duration: 600.ms, curve: Curves.easeOut),

          const SizedBox(height: 28),

          Text(
            'מצא את הסלולר\nהזול ביותר עבורך',
            style: GoogleFonts.rubik(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                color: AppColors.primaryText,
                height: 1.2),
            textAlign: TextAlign.center,
          )
              .animate()
              .fadeIn(delay: 150.ms, duration: 500.ms)
              .slideY(begin: 0.2, end: 0, delay: 150.ms, duration: 500.ms),

          const SizedBox(height: 12),

          Text(
            'אפליקציית ההשוואה החכמה של ישראל',
            style: t.bodyLarge.copyWith(color: AppColors.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 270.ms, duration: 500.ms),

          const SizedBox(height: 28),

          // Accent badge
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            decoration: BoxDecoration(
              gradient: t.accentGradient,
              borderRadius: BorderRadius.circular(t.radiusPill),
              boxShadow: t.shadowAccent,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.verified_rounded,
                    color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Text(
                  'חינמי לחלוטין · ללא עמלות נסתרות',
                  style: GoogleFonts.rubik(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.white),
                ),
              ],
            ),
          )
              .animate()
              .fadeIn(delay: 380.ms, duration: 500.ms)
              .slideY(begin: 0.1, end: 0, delay: 380.ms, duration: 400.ms),

          const SizedBox(height: 20),

          // Feature rows
          _FeatureRow(
            icon: Icons.search_rounded,
            text: 'השוואה מלאה בין כל ספקי התקשורת',
            delay: 460.ms,
          ),
          const SizedBox(height: 10),
          _FeatureRow(
            icon: Icons.auto_awesome_rounded,
            text: 'המלצות חכמות מותאמות לצריכה שלך',
            delay: 540.ms,
          ),
          const SizedBox(height: 10),
          _FeatureRow(
            icon: Icons.savings_outlined,
            text: 'גלה כמה תחסוך כבר היום',
            delay: 620.ms,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — מלא את החשבונות שלך
// ─────────────────────────────────────────────────────────────────────────────

class _Step2 extends StatelessWidget {
  const _Step2();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 12),
      child: Column(
        children: [
          const _IllustrationStep2()
              .animate()
              .fadeIn(duration: 600.ms, curve: Curves.easeOut)
              .slideX(begin: 0.1, end: 0, duration: 600.ms, curve: Curves.easeOut),

          const SizedBox(height: 28),

          Text(
            'כמה אתה\nמשלם היום?',
            style: GoogleFonts.rubik(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                color: AppColors.primaryText,
                height: 1.2),
            textAlign: TextAlign.center,
          )
              .animate()
              .fadeIn(delay: 150.ms, duration: 500.ms)
              .slideY(begin: 0.2, end: 0, delay: 150.ms, duration: 500.ms),

          const SizedBox(height: 12),

          Text(
            'הכנס את החשבונות הנוכחיים שלך — סלולר, אינטרנט, טלוויזיה',
            style: t.bodyLarge.copyWith(color: AppColors.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 270.ms, duration: 500.ms),

          const SizedBox(height: 28),

          // Category chips
          Row(
            children: [
              _CategoryChip(
                  icon: Icons.smartphone_rounded,
                  label: 'סלולר',
                  delay: 380.ms),
              const SizedBox(width: 10),
              _CategoryChip(
                  icon: Icons.public_rounded,
                  label: 'אינטרנט',
                  delay: 460.ms),
              const SizedBox(width: 10),
              _CategoryChip(
                  icon: Icons.tv_rounded,
                  label: 'טלוויזיה',
                  delay: 540.ms),
            ],
          ),

          const SizedBox(height: 24),

          // Illustrative bill card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(t.radiusLg),
              border: Border.all(color: AppColors.lineColor, width: 1.5),
              boxShadow: t.shadowCard,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.brandAccentTint,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.receipt_long_rounded,
                          color: AppColors.brandAccent, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'החשבונות שלך',
                      style: GoogleFonts.rubik(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primaryText),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const _BillRow(label: 'סלולר', amount: '₪89'),
                const _BillRow(label: 'אינטרנט', amount: '₪149'),
                const _BillRow(label: 'טלוויזיה', amount: '₪229'),
                const Divider(height: 20, color: AppColors.lineColor),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'סה"כ חודשי',
                      style: GoogleFonts.rubik(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primaryText),
                    ),
                    Text(
                      '₪467',
                      style: GoogleFonts.rubik(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: AppColors.primaryText,
                          fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                  ],
                ),
              ],
            ),
          )
              .animate()
              .fadeIn(delay: 620.ms, duration: 500.ms)
              .slideY(begin: 0.1, end: 0, delay: 620.ms, duration: 400.ms),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — קבל המלצות מותאמות
// ─────────────────────────────────────────────────────────────────────────────

class _Step3 extends StatelessWidget {
  const _Step3();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 12),
      child: Column(
        children: [
          const _IllustrationStep3()
              .animate()
              .fadeIn(duration: 600.ms, curve: Curves.easeOut)
              .scale(
                  begin: const Offset(0.88, 0.88),
                  end: const Offset(1, 1),
                  duration: 600.ms,
                  curve: Curves.easeOutBack),

          const SizedBox(height: 28),

          Text(
            'חסוך עד אלפי\nשקלים בשנה',
            style: GoogleFonts.rubik(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                color: AppColors.primaryText,
                height: 1.2),
            textAlign: TextAlign.center,
          )
              .animate()
              .fadeIn(delay: 150.ms, duration: 500.ms)
              .slideY(begin: 0.2, end: 0, delay: 150.ms, duration: 500.ms),

          const SizedBox(height: 12),

          Text(
            'המנוע החכם שלנו ימצא את התוכנית הכי משתלמת בשבילך',
            style: t.bodyLarge.copyWith(color: AppColors.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 270.ms, duration: 500.ms),

          const SizedBox(height: 24),

          // Savings badge — amber VALUE accent
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.saving.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(t.radiusLg),
              border: Border.all(
                  color: AppColors.saving.withValues(alpha: 0.35),
                  width: 1.5),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.savings_rounded,
                    color: AppColors.savingDark, size: 24),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'בממוצע חוסכים',
                      style: GoogleFonts.assistant(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.savingDark,
                          height: 1.1),
                    ),
                    Text(
                      '₪1,200 בשנה',
                      style: GoogleFonts.rubik(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: AppColors.savingDark,
                          height: 1.1,
                          fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                  ],
                ),
              ],
            ),
          )
              .animate()
              .fadeIn(delay: 380.ms, duration: 500.ms)
              .scale(
                  begin: const Offset(0.92, 0.92),
                  end: const Offset(1, 1),
                  delay: 380.ms,
                  duration: 400.ms,
                  curve: Curves.easeOutBack),

          const SizedBox(height: 24),

          // How it works — 3 quick steps
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(t.radiusLg),
              border: Border.all(color: AppColors.lineColor, width: 1.5),
              boxShadow: t.shadowCard,
            ),
            child: Column(
              children: [
                _HowItWorksRow(
                  step: '1',
                  icon: Icons.assignment_outlined,
                  title: 'ממלאים שאלון קצר',
                  sub: '2 דקות בלבד',
                  delay: 500.ms,
                ),
                const SizedBox(height: 14),
                _HowItWorksRow(
                  step: '2',
                  icon: Icons.compare_arrows_rounded,
                  title: 'מקבלים המלצה מותאמת',
                  sub: 'מחירים ותנאים שקופים',
                  delay: 590.ms,
                ),
                const SizedBox(height: 14),
                _HowItWorksRow(
                  step: '3',
                  icon: Icons.check_circle_outline_rounded,
                  title: 'חוסכים מיד',
                  sub: 'ניוד קל ב-1–3 ימי עסקים',
                  delay: 680.ms,
                ),
              ],
            ),
          ).animate().fadeIn(delay: 500.ms, duration: 500.ms),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Illustrations — pure geometric / Unicode, no asset files
// ─────────────────────────────────────────────────────────────────────────────

class _IllustrationStep1 extends StatelessWidget {
  const _IllustrationStep1();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SizedBox(
      height: 160,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Outer glow ring
          Container(
            width: 148,
            height: 148,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.brandAccentTint,
            ),
          ),
          // Middle ring
          Container(
            width: 118,
            height: 118,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: t.accentGradient,
              boxShadow: t.shadowAccent,
            ),
          ),
          // Centre symbol
          Text(
            '₪',
            style: GoogleFonts.rubik(
                fontSize: 56,
                fontWeight: FontWeight.w900,
                color: Colors.white),
          ),
          // Orbiting chip — top right
          const Positioned(
            top: 8,
            right: 4,
            child: _MiniChip(label: 'סלקום', color: Color(0xFFCC2244)),
          ),
          // Orbiting chip — bottom left
          const Positioned(
            bottom: 8,
            left: 4,
            child: _MiniChip(label: 'פלאפון', color: Color(0xFFE07034)),
          ),
        ],
      ),
    );
  }
}

class _IllustrationStep2 extends StatelessWidget {
  const _IllustrationStep2();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SizedBox(
      height: 160,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Background circle
          Container(
            width: 148,
            height: 148,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.brandAccentTint,
            ),
          ),
          // Receipt stack — three layered cards
          Positioned(
            top: 22,
            right: 28,
            child: _ReceiptCard(
                color: Colors.white,
                shadow: t.shadowSoft,
                rotate: 0.08),
          ),
          Positioned(
            top: 30,
            left: 28,
            child: _ReceiptCard(
                color: AppColors.accent2,
                shadow: t.shadowSoft,
                rotate: -0.06),
          ),
          // Centre receipt
          _ReceiptCard(
            color: Colors.white,
            shadow: t.shadowCard,
            rotate: 0,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.receipt_long_rounded,
                    color: AppColors.brandAccent, size: 30),
                const SizedBox(height: 4),
                Text(
                  '₪467',
                  style: GoogleFonts.rubik(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: AppColors.primaryText,
                      fontFeatures: const [FontFeature.tabularFigures()]),
                ),
                Text(
                  'לחודש',
                  style: GoogleFonts.assistant(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.secondaryText),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _IllustrationStep3 extends StatelessWidget {
  const _IllustrationStep3();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SizedBox(
      height: 160,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Outer amber glow
          Container(
            width: 148,
            height: 148,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.saving.withValues(alpha: 0.1),
            ),
          ),
          // Inner circle
          Container(
            width: 112,
            height: 112,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                colors: [AppColors.saving, AppColors.savingDark],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.saving.withValues(alpha: 0.4),
                  blurRadius: 22,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
          ),
          // Centre icon
          const Icon(Icons.savings_rounded, color: Colors.white, size: 48),
          // Spark badges
          Positioned(
            top: 10,
            right: 10,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.brandAccent,
                borderRadius: BorderRadius.circular(t.radiusPill),
              ),
              child: Text(
                '-30%',
                style: GoogleFonts.rubik(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    fontFeatures: const [FontFeature.tabularFigures()]),
              ),
            ),
          ),
          Positioned(
            bottom: 14,
            left: 6,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.primaryText,
                borderRadius: BorderRadius.circular(t.radiusPill),
              ),
              child: Text(
                '✓ המלצה',
                style: GoogleFonts.rubik(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared small widgets
// ─────────────────────────────────────────────────────────────────────────────

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({
    required this.icon,
    required this.text,
    required this.delay,
  });
  final IconData icon;
  final String text;
  final Duration delay;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(t.radiusSm),
        border: Border.all(color: AppColors.lineColor, width: 1.5),
        boxShadow: t.shadowSoft,
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: AppColors.brandAccentTint,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: AppColors.brandAccent, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: t.bodyMedium.copyWith(
                  color: AppColors.primaryText,
                  fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(delay: delay, duration: 400.ms).slideY(
        begin: 0.1, end: 0, delay: delay, duration: 400.ms);
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.icon,
    required this.label,
    required this.delay,
  });
  final IconData icon;
  final String label;
  final Duration delay;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Expanded(
      child: Semantics(
        label: label,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(t.radiusMd),
            border: Border.all(
                color: AppColors.brandAccent.withValues(alpha: 0.25),
                width: 1.5),
            boxShadow: t.shadowSoft,
          ),
          child: Column(
            children: [
              ExcludeSemantics(
                child: Icon(icon, color: AppColors.brandAccent, size: 26),
              ),
              const SizedBox(height: 6),
              ExcludeSemantics(
                child: Text(
                  label,
                  style: GoogleFonts.rubik(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primaryText),
                ),
              ),
            ],
          ),
        ),
      ).animate().fadeIn(delay: delay, duration: 400.ms).scale(
          begin: const Offset(0.88, 0.88),
          end: const Offset(1, 1),
          delay: delay,
          duration: 400.ms,
          curve: Curves.easeOutBack),
    );
  }
}

class _BillRow extends StatelessWidget {
  const _BillRow({
    required this.label,
    required this.amount,
  });
  final String label;
  final String amount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.assistant(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.secondaryText),
          ),
          Text(
            amount,
            style: GoogleFonts.rubik(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryText,
                fontFeatures: const [FontFeature.tabularFigures()]),
          ),
        ],
      ),
    );
  }
}

class _HowItWorksRow extends StatelessWidget {
  const _HowItWorksRow({
    required this.step,
    required this.icon,
    required this.title,
    required this.sub,
    required this.delay,
  });
  final String step;
  final IconData icon;
  final String title;
  final String sub;
  final Duration delay;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            gradient: t.accentGradient,
            shape: BoxShape.circle,
            boxShadow: t.shadowAccent,
          ),
          child: Center(
            child: Text(
              step,
              style: GoogleFonts.rubik(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: Colors.white),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: t.titleSmall
                    .copyWith(color: AppColors.primaryText, fontSize: 14),
              ),
              Text(sub,
                  style:
                      t.labelSmall.copyWith(color: AppColors.secondaryText)),
            ],
          ),
        ),
        Icon(icon, color: AppColors.brandAccent, size: 22),
      ],
    ).animate().fadeIn(delay: delay, duration: 400.ms).slideX(
        begin: 0.08, end: 0, delay: delay, duration: 400.ms);
  }
}

class _MiniChip extends StatelessWidget {
  const _MiniChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3), width: 1.5),
        boxShadow: AppTheme.of(context).shadowSoft,
      ),
      child: Text(
        label,
        style: GoogleFonts.rubik(
            fontSize: 11, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

class _ReceiptCard extends StatelessWidget {
  const _ReceiptCard({
    required this.color,
    required this.shadow,
    required this.rotate,
    this.child,
  });
  final Color color;
  final List<BoxShadow> shadow;
  final double rotate;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Transform.rotate(
      angle: rotate,
      child: Container(
        width: 90,
        height: 110,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(t.radiusMd),
          border: Border.all(color: AppColors.lineColor, width: 1),
          boxShadow: shadow,
        ),
        child: child,
      ),
    );
  }
}
