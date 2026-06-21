import 'package:flutter/material.dart';
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
import '../../components/logo_widget/logo_widget.dart';
import '../../components/plan_card/mini_plan_card.dart';
import '../../services/backend/local_backend.dart';

class ProfileWidget extends StatefulWidget {
  const ProfileWidget({super.key});

  @override
  State<ProfileWidget> createState() => _ProfileWidgetState();
}

class _ProfileWidgetState extends State<ProfileWidget> {
  String _lang = 'עברית';

  void _showEditProfile(BuildContext context, AppState appState, AppTheme ffTheme) {
    final nameCtrl = TextEditingController(text: appState.userName);
    final phoneCtrl = TextEditingController(text: appState.userPhone);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: ffTheme.background,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(ctx).viewInsets.bottom + 32),
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
              controller: nameCtrl,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'ישראל ישראלי',
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
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                hintText: '050-0000000',
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
              onPressed: () async {
                final name = nameCtrl.text.trim();
                final phone = phoneCtrl.text.trim();
                if (name.isEmpty || phone.isEmpty) {
                  AppSnackBar.error(ctx, 'אנא מלאו שם ומספר טלפון',
                      duration: const Duration(seconds: 2));
                  return;
                }
                Provider.of<AppState>(ctx, listen: false).login(name: name, phone: phone);
                appBackend.upsertProfile(name: name, phone: phone).catchError((_) {});
                Navigator.pop(ctx);
              },
              width: double.infinity,
              height: 52,
              color: AppColors.primary,
              textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
              borderRadius: BorderRadius.circular(14),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
        slivers: [
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

                  // Language
                  _buildSectionHeader('שפה', ffTheme),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: ffTheme.glassDecoration(radius: 14),
                    child: Row(
                      children: ['עברית', 'English', 'العربية'].map((lang) {
                        final active = _lang == lang;
                        return Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() => _lang = lang),
                            child: AnimatedContainer(
                              duration: ffTheme.motionFast,
                              margin: const EdgeInsets.symmetric(horizontal: 3),
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                gradient: active ? ffTheme.accentGradient : null,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Center(
                                child: Text(lang, style: ffTheme.labelSmall.copyWith(color: active ? Colors.white : ffTheme.secondaryText)),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Appearance — live theme control (system / light / dark)
                  _buildSectionHeader('מראה', ffTheme),
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                    decoration: ffTheme.glassDecoration(radius: 14),
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
                                borderRadius: BorderRadius.circular(10),
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

  Widget _buildHeroHeader(BuildContext context, AppTheme ffTheme, AppState appState) {
    return SliverAppBar(
      expandedHeight: 200,
      pinned: true,
      backgroundColor: ffTheme.primary,
      leading: Navigator.canPop(context)
          ? IconButton(
              icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
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
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: ffTheme.accentGradient,
          borderRadius: BorderRadius.circular(16),
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
        padding: const EdgeInsets.all(14),
        decoration: ffTheme.glassDecoration(radius: 14).copyWith(
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
                  Text('בתהליך', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccent, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.08);
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
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: ffTheme.accentGradient,
          borderRadius: BorderRadius.circular(14),
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
              child: Text(actionLabel, style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccent, fontWeight: FontWeight.w600)),
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
          Text(text, style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccent, fontWeight: FontWeight.w600)),
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
