import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_snackbar.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../widgets/pressable.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../widgets/app_sliver_header.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../components/plan_card/mini_plan_card.dart';
import '../../services/backend/local_backend.dart';
import '../../services/savings_summary.dart';

class ProfileWidget extends StatefulWidget {
  const ProfileWidget({super.key});

  @override
  State<ProfileWidget> createState() => _ProfileWidgetState();
}

class _ProfileWidgetState extends State<ProfileWidget> {
  /// Whole-app saving potential from the user's bills + the recommendation
  /// engine. Recomputed each build (pure, cheap) so it tracks bill edits.
  late SavingsSummary _savings;

  void _showEditProfile(BuildContext context, AppState appState, AppTheme ffTheme) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: ffTheme.background,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => const EditProfileSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    _savings = computeSavings(appState);

    return Scaffold(
      backgroundColor: ffTheme.background,
      // Pull-to-refresh recomputes the live AppState-derived figures (savings
      // potential, renewals, watchlist) — a notify is enough to rebuild.
      body: RefreshableScroll(
        onRefresh: () async {
          HapticFeedback.lightImpact();
          AppState().update(() {});
        },
        slivers: [
          // Collapsing savings hero — the visual anchor that opens the profile
          // on the single highest-value stat: the user's total annual saving
          // potential (computed by the real savings service, never invented).
          // When there is no bill data yet it shows an honest "fill in details"
          // state instead of a fake figure. Green ACTION wash via AppSliverHeader.
          _buildSavingsHero(context, ffTheme),
          _buildHeroHeader(context, ffTheme, appState),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Guest state CTA
                  if (!appState.isLoggedIn) ...[
                    _buildGuestCard(context, ffTheme).animate().fadeIn(duration: 350.ms).slideY(begin: 0.1),
                    const SizedBox(height: 20),
                  ],

                  // Active transition plan
                  if (appState.leadPlanId != null) ...[
                    _buildSectionHeader('מעבר פעיל', ffTheme),
                    _buildActivePlanCard(context, ffTheme, appState),
                    const SizedBox(height: 20),
                  ],

                  // Upcoming renewal alert — surfaces the soonest promo end from
                  // the renewal radar so a deal about to expire never hides on
                  // the tracker screen. Taps into the full comparison report.
                  if (appState.nextRenewal != null) ...[
                    _buildRenewalAlert(context, ffTheme, appState),
                    const SizedBox(height: 20),
                  ],

                  // Saving potential — the whole-app opportunity from the user's
                  // bills (amber = VALUE). Links to the per-category breakdown.
                  if (_savings.hasAnyBill && _savings.totalAnnualPotential > 0) ...[
                    _buildSavingsCard(context, ffTheme),
                    const SizedBox(height: 20),
                  ],

                  // Tracked plans (renewal radar)
                  if (appState.myPlans.isNotEmpty) ...[
                    _buildSectionHeader('המסלולים שלי', ffTheme, actionLabel: 'מעקב חידושים', onAction: () => context.pushNamed('Tracker')),
                    _buildTrackedPlans(context, ffTheme, appState),
                    const SizedBox(height: 20),
                  ],

                  // Watchlist
                  if (appState.watchedPlans.isNotEmpty) ...[
                    _buildSectionHeader('מסלולים במעקב', ffTheme, actionLabel: 'כל הרשימה', onAction: () => context.goNamed('Results')),
                    _buildWatchlist(context, ffTheme, appState),
                    const SizedBox(height: 20),
                  ],

                  // Recently viewed
                  if (appState.recentlyViewed.isNotEmpty) ...[
                    _buildSectionHeader('צפייה אחרונה', ffTheme),
                    _buildRecentlyViewed(context, ffTheme, appState),
                    const SizedBox(height: 20),
                  ],

                  // Quiz preferences
                  if (appState.quizCompleted) ...[
                    _buildSectionHeader('העדפות שאלון', ffTheme, actionLabel: 'עדכן', onAction: () => context.pushNamed('Quiz')),
                    _buildQuizSummary(context, ffTheme, appState),
                    const SizedBox(height: 20),
                  ] else ...[
                    _buildQuizCTA(context, ffTheme).animate().fadeIn(delay: 200.ms),
                    const SizedBox(height: 20),
                  ],

                  // User reviews
                  if (appState.userReviews.isNotEmpty) ...[
                    _buildSectionHeader('הביקורות שלי', ffTheme, actionLabel: 'כתוב ביקורת', onAction: () => context.pushNamed('Ratings')),
                    ...appState.userReviews.take(3).map((r) {
                      final overall = r['overall'] as int? ?? 0;
                      final text = r['text'] as String? ?? '';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: ffTheme.glassDecoration(radius: 14),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(r['provider'] as String, style: ffTheme.labelMedium.copyWith(fontWeight: FontWeight.w700)),
                                  if (text.isNotEmpty) ...[
                                    const SizedBox(height: 2),
                                    Text(text, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: List.generate(5, (i) => Icon(
                                i < overall ? Icons.star_rounded : Icons.star_outline_rounded,
                                size: 15,
                                color: ffTheme.warning,
                              )),
                            ),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 12),
                  ],

                  // Notifications
                  _buildSectionHeader('התראות', ffTheme),
                  _ToggleTile(
                    icon: Icons.trending_down_rounded,
                    title: 'ירידות מחיר',
                    subtitle: 'עדכן אותי כשמחירים יורדים',
                    value: appState.prefPriceAlerts,
                    onChanged: appState.setPrefPriceAlerts,
                    ffTheme: ffTheme,
                  ),
                  _ToggleTile(
                    icon: Icons.swap_horiz_rounded,
                    title: 'עדכוני בקשות',
                    subtitle: 'התקדמות בתהליך המעבר',
                    value: appState.prefRequestUpdates,
                    onChanged: appState.setPrefRequestUpdates,
                    ffTheme: ffTheme,
                  ),
                  _ToggleTile(
                    icon: Icons.people_rounded,
                    title: 'קהילה',
                    subtitle: 'תגובות ולייקים',
                    value: appState.prefCommunityNotifs,
                    onChanged: appState.setPrefCommunityNotifs,
                    ffTheme: ffTheme,
                  ),

                  const SizedBox(height: 20),

                  // Language — informational only. The app ships Hebrew-first
                  // (RTL) and there is no live locale switch yet, so this is a
                  // static status row, not a fake toggle: the previous tappable
                  // chips set a `_lang` field that changed nothing visible. We
                  // surface the active language honestly and mark the rest as
                  // upcoming rather than pretending they're selectable.
                  _buildSectionHeader('שפה', ffTheme),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: ffTheme.brandAccentTint,
                            borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                          ),
                          child: Icon(Icons.translate_rounded, color: ffTheme.brandAccent, size: 20),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('עברית', style: ffTheme.titleSmall),
                              Text('English · العربية בקרוב', style: ffTheme.bodySmall),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: ffTheme.brandAccentTint,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text('פעיל', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Appearance — live theme control (system / light / dark)
                  _buildSectionHeader('מראה', ffTheme),
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                    decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: ffTheme.brandAccentTint,
                                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                              ),
                              child: Icon(Icons.dark_mode_rounded, color: ffTheme.brandAccent, size: 20),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('ערכת נושא', style: ffTheme.titleSmall),
                                  Text('בהיר, כהה או לפי המכשיר', style: ffTheme.bodySmall),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        _ThemeSegmented(
                          ffTheme: ffTheme,
                          mode: appState.themeMode,
                          onChanged: (m) => Provider.of<AppState>(context, listen: false).setThemeMode(m),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 28),

                  // Logout
                  if (appState.isLoggedIn)
                    OutlinedButton.icon(
                      onPressed: () {
                        appState.logout();
                        context.goNamed('Onboarding');
                      },
                      icon: Icon(Icons.logout_rounded, color: ffTheme.error),
                      label: Text('התנתקות', style: ffTheme.titleSmall.copyWith(color: ffTheme.error)),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: ffTheme.error),
                        minimumSize: const Size(double.infinity, 52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ).animate().fadeIn(delay: 400.ms),

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Sections ────────────────────────────────────────────────────────────────

  /// The collapsing hero that anchors the profile on its single most valuable
  /// number: the whole-app annual saving potential from [_savings] (the same
  /// `computeSavings` service the savings card uses — no invented figure).
  ///
  /// Reuses the shared [AppSliverHeader] primitive in its green ACTION wash.
  /// With a real opportunity it shows "עד ₪X בשנה"; with bills but no positive
  /// saving it stays honest ("הפרטים שלך מעודכנים"); with no bill data at all it
  /// invites the user to start ("התחילו למלא פרטים כדי לראות חיסכון"). [showBack]
  /// is false here — the pinned [_buildHeroHeader] below keeps the back/edit
  /// affordances — so this header is a pure hero anchor at the top of the page.
  Widget _buildSavingsHero(BuildContext context, AppTheme ffTheme) {
    final total = _savings.totalAnnualPotential;
    final hasOpportunity = _savings.hasAnyBill && total > 0;

    final String subtitle;
    final Widget figure;
    if (hasOpportunity) {
      subtitle = 'פוטנציאל החיסכון השנתי שלך';
      figure = Text(
        'עד ₪$total בשנה',
        textAlign: TextAlign.center,
        style: ffTheme.displaySmall.copyWith(
          color: ffTheme.savingText,
          fontWeight: FontWeight.w800,
        ),
      );
    } else if (_savings.hasAnyBill) {
      // Bills entered but no positive saving — stay truthful, don't fake a number.
      subtitle = 'פוטנציאל החיסכון השנתי שלך';
      figure = Text(
        'הפרטים שלך מעודכנים',
        textAlign: TextAlign.center,
        style: ffTheme.titleMedium.copyWith(
          color: ffTheme.primaryText,
          fontWeight: FontWeight.w700,
        ),
      );
    } else {
      // No data at all — honest invitation rather than a hollow "₪0".
      subtitle = 'כמה אפשר לחסוך?';
      figure = Text(
        'התחילו למלא פרטים כדי לראות חיסכון',
        textAlign: TextAlign.center,
        style: ffTheme.titleSmall.copyWith(
          color: ffTheme.secondaryText,
          fontWeight: FontWeight.w700,
        ),
      );
    }

    return AppSliverHeader(
      title: 'הפרופיל שלי',
      subtitle: subtitle,
      expandedHeight: 184,
      showBack: false,
      flexibleChild: figure,
    );
  }

  Widget _buildHeroHeader(BuildContext context, AppTheme ffTheme, AppState appState) {
    return SliverAppBar(
      expandedHeight: 200,
      pinned: true,
      backgroundColor: ffTheme.primary,
      leading: Navigator.canPop(context)
          ? IconButton(
              icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
              tooltip: 'חזרה',
              onPressed: () => context.safePop(),
            )
          : null,
      actions: [
        if (appState.isLoggedIn)
          IconButton(
            icon: const Icon(Icons.edit_rounded, color: Colors.white),
            tooltip: 'עריכת פרופיל',
            onPressed: () => _showEditProfile(context, appState, ffTheme),
          ),
        const SizedBox(width: 8),
      ],
      flexibleSpace: FlexibleSpaceBar(
        background: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [ffTheme.primary, ffTheme.tertiary],
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
            ),
          ),
          child: SafeArea(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(height: 32),
                // Avatar
                GestureDetector(
                  onTap: appState.isLoggedIn ? () => _showEditProfile(context, appState, ffTheme) : null,
                  child: Stack(
                    children: [
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 2),
                        ),
                        child: Center(
                          child: appState.isLoggedIn && appState.firstName.isNotEmpty
                              ? Text(
                                  appState.firstName[0],
                                  style: GoogleFonts.rubik(fontSize: 30, fontWeight: FontWeight.w700, color: Colors.white),
                                )
                              : const Icon(Icons.person_rounded, size: 32, color: Colors.white),
                        ),
                      ),
                      if (appState.isLoggedIn)
                        Positioned(
                          bottom: 0,
                          left: 0,
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: ffTheme.secondary,
                              shape: BoxShape.circle,
                              border: Border.all(color: ffTheme.primary, width: 1.5),
                            ),
                            child: Icon(Icons.camera_alt_rounded, size: 11, color: ffTheme.primary),
                          ),
                        ),
                    ],
                  ),
                ).animate().scale(duration: 500.ms, curve: Curves.elasticOut),
                const SizedBox(height: 10),
                Text(
                  appState.isLoggedIn ? appState.userName : 'אורח',
                  style: ffTheme.titleMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                // Stats row
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _HeroStat(value: '₪${appState.totalSavings}', label: 'חיסכון', ffTheme: ffTheme),
                    Container(width: 1, height: 32, color: Colors.white.withValues(alpha: 0.3), margin: const EdgeInsets.symmetric(horizontal: 20)),
                    _HeroStat(value: appState.leadPlanId != null ? '1' : '0', label: 'מעברים', ffTheme: ffTheme),
                    Container(width: 1, height: 32, color: Colors.white.withValues(alpha: 0.3), margin: const EdgeInsets.symmetric(horizontal: 20)),
                    _HeroStat(value: '${appState.watchedPlans.length}', label: 'במעקב', ffTheme: ffTheme),
                    Container(width: 1, height: 32, color: Colors.white.withValues(alpha: 0.3), margin: const EdgeInsets.symmetric(horizontal: 20)),
                    _HeroStat(value: '${appState.userReviews.length}', label: 'ביקורות', ffTheme: ffTheme),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGuestCard(BuildContext context, AppTheme ffTheme) {
    return Pressable(
      onTap: () => context.pushNamed('Auth'),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: ffTheme.accentGradient,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          boxShadow: ffTheme.shadowAccent,
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
              child: const Center(child: Icon(Icons.person_outline_rounded, size: 22, color: Colors.white)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('התחבר לחשבון', style: ffTheme.titleSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                  Text('שמור מסלולים, עקוב אחר חיסכון וקבל התראות', style: ffTheme.bodySmall.copyWith(color: Colors.white70)),
                ],
              ),
            ),
            const Icon(Icons.arrow_back_ios_rounded, color: Colors.white70, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildActivePlanCard(BuildContext context, AppTheme ffTheme, AppState appState) {
    final plan = planById(appState.leadPlanId!);
    if (plan == null) return const SizedBox();
    return Pressable(
      onTap: () => context.pushNamed('Tracker'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: ffTheme.glassDecoration(radius: ffTheme.radiusLg).copyWith(
          border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3), width: 1.5),
          boxShadow: [BoxShadow(color: ffTheme.brandAccent.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(
          children: [
            LogoWidget(provider: plan.provider, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(plan.provider, style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700)),
                  Text(plan.plan, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text('₪${plan.priceText}/${priceUnitShort(plan)}', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 6, height: 6, decoration: BoxDecoration(color: ffTheme.brandAccent, shape: BoxShape.circle)),
                  const SizedBox(width: 5),
                  Text('בתהליך', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.08);
  }

  /// A compact alert for the soonest upcoming renewal — the radar's headline,
  /// surfaced here so an expiring promo is impossible to miss. The border/icon
  /// run amber as it nears (VALUE/urgency), green otherwise. Taps open the full
  /// comparison report for that exact tracked plan.
  Widget _buildRenewalAlert(BuildContext context, AppTheme ffTheme, AppState appState) {
    final tp = appState.nextRenewal!;
    final days = tp.daysUntilRenewal;
    final soon = days != null && days <= 30;
    final accent = soon ? ffTheme.warning : ffTheme.brandAccent;
    final daysLabel = days == null
        ? 'מועד החידוש לא ידוע'
        : days <= 0
            ? 'המבצע מסתיים היום'
            : 'המבצע מסתיים בעוד $days ימים';
    return Pressable(
      onTap: () => context.pushNamed('RenewalReport', pathParameters: {'trackedId': tp.id}),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: ffTheme.glassDecoration(radius: ffTheme.radiusLg).copyWith(
          border: Border.all(color: accent.withValues(alpha: 0.4), width: 1.5),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
              ),
              child: Icon(Icons.event_repeat_rounded, color: accent, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('חידוש קרוב', style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text('${tp.provider} · ${tp.planName}',
                      style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(daysLabel, style: ffTheme.labelSmall.copyWith(color: accent, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            Icon(Icons.arrow_back_ios_rounded, color: ffTheme.secondaryText, size: 14),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.08);
  }

  /// The total annual saving potential across the user's bills (amber = VALUE),
  /// with the top opportunity called out. Links to the per-category breakdown.
  Widget _buildSavingsCard(BuildContext context, AppTheme ffTheme) {
    final total = _savings.totalAnnualPotential;
    final top = _savings.topOpportunity;
    final topLabel = top == null ? null : categoryById(top.categoryId)?.name;
    return Pressable(
      onTap: () => context.pushNamed('Savings'),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: ffTheme.glassDecoration(radius: ffTheme.radiusLg).copyWith(
          border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4), width: 1.5),
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: ffTheme.saving.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
              ),
              child: Icon(Icons.savings_rounded, color: ffTheme.savingDark, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('פוטנציאל החיסכון שלך', style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(
                    topLabel != null
                        ? 'הכי משתלם להחליף ב$topLabel'
                        : 'לפי החשבונות שעדכנת',
                    style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Text('עד ₪$total בשנה',
                      style: ffTheme.titleMedium.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
            Icon(Icons.arrow_back_ios_rounded, color: ffTheme.secondaryText, size: 14),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 320.ms).slideY(begin: 0.08);
  }

  /// The user's own tracked plans (renewal radar). Each row shows the carrier,
  /// the monthly spend, and a renewal-countdown chip, and links to the full
  /// comparison report so the section never dead-ends.
  Widget _buildTrackedPlans(BuildContext context, AppTheme ffTheme, AppState appState) {
    final plans = appState.myPlans.take(3).toList();
    return Column(
      children: plans.asMap().entries.map((e) {
        final i = e.key;
        final tp = e.value;
        final days = tp.daysUntilRenewal;
        final hasCountdown = days != null;
        final soon = hasCountdown && days <= 30;
        final chipColor = !hasCountdown
            ? ffTheme.secondaryText
            : soon
                ? ffTheme.warning
                : ffTheme.brandAccent;
        final chipText = !hasCountdown
            ? 'ללא מועד'
            : days <= 0
                ? 'מסתיים היום'
                : 'בעוד $days ימים';
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Pressable(
            onTap: () => context.pushNamed('RenewalReport', pathParameters: {'trackedId': tp.id}),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: ffTheme.glassDecoration(radius: 14),
              child: Row(
                children: [
                  LogoWidget(provider: tp.provider, size: 40),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tp.provider, style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w700)),
                        Text(tp.planName, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 4),
                        Text('₪${tp.monthlyPrice}/חודש', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: chipColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(chipText, style: ffTheme.labelSmall.copyWith(color: chipColor, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
          ),
        ).animate(delay: (i * 50).ms).fadeIn(duration: 250.ms).slideX(begin: 0.05);
      }).toList(),
    );
  }

  Widget _buildWatchlist(BuildContext context, AppTheme ffTheme, AppState appState) {
    final plans = appState.watchedPlans
        .map(planById)
        .whereType<Plan>()
        .take(3)
        .toList();
    return Column(
      children: plans.asMap().entries.map((e) {
        final i = e.key;
        final plan = e.value;
        final bill = appState.currentBill(plan.cat);
        final save = planSaveYear(plan, bill);
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: MiniPlanCard(
            plan: plan,
            savingsPerYear: save,
            showCta: false,
            onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
          ),
        ).animate(delay: (i * 50).ms).fadeIn(duration: 250.ms).slideX(begin: 0.05);
      }).toList(),
    );
  }

  Widget _buildRecentlyViewed(BuildContext context, AppTheme ffTheme, AppState appState) {
    final plans = appState.recentlyViewed
        .map(planById)
        .whereType<Plan>()
        .take(6)
        .toList();
    if (plans.isEmpty) return const SizedBox();
    return SizedBox(
      height: 100,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: plans.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (ctx, i) {
          final p = plans[i];
          return Pressable(
            onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': p.id}),
            child: Container(
              width: 130,
              padding: const EdgeInsets.all(12),
              decoration: ffTheme.glassDecoration(radius: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      LogoWidget(provider: p.provider, size: 26),
                      const SizedBox(width: 8),
                      Expanded(child: Text(p.provider, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text('₪${p.priceText}/${priceUnitShort(p)}', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary)),
                  const SizedBox(height: 2),
                  Text(p.plan, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ).animate(delay: (i * 40).ms).fadeIn(duration: 200.ms);
        },
      ),
    );
  }

  Widget _buildQuizSummary(BuildContext context, AppTheme ffTheme, AppState appState) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.glassDecoration(radius: 14),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          _QuizChip(icon: categoryIconData(appState.quizCat), text: _catLabel(appState.quizCat), ffTheme: ffTheme),
          _QuizChip(text: 'תקציב ₪${appState.quizBudget}', ffTheme: ffTheme),
          _QuizChip(icon: _priorityIcon(appState.quizPriority), text: _priorityLabel(appState.quizPriority), ffTheme: ffTheme),
        ],
      ),
    );
  }

  Widget _buildQuizCTA(BuildContext context, AppTheme ffTheme) {
    return Pressable(
      onTap: () => context.pushNamed('Quiz'),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: ffTheme.accentGradient,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          boxShadow: ffTheme.shadowAccent,
        ),
        child: Row(
          children: [
            const Icon(Icons.adjust, size: 24, color: Colors.white),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('גלה כמה תחסוך', style: ffTheme.titleSmall.copyWith(color: Colors.white)),
                  Text('ענה על 4 שאלות קצרות', style: ffTheme.bodySmall.copyWith(color: Colors.white70)),
                ],
              ),
            ),
            const Icon(Icons.arrow_back_ios_rounded, color: Colors.white70, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, AppTheme ffTheme, {String? actionLabel, VoidCallback? onAction}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: ffTheme.titleMedium),
          if (actionLabel != null && onAction != null)
            GestureDetector(
              onTap: onAction,
              child: Text(actionLabel, style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}

// ── Helper widgets ────────────────────────────────────────────────────────────

/// A 3-way segmented control for the app theme: system / light / dark.
/// Bound to [AppState.themeMode]; the active segment carries the green ACTION
/// gradient so the choice reads at a glance in both light and dark.
class _ThemeSegmented extends StatelessWidget {
  const _ThemeSegmented({required this.ffTheme, required this.mode, required this.onChanged});
  final AppTheme ffTheme;
  final ThemeMode mode;
  final ValueChanged<ThemeMode> onChanged;

  static const _segments = <(ThemeMode, String, IconData)>[
    (ThemeMode.system, 'מערכת', Icons.brightness_auto_rounded),
    (ThemeMode.light, 'בהיר', Icons.light_mode_rounded),
    (ThemeMode.dark, 'כהה', Icons.dark_mode_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: _segments.map((s) {
          final active = mode == s.$1;
          return Expanded(
            child: Semantics(
              button: true,
              selected: active,
              label: s.$2,
              child: GestureDetector(
                onTap: () => onChanged(s.$1),
                behavior: HitTestBehavior.opaque,
                child: AnimatedContainer(
                  duration: ffTheme.motionMedium,
                  curve: ffTheme.easeOut,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    gradient: active ? ffTheme.accentGradient : null,
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: active ? ffTheme.shadowAccent : null,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ExcludeSemantics(
                        child: Icon(s.$3, size: 18, color: active ? Colors.white : ffTheme.secondaryText),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        s.$2,
                        style: ffTheme.labelSmall.copyWith(
                          color: active ? Colors.white : ffTheme.secondaryText,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w600,
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
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.value, required this.label, required this.ffTheme});
  final String value;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(value, style: ffTheme.titleMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
        Text(label, style: ffTheme.labelSmall.copyWith(color: Colors.white70)),
      ],
    );
  }
}

class _QuizChip extends StatelessWidget {
  const _QuizChip({required this.text, required this.ffTheme, this.icon});
  final String text;
  final IconData? icon;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: ffTheme.brandAccentTint,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            ExcludeSemantics(child: Icon(icon, size: 13, color: ffTheme.brandAccent)),
            const SizedBox(width: 4),
          ],
          Text(text, style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _ToggleTile extends StatelessWidget {
  const _ToggleTile({required this.icon, required this.title, required this.subtitle, required this.value, required this.onChanged, required this.ffTheme});
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: ffTheme.glassDecoration(radius: 14),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: ffTheme.brandAccent, size: 20),
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
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: ffTheme.brandAccent,
          ),
        ],
      ),
    );
  }
}

/// The edit-profile bottom sheet. A [StatefulWidget] so its controllers are
/// disposed and the save button can show an async loading state. Validates the
/// Israeli phone (via [AppState.isValidIlPhone]), commits to local state through
/// [AppState.saveProfile], then best-effort syncs to the backend via
/// [appBackend.upsertProfile]; a network failure still keeps the local edit and
/// only downgrades the success message.
/// Public so it can be pumped directly in a widget test (the full-app shell's
/// live-blur [GlassPanel] bottom nav otherwise intercepts taps on the sheet).
class EditProfileSheet extends StatefulWidget {
  const EditProfileSheet({super.key});

  @override
  State<EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends State<EditProfileSheet> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _phoneCtrl;
  bool _saving = false;
  String? _nameError;
  String? _phoneError;

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    _nameCtrl = TextEditingController(text: appState.userName);
    _phoneCtrl = TextEditingController(text: appState.userPhone);
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    final name = _nameCtrl.text.trim();
    final phone = _phoneCtrl.text.trim();

    // Inline field validation first so the error sits next to the offending field.
    final nameErr = name.isEmpty ? 'נא להזין שם מלא' : null;
    final phoneErr = !AppState.isValidIlPhone(phone) ? 'מספר טלפון אינו תקין' : null;
    if (nameErr != null || phoneErr != null) {
      setState(() {
        _nameError = nameErr;
        _phoneError = phoneErr;
      });
      return;
    }

    setState(() {
      _saving = true;
      _nameError = null;
      _phoneError = null;
    });

    final appState = Provider.of<AppState>(context, listen: false);
    final result = appState.saveProfile(name: name, phone: phone);
    if (result != ProfileSaveResult.ok) {
      // Defensive: validation already passed above, but keep the UI honest if a
      // rule ever changes in AppState.
      if (!mounted) return;
      setState(() {
        _saving = false;
        if (result == ProfileSaveResult.emptyName) _nameError = 'נא להזין שם מלא';
        if (result == ProfileSaveResult.invalidPhone) _phoneError = 'מספר טלפון אינו תקין';
      });
      return;
    }

    // Local save succeeded; sync to the backend and report honestly whether the
    // remote write went through.
    final savedPhone = appState.userPhone;
    var remoteOk = true;
    try {
      await appBackend.upsertProfile(name: name, phone: savedPhone);
    } catch (_) {
      remoteOk = false;
    }

    if (!mounted) return;
    Navigator.pop(context);
    if (remoteOk) {
      AppSnackBar.success(context, 'הפרופיל עודכן', duration: const Duration(seconds: 2));
    } else {
      AppSnackBar.info(context, 'הפרטים נשמרו במכשיר — הסנכרון לשרת ייעשה מאוחר יותר');
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // Scrollable so the on-screen keyboard never overflows the sheet — the
    // viewInsets padding lifts the content above it and the user can scroll to
    // the save button.
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(width: 40, height: 4, decoration: BoxDecoration(color: ffTheme.alternate, borderRadius: BorderRadius.circular(2))),
          ),
          const SizedBox(height: 16),
          Text('עריכת פרופיל', style: ffTheme.headlineSmall),
          const SizedBox(height: 20),
          Text('שם מלא', style: ffTheme.labelLarge),
          const SizedBox(height: 8),
          TextField(
            key: const Key('editProfileName'),
            controller: _nameCtrl,
            textDirection: TextDirection.rtl,
            enabled: !_saving,
            textInputAction: TextInputAction.next,
            onChanged: (_) { if (_nameError != null) setState(() => _nameError = null); },
            decoration: InputDecoration(
              hintText: 'ישראל ישראלי',
              errorText: _nameError,
              filled: true,
              fillColor: ffTheme.cardSurface,
              prefixIcon: Icon(Icons.person_outline_rounded, color: ffTheme.secondaryText),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
            ),
          ),
          const SizedBox(height: 16),
          Text('מספר טלפון', style: ffTheme.labelLarge),
          const SizedBox(height: 8),
          TextField(
            key: const Key('editProfilePhone'),
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            enabled: !_saving,
            textInputAction: TextInputAction.done,
            onChanged: (_) { if (_phoneError != null) setState(() => _phoneError = null); },
            onSubmitted: (_) => _save(),
            decoration: InputDecoration(
              hintText: '050-0000000',
              errorText: _phoneError,
              filled: true,
              fillColor: ffTheme.cardSurface,
              prefixIcon: Icon(Icons.phone_outlined, color: ffTheme.secondaryText),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
            ),
          ),
          const SizedBox(height: 24),
          AppButton(
            text: 'שמור שינויים',
            onPressed: _save,
            width: double.infinity,
            height: 52,
            color: AppColors.primary,
            textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
            borderRadius: BorderRadius.circular(14),
          ),
        ],
      ),
    );
  }
}

String _catLabel(String cat) => const {
  'cellular': 'סלולר', 'internet': 'אינטרנט',
  'tv': 'טלוויזיה', 'triple': 'משולב', 'abroad': 'חו"ל',
}[cat] ?? cat;

String _priorityLabel(String p) => const {
  'price': 'מחיר',
  'speed': 'מהירות',
  'speed_basic': 'עד 200Mb',
  'speed_fast': '500Mb+',
  'speed_ultra': 'גיגה',
  'abroad': 'חו"ל',
  'nocommit': 'ללא התחייבות',
  'esim': 'eSIM',
  'data': 'הרבה גלישה',
  'channels': 'ערוצים',
  'sport': 'ספורט',
  'streaming': 'סטרימינג',
  'netflix': 'Netflix',
  'reliability': 'אמינות',
}[p] ?? p;

IconData? _priorityIcon(String p) => const {
  'price': Icons.savings_rounded,
  'speed': Icons.bolt_rounded,
  'speed_basic': Icons.directions_run_rounded,
  'speed_fast': Icons.bolt_rounded,
  'speed_ultra': Icons.rocket_launch_rounded,
  'abroad': Icons.flight_takeoff_rounded,
  'nocommit': Icons.lock_open_rounded,
  'esim': Icons.sim_card_rounded,
  'data': Icons.signal_cellular_alt_rounded,
  'channels': Icons.live_tv_rounded,
  'sport': Icons.sports_soccer_rounded,
  'streaming': Icons.movie_rounded,
  'netflix': Icons.movie_rounded,
  'reliability': Icons.verified_user_rounded,
}[p];
