import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../widgets/app_button.dart';
import '../../widgets/price_text.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../services/recommendation_engine.dart';
import '../../services/reminder_schedule.dart';
import '../../services/push_notification_service.dart';
import '../../services/backend/local_backend.dart';

class RenewalWidget extends StatefulWidget {
  const RenewalWidget({super.key});

  @override
  State<RenewalWidget> createState() => _RenewalWidgetState();
}

class _RenewalWidgetState extends State<RenewalWidget> {
  List<TrackedPlan> _remoteOnly = [];

  @override
  void initState() {
    super.initState();
    _loadRemote().catchError((_) {});
  }

  /// Pull-to-refresh: re-pull remote tracked plans and re-derive the list. A
  /// frame-bounded setState recomputes the watch summary + per-plan cards from
  /// AppState even when the remote fetch yields nothing new.
  Future<void> _refresh() async {
    await _loadRemote().catchError((_) {});
    if (mounted) setState(() {});
  }

  Future<void> _loadRemote() async {
    final remote = await appBackend.fetchTrackedPlans();
    if (!mounted || remote.isEmpty) return;
    // Dedup by content rather than ID — local plans use a timestamp ID while
    // Supabase generates UUIDs, so they would never match by ID alone.
    final localKeys = AppState()
        .myPlans
        .map((p) => '${p.provider}|${p.planName}|${p.category}')
        .toSet();
    final newOnes = remote
        .where((p) => !localKeys.contains('${p.provider}|${p.planName}|${p.category}'))
        .toList();
    if (newOnes.isEmpty) return;
    setState(() => _remoteOnly = newOnes);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    // Re-dedup the remote-only plans against the current local list on every
    // build — adding a plan locally that matches a remote row (same
    // provider/name/category) must not leave it showing twice.
    final localKeys = appState.myPlans
        .map((p) => '${p.provider}|${p.planName}|${p.category}')
        .toSet();
    final remoteOnly = _remoteOnly
        .where((p) => !localKeys.contains('${p.provider}|${p.planName}|${p.category}'))
        .toList();
    final plans = [...appState.myPlans, ...remoteOnly];

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        elevation: 0,
        title: Text(
          'מעקב חידושים',
          // Type-scale token; white-on-ink is the only delta (fixed header).
          style: ffTheme.headlineMedium
              .copyWith(fontWeight: FontWeight.w700, color: Colors.white),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white),
          tooltip: 'חזרה',
          onPressed: () {
            HapticFeedback.selectionClick();
            context.safePop();
          },
        ),
      ),
      // Pull-to-refresh + bouncing overscroll via the shared primitive. The
      // intro hero card stays the first item in the list (NOT a pinned header
      // floating over content), so every tappable control below — including the
      // "טבלת השוואה מלאה" compare button — stays fully hit-testable.
      body: RefreshableScroll(
        onRefresh: _refresh,
        padding: const EdgeInsets.all(20),
        slivers: [
          SliverList.list(children: [
          // Intro card
          _IntroCard(ffTheme: ffTheme)
              .animate()
              .fadeIn(duration: 350.ms),

          const SizedBox(height: 20),

          if (plans.isEmpty) ...[
            _EmptyState(
              ffTheme: ffTheme,
              onAdd: () => _showAddSheet(context),
              onFind: () => context.goNamed('Results'),
              onQuiz: () => context.goNamed('Quiz'),
              onBills: () => context.goNamed('Bills'),
            ).animate().fadeIn(delay: 150.ms),
          ] else ...[
            // Price-watch summary: how many plans we're tracking and the total
            // monthly spend across them — an at-a-glance VALUE read.
            _WatchSummary(plans: plans, ffTheme: ffTheme)
                .animate()
                .fadeIn(delay: 80.ms),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text('המסלולים במעקב', style: ffTheme.titleLarge),
                  ),
                ),
                Text('${plans.length}',
                    style: ffTheme.titleLarge
                        .copyWith(color: ffTheme.secondaryText)),
              ],
            ).animate().fadeIn(delay: 100.ms),
            const SizedBox(height: 12),
            ...plans.asMap().entries.map((e) => _PlanCard(
                  plan: e.value,
                  ffTheme: ffTheme,
                  onDelete: () => _confirmDelete(context, appState, e.value),
                  onCompare: () => context.pushNamed('RenewalReport',
                      pathParameters: {'trackedId': e.value.id}),
                  onBestMatch: (planId) => context.pushNamed('PlanDetail',
                      pathParameters: {'planId': planId}),
                ).animate().fadeIn(delay: (100 + e.key * 80).ms)),

            const SizedBox(height: 16),
            // Shared AppButton defaults: contrast-aware label, no pinned white.
            AppButton(
              text: 'הוסף מסלול',
              icon: const Icon(Icons.add_rounded, size: 20),
              color: AppColors.primary,
              onPressed: () async => _showAddSheet(context),
            ).animate().fadeIn(delay: 200.ms),
          ],

          const SizedBox(height: 20),

          // Reminder switch
          _ReminderTile(ffTheme: ffTheme, appState: appState)
              .animate()
              .fadeIn(delay: 300.ms),

          const SizedBox(height: 32),
          ]),
        ],
      ),
    );
  }

  Future<void> _showAddSheet(BuildContext context) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AddPlanSheet(),
    );
  }

  Future<void> _confirmDelete(
      BuildContext context, AppState appState, TrackedPlan plan) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final ffTheme = AppTheme.of(ctx);
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXl)),
          title: Text('הסרת מסלול', style: ffTheme.titleLarge),
          content: Text('להסיר את "${plan.planName}" של ${plan.provider}?',
              style: ffTheme.bodyMedium),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('ביטול', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
            ),
            // Destructive confirm — error ink inside a confirm dialog.
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text('הסר', style: ffTheme.bodyMedium.copyWith(color: ffTheme.error, fontWeight: FontWeight.w700)),
            ),
          ],
        );
      },
    );
    if (confirm == true && context.mounted) {
      Provider.of<AppState>(context, listen: false).removeMyPlan(plan.id);
      appBackend.removeTrackedPlan(plan.id).catchError((_) {});
      setState(() => _remoteOnly.removeWhere((p) => p.id == plan.id));
      PushNotificationService.instance.syncRenewalReminders(AppState());
    }
  }
}

