import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../data.dart';

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
      _controller.nextPage(duration: const Duration(milliseconds: 350), curve: Curves.easeInOut);
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
      body: Stack(
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
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Center(
                            child: Text('₪',
                                style: GoogleFonts.rubik(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                    color: ffTheme.primaryDark)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text('חוסך', style: GoogleFonts.rubik(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                        const Spacer(),
                        TextButton(
                          onPressed: () {
                            AppState().markOnboardingSeen();
                            context.goNamed('Home');
                          },
                          child: Text('דלג', style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.7))),
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

              // Dots + button
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(3, (i) => AnimatedContainer(
                    duration: ffTheme.motionMedium,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: i == _page ? 28 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: i == _page ? ffTheme.primary : ffTheme.alternate,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  )),
                ),
              ),
              const SizedBox(height: 20),

              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
                child: AppButton(
                  text: _page == 2 ? 'בואו נתחיל לחסוך! 🚀' : 'הבא →',
                  onPressed: () async => _next(),
                  
                    width: double.infinity,
                    height: 58,
                    color: ffTheme.primary,
                    textStyle: ffTheme.titleMedium.copyWith(color: Colors.white),
                    borderRadius: BorderRadius.circular(18),
                  
                ),
              ),
            ],
          ),
        ],
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
          const Text('💰', style: TextStyle(fontSize: 72))
              .animate().scale(duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 20),
          Text(
            'כל המחירים\nבמקום אחד',
            style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: ffTheme.primaryText, height: 1.15),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 12),
          Text(
            'חוסך משווה לכם את החבילות של כל הספקים על סלולר, אינטרנט וטלוויזיה – בשניות.',
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
          ).animate().fadeIn(delay: 350.ms).slideY(begin: 0.1, end: 0),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
            ),
            child: Row(
              children: [
                const Text('🔎', style: TextStyle(fontSize: 24)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'מחירים שקופים מכל הספקים, ללא עמלות נסתרות — אתם מחליטים מה הכי משתלם.',
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
          const Text('🔍', style: TextStyle(fontSize: 72))
              .animate().scale(duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 20),
          Text(
            'כל הספקים\nבמקום אחד',
            style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: ffTheme.primaryText, height: 1.15),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 12),
          Text(
            'השוואה מלאה בין כל מובילי התקשורת — מחירים, תנאים, ביקורות — הכל שקוף.',
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
                  color: p.$3,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: p.$2.withValues(alpha: 0.25)),
                ),
                child: Text(p.$1, style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: p.$2)),
              ).animate(delay: (300 + i * 60).ms).fadeIn(duration: 300.ms).scale(begin: const Offset(0.8, 0.8));
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
          const Text('🤝', style: TextStyle(fontSize: 72))
              .animate().scale(duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 20),
          Text(
            'מעבר קל\nוחלק',
            style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: ffTheme.primaryText, height: 1.15),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 12),
          Text(
            'אנחנו מלווים אתכם בכל שלב — מהבחירה ועד ניוד הקו, ללא עלויות נסתרות.',
            style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          _StepTimeline(ffTheme: ffTheme).animate().fadeIn(delay: 350.ms),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [ffTheme.primaryDark, ffTheme.primary],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                const Icon(Icons.verified_rounded, color: Colors.white, size: 26),
                const SizedBox(height: 8),
                Text(
                  'שירות חינמי לחלוטין',
                  style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
                ),
                const SizedBox(height: 4),
                Text('אין עמלות נסתרות · המספר נשמר · ליווי עד סיום הניוד',
                    style: ffTheme.bodySmall.copyWith(color: Colors.white60), textAlign: TextAlign.center),
              ],
            ),
          ).animate().fadeIn(delay: 550.ms).scale(begin: const Offset(0.95, 0.95)),
        ],
      ),
    );
  }
}

// ── Helper widgets ────────────────────────────────────────────────────────────

class _StatChip extends StatelessWidget {
  const _StatChip({required this.value, required this.label, required this.ffTheme});
  final String value;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8)],
        ),
        child: Column(
          children: [
            Text(value, style: GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w800, color: ffTheme.primary)),
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
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ffTheme.primary.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Icon(icon, color: ffTheme.primary, size: 20),
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
      ('השאלון', 'מה מחפשים? 2 דקות', '📋'),
      ('ההשוואה', 'בחרו את המסלול הטוב ביותר', '🔍'),
      ('הנציג', 'נחזור אליכם תוך שעה', '📞'),
      ('הניוד', 'מספר שמור, 1–3 ימי עסקים', '✅'),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.alternate),
      ),
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
                    decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
                    child: Center(child: Text(s.$3, style: const TextStyle(fontSize: 14))),
                  ),
                  if (!isLast) Container(width: 2, height: 24, color: ffTheme.alternate, margin: const EdgeInsets.symmetric(vertical: 3)),
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
