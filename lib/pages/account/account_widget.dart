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
                      IconButton(
                        icon: const Icon(Icons.settings_rounded, color: Colors.white),
                        onPressed: () => context.pushNamed('Profile'),
                      ),
                    ],
                  ),
                ),
              ),
            ).animate().fadeIn(duration: 400.ms),
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
                                  color: ffTheme.accent1,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text('בתהליך', style: GoogleFonts.rubik(fontSize: 11, fontWeight: FontWeight.w700, color: ffTheme.primary)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton(
                            onPressed: () => context.goNamed('Tracker'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: ffTheme.primary,
                              side: BorderSide(color: ffTheme.primary),
                              minimumSize: const Size(double.infinity, 40),
                            ),
                            child: const Text('מעקב'),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(delay: 300.ms)
                  else
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: ffTheme.alternate),
                      ),
                      child: Column(
                        children: [
                          const Text('📭', style: TextStyle(fontSize: 36)),
                          const SizedBox(height: 8),
                          Text('אין בקשות פעילות', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                        ],
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
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: ffTheme.alternate),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.notifications_active_rounded, color: ffTheme.warning, size: 20),
                            const SizedBox(width: 12),
                            Expanded(child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p.provider, style: ffTheme.titleSmall),
                                Text('₪${p.price}/חודש', style: ffTheme.bodySmall),
                              ],
                            )),
                            TextButton(
                              onPressed: () => context.pushNamed('PlanDetail', pathParameters: {'planId': id}),
                              child: Text('פרטים', style: ffTheme.labelSmall.override(color: ffTheme.primary)),
                            ),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 10),
                  ],

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
