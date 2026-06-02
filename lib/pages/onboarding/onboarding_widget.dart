import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

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
      FFAppState().markOnboardingSeen();
      context.goNamed('Quiz');
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          Column(
            children: [
              // Top brand strip
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [ffTheme.primary, ffTheme.tertiary],
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                  ),
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
                            color: ffTheme.secondary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Center(child: Text('✦', style: TextStyle(fontSize: 20))),
                        ),
                        const SizedBox(width: 10),
                        Text('חוסך', style: GoogleFonts.rubik(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                        const Spacer(),
                        TextButton(
                          onPressed: () {
                            FFAppState().markOnboardingSeen();
                            context.goNamed('Home');
                          },
                          child: Text('דלג', style: ffTheme.labelMedium.override(color: Colors.white.withOpacity(0.7))),
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
                    duration: const Duration(milliseconds: 300),
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
                child: FFButtonWidget(
                  text: _page == 2 ? 'בואו נתחיל לחסוך! 🚀' : 'הבא →',
                  onPressed: () async => _next(),
                  options: FFButtonOptions(
                    width: double.infinity,
                    height: 58,
                    color: ffTheme.primary,
                    textStyle: ffTheme.titleMedium.override(color: Colors.white),
                    borderRadius: BorderRadius.circular(18),
                  ),
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

class _Page1 extends StatefulWidget {
  const _Page1({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

  @override
  State<_Page1> createState() => _Page1State();
}

class _Page1State extends State<_Page1> {
  static const _testimonials = [
    ('"עברתי מ-₪150 ל-₪49 בחודש — חסכתי ₪1,212 השנה!"', 'מיכאל כ. | סלולר'),
    ('"מעבר אינטרנט ל-yes ב-3 ימים. ₪960 חיסכון לשנה!"', 'רחל מ. | אינטרנט'),
    ('"חבילה משולבת רמי לוי — ₪2,400 פחות בשנה 🤩"', 'עמית ב. | חבילה משולבת'),
  ];
  int _tIdx = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (mounted) setState(() => _tIdx = (_tIdx + 1) % _testimonials.length);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = widget.ffTheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          Text('💰', style: const TextStyle(fontSize: 72))
              .animate().scale(duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 20),
          Text(
            'חסכו עד\n₪1,200 בשנה',
            style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26), height: 1.15),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 12),
          Text(
            'חוסך מוצא לכם את החבילה הכי זולה על סלולר, אינטרנט וטלוויזיה – בשניות.',
            style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          Row(
            children: [
              _StatChip(value: '100+', label: 'מסלולים', ffTheme: ffTheme),
              const SizedBox(width: 10),
              _StatChip(value: '60K', label: 'לקוחות', ffTheme: ffTheme),
              const SizedBox(width: 10),
              _StatChip(value: '₪15', label: 'מחיר מינימום', ffTheme: ffTheme),
            ],
          ).animate().fadeIn(delay: 350.ms).slideY(begin: 0.1, end: 0),
          const SizedBox(height: 20),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 500),
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 0.08), end: Offset.zero).animate(anim),
                child: child,
              ),
            ),
            child: Container(
              key: ValueKey(_tIdx),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: ffTheme.primary.withOpacity(0.15)),
              ),
              child: Row(
                children: [
                  const Text('⭐', style: TextStyle(fontSize: 24)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_testimonials[_tIdx].$1,
                            style: ffTheme.bodyMedium.override(color: ffTheme.primaryText, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text(_testimonials[_tIdx].$2, style: ffTheme.labelSmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ).animate().fadeIn(delay: 450.ms),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(_testimonials.length, (i) => AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == _tIdx ? 20 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: i == _tIdx ? ffTheme.primary : ffTheme.alternate,
                borderRadius: BorderRadius.circular(3),
              ),
            )),
          ),
        ],
      ),
    );
  }
}

// ── Page 2: Compare all providers ────────────────────────────────────────────

class _Page2 extends StatelessWidget {
  const _Page2({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

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
          Text('🔍', style: const TextStyle(fontSize: 72))
              .animate().scale(duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 20),
          Text(
            'כל הספקים\nבמקום אחד',
            style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26), height: 1.15),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 12),
          Text(
            'השוואה מלאה בין כל מובילי התקשורת — מחירים, תנאים, ביקורות — הכל שקוף.',
            style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText),
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
                  border: Border.all(color: p.$2.withOpacity(0.25)),
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
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
      child: Column(
        children: [
          Text('🤝', style: const TextStyle(fontSize: 72))
              .animate().scale(duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 20),
          Text(
            'מעבר קל\nוחלק',
            style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26), height: 1.15),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 12),
          Text(
            'אנחנו מלווים אתכם בכל שלב — מהבחירה ועד ניוד הקו, ללא עלויות נסתרות.',
            style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 250.ms),
          const SizedBox(height: 28),
          _StepTimeline(ffTheme: ffTheme).animate().fadeIn(delay: 350.ms),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [const Color(0xFF0E3A26), ffTheme.primary],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(5, (i) => const Icon(Icons.star_rounded, color: Color(0xFFC9EC4B), size: 18)),
                ),
                const SizedBox(height: 8),
                Text(
                  '4.8 | 60,000+ לקוחות מרוצים',
                  style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
                ),
                const SizedBox(height: 4),
                Text('הורדה חינמית · אין עמלות נסתרות',
                    style: ffTheme.bodySmall.override(color: Colors.white60)),
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
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 8)],
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
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ffTheme.primary.withOpacity(0.1)),
      ),
      child: Row(
        children: [
          Icon(icon, color: ffTheme.primary, size: 20),
          const SizedBox(width: 10),
          Text(text, style: ffTheme.bodyMedium.override(color: ffTheme.primaryText)),
        ],
      ),
    );
  }
}

class _StepTimeline extends StatelessWidget {
  const _StepTimeline({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

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
                      Text(s.$1, style: ffTheme.titleSmall.override(fontSize: 13)),
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
