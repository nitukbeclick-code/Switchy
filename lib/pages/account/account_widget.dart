import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../widgets/pressable.dart';
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
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [ffTheme.primary, ffTheme.tertiary],
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                  child: Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: ExcludeSemantics(
                            child: appState.isLoggedIn && appState.firstName.isNotEmpty
                                ? Text(
                                    appState.firstName[0],
                                    style: GoogleFonts.rubik(fontSize: 26, fontWeight: FontWeight.w700, color: Colors.white),
                                  )
                                : const Icon(Icons.person_rounded, size: 28, color: Colors.white),
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(appState.isLoggedIn ? appState.userName : 'אורח', style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white)),
                            Text(appState.isLoggedIn ? appState.userPhone : 'לא מחובר', style: GoogleFonts.assistant(fontSize: 13, color: Colors.white70)),
                          ],
                        ),
                      ),
                      if (appState.isLoggedIn)
                        IconButton(
                          icon: const Icon(Icons.settings_rounded, color: Colors.white),
                          tooltip: 'הגדרות פרופיל',
                          onPressed: () => context.pushNamed('Settings'),
                        )
                      else
                        TextButton(
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
                    ],
                  ),
                ),
              ),
            ).animate().fadeIn(duration: 400.ms),
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
                            Text('הצטרפו לחוסך בחינם', style: ffTheme.titleSmall.copyWith(color: ffTheme.brandAccentText)),
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
                        Text('מאז שהצטרפת לחוסך', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white.withValues(alpha: 0.62))),
                      ],
                    ),
                  ),
                  ).animate().scale(begin: const Offset(0.97, 0.97), delay: 100.ms, duration: 400.ms),

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
                  if (plan != null) Text('בקשה פעילה', style: ffTheme.titleLarge),
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
                    Text('מסלולים במעקב', style: ffTheme.titleLarge),
                    const SizedBox(height: 10),
                    ...appState.watchedPlans.map((id) {
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
                      );
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
                    Row(
                      children: [
                        Text('צפיות אחרונות', style: ffTheme.titleLarge),
                        const Spacer(),
                        GestureDetector(
                          onTap: () => context.goNamed('Results'),
                          child: Text('כל המסלולים', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                        ),
                      ],
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
                    Row(
                      children: [
                        Text('הביקורות שלי', style: ffTheme.titleLarge),
                        const Spacer(),
                        GestureDetector(
                          onTap: () => context.pushNamed('Ratings'),
                          child: Text('כל הדירוגים', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                        ),
                      ],
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
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: List.generate(5, (i) => Icon(
                                i < overall ? Icons.star_rounded : Icons.star_outline_rounded,
                                size: 14,
                                color: ffTheme.warning,
                              )),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],

                  const SizedBox(height: 20),

                  // Quick actions
                  Text('פעולות מהירות', style: ffTheme.titleLarge),
                  const SizedBox(height: 12),
                  ...[
                    if (appState.isAdmin)
                      _ActionTile(icon: Icons.dashboard_rounded, title: 'ניהול לקוחות / CRM', subtitle: 'שיחות וואטסאפ, לידים וצבר מכירות', onTap: () => context.pushNamed('Crm'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.alarm_rounded, title: 'מעקב חידושים', subtitle: 'אל תשלם יותר מדי כשהמבצע נגמר', onTap: () => context.pushNamed('Renewal'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.compare_arrows_rounded, title: 'השוואה חדשה', subtitle: 'מצא את המסלול הכי מתאים לך', onTap: () => context.goNamed('Results'), ffTheme: ffTheme),
                    _ActionTile(icon: Icons.auto_awesome_rounded, title: 'יועץ AI', subtitle: 'שאל שאלות על מסלולי תקשורת', onTap: () => context.pushNamed('AIAdvisor'), ffTheme: ffTheme),
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
      onTap: onTap,
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
              child: Icon(icon, color: ffTheme.brandAccent, size: 22),
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
            Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.secondaryText),
          ],
        ),
      ),
    );
  }
}
