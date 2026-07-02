import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  // The step + 'lost' state are owned by the app-scope LeadStepSync service
  // (lib/services/lead_step_sync.dart, wired in main.dart) and mirrored into
  // AppState (trackerStep / leadLost) — this page only renders them.

  // The REAL created_at of the newest lead — the only timestamp the timeline
  // may show (stage 1's joining date). Null (offline / no lead) renders no
  // date; nothing here is ever fabricated.
  DateTime? _leadCreatedAt;

  @override
  void initState() {
    super.initState();
    appBackend.fetchLeadInfo().then((info) {
      if (!mounted || info.createdAt == null) return;
      setState(() => _leadCreatedAt = info.createdAt);
    }).catchError((_) {});
  }

  /// Honest per-stage guidance for the ACTIVE stage — what the user can do or
  /// expect right now. Replaces the fabricated '~24 שעות' SLA chip; no
  /// response-time or presence claims.
  String _whatNowForStep(int step) {
    if (step <= 1) return 'צוות הליווי בודק את הבקשה ויחזור אליכם לאישור המסלול';
    if (step == 2) return 'עוברים על מדריך הניתוק — הכינו את פרטי הספק הנוכחי';
    return 'הניוד בעיצומו — ודאו שה-SIM והציוד החדש אצלכם';
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final step = appState.trackerStep;
    final plan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;

    // Stage 1 carries the ONLY timestamp on the timeline — the lead row's real
    // created_at (when fetched). Stages 2–4 show no dates: the rep sets their
    // timing and we never fabricate one.
    final joinTitle = _leadCreatedAt == null
        ? 'הצטרפות'
        : 'הצטרפות · ${_leadCreatedAt!.day}.${_leadCreatedAt!.month}.${_leadCreatedAt!.year}';
    final steps = [
      _TrackerStep(icon: Icons.person_add_rounded, title: joinTitle, subtitle: 'פרטים נשלחו בהצלחה', done: step >= 1),
      _TrackerStep(icon: Icons.task_alt_rounded, title: 'אישור מסלול', subtitle: 'נציג אישר את הבקשה', done: step >= 2, active: step <= 1),
      _TrackerStep(icon: Icons.swap_horiz_rounded, title: 'מדריך ניתוק', subtitle: 'תהליך הניוד בעיצומו', done: step >= 3, active: step == 2),
      _TrackerStep(icon: Icons.check_circle_rounded, title: 'הושלם', subtitle: 'ברוכים הבאים לחבילה החדשה', done: step >= 4, active: step == 3),
    ];

    // Terminal 'lost' state — the rep closed the lead (mirrored into
    // AppState.leadLost by LeadStepSync). Show a calm, honest closed screen
    // instead of leaving the user "in progress" forever.
    if (appState.leadLost) {
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
                  decoration: ffTheme.glassDecoration(radius: 48),
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
                    color: AppColors.primary,
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
                  decoration: ffTheme.glassDecoration(radius: 48),
                  child: Icon(Icons.track_changes_rounded, size: 52, color: ffTheme.primary),
                ).animate().scale(begin: const Offset(0.9, 0.9), end: const Offset(1, 1), duration: 450.ms, curve: Curves.easeOut),
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
                    color: AppColors.primary,
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
        backgroundColor: AppColors.primary,
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
                Text('ברוכים הבאים\nלחבילה החדשה!',
                    style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, height: 1.2),
                    textAlign: TextAlign.center).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),
                const SizedBox(height: 12),
                if (plan != null) ...[
                  Text('${plan.provider} — ₪${plan.priceText}/${priceUnitShort(plan)}',
                      style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondary, fontWeight: FontWeight.w700))
                      .animate().fadeIn(delay: 450.ms),
                  const SizedBox(height: 10),
                  RichText(
                    textAlign: TextAlign.center,
                    text: TextSpan(
                      style: ffTheme.bodyMedium.copyWith(color: Colors.white.withValues(alpha: 0.8)),
                      children: [
                        const TextSpan(text: 'המעבר הושלם בהצלחה. חיסכון שנתי של '),
                        TextSpan(
                          text: '₪${planSaveYear(plan, appState.currentBill(plan.cat))}',
                          style: ffTheme.bodyMedium.copyWith(
                              color: ffTheme.savingText, fontWeight: FontWeight.w800),
                        ),
                        const TextSpan(text: ' כבר מתחיל!'),
                      ],
                    ),
                  ).animate().fadeIn(delay: 550.ms),
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
                const SizedBox(height: 12),
                // The plan was just added to the renewal radar — point the user
                // there so the completion screen never dead-ends.
                TextButton.icon(
                  onPressed: () => context.pushNamed('Renewal'),
                  icon: const Icon(Icons.notifications_active_outlined,
                      size: 18, color: Colors.white),
                  label: Text('עקוב אחרי החידוש שלי',
                      style: GoogleFonts.assistant(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white)),
                ).animate().fadeIn(delay: 800.ms),
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
                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                border: Border.all(color: ffTheme.lineColor),
              ),
              child: Row(
                children: [
                  Icon(Icons.handshake_outlined, size: 24, color: ffTheme.primaryText),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('אנחנו מלווים — לא מנתקים', style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: ffTheme.primaryText)),
                        Text('נציג אישי ילווה אתכם לכל אורך הדרך', style: GoogleFonts.assistant(fontSize: 12, color: ffTheme.primaryText.withValues(alpha: 0.75))),
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
                padding: const EdgeInsets.all(20),
                // Premium bento tile — the expected-saving figure is a headline
                // VALUE surface, so it gets the generous corner + soft elevation.
                decoration: ffTheme.bentoDecoration(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('החיסכון הצפוי שלך', style: ffTheme.labelMedium.copyWith(color: ffTheme.secondaryText)),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        // The expected saving is the VALUE figure → amber.
                        Text(
                          '₪${planSaveYear(plan, appState.currentBill(plan.cat))}',
                          style: ffTheme.displaySmall.copyWith(color: ffTheme.savingDark, fontWeight: FontWeight.w800),
                        ),
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
                      step == 0 ? 'ממתין לאישור' : step == 1 ? 'בתהליך אישור (${ (step / 4 * 100).round()}%)' : step >= 3 ? 'כמעט שם!' : 'בעיצומו (${(step / 4 * 100).round()}%)',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.primary),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 100.ms),
              const SizedBox(height: 20),
            ],

            // Pre-switch checklist — actionable tasks the user ticks off as they
            // complete the move. Collapsible, and only relevant once the lead is
            // live (step >= 1). Rendered above the timeline.
            if (step >= 1) ...[
              const _PreSwitchChecklist().animate().fadeIn(delay: 150.ms),
              const SizedBox(height: 20),
            ],

            // Guarantee card — the reassurance belongs BEFORE the journey, so
            // the user reads "you're covered" and then the steps (copy unchanged).
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ffTheme.accent2,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: ffTheme.warning.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.shield_outlined, size: 24, color: ffTheme.primaryText),
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
            ).animate().fadeIn(delay: 200.ms),

            const SizedBox(height: 20),

            // Timeline
            Row(
              children: [
                // Brand-green eyebrow tick — a small ACTION-colour structural cue
                // that marks the section start (matches the account tab rhythm).
                ExcludeSemantics(
                  child: Container(
                    width: 3,
                    height: 16,
                    margin: const EdgeInsetsDirectional.only(end: 8),
                    decoration: BoxDecoration(
                      color: ffTheme.brandAccent,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Text('שלבי המעבר', style: ffTheme.titleLarge),
                const Spacer(),
                Text('שלב ${step.clamp(1, 4)} מתוך 4',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 16),

            ...steps.asMap().entries.map((entry) {
              final i = entry.key;
              final s = entry.value;
              final isLast = i == steps.length - 1;
              final row = Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(
                    children: [
                      s.active
                        ? Stack(
                            alignment: Alignment.center,
                            children: [
                              // Static halo ring marks the current step — the
                              // active step is already distinguished by size,
                              // border and colour, so no perpetual pulse.
                              Container(
                                width: 52,
                                height: 52,
                                decoration: BoxDecoration(
                                  color: ffTheme.primary.withValues(alpha: 0.12),
                                  shape: BoxShape.circle,
                                ),
                              ),
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
                              color: s.done ? AppColors.primary : ffTheme.alternate,
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
                                  decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(6)),
                                  child: Text('בתהליך...', style: GoogleFonts.rubik(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            // Honest per-stage guidance — replaces the
                            // fabricated '~24 שעות' SLA chip. Describes what
                            // happens now, never a response-time promise.
                            Text(
                              'מה עכשיו · ${_whatNowForStep(step)}',
                              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
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
              // Emil: the timeline steps reveal in a short top-down stagger
              // (fade + 8px rise, ease-out) so the journey reads as a sequence
              // rather than appearing all at once. flutter_animate honours
              // reduced motion (disableAnimations short-circuits the effect).
              return row
                  .animate(delay: (i * 60).ms)
                  .fadeIn(duration: 280.ms, curve: ffTheme.easeOut)
                  .slideY(begin: 0.08, end: 0, curve: ffTheme.easeOut);
            }),

            const SizedBox(height: 24),

            // Support-team card — opens the chat with the real support channel.
            Pressable(
              onTap: () {
                HapticFeedback.lightImpact();
                context.pushNamed('Chat');
              },
              child: Container(
                padding: const EdgeInsets.all(16),
                // Premium card surface — soft hairline + shadow.
                decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
                child: Row(
                  children: [
                    // The real support channel — no invented persona, no
                    // presence dot and no response-time promise (truth-only).
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                      child: Icon(Icons.support_agent_rounded, size: 26, color: ffTheme.primary),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('צוות הליווי', style: ffTheme.titleSmall),
                          Text('לכל שאלה לאורך המעבר', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.chat_rounded, color: Colors.white, size: 18),
                    ),
                  ],
                ),
              ),
            ).animate().fadeIn(delay: 300.ms),

            const SizedBox(height: 16),

            AppButton(
              text: 'דברו עם צוות הליווי',
              onPressed: () async {
                HapticFeedback.lightImpact();
                context.pushNamed('Chat');
              },

                width: double.infinity,
                height: 52,
                color: AppColors.primary,
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
    'קיבלתי אישור מהספק',
    'הניוד החל — אישרתי פרטים',
    'המספר נויד בהצלחה',
    'הכל עובד! סיימתי',
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
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
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

/// One pre-switch task: a stable [key] (persisted, never localized) and its
/// Hebrew [label] (display only).
class _ChecklistTask {
  final String key;
  final String label;
  const _ChecklistTask(this.key, this.label);
}

/// A collapsible "before you switch" checklist. The user ticks tasks off as they
/// complete the move; checked state is persisted under stable keys via
/// [SharedPreferences] (prefixed [_prefPrefix]) so it survives restarts and
/// stays scoped to this surface — no global app state is mutated.
class _PreSwitchChecklist extends StatefulWidget {
  const _PreSwitchChecklist();

  @override
  State<_PreSwitchChecklist> createState() => _PreSwitchChecklistState();
}

class _PreSwitchChecklistState extends State<_PreSwitchChecklist> {
  static const String _prefPrefix = 'trackerChecklist.';

  static const List<_ChecklistTask> _tasks = [
    _ChecklistTask('cancel-old', 'ביטול המסלול הישן'),
    _ChecklistTask('port-code', 'אימות קוד ניוד'),
    _ChecklistTask('new-sim', 'הגדרת SIM/מכשיר חדש'),
    _ChecklistTask('activation', 'אישור הפעלה'),
  ];

  final Set<String> _done = <String>{};
  SharedPreferences? _prefs;
  bool _expanded = true;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      if (!mounted) return;
      setState(() {
        _prefs = p;
        for (final t in _tasks) {
          if (p.getBool('$_prefPrefix${t.key}') ?? false) _done.add(t.key);
        }
      });
    });
  }

  bool _isChecklistDone(String key) => _done.contains(key);

  /// Whether every task is checked — the "ready to switch" signal.
  bool get _switchChecklistDone => _tasks.every((t) => _done.contains(t.key));

  void _toggleChecklistItem(String key) {
    HapticFeedback.selectionClick();
    final nowDone = !_done.contains(key);
    setState(() {
      if (nowDone) {
        _done.add(key);
      } else {
        _done.remove(key);
      }
    });
    _prefs?.setBool('$_prefPrefix$key', nowDone);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final doneCount = _done.length;
    final allDone = _switchChecklistDone;

    return Container(
      width: double.infinity,
      // Premium card surface; once every task is done it adopts the ink accent
      // border as a "ready" tell, otherwise the soft hairline.
      decoration: ffTheme.cardDecoration(
        radius: ffTheme.radiusMd,
        borderColor: allDone ? ffTheme.primary.withValues(alpha: 0.4) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header — tap to collapse/expand.
          Semantics(
            button: true,
            label: _expanded ? 'צמצום רשימת המשימות' : 'הרחבת רשימת המשימות',
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () {
                HapticFeedback.lightImpact();
                setState(() => _expanded = !_expanded);
              },
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(
                      allDone ? Icons.checklist_rtl_rounded : Icons.fact_check_outlined,
                      size: 22,
                      color: ffTheme.primary,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('משימות לפני המעבר', style: ffTheme.titleSmall),
                          Text(
                            allDone ? 'הכל מוכן למעבר ✓' : 'הושלמו $doneCount מתוך ${_tasks.length}',
                            style: ffTheme.labelSmall.copyWith(
                              color: allDone ? ffTheme.primary : ffTheme.secondaryText,
                              fontWeight: allDone ? FontWeight.w700 : FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: 200.ms,
                      child: Icon(Icons.expand_more_rounded, color: ffTheme.secondaryText),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // Collapsible body — the task checkboxes.
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Column(
                children: [
                  for (final t in _tasks)
                    InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => _toggleChecklistItem(t.key),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        child: Row(
                          children: [
                            Checkbox(
                              value: _isChecklistDone(t.key),
                              onChanged: (_) => _toggleChecklistItem(t.key),
                              activeColor: ffTheme.primary,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                t.label,
                                style: ffTheme.bodyMedium.copyWith(
                                  color: _isChecklistDone(t.key) ? ffTheme.secondaryText : ffTheme.primaryText,
                                  decoration: _isChecklistDone(t.key) ? TextDecoration.lineThrough : null,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            crossFadeState: _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: 200.ms,
          ),
        ],
      ),
    );
  }
}
