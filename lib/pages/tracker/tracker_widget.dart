import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';

class TrackerWidget extends StatefulWidget {
  const TrackerWidget({super.key});

  @override
  State<TrackerWidget> createState() => _TrackerWidgetState();
}

class _TrackerWidgetState extends State<TrackerWidget> {
  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final step = appState.trackerStep;
    final plan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;

    final steps = [
      _TrackerStep(icon: Icons.person_add_rounded, title: 'הצטרפות', subtitle: 'פרטים נשלחו בהצלחה', done: step >= 1),
      _TrackerStep(icon: Icons.task_alt_rounded, title: 'אישור מסלול', subtitle: 'נציג אישר את הבקשה', done: step >= 2),
      _TrackerStep(icon: Icons.swap_horiz_rounded, title: 'מדריך ניתוק', subtitle: 'תהליך הניוד בעיצומו', done: step >= 3, active: step == 2),
      _TrackerStep(icon: Icons.check_circle_rounded, title: 'הושלם', subtitle: 'ברוכים הבאים לחבילה החדשה', done: step >= 4),
    ];

    // Empty state — no lead submitted yet
    if (plan == null && step == 0) {
      return Scaffold(
        backgroundColor: ffTheme.background,
        appBar: AppBar(
          title: const Text('מעקב מעבר'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: ffTheme.primaryText,
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.track_changes_rounded, size: 52, color: ffTheme.primary),
                ).animate(onPlay: (c) => c.repeat(reverse: true))
                  .scale(begin: const Offset(1, 1), end: const Offset(1.05, 1.05), duration: 1500.ms, curve: Curves.easeInOut),
                const SizedBox(height: 24),
                Text('עוד לא התחלתם', style: ffTheme.headlineSmall),
                const SizedBox(height: 8),
                Text('בחרו מסלול ושלחו פרטים כדי לעקוב אחר תהליך המעבר',
                    style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                const SizedBox(height: 32),
                FFButtonWidget(
                  text: 'מצא מסלול →',
                  onPressed: () => context.goNamed('Results'),
                  options: FFButtonOptions(
                    width: double.infinity,
                    height: 52,
                    color: ffTheme.primary,
                    textStyle: ffTheme.titleSmall.override(color: Colors.white),
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Completion state
    if (step >= 4) {
      return Scaffold(
        backgroundColor: ffTheme.primary,
        appBar: AppBar(
          title: const Text('מעקב מעבר'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: Colors.white,
          iconTheme: const IconThemeData(color: Colors.white),
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(color: ffTheme.secondary, shape: BoxShape.circle),
                  child: Icon(Icons.verified_rounded, size: 60, color: ffTheme.primary),
                ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
                const SizedBox(height: 24),
                Text('ברוכים הבאים\nלחבילה החדשה! 🎉',
                    style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, height: 1.2),
                    textAlign: TextAlign.center).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),
                const SizedBox(height: 12),
                if (plan != null) ...[
                  Text('${plan.provider} — ₪${plan.price}/חודש',
                      style: ffTheme.bodyLarge.override(color: ffTheme.secondary, fontWeight: FontWeight.w700))
                      .animate().fadeIn(delay: 450.ms),
                  const SizedBox(height: 10),
                  Text('המעבר הושלם בהצלחה. חיסכון שנתי של ₪${planSaveYear(plan, appState.currentBill(plan.cat))} כבר מתחיל!',
                      style: ffTheme.bodyMedium.override(color: Colors.white.withOpacity(0.8)),
                      textAlign: TextAlign.center).animate().fadeIn(delay: 550.ms),
                ] else ...[
                  const SizedBox(height: 10),
                  Text('המעבר הושלם בהצלחה!',
                      style: ffTheme.bodyMedium.override(color: Colors.white.withOpacity(0.8)),
                      textAlign: TextAlign.center).animate().fadeIn(delay: 550.ms),
                ],
                const SizedBox(height: 40),
                FFButtonWidget(
                  text: 'חזרה לדף הבית',
                  onPressed: () => context.goNamed('Home'),
                  options: FFButtonOptions(
                    width: double.infinity,
                    height: 52,
                    color: ffTheme.secondary,
                    textStyle: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: ffTheme.primary),
                    borderRadius: BorderRadius.circular(14),
                  ),
                ).animate().fadeIn(delay: 700.ms),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('מעקב מעבר'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Reassurance banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  const Text('🤝', style: TextStyle(fontSize: 24)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('אנחנו מלווים — לא מנתקים', style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: const Color(0xFF0E3A26))),
                        Text('נציג אישי ילווה אתכם לכל אורך הדרך', style: GoogleFonts.assistant(fontSize: 12, color: const Color(0xFF0E3A26).withOpacity(0.8))),
                      ],
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(duration: 400.ms),

            const SizedBox(height: 16),

            // Savings counter card
            if (plan != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ffTheme.alternate),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('החיסכון הצפוי שלך', style: ffTheme.labelMedium.override(color: ffTheme.secondaryText)),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '₪${planSaveYear(plan, appState.currentBill(plan.cat))}',
                          style: ffTheme.displaySmall.override(color: ffTheme.primary, fontWeight: FontWeight.w800),
                        ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 2000.ms, color: ffTheme.secondary.withOpacity(0.4)),
                        const SizedBox(width: 6),
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text('לשנה', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        value: step / 4,
                        backgroundColor: ffTheme.alternate,
                        valueColor: AlwaysStoppedAnimation(ffTheme.primary),
                        minHeight: 8,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      step == 0 ? 'ממתין לאישור' : step == 1 ? 'בתהליך אישור (${ (step / 4 * 100).round()}%)' : step >= 3 ? 'כמעט שם! 🎉' : 'בעיצומו (${(step / 4 * 100).round()}%)',
                      style: ffTheme.labelSmall.override(color: ffTheme.primary),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 100.ms),
              const SizedBox(height: 20),
            ],

            // Timeline
            Text('שלבי המעבר', style: ffTheme.titleLarge),
            const SizedBox(height: 16),

            ...steps.asMap().entries.map((entry) {
              final i = entry.key;
              final s = entry.value;
              final isLast = i == steps.length - 1;
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(
                    children: [
                      s.active
                        ? Stack(
                            alignment: Alignment.center,
                            children: [
                              Container(
                                width: 52,
                                height: 52,
                                decoration: BoxDecoration(
                                  color: ffTheme.primary.withOpacity(0.12),
                                  shape: BoxShape.circle,
                                ),
                              ).animate(onPlay: (c) => c.repeat(reverse: true))
                                .scale(begin: const Offset(1, 1), end: const Offset(1.2, 1.2), duration: 900.ms, curve: Curves.easeInOut),
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: ffTheme.accent1,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: ffTheme.primary, width: 2),
                                ),
                                child: Icon(s.icon, size: 20, color: ffTheme.primary),
                              ),
                            ],
                          )
                        : Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: s.done ? ffTheme.primary : ffTheme.alternate,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(s.icon, size: 20, color: s.done ? Colors.white : ffTheme.secondaryText),
                          ),
                      if (!isLast)
                        Container(
                          width: 2,
                          height: s.active ? 50 : 40,
                          color: s.done ? ffTheme.primary.withOpacity(0.3) : ffTheme.alternate,
                        ),
                    ],
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: isLast ? 0 : 24, top: s.active ? 14 : 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s.title, style: ffTheme.titleSmall.override(
                            color: s.done ? ffTheme.primaryText : s.active ? ffTheme.primary : ffTheme.secondaryText,
                            fontWeight: s.active ? FontWeight.w700 : FontWeight.w600,
                          )),
                          const SizedBox(height: 2),
                          Text(s.subtitle, style: ffTheme.bodySmall),
                          if (s.active) ...[
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(color: ffTheme.primary, borderRadius: BorderRadius.circular(6)),
                                  child: Text('בתהליך...', style: GoogleFonts.rubik(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                                ),
                                const SizedBox(width: 8),
                                Text('~24 שעות', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
                              ],
                            ),
                          ],
                          if (s.done) ...[
                            const SizedBox(height: 4),
                            Icon(Icons.check_circle_rounded, size: 14, color: ffTheme.primary),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              );
            }),

