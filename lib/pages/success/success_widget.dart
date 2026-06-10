import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../data.dart';

class SuccessWidget extends StatefulWidget {
  const SuccessWidget({super.key});

  @override
  State<SuccessWidget> createState() => _SuccessWidgetState();
}

class _SuccessWidgetState extends State<SuccessWidget> {
  // Staggered reveal for checklist items
  final List<bool> _checked = [false, false, false];

  @override
  void initState() {
    super.initState();
    _runChecklist();
  }

  Future<void> _runChecklist() async {
    await Future.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    setState(() => _checked[0] = true);
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    setState(() => _checked[1] = true);
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    setState(() => _checked[2] = true);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final plan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;

    return Scaffold(
      backgroundColor: ffTheme.primary,
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
                  // Outer pulse ring
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      shape: BoxShape.circle,
                    ),
                  ).animate(onPlay: (c) => c.repeat(reverse: true))
                    .scale(begin: const Offset(1, 1), end: const Offset(1.12, 1.12), duration: 1200.ms, curve: Curves.easeInOut),

                  // Main circle
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: ffTheme.secondary,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.check_rounded, size: 56, color: ffTheme.primary),
                  ).animate()
                    .scale(duration: 500.ms, curve: Curves.elasticOut)
                    .then()
                    .shake(hz: 2, duration: 200.ms),

                  // Sparkle top-left
                  Positioned(
                    top: 4,
                    right: 4,
                    child: const Text('✨', style: TextStyle(fontSize: 18))
                        .animate(delay: 400.ms).fadeIn().slideY(begin: -0.5),
                  ),
                  // Sparkle bottom-right
                  Positioned(
                    bottom: 4,
                    left: 4,
                    child: const Text('🎉', style: TextStyle(fontSize: 18))
                        .animate(delay: 600.ms).fadeIn().slideY(begin: 0.5),
                  ),
                ],
              ),

              const SizedBox(height: 28),

              Text(
                'קיבלנו, ${appState.firstName}!',
                style: GoogleFonts.rubik(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
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
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(plan.provider,
                                  style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
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
                            Text('₪${plan.priceText}/${priceUnitShort(plan)}',
                                style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w800, color: ffTheme.secondary)),
                            if (save > 0)
                              Text('חוסך ₪$save/שנה',
                                  style: ffTheme.labelSmall.copyWith(color: ffTheme.secondary.withValues(alpha: 0.85))),
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
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('מה קורה עכשיו?',
                        style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.8))),
                    const SizedBox(height: 14),
                    _CheckItem(
                      checked: _checked[0],
                      text: 'הבקשה נקלטה במערכת',
                      ffTheme: ffTheme,
                    ),
                    const SizedBox(height: 10),
                    _CheckItem(
                      checked: _checked[1],
                      text: 'נציג יחזור אליך תוך שעה',
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
                  _TrustBadge(icon: '🔒', label: 'מאובטח', ffTheme: ffTheme),
                  const SizedBox(width: 24),
                  _TrustBadge(icon: '💸', label: 'ללא עלות', ffTheme: ffTheme),
                  const SizedBox(width: 24),
                  _TrustBadge(icon: '🤝', label: 'ליווי אישי', ffTheme: ffTheme),
                ],
              ).animate().fadeIn(delay: 750.ms),

              const SizedBox(height: 28),

              AppButton(
                text: 'מעקב אחר התהליך',
                onPressed: () async => context.goNamed('Tracker'),
                
                  width: double.infinity,
                  height: 56,
                  color: ffTheme.secondary,
                  textStyle: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: ffTheme.primary),
                  borderRadius: BorderRadius.circular(16),
                
              ).animate().fadeIn(delay: 800.ms),

              const SizedBox(height: 14),

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
    return AnimatedOpacity(
      opacity: checked ? 1.0 : 0.4,
      duration: const Duration(milliseconds: 400),
      child: Row(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: checked ? ffTheme.secondary : Colors.white.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: checked
                ? Icon(Icons.check_rounded, size: 14, color: ffTheme.primary)
                : null,
          ),
          const SizedBox(width: 12),
          Text(text, style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w500, color: Colors.white)),
        ],
      ),
    );
  }
}

class _TrustBadge extends StatelessWidget {
  const _TrustBadge({required this.icon, required this.label, required this.ffTheme});
  final String icon;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(icon, style: const TextStyle(fontSize: 22)),
        const SizedBox(height: 4),
        Text(label, style: ffTheme.labelSmall.copyWith(color: Colors.white.withValues(alpha: 0.7))),
      ],
    );
  }
}
