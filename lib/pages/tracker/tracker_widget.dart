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

class TrackerWidget extends StatelessWidget {
  const TrackerWidget({super.key});

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

            const SizedBox(height: 24),

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
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: s.done ? ffTheme.primary : s.active ? ffTheme.accent1 : ffTheme.alternate,
                          shape: BoxShape.circle,
                          border: s.active ? Border.all(color: ffTheme.primary, width: 2) : null,
                        ),
                        child: Icon(
                          s.icon,
                          size: 20,
                          color: s.done ? Colors.white : s.active ? ffTheme.primary : ffTheme.secondaryText,
                        ),
                      ),
                      if (!isLast)
                        Container(
                          width: 2,
                          height: 40,
                          color: s.done ? ffTheme.primary.withOpacity(0.3) : ffTheme.alternate,
                        ),
                    ],
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: isLast ? 0 : 24, top: 8),
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
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: ffTheme.primary,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text('בתהליך...', style: GoogleFonts.rubik(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                            ),
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
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: ffTheme.alternate),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
              ),
              child: Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: ffTheme.accent1,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text('ד', style: GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, color: ffTheme.primary)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('דנה — הנציגה שלכם', style: ffTheme.titleSmall),
                        Text('זמן תגובה: ~5 דקות', style: ffTheme.bodySmall),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: ffTheme.accent1,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.circle, color: Colors.green, size: 10),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 300.ms),

            const SizedBox(height: 16),

            FFButtonWidget(
              text: 'שליחת הודעה לנציג',
              onPressed: () async => context.pushNamed('Chat'),
              options: FFButtonOptions(
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              ),
            ).animate().fadeIn(delay: 400.ms),

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
