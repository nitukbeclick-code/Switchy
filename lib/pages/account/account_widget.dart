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
import '../../components/logo_widget/logo_widget.dart';

class AccountWidget extends StatelessWidget {
  const AccountWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
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
                          color: Colors.white.withOpacity(0.2),
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            appState.isLoggedIn && appState.firstName.isNotEmpty ? appState.firstName[0] : '👤',
                            style: GoogleFonts.rubik(fontSize: 26, fontWeight: FontWeight.w700, color: Colors.white),
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
                          onPressed: () => context.pushNamed('Profile'),
                        )
                      else
                        TextButton(
                          onPressed: () => context.pushNamed('Auth'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: ffTheme.secondary,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text('כניסה', style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: const Color(0xFF0E3A26))),
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
              child: GestureDetector(
                onTap: () => context.pushNamed('Auth'),
                child: Container(
                  margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                  ),
                  child: Row(
                    children: [
                      const Text('🔓', style: TextStyle(fontSize: 22)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('הצטרפו לחוסך בחינם', style: ffTheme.titleSmall.override(color: ffTheme.primary)),
                            Text('שמרו תוצאות, עקבו אחר מחירים ועוד', style: ffTheme.bodySmall),
                          ],
                        ),
                      ),
                      Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.primary),
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
                  // Savings hero
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [const Color(0xFF0E3A26), ffTheme.primary]),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('חסכת עד כה! 🎉', style: GoogleFonts.assistant(fontSize: 13, color: ffTheme.secondary, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 6),
                        Text('₪${appState.totalSavings}', style: GoogleFonts.rubik(fontSize: 44, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1)),
                        Text('מאז שהצטרפת לחוסך', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white60)),
                      ],
                    ),
                  ).animate().scale(begin: const Offset(0.97, 0.97), delay: 100.ms, duration: 400.ms),

                  const SizedBox(height: 16),

                  // Quick links row
                  Row(
                    children: [
                      _QuickLink(icon: Icons.receipt_rounded, label: 'חשבונות', onTap: () => context.pushNamed('Bills'), ffTheme: ffTheme),
                      const SizedBox(width: 10),
                      _QuickLink(icon: Icons.star_rounded, label: 'דירוגים', onTap: () => context.pushNamed('Ratings'), ffTheme: ffTheme),
                      const SizedBox(width: 10),
                      _QuickLink(icon: Icons.chat_rounded, label: 'קהילה', onTap: () => context.goNamed('Community'), ffTheme: ffTheme),
                    ],
                  ).animate().fadeIn(delay: 200.ms),

                  const SizedBox(height: 20),

                  // Active request
                  Text('בקשה פעילה', style: ffTheme.titleLarge),
                  const SizedBox(height: 12),
                  if (plan != null)
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: ffTheme.alternate),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
                      ),
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
                                  color: appState.trackerStep >= 3 ? ffTheme.accent1 : ffTheme.accent1,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  appState.trackerStep >= 4 ? 'הושלם ✓' : 'בתהליך',
                                  style: GoogleFonts.rubik(fontSize: 11, fontWeight: FontWeight.w700, color: appState.trackerStep >= 4 ? ffTheme.success : ffTheme.primary),
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
                              valueColor: AlwaysStoppedAnimation(appState.trackerStep >= 4 ? ffTheme.success : ffTheme.primary),
                              minHeight: 6,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            ['ממתין לאישור', 'אישור מסלול', 'ניוד בעיצומו', 'כמעט שם! 🎉', 'הושלם ✓'][appState.trackerStep.clamp(0, 4)],
                            style: ffTheme.labelSmall.override(color: ffTheme.primary),
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton(
                            onPressed: () => context.goNamed('Tracker'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: ffTheme.primary,
                              side: BorderSide(color: ffTheme.primary),
                              minimumSize: const Size(double.infinity, 40),
                            ),
                            child: const Text('מעקב מלא'),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(delay: 300.ms)
                  else
                    GestureDetector(
                      onTap: () => context.goNamed('Results'),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: ffTheme.alternate, width: 1.5),
                        ),
                        child: Column(
                          children: [
                            const Text('🚀', style: TextStyle(fontSize: 40)),
                            const SizedBox(height: 12),
                            Text('עוד לא בחרתם מסלול?', style: ffTheme.titleSmall),
                            const SizedBox(height: 4),
                            Text('מצאו את החבילה הזולה ביותר עכשיו', style: ffTheme.bodySmall.override(color: ffTheme.secondaryText)),
                            const SizedBox(height: 14),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
                              decoration: BoxDecoration(
                                color: ffTheme.primary,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text('השווה מסלולים', style: ffTheme.labelMedium.override(color: Colors.white, fontWeight: FontWeight.w700)),
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
                      return GestureDetector(
                        onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': id}),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: ffTheme.alternate),
                            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6)],
                          ),
                          child: Row(
                            children: [
                              LogoWidget(provider: p.provider, size: 38),
                              const SizedBox(width: 12),
                              Expanded(child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p.provider, style: ffTheme.titleSmall),
                                  Text(p.plan, style: ffTheme.bodySmall.override(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                                ],
                              )),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text('₪${p.price}/חודש', style: ffTheme.titleSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                                  if (save > 0) Text('חוסך ₪$save/שנה', style: ffTheme.labelSmall.override(color: ffTheme.success)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 10),
                  ],

                  // Quiz CTA or summary
                  if (!appState.quizCompleted) ...[
                    const SizedBox(height: 20),
                    GestureDetector(
                      onTap: () => context.pushNamed('Quiz'),
                      child: Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [const Color(0xFF0E3A26), ffTheme.primary],
                            begin: Alignment.topRight,
                            end: Alignment.bottomLeft,
                          ),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Center(child: Text('🎯', style: TextStyle(fontSize: 24))),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('גלה כמה תוכל לחסוך!',
                                      style: ffTheme.titleSmall.override(color: Colors.white)),
                                  const SizedBox(height: 2),
                                  Text('שאלון קצר — תוצאות מותאמות אישית',
                                      style: ffTheme.bodySmall.override(color: Colors.white70)),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: ffTheme.secondary,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text('התחל ←',
                                  style: ffTheme.labelSmall.override(
                                      color: const Color(0xFF0E3A26),
                                      fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ),
                    ).animate().fadeIn(delay: 250.ms),
                  ] else ...[
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: ffTheme.accent1,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                      ),
                      child: Row(
                        children: [
                          const Text('🎯', style: TextStyle(fontSize: 20)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text('תקציב השאלון: ₪${appState.quizBudget}/חודש',
                                style: ffTheme.bodyMedium.override(color: ffTheme.primary)),
                          ),
                          GestureDetector(
                            onTap: () => context.pushNamed('Results'),
                            child: Text('לתוצאות', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
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
                          child: Text('כל המסלולים', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
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
                          return GestureDetector(
                            onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': id}),
                            child: Container(
                              width: 140,
                              margin: const EdgeInsets.only(left: 10),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: ffTheme.alternate),
                                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6)],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      LogoWidget(provider: p.provider, size: 24),
                                      const SizedBox(width: 6),
                                      Expanded(child: Text(p.provider, style: ffTheme.labelSmall.override(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
                                    ],
                                  ),
                                  const SizedBox(height: 5),
                                  Text('₪${p.price}/חודש', style: ffTheme.titleSmall.override(color: ffTheme.primary)),
                                  Text(p.plan, style: ffTheme.labelSmall.override(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ],

                  const SizedBox(height: 20),

                  // Quick actions
                  Text('פעולות מהירות', style: ffTheme.titleLarge),
                  const SizedBox(height: 12),
                  _ActionTile(icon: Icons.compare_arrows_rounded, title: 'השוואה חדשה', subtitle: 'מצא את המסלול הכי מתאים לך', onTap: () => context.goNamed('Results'), ffTheme: ffTheme),
                  _ActionTile(icon: Icons.auto_awesome_rounded, title: 'יועץ AI', subtitle: 'שאל שאלות על מסלולי תקשורת', onTap: () => context.pushNamed('AIAdvisor'), ffTheme: ffTheme),
                  _ActionTile(icon: Icons.person_rounded, title: 'הגדרות פרופיל', subtitle: 'עדכן פרטים ועדפות', onTap: () => context.pushNamed('Profile'), ffTheme: ffTheme),

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
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: ffTheme.alternate),
          ),
          child: Column(
            children: [
              Icon(icon, color: ffTheme.primary, size: 24),
              const SizedBox(height: 6),
              Text(label, style: ffTheme.labelSmall.override(color: ffTheme.primaryText)),
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
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 8)],
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: ffTheme.primary, size: 22),
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
