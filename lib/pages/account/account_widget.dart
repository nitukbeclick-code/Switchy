import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../widgets/pressable.dart';
import '../../widgets/app_sliver_header.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../components/plan_card/mini_plan_card.dart';

class AccountWidget extends StatelessWidget {
  const AccountWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final plan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;

    return Scaffold(
      backgroundColor: ffTheme.background,
      // Pull-to-refresh recomputes the live AppState-derived figures (savings,
      // tracker, watchlist) — a notify is enough to rebuild this StatelessWidget.
      body: RefreshableScroll(
        onRefresh: () async {
          HapticFeedback.lightImpact();
          AppState().update(() {});
        },
        slivers: [
          // Collapsing ink hero — mirrors the Profile header. The avatar rides
          // as the flexibleChild and the settings / login action sits trailing.
          AppSliverHeader(
            title: appState.isLoggedIn ? appState.userName : 'אורח',
            subtitle: appState.isLoggedIn ? appState.userPhone : 'לא מחובר',
            expandedHeight: 188,
            gradient: false,
            showBack: false,
            actions: [
              if (appState.isLoggedIn)
                IconButton(
                  icon: Icon(Icons.settings_rounded, color: ffTheme.primaryText),
                  tooltip: 'הגדרות פרופיל',
                  onPressed: () => context.pushNamed('Settings'),
                )
              else
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: TextButton(
                    onPressed: () => context.pushNamed('Auth'),
                    // Solid white chip with ink text — reads as a clear CTA on
                    // the ink header in both themes (the old `secondary` fill
                    // went dark slate on dark, hiding the black label).
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text('כניסה', style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primary)),
                    ),
                  ),
                ),
            ],
            flexibleChild: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: ExcludeSemantics(
                  child: appState.isLoggedIn && appState.firstName.isNotEmpty
                      ? Text(
                          appState.firstName[0],
                          style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w700, color: ffTheme.primaryText),
                        )
                      : Icon(Icons.person_rounded, size: 30, color: ffTheme.primaryText),
                ),
              ),
            ),
          ),

          // Login CTA banner for guests
          if (!appState.isLoggedIn)
            SliverToBoxAdapter(
              child: Pressable(
                onTap: () => context.pushNamed('Auth'),
                child: Container(
                  margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: ffTheme.brandAccentTint,
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.22)),
                    boxShadow: ffTheme.shadowXs,
                  ),
                  child: Row(
                    children: [
                      ExcludeSemantics(child: Icon(Icons.lock_open_rounded, size: 22, color: ffTheme.brandAccent)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('הצטרפו ל-Switchy AI בחינם', style: ffTheme.titleSmall.copyWith(color: ffTheme.brandAccentText)),
                            Text('שמרו תוצאות, עקבו אחר מחירים ועוד', style: ffTheme.bodySmall),
                          ],
                        ),
                      ),
                      Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.brandAccent),
                    ],
                  ),
                ),
              ).animate().fadeIn(delay: 150.ms),
            ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Savings hero — only for users who have an active plan/savings.
                  // Tapping opens the full /savings dashboard (never a dead-end);
                  // the figure is rendered in amber (VALUE) and all labels use a
                  // white-alpha so they stay legible on the ink hero in BOTH themes
                  // (the old `secondary` label collapsed to dark slate on dark).
                  if (appState.isLoggedIn || appState.totalSavings > 0)
                  Pressable(
                    onTap: () => context.pushNamed('Savings'),
                    child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [ffTheme.primaryDark, ffTheme.primary]),
                      borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                      boxShadow: ffTheme.shadowLifted,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text('חסכת עד כה!', style: GoogleFonts.assistant(fontSize: 13, color: Colors.white.withValues(alpha: 0.75), fontWeight: FontWeight.w600)),
                            const Spacer(),
                            Text('פירוט החיסכון', style: ffTheme.labelSmall.copyWith(color: Colors.white.withValues(alpha: 0.75), fontWeight: FontWeight.w700)),
                            Icon(Icons.arrow_back_ios_rounded, size: 11, color: Colors.white.withValues(alpha: 0.75)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text('₪${appState.totalSavings}', style: GoogleFonts.rubik(fontSize: 44, fontWeight: FontWeight.w800, color: ffTheme.saving, letterSpacing: -1)),
                        Text('מאז שהצטרפת ל-Switchy AI', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white.withValues(alpha: 0.62))),
                      ],
                    ),
                  ),
                  ).animate().scale(begin: const Offset(0.95, 0.95), delay: 100.ms, duration: 300.ms),

                  const SizedBox(height: 16),

                  // Quick links row
                  Row(
                    children: [
                      _QuickLink(icon: Icons.receipt_rounded, label: 'חשבונות', onTap: () => context.pushNamed('Bills'), ffTheme: ffTheme),
                      const SizedBox(width: 10),
                      _QuickLink(icon: Icons.savings_rounded, label: 'חיסכון', onTap: () => context.pushNamed('Savings'), ffTheme: ffTheme),
                      const SizedBox(width: 10),
                      _QuickLink(icon: Icons.star_rounded, label: 'דירוגים', onTap: () => context.pushNamed('Ratings'), ffTheme: ffTheme),
                      const SizedBox(width: 10),
                      _QuickLink(icon: Icons.chat_rounded, label: 'קהילה', onTap: () => context.goNamed('Community'), ffTheme: ffTheme),
                    ],
                  ).animate().fadeIn(delay: 200.ms),

                  const SizedBox(height: 20),

                  // Active request — header only shown when a plan is active
                  if (plan != null) _SectionHeader('בקשה פעילה', ffTheme: ffTheme),
                  if (plan != null) const SizedBox(height: 12),
                  if (plan != null)
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(plan.provider, style: ffTheme.titleSmall),
                                    Text(plan.plan, style: ffTheme.bodySmall),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: appState.trackerStep >= 4 ? ffTheme.success.withValues(alpha: 0.1) : ffTheme.brandAccentTint,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  appState.trackerStep >= 4 ? 'הושלם' : 'בתהליך',
                                  style: GoogleFonts.rubik(fontSize: 11, fontWeight: FontWeight.w700, color: appState.trackerStep >= 4 ? ffTheme.success : ffTheme.brandAccent),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          // Mini tracker progress
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: LinearProgressIndicator(
                              value: appState.trackerStep / 4,
                              backgroundColor: ffTheme.alternate,
                              valueColor: AlwaysStoppedAnimation(appState.trackerStep >= 4 ? ffTheme.success : ffTheme.brandAccent),
                              minHeight: 6,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            ['ממתין לאישור', 'אישור מסלול', 'ניוד בעיצומו', 'כמעט שם!', 'הושלם'][appState.trackerStep.clamp(0, 4)],
                            style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText),
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton(
                            onPressed: () => context.goNamed('Tracker'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: ffTheme.brandAccentText,
                              side: BorderSide(color: ffTheme.brandAccent),
                              minimumSize: const Size(double.infinity, 40),
                            ),
                            child: const Text('מעקב מלא'),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(delay: 300.ms)
                  else
                    Pressable(
                      onTap: () => context.goNamed('Results'),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: ffTheme.glassDecoration(radius: 16).copyWith(
                          border: Border.all(color: ffTheme.alternate, width: 1.5),
                        ),
                        child: Column(
                          children: [
                            ExcludeSemantics(child: Icon(Icons.rocket_launch_outlined, size: 40, color: ffTheme.brandAccent)),
                            const SizedBox(height: 12),
                            Text('עוד לא בחרתם מסלול?', style: ffTheme.titleSmall),
                            const SizedBox(height: 4),
                            Text('מצאו את החבילה הזולה ביותר עכשיו', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
                            const SizedBox(height: 14),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
                              decoration: BoxDecoration(
                                gradient: ffTheme.accentGradient,
                                borderRadius: BorderRadius.circular(10),
                                boxShadow: ffTheme.shadowAccent,
                              ),
                              child: Text('השווה מסלולים', style: ffTheme.labelMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ),
                    ).animate().fadeIn(delay: 300.ms),

                  const SizedBox(height: 20),

                  // Watchlist
                  if (appState.watchedPlans.isNotEmpty) ...[
                    _SectionHeader('מסלולים במעקב', ffTheme: ffTheme, count: appState.watchedPlans.length),
                    const SizedBox(height: 10),
                    // Emil: watched plans reveal in a short stagger (fade + 6px
                    // rise, ease-out), matching the quick-actions rhythm below so
                    // the long account scroll resolves group-by-group. Capped
                    // delay keeps a long watchlist snappy; reduced motion is
                    // honoured by flutter_animate.
                    ...appState.watchedPlans.asMap().entries.map((e) {
                      final id = e.value;
                      final p = planById(id);
                      if (p == null) return const SizedBox();
                      final save = planSaveYear(p, appState.currentBill(p.cat));
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: MiniPlanCard(
                                plan: p,
                                savingsPerYear: save,
                                showCta: false,
                                onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': id}),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                              icon: const Icon(Icons.notifications_off_outlined, size: 18),
                              color: ffTheme.secondaryText,
                              tooltip: 'הסר ממעקב',
                              onPressed: () => appState.toggleWatch(id),
                            ),
                          ],
                        ),
                      ).animate(delay: (e.key.clamp(0, 6) * 50).ms)
                          .fadeIn(duration: 260.ms, curve: ffTheme.easeOut)
                          .slideY(begin: 0.06, end: 0, curve: ffTheme.easeOut);
                    }),
                    const SizedBox(height: 10),
                  ],

                  // Quiz CTA or summary
                  if (!appState.quizCompleted) ...[
                    const SizedBox(height: 20),
                    Pressable(
                      onTap: () => context.pushNamed('Quiz'),
                      child: Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [ffTheme.primaryDark, ffTheme.primary],
                            begin: Alignment.topRight,
                            end: Alignment.bottomLeft,
                          ),
                          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                          boxShadow: ffTheme.shadowMd,
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                              ),
                              child: const Center(child: ExcludeSemantics(child: Icon(Icons.adjust, size: 24, color: Colors.white))),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('גלה כמה תוכל לחסוך!',
                                      style: ffTheme.titleSmall.copyWith(color: Colors.white)),
                                  const SizedBox(height: 2),
                                  Text('שאלון קצר — תוצאות מותאמות אישית',
                                      style: ffTheme.bodySmall.copyWith(color: Colors.white70)),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              // White chip + ink label — legible on the ink quiz
                              // card in both themes (the old `secondary` fill went
                              // dark slate on dark, swallowing the black text).
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text('התחל ←',
                                  style: ffTheme.labelSmall.copyWith(
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ),
                    ).animate().fadeIn(delay: 250.ms),
                  ] else ...[
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: ffTheme.brandAccentTint,
                        borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.22)),
                        boxShadow: ffTheme.shadowXs,
                      ),
                      child: Row(
                        children: [
                          ExcludeSemantics(child: Icon(Icons.adjust, size: 20, color: ffTheme.brandAccent)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text('תקציב השאלון: ₪${appState.quizBudget}${appState.quizCat == 'abroad' ? '/חבילה' : '/חודש'}',
                                style: ffTheme.bodyMedium.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w600)),
                          ),
                          GestureDetector(
                            onTap: () => context.goNamed('Results'),
                            child: Text('לתוצאות', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(delay: 250.ms),
                  ],

                  // Recently viewed
                  if (appState.recentlyViewed.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    _SectionHeader(
                      'צפיות אחרונות',
                      ffTheme: ffTheme,
                      trailingLabel: 'כל המסלולים',
                      onTrailingTap: () => context.goNamed('Results'),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 88,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: appState.recentlyViewed.map((id) {
                          final p = planById(id);
                          if (p == null) return const SizedBox();
                          return Pressable(
                            onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': id}),
                            child: Container(
                              width: 140,
                              margin: const EdgeInsetsDirectional.only(end: 10),
                              padding: const EdgeInsets.all(12),
                              decoration: ffTheme.glassDecoration(radius: 14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      LogoWidget(provider: p.provider, size: 24),
                                      const SizedBox(width: 6),
                                      Expanded(child: Text(p.provider, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
                                    ],
                                  ),
                                  const SizedBox(height: 5),
                                  Text('₪${p.priceText}/${priceUnitShort(p)}', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary)),
                                  Text(p.plan, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ],

                  if (appState.userReviews.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    _SectionHeader(
                      'הביקורות שלי',
                      ffTheme: ffTheme,
                      trailingLabel: 'כל הדירוגים',
                      onTrailingTap: () => context.pushNamed('Ratings'),
                    ),
                    const SizedBox(height: 10),
                    ...appState.userReviews.take(3).map((r) {
                      final overall = r['overall'] as int? ?? 0;
                      final text = r['text'] as String? ?? '';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: ffTheme.glassDecoration(radius: 12),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(r['provider'] as String, style: ffTheme.labelMedium.copyWith(fontWeight: FontWeight.w700)),
                                  if (text.isNotEmpty) ...[
                                    const SizedBox(height: 2),
                                    Text(text, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                                  ],
                                ],
                              ),
                            ),
                            Semantics(
                              label: 'דירוג: $overall מתוך 5 כוכבים',
                              child: ExcludeSemantics(
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: List.generate(5, (i) => Icon(
                                    i < overall ? Icons.star_rounded : Icons.star_outline_rounded,
                                    size: 14,
                                    color: ffTheme.warning,
                                  )),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],

                  const SizedBox(height: 20),

                  // Quick actions
                  _SectionHeader('פעולות מהירות', ffTheme: ffTheme),
                  const SizedBox(height: 12),
                  ...[
                    if (appState.isAdmin) ...[
                      _ActionTile(icon: Icons.dashboard_rounded, title: 'ניהול לקוחות / CRM', subtitle: 'שיחות וואטסאפ, לידים וצבר מכירות', onTap: () => context.pushNamed('Crm'), ffTheme: ffTheme),
                      _ActionTile(icon: Icons.insights_rounded, title: 'דשבורד אנליטיקס', subtitle: 'מדדי משפך אמיתיים — לידים, ערוצים והמרה', onTap: () => context.pushNamed('Analytics'), ffTheme: ffTheme),
                    ],
                    _ActionTile(icon: Icons.account_balance_wallet_rounded, title: 'ארנק התקשורת', subtitle: 'כמה כבר חסכת דרכנו', onTap: () => context.pushNamed('Wallet'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.alarm_rounded, title: 'מעקב חידושים', subtitle: 'אל תשלם יותר מדי כשהמבצע נגמר', onTap: () => context.pushNamed('Renewal'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.support_agent_rounded, title: 'תסריט מיקוח', subtitle: 'רוצים להישאר? בקשו הנחה עם נתונים אמיתיים', onTap: () => context.pushNamed('Negotiate'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.compare_arrows_rounded, title: 'השוואה חדשה', subtitle: 'מצא את המסלול הכי מתאים לך', onTap: () => context.goNamed('Results'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.auto_awesome_rounded, title: 'יועץ AI', subtitle: 'שאל שאלות על מסלולי תקשורת', onTap: () => context.pushNamed('AIAdvisor'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.card_giftcard_rounded, title: 'הזמינו חבר', subtitle: 'עזרו לחבר לחסוך — שתפו את Switchy AI', onTap: () => context.pushNamed('Referral'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.person_rounded, title: 'הגדרות פרופיל', subtitle: 'עדכן פרטים ועדפות', onTap: () => context.pushNamed('Profile'), ffTheme: ffTheme),
                  ].animate(interval: 70.ms).fadeIn(duration: 300.ms).slideY(begin: 0.06, end: 0),

                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A consistent section heading: a short green "eyebrow" tick + the title, with
/// an optional muted count badge and an optional trailing link. Gives the long
/// account scroll a designed group rhythm instead of a flat stack of titles.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader(
    this.title, {
    required this.ffTheme,
    this.count,
    this.trailingLabel,
    this.onTrailingTap,
  });
  final String title;
  final AppTheme ffTheme;
  final int? count;
  final String? trailingLabel;
  final VoidCallback? onTrailingTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Brand-green eyebrow tick — a small ACTION-colour structural cue.
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
        Text(title, style: ffTheme.titleLarge),
        if (count != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
            decoration: BoxDecoration(
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text('$count',
                style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
          ),
        ],
        if (trailingLabel != null) ...[
          const Spacer(),
          GestureDetector(
            onTap: onTrailingTap,
            child: Text(trailingLabel!,
                style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
          ),
        ],
      ],
    );
  }
}

class _QuickLink extends StatelessWidget {
  const _QuickLink({required this.icon, required this.label, required this.onTap, required this.ffTheme});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Pressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
          child: Column(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: ffTheme.brandAccentTint,
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: Icon(icon, color: ffTheme.brandAccent, size: 22),
              ),
              const SizedBox(height: 8),
              Text(label, style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.title, required this.subtitle, required this.onTap, required this.ffTheme});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      // Light haptic confirms the tap before the route push, matching the
      // tactile feedback the rest of the app gives on primary actions.
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: ffTheme.glassDecoration(radius: ffTheme.radiusMd),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
              ),
              child: ExcludeSemantics(child: Icon(icon, color: ffTheme.brandAccent, size: 22)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: ffTheme.titleSmall),
                  Text(subtitle, style: ffTheme.bodySmall),
                ],
              ),
            ),
            ExcludeSemantics(child: Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.secondaryText)),
          ],
        ),
      ),
    );
  }
}
