import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/pressable.dart';
import '../../widgets/price_text.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../widgets/saving_pill.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../services/push_notification_service.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../services/renewal_report.dart';
import '../../services/reminder_schedule.dart';
import '../../services/provider_ratings.dart';
import '../../services/backend/local_backend.dart';

/// The full, fresh comparison table for a single tracked plan that is about to
/// renew — every alternative in its category ranked by fit, with the annual
/// saving each one delivers against what the customer pays today.
class RenewalReportWidget extends StatefulWidget {
  const RenewalReportWidget({super.key, required this.trackedId});
  final String trackedId;

  @override
  State<RenewalReportWidget> createState() => _RenewalReportWidgetState();
}

class _RenewalReportWidgetState extends State<RenewalReportWidget> {
  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final tp = appState.trackedPlanById(widget.trackedId);

    if (tp == null) return _NotFound(ffTheme: ffTheme);

    final matches = RenewalReport.alternatives(tp, appState, limit: 12);
    final bestSaver = RenewalReport.bestSaver(tp, appState);
    // Abroad plans are priced per package — every saving in this report must be
    // framed per package, never per month/year.
    final isAbroad = tp.category == 'abroad';
    final unit = isAbroad ? 'לחבילה' : 'לחודש';

    return Scaffold(
      backgroundColor: ffTheme.background,
      // Pull-to-refresh + bouncing overscroll via the shared primitive. The
      // hero stays a normal *eager* first sliver (SliverToBoxAdapter) — NOT a
      // pinned/collapsing header — so it never floats over the tappable
      // comparison rows, and "המסלול שלך היום" renders immediately.
      body: RefreshableScroll(
        // Recompute the whole report (alternatives + best-saver re-derive from
        // AppState on rebuild) — a frame-bounded setState is the recompute.
        onRefresh: () async {
          if (mounted) setState(() {});
        },
        slivers: [
          SliverToBoxAdapter(
            child: _Hero(tp: tp, unit: unit, ffTheme: ffTheme, onBack: () => context.safePop()),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Headline saving banner
                  if (bestSaver != null)
                    _SaverBanner(
                      match: bestSaver,
                      isAbroad: isAbroad,
                      currentPrice: tp.monthlyPrice,
                      ffTheme: ffTheme,
                      onTap: () => context.pushNamed('PlanDetail',
                          pathParameters: {'planId': bestSaver.plan.id}),
                    ).animate().fadeIn(duration: 340.ms).slideY(begin: 0.1)
                  else
                    _NoSaverNote(provider: tp.provider, ffTheme: ffTheme)
                        .animate().fadeIn(duration: 340.ms),

                  const SizedBox(height: 20),

                  Row(
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.table_chart_rounded, size: 18, color: ffTheme.primary),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Semantics(
                          header: true,
                          child: Text('כל המסלולים — מהמשתלם ביותר',
                              style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                        ),
                      ),
                      Text('${matches.length} מסלולים',
                          style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    isAbroad
                        ? 'החיסכון מחושב מול המחיר שאתה משלם לחבילה היום'
                        : 'החיסכון מחושב מול המחיר שאתה משלם היום',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                  const SizedBox(height: 12),

                  ...matches.asMap().entries.map((e) {
                    final i = e.key;
                    final m = e.value;
                    final row = _AlternativeRow(
                      rank: i + 1,
                      match: m,
                      currentPrice: tp.monthlyPrice,
                      isAbroad: isAbroad,
                      isTop: i == 0,
                      ffTheme: ffTheme,
                      onTap: () => context.pushNamed('PlanDetail',
                          pathParameters: {'planId': m.plan.id}),
                    );
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      // "הבחירה שלנו" (rank 0) is the focal alternative — it also
                      // wears the strong ink border + lift. Give it a confident-
                      // but-restrained reveal: settle from a hair larger
                      // (1.02→1.0) on the gentle spring so the eye lands on the
                      // top pick first; the rest keep the calm fade+slide.
                      // Fires once on reveal (no loop); flutter_animate drops the
                      // transform under reduced-motion.
                      child: i == 0
                          ? row
                              .animate()
                              .fadeIn(duration: 300.ms)
                              .scale(
                                begin: const Offset(1.02, 1.02),
                                end: const Offset(1, 1),
                                duration: 380.ms,
                                curve: ffTheme.spring,
                              )
                          : row
                              .animate(delay: (i * 45 + 80).ms)
                              .fadeIn(duration: 260.ms)
                              .slideY(begin: 0.06),
                    );
                  }),

                  const SizedBox(height: 12),
                  _ReminderCta(tp: tp, ffTheme: ffTheme),
                  const SizedBox(height: 10),
                  Center(
                    child: Text(
                      'המחירים מתעדכנים באופן שוטף מאתרי הספקים',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Hero ────────────────────────────────────────────────────────────────────

class _Hero extends StatelessWidget {
  const _Hero({required this.tp, required this.unit, required this.ffTheme, required this.onBack});
  final TrackedPlan tp;
  final String unit;
  final AppTheme ffTheme;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final days = tp.daysUntilRenewal;
    // Abroad plans are priced per package — annualizing (x12) is meaningless,
    // so show only the per-package framing for them.
    final isAbroad = tp.category == 'abroad';
    final priceCaption =
        isAbroad ? unit : '$unit · ₪${tp.monthlyPrice * 12}/שנה';
    return Container(
      // Flat ink hero band — resting content carries no shadow.
      decoration: BoxDecoration(
        gradient: ffTheme.brandGradient,
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 16, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white, size: 20),
                    tooltip: 'חזרה',
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      onBack();
                    },
                  ),
                  Expanded(
                    child: Semantics(
                      header: true,
                      // Type-scale token; white-on-ink is the only delta.
                      child: Text('טבלת השוואה מלאה',
                          style: ffTheme.headlineMedium.copyWith(
                              fontWeight: FontWeight.w800, color: Colors.white)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                // "Your plan" is the ANCHOR the alternatives below are measured
                // against — give it a soft green ACTION wash + green hairline +
                // a "המסלול שלך" tag so it reads as the distinct reference card,
                // not just another comparison row.
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: ffTheme.brandAccent.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(ffTheme.radiusXl),
                    border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.5)),
                  ),
                  child: Row(
                    children: [
                      Hero(
                        tag: 'tracked-logo-${tp.id}',
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                          ),
                          child: LogoWidget(provider: tp.provider, size: 40),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                ExcludeSemantics(
                                  child: Icon(Icons.person_pin_circle_rounded,
                                      size: 13, color: Colors.white.withValues(alpha: 0.9)),
                                ),
                                const SizedBox(width: 4),
                                // Type-scale tokens; white-on-ink is the only
                                // delta (fixed ink hero).
                                Text('המסלול שלך היום',
                                    style: ffTheme.labelMedium.copyWith(
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white.withValues(alpha: 0.9))),
                              ],
                            ),
                            Text('${tp.provider} · ${tp.planName}',
                                style: ffTheme.titleLarge.copyWith(color: Colors.white),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          // Money via PriceText — numeric token, tabular,
                          // bidi-safe.
                          PriceText('₪${tp.monthlyPrice}',
                              style: ffTheme.numericMedium.copyWith(
                                  fontWeight: FontWeight.w800, color: Colors.white)),
                          Text(priceCaption,
                              style: ffTheme.labelSmall.copyWith(
                                  fontWeight: FontWeight.w400,
                                  color: Colors.white.withValues(alpha: 0.8))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              if (days != null) ...[
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Fixed white on the fixed ink hero (the themed
                        // `secondary` token goes dark-on-dark in dark mode).
                        const Icon(Icons.alarm_rounded, size: 15, color: Colors.white),
                        const SizedBox(width: 6),
                        Text(
                          days < 0
                              ? 'המבצע הסתיים — שווה לבדוק עכשיו'
                              : days == 0
                                  ? 'המבצע מסתיים היום!'
                                  : 'המבצע מסתיים בעוד $days ימים',
                          style: ffTheme.labelMedium.copyWith(
                              fontWeight: FontWeight.w700, color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Headline saver banner ───────────────────────────────────────────────────

class _SaverBanner extends StatelessWidget {
  const _SaverBanner({
    required this.match,
    required this.isAbroad,
    required this.currentPrice,
    required this.ffTheme,
    required this.onTap,
  });
  final PlanMatch match;
  final bool isAbroad;
  final int currentPrice;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Abroad plans are per-package: annualizing the saving (x12) is
    // meaningless, so frame it per package instead.
    final perPackage = currentPrice - match.plan.price;
    final headline = isAbroad
        ? 'אפשר לחסוך ₪$perPackage לחבילה'
        : 'אפשר לחסוך ₪${match.annualSaving} בשנה';
    final shareText = isAbroad
        ? 'גיליתי שאפשר לחסוך ₪$perPackage לחבילה במעבר ל${match.plan.provider} — עם Switchy AI'
        : 'גיליתי שאפשר לחסוך ₪${match.annualSaving} בשנה במעבר ל${match.plan.provider} — עם Switchy AI';
    // The headline saving is the page's hero VALUE moment — the green savings
    // tint treatment, with a celebratory icon badge.
    // Light selection haptic on the saver tap targets — matches the tactile
    // feedback the Pressable rows below emit.
    void tapWithHaptic() {
      HapticFeedback.selectionClick();
      onTap();
    }

    return Semantics(
      button: true,
      label: '$headline, מעבר ל${match.plan.provider}. הצג מסלול',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: tapWithHaptic,
          borderRadius: BorderRadius.circular(ffTheme.radiusXl),
          splashColor: ffTheme.saving.withValues(alpha: 0.12),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.circular(ffTheme.radiusXl),
              border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // Neutral icon medallion pattern with the VALUE glyph.
                    ExcludeSemantics(
                      child: Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: ffTheme.saving.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                        ),
                        child: Icon(Icons.celebration_rounded, size: 24, color: ffTheme.savingText),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Headline token; the savings green is the VALUE ink.
                          Text(headline,
                              style: ffTheme.headlineMedium.copyWith(
                                  fontWeight: FontWeight.w800, color: ffTheme.savingText)),
                          const SizedBox(height: 2),
                          Text('מעבר ל${match.plan.provider} · ${match.plan.plan}',
                              style: ffTheme.bodySmall.copyWith(
                                  color: ffTheme.primaryText, fontWeight: FontWeight.w600),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    const SizedBox(width: 4),
                    IconButton(
                      tooltip: 'שתף',
                      icon: Icon(Icons.ios_share_rounded, size: 20, color: ffTheme.savingText),
                      onPressed: () => Share.share(shareText),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // The screen's ONE primary gradient CTA — the saving is the
                // VALUE (tint); switching is the ACTION, so the button leads.
                AppButton(
                  text: 'צפה במסלול החוסך',
                  icon: const Icon(Icons.arrow_back_rounded, size: 18),
                  color: AppColors.primary,
                  width: double.infinity,
                  onPressed: () async => tapWithHaptic(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NoSaverNote extends StatelessWidget {
  const _NoSaverNote({required this.provider, required this.ffTheme});
  final String provider;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      // Neutral tint surface + 1px hairline (no ad-hoc ink border).
      decoration: BoxDecoration(
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(ffTheme.radiusXl),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          ExcludeSemantics(
            child: Icon(Icons.thumb_up_alt_outlined, size: 26, color: ffTheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'המחיר שלך ב$provider עדיין מהתחרותיים בשוק — שווה לוודא מול הטבלה למטה',
              style: ffTheme.bodySmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Alternative row ─────────────────────────────────────────────────────────

class _AlternativeRow extends StatelessWidget {
  const _AlternativeRow({
    required this.rank,
    required this.match,
    required this.currentPrice,
    required this.isAbroad,
    required this.isTop,
    required this.ffTheme,
    required this.onTap,
  });
  final int rank;
  final PlanMatch match;
  final int currentPrice;
  final bool isAbroad;
  final bool isTop;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final plan = match.plan;
    final saving = match.annualSaving;
    // Per-package framing for abroad — never annualize a per-package price.
    final savingLabel = isAbroad
        ? 'חוסך ₪${currentPrice - plan.price} לחבילה'
        : 'חוסך ₪$saving/שנה';
    final rating = ProviderRatings.averageStars(plan.provider);
    return Pressable(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        // Flat resting card + 1px hairline; the top pick earns the strong ink
        // border as its focal tell (no lift — one elevation story).
        decoration: isTop
            ? ffTheme.cardDecoration(radius: ffTheme.radiusMd).copyWith(
                border: Border.all(color: ffTheme.primary, width: 2),
              )
            : ffTheme.cardDecoration(radius: ffTheme.radiusMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isTop)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Icon(Icons.verified_rounded, size: 15, color: ffTheme.primary),
                    const SizedBox(width: 4),
                    Text('הבחירה שלנו',
                        style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.primary, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            Row(
              children: [
                LogoWidget(provider: plan.provider, size: 38),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(plan.provider,
                                style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                          if (rating > 0) ...[
                            const SizedBox(width: 6),
                            // Amber star = the universal rating glyph (a
                            // documented warning-token exception).
                            Icon(Icons.star_rounded, size: 13, color: ffTheme.warning),
                            Text(rating.toStringAsFixed(1),
                                style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700)),
                          ],
                        ],
                      ),
                      Text(plan.plan,
                          style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Money = ink, tabular + bidi-safe via PriceText.
                    PriceText('₪${plan.priceText}',
                        style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
                    Text(plan.hasPromo ? 'ואז ₪${plan.afterText}' : priceUnitLabel(plan),
                        style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                // Match score chip — neutral chip language.
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    border: Border.all(color: ffTheme.lineColor),
                  ),
                  child: Text('${match.scorePct}% התאמה',
                      style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.primary, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 8),
                // Saving vs current — the ONE shared VALUE-pill treatment.
                if (saving > 0)
                  Flexible(child: SavingPill(text: savingLabel))
                else
                  Text(
                    plan.price <= currentPrice ? 'מחיר דומה' : 'יקר מהנוכחי',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                const Spacer(),
                Icon(Icons.chevron_left_rounded, size: 18, color: ffTheme.secondaryText),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Reminder CTA ────────────────────────────────────────────────────────────

class _ReminderCta extends StatelessWidget {
  const _ReminderCta({required this.tp, required this.ffTheme});
  final TrackedPlan tp;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final on = appState.renewalReminders;
    final fire = reminderFireDate(tp);
    final dateStr = fire != null ? DateFormat('d/M/yyyy').format(fire) : null;

    return Container(
      padding: const EdgeInsets.all(16),
      // ON = a success/active confirmation → the green tint treatment; the
      // inactive state is a standard flat card + hairline.
      decoration: on
          ? BoxDecoration(
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.circular(ffTheme.radiusMd),
              border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.4)),
            )
          : ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: on
          ? Row(
              children: [
                Icon(Icons.check_circle_rounded, color: ffTheme.brandAccent, size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    dateStr != null
                        ? 'מצוין! נזכיר לך ב-$dateStr עם טבלה מעודכנת'
                        : 'מצוין! נזכיר לך לפני סיום המבצע עם טבלה מעודכנת',
                    style: ffTheme.bodySmall.copyWith(
                        color: ffTheme.primaryText, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.mark_email_unread_rounded, color: ffTheme.primary, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('רוצה שנשלח לך את הטבלה לפני החידוש?',
                          style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'נזכיר לך ~21 יום לפני סיום המבצע עם השוואת מחירים עדכנית מכל החברות.',
                  style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                ),
                const SizedBox(height: 12),
                // Secondary AppButton — the saver banner above holds the
                // screen's single primary gradient CTA.
                AppButton.secondary(
                  text: 'שלחו לי תזכורת',
                  icon: const Icon(Icons.notifications_active_rounded, size: 18),
                  width: double.infinity,
                  height: 48,
                  onPressed: () async {
                    appState.setRenewalReminders(true);
                    appBackend.setRenewalReminder(true).catchError((_) {});
                    await PushNotificationService.instance.requestPermission();
                    await PushNotificationService.instance.syncRenewalReminders(appState);
                    if (context.mounted) {
                      AppSnackBar.success(
                          context, 'תזכורת חידוש הופעלה — נדאג שלא תפספס');
                    }
                  },
                ),
              ],
            ),
    );
  }
}

// ── Not found ───────────────────────────────────────────────────────────────

class _NotFound extends StatelessWidget {
  const _NotFound({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: const Text('טבלת השוואה'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.search_off_rounded, size: 56, color: ffTheme.alternate),
              const SizedBox(height: 12),
              Text('המסלול לא נמצא', style: ffTheme.titleMedium),
              const SizedBox(height: 6),
              Text('ייתכן שהוסר מהמעקב',
                  style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
                  textAlign: TextAlign.center),
              const SizedBox(height: 24),
              // Never dead-end — route back to the renewal radar so the user can
              // re-add or pick another tracked plan to compare. The empty
              // screen's single action = the primary AppButton CTA.
              AppButton(
                text: 'חזרה למעקב חידושים',
                icon: const Icon(Icons.notifications_active_outlined, size: 18),
                color: AppColors.primary,
                width: double.infinity,
                onPressed: () async =>
                    context.canPop() ? context.safePop() : context.goNamed('Renewal'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
