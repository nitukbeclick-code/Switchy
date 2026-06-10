import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/pressable.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../services/backend/local_backend.dart';

class TrackerWidget extends StatefulWidget {
  const TrackerWidget({super.key});

  @override
  State<TrackerWidget> createState() => _TrackerWidgetState();
}

class _TrackerWidgetState extends State<TrackerWidget> {
  StreamSubscription<int>? _leadStepSub;

  // A 'lost' lead (step -1) is terminal: the rep closed the pipeline. It can't
  // flow through AppState.setTrackerStep (which only accepts forward steps 1–4),
  // so we hold it as page-local state and render a closed screen.
  bool _leadLost = false;

  @override
  void initState() {
    super.initState();
    // Hydrate current step immediately (handles users who were offline when
    // the rep updated the lead status).
    appBackend.fetchLeadStep().then((step) {
      if (!mounted) return;
      if (step == -1) {
        setState(() => _leadLost = true);
      } else if (step > AppState().trackerStep) {
        AppState().setTrackerStep(step);
      }
    }).catchError((_) {});
    // Then subscribe for live updates.
    _leadStepSub = appBackend.leadStepStream().listen((step) {
      if (!mounted) return;
      if (step == -1) {
        setState(() => _leadLost = true);
      } else {
        if (_leadLost) setState(() => _leadLost = false);
        AppState().setTrackerStep(step);
      }
    });
  }