            const SizedBox(height: 24),

            // Rep card
            GestureDetector(
              onTap: () => context.pushNamed('Chat'),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ffTheme.alternate),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
                ),
                child: Row(
                  children: [
                    Stack(
                      children: [
                        Container(
                          width: 50,
                          height: 50,
                          decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                          child: Center(
                            child: Text('ד', style: GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, color: ffTheme.primary)),
                          ),
                        ),
                        Positioned(
                          right: 0, bottom: 0,
                          child: Container(
                            width: 14, height: 14,
                            decoration: BoxDecoration(
                              color: Colors.green,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                          ).animate(onPlay: (c) => c.repeat(reverse: true))
                            .scale(begin: const Offset(1, 1), end: const Offset(1.3, 1.3), duration: 800.ms),
                        ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('דנה — הנציגה שלכם', style: ffTheme.titleSmall),
                          Row(
                            children: [
                              Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle)),
                              const SizedBox(width: 4),
                              Text('פנויה עכשיו · תגובה ~5 דקות', style: ffTheme.labelSmall.override(color: Colors.green, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: ffTheme.primary, borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.chat_rounded, color: Colors.white, size: 18),
                    ),
                  ],
                ),
              ),
            ).animate().fadeIn(delay: 300.ms),

            const SizedBox(height: 16),

            FFButtonWidget(
              text: 'שליחת הודעה לדנה',
              onPressed: () async => context.pushNamed('Chat'),
              options: FFButtonOptions(
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              ),
            ).animate().fadeIn(delay: 400.ms),

            const SizedBox(height: 8),

            // Advance step for demo
            if (step < 4 && plan != null)
              GestureDetector(
                onTap: () => appState.advanceTracker(),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: ffTheme.alternate),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.arrow_forward_rounded, size: 16, color: ffTheme.secondaryText),
                      const SizedBox(width: 6),
                      Text('קבלתי עדכון מהספק', style: ffTheme.labelMedium.override(color: ffTheme.secondaryText)),
                    ],
                  ),
                ),
              ).animate().fadeIn(delay: 440.ms),

            const SizedBox(height: 12),

            // Porting CTA when step >= 1
            if (step >= 1)
              OutlinedButton.icon(
                onPressed: () => context.pushNamed('Porting'),
                icon: const Icon(Icons.swap_horizontal_circle_outlined, size: 18),
                label: const Text('ניוד מספר טלפון'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: ffTheme.primary,
                  side: BorderSide(color: ffTheme.primary),
                  minimumSize: const Size(double.infinity, 48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ).animate().fadeIn(delay: 450.ms),

            const SizedBox(height: 16),

            // Guarantee card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ffTheme.accent2,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: ffTheme.warning.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Text('🛡️', style: TextStyle(fontSize: 24)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ערבות שקט', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w700, color: ffTheme.primaryText)),
                        Text('מבטיחים שלא תחויבו פעמיים במהלך המעבר', style: ffTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 500.ms),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _TrackerStep {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool done;
  final bool active;
  const _TrackerStep({required this.icon, required this.title, required this.subtitle, this.done = false, this.active = false});
}