// ── Intro Card ────────────────────────────────────────────────────────────────

class _IntroCard extends StatelessWidget {
  const _IntroCard({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        // Ink hero band — flat (one elevation story: resting content carries
        // no shadow), generous bento corner.
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(ffTheme.radiusMd),
            ),
            child: const Center(
              child: Icon(Icons.access_time_rounded, size: 24, color: Colors.white),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              'נעקוב מתי המבצע שלך נגמר ונזכיר לך לפני שהמחיר קופץ — כדי שלא תשלם יותר מדי',
              // Body token; white-on-ink is the only delta (fixed hero band).
              style: ffTheme.bodyMedium.copyWith(color: Colors.white, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Watch summary ─────────────────────────────────────────────────────────────

/// A compact price-watch strip above the tracked-plan list: the number of plans
/// we're watching and the combined monthly spend. The nearest renewal (smallest
/// positive `daysUntilRenewal`) is surfaced so the user sees what needs
/// attention first.
class _WatchSummary extends StatelessWidget {
  const _WatchSummary({required this.plans, required this.ffTheme});
  final List<TrackedPlan> plans;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final monthlyTotal =
        plans.fold<int>(0, (sum, p) => sum + p.monthlyPrice);
    // Soonest upcoming renewal across all tracked plans, if any.
    int? soonest;
    for (final p in plans) {
      final d = p.daysUntilRenewal;
      if (d == null || d < 0) continue;
      if (soonest == null || d < soonest) soonest = d;
    }
    return Container(
      padding: const EdgeInsets.all(16),
      // Premium card surface — soft hairline + shadow, replacing the old border.
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(ffTheme.radiusSm),
            ),
            child: Icon(Icons.monitor_heart_outlined,
                size: 22, color: ffTheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('עוקבים אחרי המחירים שלך',
                    style: ffTheme.titleSmall
                        .copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  soonest != null
                      ? 'סה"כ ₪$monthlyTotal/חודש · החידוש הקרוב בעוד $soonest ימים'
                      : 'סה"כ ₪$monthlyTotal/חודש על ${plans.length} מסלולים',
                  style: ffTheme.bodySmall
                      .copyWith(color: ffTheme.secondaryText),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Urgency Chip ──────────────────────────────────────────────────────────────

Color _chipColor(int days, AppTheme ffTheme) {
  if (days < 0) return ffTheme.error;
  if (days <= 21) return ffTheme.error;
  // Mid-band urgency = the WARNING token (green stays for CTAs/savings/
  // success — "renews soon" is a heads-up, not a win).
  if (days <= 45) return ffTheme.warning;
  return ffTheme.secondaryText;
}

String _chipLabel(int days) {
  if (days < 0) return 'המבצע הסתיים';
  if (days == 0) return 'מסתיים היום!';
  return 'מסתיים בעוד $days ימים';
}

// ── Countdown ring ─────────────────────────────────────────────────────────────

/// A compact circular gauge that fills as the renewal date approaches. Over a
/// 90-day horizon: far out → a thin sliver; days==0 → a full ring. Past-due (<0)
/// renders a full ring in the urgency colour. The day number sits in the centre.
class _CountdownRing extends StatelessWidget {
  const _CountdownRing({required this.days, required this.color, required this.ffTheme});
  final int days;
  final Color color;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // 0..1 progress where 1 = renews now / overdue, ~0 = 90+ days away.
    final progress = days < 0 ? 1.0 : (1 - (days / 90)).clamp(0.06, 1.0);
    final centerLabel = days < 0 ? '!' : '$days';
    return Semantics(
      label: _chipLabel(days),
      child: SizedBox(
        width: 44,
        height: 44,
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: reduceMotion ? progress : 0, end: progress),
          duration: const Duration(milliseconds: 900),
          curve: ffTheme.easeOut,
          builder: (_, value, __) => Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 44,
                height: 44,
                child: CircularProgressIndicator(
                  value: value,
                  strokeWidth: 4,
                  backgroundColor: color.withValues(alpha: 0.15),
                  valueColor: AlwaysStoppedAnimation(color),
                  strokeCap: StrokeCap.round,
                ),
              ),
              Text(
                centerLabel,
                // Nearest Rubik tokens (titleSmall for 3+ digits, titleLarge
                // otherwise) + tabular figures so the countdown never jitters.
                style: (days >= 100 ? ffTheme.titleSmall : ffTheme.titleLarge)
                    .copyWith(
                        fontWeight: FontWeight.w800,
                        color: color,
                        fontFeatures: const [FontFeature.tabularFigures()]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.ffTheme,
    required this.onDelete,
    required this.onCompare,
    required this.onBestMatch,
  });
  final TrackedPlan plan;
  final AppTheme ffTheme;
  final VoidCallback onDelete;
  final VoidCallback onCompare;
  final void Function(String planId) onBestMatch;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    final days = plan.daysUntilRenewal;
    final promoEnd = plan.promoEnd;

    final profile = MatchProfile(
      category: plan.category,
      currentBill: plan.monthlyPrice,
      priority: priorityFromId(appState.quizPriority),
      lines: appState.quizLines,
      wants5G: appState.wants5G,
      wantsAbroad: appState.wantsAbroad,
      wantsNoCommit: appState.wantsNoCommit,
    );
    final bestMatch = RecommendationEngine.bestMatch(profile);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      // Standard resting card — flat, 1px hairline (no lift; one elevation
      // story).
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                // Hero-tagged logo so it shares-element animates into the
                // full comparison report when the card is opened.
                Hero(
                  tag: 'tracked-logo-${plan.id}',
                  child: LogoWidget(provider: plan.provider, size: 44),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plan.provider,
                          style: ffTheme.titleSmall
                              .copyWith(fontWeight: FontWeight.w700)),
                      Text(plan.planName,
                          style: ffTheme.bodySmall
                              .copyWith(color: ffTheme.secondaryText),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      // Money = ink, tabular + bidi-safe via PriceText.
                      PriceText(
                        '₪${plan.monthlyPrice}/${plan.category == 'abroad' ? 'חבילה' : 'חודש'}',
                        style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
                // Delete button
                IconButton(
                  icon: Icon(Icons.delete_outline_rounded,
                      color: ffTheme.secondaryText, size: 22),
                  tooltip: 'הסר מסלול',
                  onPressed: onDelete,
                ),
              ],
            ),
          ),

          // Promo end countdown — a ring that fills as renewal approaches sits
          // beside the urgency chip for an at-a-glance "how close" read.
          if (days != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  _CountdownRing(days: days, color: _chipColor(days, ffTheme), ffTheme: ffTheme),
                  const SizedBox(width: 10),
                  Flexible(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: _chipColor(days, ffTheme).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                            border: Border.all(
                                color: _chipColor(days, ffTheme).withValues(alpha: 0.4)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.timer_outlined,
                                  size: 13,
                                  color: _chipColor(days, ffTheme)),
                              const SizedBox(width: 4),
                              Text(
                                _chipLabel(days),
                                style: ffTheme.labelMedium.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: _chipColor(days, ffTheme),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (promoEnd != null) ...[
                          const SizedBox(height: 3),
                          Text(
                            DateFormat('d/M/yyyy').format(promoEnd),
                            style: ffTheme.labelSmall
                                .copyWith(color: ffTheme.secondaryText),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],

          // Best alternative banner — a VALUE moment: the green savings tint.
          if (bestMatch != null && bestMatch.annualSaving > 0) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Semantics(
                button: true,
                label: 'מצאנו מסלול שחוסך ₪${bestMatch.annualSaving} בשנה. הצג מסלול',
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () => onBestMatch(bestMatch.plan.id),
                    borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                    splashColor: ffTheme.saving.withValues(alpha: 0.12),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: ffTheme.brandAccentTint,
                        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                        border:
                            Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.lightbulb_rounded, size: 18, color: ffTheme.savingDark),
                          const SizedBox(width: 10),
                          Expanded(
                            child: RichText(
                              text: TextSpan(
                                style: ffTheme.bodySmall.copyWith(
                                    color: ffTheme.primaryText, fontWeight: FontWeight.w700),
                                children: [
                                  const TextSpan(text: 'מצאנו לך מסלול שחוסך '),
                                  TextSpan(
                                      text: '₪${bestMatch.annualSaving}/שנה',
                                      style: ffTheme.bodySmall.copyWith(
                                          color: ffTheme.savingText, fontWeight: FontWeight.w800)),
                                ],
                              ),
                            ),
                          ),
                          Icon(Icons.arrow_back_ios_rounded,
                              size: 12, color: ffTheme.savingDark),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],

          // Compare button — the shared secondary AppButton (>=48dp, hairline,
          // built-in haptic + press feedback), then navigate to the report.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 14),
            child: AppButton.secondary(
              text: 'טבלת השוואה מלאה',
              icon: const Icon(Icons.table_chart_rounded, size: 17),
              width: double.infinity,
              height: 48,
              onPressed: () async => onCompare(),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Empty State ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.ffTheme,
    required this.onAdd,
    required this.onFind,
    required this.onQuiz,
    required this.onBills,
  });
  final AppTheme ffTheme;
  final VoidCallback onAdd;
  final VoidCallback onFind;
  final VoidCallback onQuiz;
  final VoidCallback onBills;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 32),
        Container(
          width: 88,
          height: 88,
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            shape: BoxShape.circle,
          ),
          child: Center(
              child: Icon(Icons.cell_tower_rounded, size: 40, color: ffTheme.primary)),
        ),
        const SizedBox(height: 18),
        Text('עוד לא הוספת מסלולים',
            style: ffTheme.titleLarge
                .copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(
          'הוסף את המסלולים שלך ונעקוב אחרי מועד חידושם — ונזכיר לך לפני שהמחיר קופץ',
          style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        // Shared AppButton defaults: contrast-aware label, no pinned white.
        AppButton(
          text: 'הוסף מסלול ראשון',
          icon: const Icon(Icons.add_rounded, size: 20),
          color: AppColors.primary,
          onPressed: () async => onAdd(),
        ),
        const SizedBox(height: 12),
        // Onward link so the empty state never dead-ends — jump straight to
        // browsing plans.
        TextButton.icon(
          onPressed: onFind,
          icon: const Icon(Icons.search_rounded, size: 18),
          label: const Text('או מצא מסלול חדש לחיסכון'),
          style: TextButton.styleFrom(
            foregroundColor: ffTheme.primary,
            minimumSize: const Size(0, kMinTapTarget),
          ),
        ),
        const SizedBox(height: 16),
        // Two more ways to set one up without typing it all in by hand: answer a
        // quick quiz to get a match, or fill in the current bill on the Bills
        // screen — both feed straight back into something worth tracking.
        Divider(color: ffTheme.lineColor, height: 1),
        const SizedBox(height: 12),
        Text('לא בטוחים מאיפה להתחיל?',
            style: ffTheme.labelMedium.copyWith(color: ffTheme.secondaryText)),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Expanded(
              child: AppButton.secondary(
                text: 'שאלון התאמה',
                icon: const Icon(Icons.quiz_outlined, size: 18),
                height: 48,
                onPressed: () async => onQuiz(),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AppButton.secondary(
                text: 'החשבון שלי',
                icon: const Icon(Icons.receipt_long_outlined, size: 18),
                height: 48,
                onPressed: () async => onBills(),
              ),
            ),
          ],
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

// ── Reminder Tile ─────────────────────────────────────────────────────────────

class _ReminderTile extends StatelessWidget {
  const _ReminderTile({required this.ffTheme, required this.appState});
  final AppTheme ffTheme;
  final AppState appState;

  @override
  Widget build(BuildContext context) {
    final next = appState.renewalReminders ? nextReminder(appState) : null;
    final subtitle = next != null
        ? 'התזכורת הבאה: ${DateFormat('d/M/yyyy').format(next.fireDate)} · ${next.plan.provider}'
        : 'נשלח לך התראה ~21 יום לפני סיום המבצע';
    return Container(
      // Premium card surface — soft hairline + shadow, replacing the old border.
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile(
            value: appState.renewalReminders,
            onChanged: (v) async {
              appState.setRenewalReminders(v);
              appBackend.setRenewalReminder(v).catchError((_) {});
              if (v) await PushNotificationService.instance.requestPermission();
              await PushNotificationService.instance.syncRenewalReminders(appState);
            },
            // ON = an active state → the green accent (not ink).
            activeThumbColor: ffTheme.brandAccent,
            title: Text('תזכורות חידוש',
                style: ffTheme.titleSmall
                    .copyWith(fontWeight: FontWeight.w700)),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                subtitle,
                style: ffTheme.bodySmall
                    .copyWith(color: ffTheme.secondaryText),
              ),
            ),
            secondary: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(ffTheme.radiusLg),
              ),
              child: Icon(Icons.notifications_active_outlined,
                  color: ffTheme.primary, size: 20),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          ),
          // Explicit opt-in microcopy (Spam-Law §30A): shown once reminders are
          // ON, stating the user consented to receive renewal notifications and
          // can withdraw consent any time from the same switch.
          if (appState.renewalReminders)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.verified_user_outlined,
                      size: 14, color: ffTheme.secondaryText),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'בהפעלה אישרת לקבל מאיתנו התראות חידוש (התראה באפליקציה, '
                      'ואם תאשר גם אימייל עם קישור הסרה). אפשר לבטל בכל רגע.',
                      style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.secondaryText,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Add Plan Bottom Sheet ─────────────────────────────────────────────────────

/// Raises a small control's HIT AREA to the >=48dp accessibility minimum
/// ([kMinTapTarget]) without growing the painted control itself — the child
/// keeps its intrinsic size, centered inside the enlarged (transparent) box.
/// Pair with a [GestureDetector] using [HitTestBehavior.opaque].
class _MinTapTarget extends StatelessWidget {
  const _MinTapTarget({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(
            minWidth: kMinTapTarget, minHeight: kMinTapTarget),
        child: Align(widthFactor: 1, heightFactor: 1, child: child),
      );
}

class _AddPlanSheet extends StatefulWidget {
  const _AddPlanSheet();

  @override
  State<_AddPlanSheet> createState() => _AddPlanSheetState();
}

class _AddPlanSheetState extends State<_AddPlanSheet> {
  String? _selectedCat;
  String _provider = '';
  String _planName = '';
  int _price = 0;
  String? _promoEndDate;
  bool _joinedViaUs = false;

  final _providerCtrl = TextEditingController();
  final _planNameCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  List<String> get _providers {
    if (_selectedCat == null) return [];
    return plansByCat(_selectedCat!)
        .map((p) => p.provider)
        .toSet()
        .toList()
      ..sort();
  }

  @override
  void dispose() {
    _providerCtrl.dispose();
    _planNameCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 30)),
      firstDate: now,
      lastDate: DateTime(now.year + 5),
      helpText: 'תאריך סיום המבצע',
    );
    if (picked != null) {
      setState(() {
        _promoEndDate =
            '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    _formKey.currentState!.save();
    if (_selectedCat == null) return;

    final appState = Provider.of<AppState>(context, listen: false);
    appState.addMyPlan(
      category: _selectedCat!,
      provider: _provider.trim(),
      planName: _planName.trim(),
      monthlyPrice: _price,
      promoEndDate: _promoEndDate,
      joinedViaUs: _joinedViaUs,
    );
    PushNotificationService.instance.syncRenewalReminders(appState);
    // Mirror the newly added plan to the backend seam.
    if (appState.myPlans.isNotEmpty) {
      appBackend.addTrackedPlan(appState.myPlans.first).catchError((_) {});
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet)),
      ),
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomInset),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: ffTheme.alternate,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Semantics(
                header: true,
                child: Text('הוסף מסלול',
                    style: ffTheme.titleLarge
                        .copyWith(fontWeight: FontWeight.w800)),
              ),
              const SizedBox(height: 20),

              // Category chips
              Text('קטגוריה', style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: categories.map((cat) {
                  final selected = _selectedCat == cat.id;
                  // ONE chip language — ACTIVE = green tint + green hairline +
                  // green ink (no ink-filled chips); announced as a selectable
                  // button with a >=48dp hit area around the painted pill.
                  return Semantics(
                    button: true,
                    selected: selected,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        setState(() {
                          _selectedCat = cat.id;
                          _provider = '';
                          _providerCtrl.clear();
                        });
                      },
                      child: _MinTapTarget(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: selected ? ffTheme.brandAccentTint : ffTheme.accent1,
                            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                            border: Border.all(
                              color: selected
                                  ? ffTheme.brandAccent
                                  : ffTheme.alternate,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              ExcludeSemantics(
                                child: Icon(
                                  categoryIconData(cat.id),
                                  size: 14,
                                  color: selected ? ffTheme.brandAccent : ffTheme.secondaryText,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                cat.name,
                                style: ffTheme.labelMedium.copyWith(
                                  color: selected ? ffTheme.brandAccentText : ffTheme.primaryText,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              if (_selectedCat == null) ...[
                const SizedBox(height: 4),
                Text('יש לבחור קטגוריה',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.error)),
              ],

              const SizedBox(height: 18),

              // Provider field
              Text('ספק', style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              Autocomplete<String>(
                optionsBuilder: (textEditingValue) {
                  if (textEditingValue.text.isEmpty) return _providers;
                  return _providers.where((p) =>
                      p.contains(textEditingValue.text));
                },
                onSelected: (val) => setState(() => _provider = val),
                fieldViewBuilder: (ctx, ctrl, focusNode, onSubmit) {
                  // Sync controller reference
                  if (ctrl.text.isEmpty && _provider.isNotEmpty) {
                    ctrl.text = _provider;
                  }
                  return TextFormField(
                    controller: ctrl,
                    focusNode: focusNode,
                    decoration: _inputDecoration(ffTheme, 'שם הספק'),
                    onChanged: (v) => setState(() => _provider = v),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
                    onSaved: (v) => _provider = v ?? '',
                  );
                },
              ),

              const SizedBox(height: 14),

              // Plan name field
              Text('שם המסלול', style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              TextFormField(
                controller: _planNameCtrl,
                decoration: _inputDecoration(ffTheme, 'למשל: גולד 100GB'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
                onSaved: (v) => _planName = v ?? '',
              ),

              const SizedBox(height: 14),

              // Monthly price
              Text(
                _selectedCat == 'abroad'
                    ? 'מחיר לחבילה (₪)'
                    : 'מחיר לחודש (₪)',
                style: ffTheme.labelMedium,
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _priceCtrl,
                keyboardType: TextInputType.number,
                decoration: _inputDecoration(ffTheme, '₪'),
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  if (n == null || n <= 0) return 'יש להזין מחיר תקין';
                  return null;
                },
                onSaved: (v) => _price = int.tryParse(v ?? '') ?? 0,
              ),

              const SizedBox(height: 14),

              // Promo end date
              Text('תאריך סיום המבצע (אופציונלי)',
                  style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              Semantics(
                button: true,
                label: 'בחירת תאריך סיום המבצע',
                child: GestureDetector(
                onTap: _pickDate,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                    border: Border.all(color: ffTheme.alternate),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.calendar_today_rounded,
                          color: ffTheme.primary, size: 18),
                      const SizedBox(width: 10),
                      Text(
                        _promoEndDate != null
                            ? _formatDate(_promoEndDate!)
                            : 'בחר תאריך',
                        style: ffTheme.bodyMedium.copyWith(
                          color: _promoEndDate != null
                              ? ffTheme.primaryText
                              : ffTheme.secondaryText,
                        ),
                      ),
                      const Spacer(),
                      if (_promoEndDate != null)
                        Semantics(
                          button: true,
                          label: 'נקה תאריך סיום מבצע',
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () =>
                                setState(() => _promoEndDate = null),
                            // >=48dp hit area around the small painted X.
                            child: _MinTapTarget(
                              child: Icon(Icons.close_rounded,
                                  size: 16, color: ffTheme.secondaryText),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                ),
              ),

              const SizedBox(height: 14),

              // Joined via us switch
              Container(
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                  border: Border.all(color: ffTheme.alternate),
                ),
                child: SwitchListTile(
                  dense: true,
                  value: _joinedViaUs,
                  onChanged: (v) => setState(() => _joinedViaUs = v),
                  // ON = an active state → the green accent (not ink).
                  activeThumbColor: ffTheme.brandAccent,
                  title: Text('הצטרפתי דרך Switchy AI',
                      style: ffTheme.bodyMedium
                          .copyWith(fontWeight: FontWeight.w600)),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                ),
              ),

              const SizedBox(height: 24),

              AppButton(
                text: 'שמור מסלול',
                color: AppColors.primary,
                onPressed: () async {
                  if (_selectedCat == null) {
                    setState(() {});
                    return;
                  }
                  _submit();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(AppTheme ffTheme, String hint) =>
      InputDecoration(
        hintText: hint,
        hintStyle: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
        filled: true,
        fillColor: ffTheme.accent1,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
          borderSide: BorderSide(color: ffTheme.alternate),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
          borderSide: BorderSide(color: ffTheme.alternate),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
          borderSide: BorderSide(color: ffTheme.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
          borderSide: BorderSide(color: ffTheme.error),
        ),
      );

  String _formatDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${d.day}/${d.month}/${d.year}';
  }
}