  @override
  void dispose() {
    _leadStepSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final step = appState.trackerStep;
    final plan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;

    final steps = [
      _TrackerStep(icon: Icons.person_add_rounded, title: 'הצטרפות', subtitle: 'פרטים נשלחו בהצלחה', done: step >= 1),
      _TrackerStep(icon: Icons.task_alt_rounded, title: 'אישור מסלול', subtitle: 'נציג אישר את הבקשה', done: step >= 2, active: step == 1),
      _TrackerStep(icon: Icons.swap_horiz_rounded, title: 'מדריך ניתוק', subtitle: 'תהליך הניוד בעיצומו', done: step >= 3, active: step == 2),
      _TrackerStep(icon: Icons.check_circle_rounded, title: 'הושלם', subtitle: 'ברוכים הבאים לחבילה החדשה', done: step >= 4),
    ];

    // Terminal 'lost' state — the rep closed the lead. Show a calm, honest
    // closed screen instead of leaving the user "in progress" forever.
    if (_leadLost) {
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
                    color: ffTheme.alternate,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.do_not_disturb_on_outlined, size: 52, color: ffTheme.secondaryText),
                ).animate().scale(duration: 500.ms, curve: Curves.easeOut),
                const SizedBox(height: 24),
                Text('הפנייה נסגרה', style: ffTheme.headlineSmall),
                const SizedBox(height: 8),
                Text('הטיפול בפנייה זו הסתיים. אפשר תמיד להתחיל מחדש ולמצוא מסלול שמתאים לכם.',
                    style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                const SizedBox(height: 32),
                AppButton(
                  text: 'מצא מסלול חדש →',
                  onPressed: () async => context.goNamed('Results'),

                    width: double.infinity,
                    height: 52,
                    color: ffTheme.primary,
                    textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                    borderRadius: BorderRadius.circular(14),

                ),
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: () => context.pushNamed('Chat'),
                  icon: const Icon(Icons.chat_rounded, size: 18),
                  label: const Text('יש שאלה? דברו איתנו'),
                  style: TextButton.styleFrom(foregroundColor: ffTheme.primary),
                ),
              ],
            ),
          ),
        ),
      );
    }

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
                    style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                const SizedBox(height: 32),
                AppButton(
                  text: 'מצא מסלול →',
                  onPressed: () async => context.goNamed('Results'),
                  
                    width: double.infinity,
                    height: 52,
                    color: ffTheme.primary,
                    textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                    borderRadius: BorderRadius.circular(14),
                  
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
                  Text('${plan.provider} — ₪${plan.priceText}/${priceUnitShort(plan)}',
                      style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondary, fontWeight: FontWeight.w700))
                      .animate().fadeIn(delay: 450.ms),
                  const SizedBox(height: 10),
                  Text('המעבר הושלם בהצלחה. חיסכון שנתי של ₪${planSaveYear(plan, appState.currentBill(plan.cat))} כבר מתחיל!',
                      style: ffTheme.bodyMedium.copyWith(color: Colors.white.withValues(alpha: 0.8)),
                      textAlign: TextAlign.center).animate().fadeIn(delay: 550.ms),
                ] else ...[
                  const SizedBox(height: 10),
                  Text('המעבר הושלם בהצלחה!',
                      style: ffTheme.bodyMedium.copyWith(color: Colors.white.withValues(alpha: 0.8)),
                      textAlign: TextAlign.center).animate().fadeIn(delay: 550.ms),
                ],
                const SizedBox(height: 40),
                AppButton(
                  text: 'חזרה לדף הבית',
                  onPressed: () async => context.goNamed('Home'),
                  
                    width: double.infinity,
                    height: 52,
                    color: ffTheme.secondary,
                    textStyle: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: ffTheme.primary),
                    borderRadius: BorderRadius.circular(14),
                  
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
                        Text('אנחנו מלווים — לא מנתקים', style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: ffTheme.primaryDark)),
                        Text('נציג אישי ילווה אתכם לכל אורך הדרך', style: GoogleFonts.assistant(fontSize: 12, color: ffTheme.primaryDark.withValues(alpha: 0.8))),
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
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 10)],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('החיסכון הצפוי שלך', style: ffTheme.labelMedium.copyWith(color: ffTheme.secondaryText)),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '₪${planSaveYear(plan, appState.currentBill(plan.cat))}',
                          style: ffTheme.displaySmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800),
                        ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 2000.ms, color: ffTheme.secondary.withValues(alpha: 0.4)),
                        const SizedBox(width: 6),
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text('לשנה', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
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
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.primary),
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
                                  color: ffTheme.primary.withValues(alpha: 0.12),
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
                          color: s.done ? ffTheme.primary.withValues(alpha: 0.3) : ffTheme.alternate,
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
                          Text(s.title, style: ffTheme.titleSmall.copyWith(
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
                                Text('~24 שעות', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
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
            Pressable(
              onTap: () {
                HapticFeedback.lightImpact();
                context.pushNamed('Chat');
              },
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ffTheme.alternate),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 10)],
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
                        PositionedDirectional(
                          end: 0, bottom: 0,
                          child: Container(
                            width: 14, height: 14,
                            decoration: BoxDecoration(
                              color: const Color(0xFF111827),
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
                              Container(width: 6, height: 6, decoration: const BoxDecoration(color: Color(0xFF111827), shape: BoxShape.circle)),
                              const SizedBox(width: 4),
                              Text('פנויה עכשיו · תגובה ~5 דקות', style: ffTheme.labelSmall.copyWith(color: const Color(0xFF111827), fontWeight: FontWeight.w600)),
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

            AppButton(
              text: 'שליחת הודעה לדנה',
              onPressed: () async {
                HapticFeedback.lightImpact();
                context.pushNamed('Chat');
              },
              
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              
            ).animate().fadeIn(delay: 400.ms),

            const SizedBox(height: 8),

            if (step < 4 && plan != null) ...[
              _StepConfirmButton(step: step, onConfirm: () {
                appState.advanceTracker();
                // When the final step completes, persist the plan to the renewal
                // radar so it appears in tracked_plans (and renewal notifications).
                if (step == 3) {
                  appState.addMyPlan(
                    category: plan.cat,
                    provider: plan.provider,
                    planName: plan.plan,
                    monthlyPrice: plan.price,
                    joinedViaUs: true,
                  );
                  appBackend.addTrackedPlan(TrackedPlan(
                    id: '',
                    category: plan.cat,
                    provider: plan.provider,
                    planName: plan.plan,
                    monthlyPrice: plan.price,
                    joinedViaUs: true,
                  )).catchError((_) {});
                  final saving = planSaveYear(plan, appState.currentBill(plan.cat));
                  if (saving > 0) appBackend.addSavings(saving).catchError((_) {});
                }
              }, ffTheme: ffTheme),
            ],

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
                border: Border.all(color: ffTheme.warning.withValues(alpha: 0.3)),
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

class _StepConfirmButton extends StatelessWidget {
  const _StepConfirmButton({required this.step, required this.onConfirm, required this.ffTheme});
  final int step;
  final VoidCallback onConfirm;
  final AppTheme ffTheme;

  static const _labels = [
    'קיבלתי אישור מהספק ✓',
    'הניוד החל — אישרתי פרטים',
    'המספר נויד בהצלחה 🎉',
    'הכל עובד! סיימתי ✓',
  ];

  @override
  Widget build(BuildContext context) {
    final label = step < _labels.length ? _labels[step] : _labels.last;
    return Pressable(
      onTap: () {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Text('עדכון סטטוס', textAlign: TextAlign.center),
            content: Text('לעדכן: "$label"?', textAlign: TextAlign.center),
            actionsAlignment: MainAxisAlignment.center,
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('ביטול')),
              ElevatedButton(
                onPressed: () {
                  HapticFeedback.lightImpact();
                  Navigator.pop(ctx);
                  onConfirm();
                },
                style: ElevatedButton.styleFrom(backgroundColor: ffTheme.primary, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                child: const Text('אישור'),
              ),
            ],
          ),
        );
      },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: ffTheme.accent1,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline_rounded, size: 17, color: ffTheme.primary),
            const SizedBox(width: 8),
            Text(label, style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    ).animate().fadeIn(delay: 440.ms);
  }
}
