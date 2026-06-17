import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_snackbar.dart';
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
class RenewalReportWidget extends StatelessWidget {
  const RenewalReportWidget({super.key, required this.trackedId});
  final String trackedId;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final tp = appState.trackedPlanById(trackedId);

    if (tp == null) return _NotFound(ffTheme: ffTheme);

    final matches = RenewalReport.alternatives(tp, appState, limit: 12);
    final bestSaver = RenewalReport.bestSaver(tp, appState);
    // Abroad plans are priced per package — every saving in this report must be
    // framed per package, never per month/year.
    final isAbroad = tp.category == 'abroad';
    final unit = isAbroad ? 'לחבילה' : 'לחודש';

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
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

                  const SizedBox(height: 24),

                  Row(
                    children: [
                      Icon(Icons.table_chart_rounded, size: 18, color: ffTheme.primary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text('כל המסלולים — מהמשתלם ביותר',
                            style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                      ),
                      Text('${matches.length} מסלולים',
                          style: ffTheme.labelSmall.copyWith(
                              color: ffTheme.secondaryText,
                              fontFeatures: const [FontFeature.tabularFigures()])),
                    ],
                  ),
                  const SizedBox(height: 12),

                  ...matches.asMap().entries.map((e) {
                    final i = e.key;
                    final m = e.value;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _AlternativeRow(
                        rank: i + 1,
                        match: m,
                        currentPrice: tp.monthlyPrice,
                        isAbroad: isAbroad,
                        isTop: i == 0,
                        ffTheme: ffTheme,
                        onTap: () => context.pushNamed('PlanDetail',
                            pathParameters: {'planId': m.plan.id}),
                      ).animate(delay: (i * 45 + 80).ms).fadeIn(duration: 260.ms).slideY(begin: 0.06),
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
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [ffTheme.primaryDark, ffTheme.primary],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
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
                    onPressed: onBack,
                  ),
                  Expanded(
                    child: Text('טבלת השוואה מלאה',
                        style: GoogleFonts.rubik(
                            fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: LogoWidget(provider: tp.provider, size: 40),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('המסלול שלך היום',
                              style: GoogleFonts.assistant(
                                  fontSize: 12, color: Colors.white.withValues(alpha: 0.8))),
                          Text('${tp.provider} · ${tp.planName}',
                              style: GoogleFonts.rubik(
                                  fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('₪${tp.monthlyPrice}',
                            style: GoogleFonts.rubik(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                                fontFeatures: const [FontFeature.tabularFigures()])),
                        Text(priceCaption,
                            style: GoogleFonts.assistant(
                                fontSize: 11,
                                color: Colors.white.withValues(alpha: 0.8),
                                fontFeatures: const [FontFeature.tabularFigures()])),
                      ],
                    ),
                  ],
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
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.alarm_rounded, size: 15, color: ffTheme.secondary),
                        const SizedBox(width: 6),
                        Text(
                          days < 0
                              ? 'המבצע הסתיים — כדאי לבדוק עכשיו'
                              : days == 0
                                  ? 'המבצע מסתיים היום!'
                                  : 'המבצע מסתיים בעוד $days ימים',
                          style: GoogleFonts.assistant(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                              fontFeatures: const [FontFeature.tabularFigures()]),
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
        ? 'גיליתי שאפשר לחסוך ₪$perPackage לחבילה במעבר ל${match.plan.provider} — עם חוסך'
        : 'גיליתי שאפשר לחסוך ₪${match.annualSaving} בשנה במעבר ל${match.plan.provider} — עם חוסך';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsetsDirectional.fromSTEB(14, 14, 12, 14),
        decoration: BoxDecoration(
          color: ffTheme.saving,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          border: Border.all(color: ffTheme.savingDark.withValues(alpha: 0.45)),
          boxShadow: ffTheme.shadowSoft,
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: ffTheme.primaryDark,
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
              ),
              child: Icon(Icons.savings_rounded, size: 24, color: ffTheme.saving),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(headline,
                      style: GoogleFonts.rubik(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          height: 1.1,
                          color: ffTheme.primaryDark,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  const SizedBox(height: 3),
                  Text('מעבר ל${match.plan.provider} · ${match.plan.plan}',
                      style: GoogleFonts.assistant(
                          fontSize: 13, fontWeight: FontWeight.w600, color: ffTheme.primaryDark),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const SizedBox(width: 4),
            Semantics(
              button: true,
              label: 'שתף את החיסכון',
              child: IconButton(
                tooltip: 'שתף',
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                icon: Icon(Icons.ios_share_rounded, size: 20, color: ffTheme.primaryDark),
                onPressed: () => Share.share(shareText),
              ),
            ),
            Icon(Icons.arrow_back_ios_rounded, size: 16, color: ffTheme.primaryDark),
          ],
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
      decoration: BoxDecoration(
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Icon(Icons.thumb_up_alt_outlined, size: 26, color: ffTheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'המחיר שלך ב$provider עדיין מהתחרותיים בשוק — אבל כדאי לוודא מול הטבלה למטה',
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          border: Border.all(
            color: isTop ? ffTheme.primary : ffTheme.alternate,
            width: isTop ? 2 : 1,
          ),
          boxShadow: isTop ? ffTheme.shadowCard : ffTheme.shadowSoft,
        ),
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
              )
            else
              // Reserve the badge's footprint so every row's content aligns.
              const SizedBox(height: 23),
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
                            Icon(Icons.star_rounded, size: 13, color: ffTheme.warning),
                            Text(rating.toStringAsFixed(1),
                                style: ffTheme.labelSmall.copyWith(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 11,
                                    fontFeatures: const [FontFeature.tabularFigures()])),
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
                    Text('₪${plan.priceText}',
                        style: ffTheme.titleMedium.copyWith(
                            color: ffTheme.primary,
                            fontWeight: FontWeight.w800,
                            fontFeatures: const [FontFeature.tabularFigures()])),
                    Text(plan.hasPromo ? 'ואז ₪${plan.after}' : priceUnitLabel(plan),
                        style: ffTheme.labelSmall.copyWith(
                            color: ffTheme.secondaryText,
                            fontSize: 10,
                            fontFeatures: const [FontFeature.tabularFigures()])),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                // Match score chip
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                  ),
                  child: Text('${match.scorePct}% התאמה',
                      style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.primary,
                          fontWeight: FontWeight.w700,
                          fontSize: 10.5,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                ),
                const SizedBox(width: 8),
                // Saving vs current — the VALUE moment carries the amber accent.
                if (saving > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: ffTheme.saving,
                      borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                    ),
                    child: Text(savingLabel,
                        style: GoogleFonts.rubik(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                            color: ffTheme.primaryDark,
                            fontFeatures: const [FontFeature.tabularFigures()])),
                  )
                else
                  Text(
                    plan.price <= currentPrice ? 'מחיר דומה' : 'יקר מהנוכחי',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10.5),
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
      decoration: BoxDecoration(
        color: on ? ffTheme.success.withValues(alpha: 0.08) : ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: on ? ffTheme.success.withValues(alpha: 0.4) : ffTheme.alternate),
        boxShadow: on ? null : ffTheme.shadowSoft,
      ),
      child: on
          ? Row(
              children: [
                Icon(Icons.check_circle_rounded, color: ffTheme.success, size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    dateStr != null
                        ? 'מצוין! נזכיר לך ב-$dateStr עם טבלה מעודכנת'
                        : 'מצוין! נזכיר לך לפני סיום המבצע עם טבלה מעודכנת',
                    style: ffTheme.bodySmall.copyWith(
                        color: ffTheme.primaryText,
                        fontWeight: FontWeight.w600,
                        fontFeatures: const [FontFeature.tabularFigures()]),
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
                  style: ffTheme.bodySmall.copyWith(
                      color: ffTheme.secondaryText,
                      fontFeatures: const [FontFeature.tabularFigures()]),
                ),
                const SizedBox(height: 14),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: ffTheme.accentGradient,
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    boxShadow: ffTheme.shadowAccent,
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
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
                      icon: const Icon(Icons.notifications_active_rounded, size: 18),
                      label: const Text('שלחו לי תזכורת'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        shadowColor: Colors.transparent,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        textStyle: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
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
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: const Text('טבלת השוואה'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off_rounded, size: 56, color: ffTheme.alternate),
            const SizedBox(height: 12),
            Text('המסלול לא נמצא', style: ffTheme.titleMedium),
            const SizedBox(height: 6),
            Text('ייתכן שהוסר מהמעקב', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
          ],
        ),
      ),
    );
  }
}
