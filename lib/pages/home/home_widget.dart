import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../components/plan_card/mini_plan_card.dart';
import '../../widgets/pressable.dart';
import '../../services/recommendation_engine.dart';
import '../../services/notifications.dart';
import '../../services/savings_summary.dart';

class HomeWidget extends StatefulWidget {
  const HomeWidget({super.key});

  @override
  State<HomeWidget> createState() => _HomeWidgetState();
}

class _HomeWidgetState extends State<HomeWidget> {
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// Returns the best alternative plan in the same category, or null if none
  /// is clearly better (score delta > 4 AND cheaper or positive annual saving).
  PlanMatch? _betterDealFor(Plan watched, AppState appState) {
    final profile = MatchProfile.fromAppState(appState, watched.cat);
    final watchedScore = RecommendationEngine.scorePlan(watched, profile).score;
    for (final m in RecommendationEngine.rank(profile)) {
      if (m.plan.id == watched.id) continue;
      if (m.score > watchedScore + 4 &&
          (m.plan.price < watched.price || m.annualSaving > 0)) {
        return m;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final activeCat = appState.selectedCat;
    final deal = hotDeal(appState.currentBill(activeCat), cat: activeCat);
    // Compute the savings summary once and share it with the hero + grid
    // (each used to recompute it — 5 engine rankings — on every build).
    final savings = computeSavings(appState);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          // ── Main scrollable content ────────────────────────────────────────
          CustomScrollView(
            controller: _scrollController,
            slivers: [
              // ── 1. Brand header ────────────────────────────────────────────
              SliverToBoxAdapter(child: _buildHeader(context, ffTheme, appState)),

              // ── 2. Renewal Radar alert ─────────────────────────────────────
              _buildRenewalAlert(context, ffTheme, appState),

              // ── 3. Savings hero card ───────────────────────────────────────
              SliverToBoxAdapter(child: _buildSavingsHero(context, ffTheme, savings)),

              // ── 4. Hot deal card ───────────────────────────────────────────
              if (deal != null)
                SliverToBoxAdapter(child: _buildHotDeal(context, ffTheme, deal, appState)),

              // ── 4b. Quiz match (when quiz completed) ──────────────────────
              if (appState.quizCompleted)
                SliverToBoxAdapter(child: _buildQuizMatch(context, ffTheme, appState)),

              // ── 4c. Top pick for you ──────────────────────────────────────
              SliverToBoxAdapter(child: _buildTopPick(context, ffTheme, appState)),

              // ── 5. Category grid ───────────────────────────────────────────
              SliverToBoxAdapter(child: _buildCategoryGrid(context, ffTheme, appState, savings)),

              // ── 6. AI advisor card ─────────────────────────────────────────
              SliverToBoxAdapter(child: _buildAIAdvisor(context, ffTheme)),

              // ── 6b. Community highlights ──────────────────────────────────
              SliverToBoxAdapter(child: _buildCommunityHighlights(context, ffTheme)),

              // ── 7. Tools quick-action row ──────────────────────────────────
              SliverToBoxAdapter(child: _buildToolsRow(context, ffTheme)),

              // ── 8. Watchlist quick view ────────────────────────────────────
              if (appState.watchedPlans.isNotEmpty)
                SliverToBoxAdapter(child: _buildWatchlist(context, ffTheme, appState)),

              // ── 8b. Recently viewed ───────────────────────────────────────
              if (appState.recentlyViewed.isNotEmpty)
                SliverToBoxAdapter(child: _buildRecentlyViewed(context, ffTheme, appState)),

              // ── 9. Brand trust strip ───────────────────────────────────────
              SliverToBoxAdapter(child: _buildBrandStrip(context, ffTheme)),

              // ── 10. Bottom padding for nav + FAB ──────────────────────────
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),

          // ── 9. Callback FAB ────────────────────────────────────────────────
          Positioned(
            bottom: 24,
            left: 20,
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: ffTheme.shadowPrimary,
              ),
              child: FloatingActionButton(
                backgroundColor: ffTheme.secondary,
                elevation: 0,
                onPressed: () {
                  HapticFeedback.lightImpact();
                  context.pushNamed('Callback');
                },
                child: Icon(Icons.phone_rounded, color: ffTheme.primary, size: 26),
              ),
            ),
          ),

          // ── Compare tray ───────────────────────────────────────────────────
          if (appState.comparePlans.isNotEmpty)
            Positioned(
              bottom: 24,
              right: 16,
              left: 76,
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  context.goNamed('Compare');
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    gradient: ffTheme.freshGradient,
                    borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                    boxShadow: ffTheme.shadowPrimary,
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.compare_arrows_rounded, color: ffTheme.secondary, size: 20),
                      const SizedBox(width: 8),
                      Text('השווה ${appState.comparePlans.length} מסלולים', style: ffTheme.titleSmall.copyWith(color: Colors.white)),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(color: ffTheme.secondary, borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
                        child: Text('←', style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800)),
                      ),
                    ],
                  ),
                ),
              ).animate().slideY(begin: 1, end: 0, duration: 300.ms, curve: Curves.easeOutCubic),
            ),
        ],
      ),
    );
  }

  // ── Section builders ─────────────────────────────────────────────────────

  Widget _buildRenewalAlert(BuildContext context, AppTheme ffTheme, AppState appState) {
    final r = appState.nextRenewal;
    if (r == null || r.daysUntilRenewal == null || r.daysUntilRenewal! > 30) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final days = r.daysUntilRenewal!;
    final isExpired = days <= 0;
    final mainText = isExpired
        ? 'המבצע שלך הסתיים — כדאי להשוות עכשיו'
        : '⏰ המבצע שלך ב${r.provider} מסתיים בעוד $days ימים';
    final subText = isExpired ? '' : 'השווה עכשיו ותחסוך לפני שהמחיר קופץ';

    // Urgency: red-tinted when ≤7 days, amber-tinted otherwise
    final isUrgent = days <= 7;
    final gradientColors = isUrgent
        ? [const Color(0xFF7B1E1E), const Color(0xFFB33030)]
        : [const Color(0xFF7B5E00), const Color(0xFFB38A00)];
    final bgColor = isUrgent ? const Color(0xFFFFF0F0) : const Color(0xFFFFF8E1);
    final borderColor = isUrgent
        ? const Color(0xFFE53935).withValues(alpha: 0.35)
        : const Color(0xFFFFB300).withValues(alpha: 0.45);

    return SliverToBoxAdapter(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.lightImpact();
          context.pushNamed('RenewalReport', pathParameters: {'trackedId': r.id});
        },
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(ffTheme.radiusLg),
            border: Border.all(color: borderColor, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: (isUrgent ? const Color(0xFFE53935) : const Color(0xFFFFB300)).withValues(alpha: 0.15),
                blurRadius: 12,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Icon badge
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: gradientColors,
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                  ),
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: const Center(
                  child: Text('⏰', style: TextStyle(fontSize: 22)),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      mainText,
                      style: ffTheme.titleSmall.copyWith(
                        color: isUrgent ? const Color(0xFF7B1E1E) : const Color(0xFF5F4000),
                        fontWeight: FontWeight.w800,
                        fontSize: 13.5,
                      ),
                    ),
                    if (subText.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        subText,
                        style: ffTheme.bodySmall.copyWith(
                          color: isUrgent ? const Color(0xFF9E2020) : const Color(0xFF7A5500),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradientColors, begin: Alignment.topRight, end: Alignment.bottomLeft),
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: Text(
                  'השווה ←',
                  style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.1, end: 0),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, AppTheme ffTheme, AppState appState) {
    return Container(
      decoration: BoxDecoration(
        gradient: ffTheme.freshGradient,
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left: greeting
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greeting()} ${appState.firstName} 👋',
                      style: AppTheme.of(context).headlineSmall.copyWith(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        context.pushNamed('Search');
                      },
                      child: Container(
                        margin: const EdgeInsets.only(top: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.search_rounded, color: Colors.white.withValues(alpha: 0.7), size: 16),
                            const SizedBox(width: 8),
                            Text('חפש ספק או מסלול...', style: AppTheme.of(context).bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.65))),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Right: notification bell
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.notifications_outlined, color: Colors.white, size: 22),
                      tooltip: 'התראות',
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        context.pushNamed('Notifications');
                      },
                      padding: EdgeInsets.zero,
                    ),
                  ),
                  Builder(builder: (context) {
                    final count = notificationCount(appState);
                    if (count == 0) return const SizedBox.shrink();
                    return Positioned(
                      top: -2,
                      right: -2,
                      child: Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(color: ffTheme.secondary, shape: BoxShape.circle, border: Border.all(color: ffTheme.primaryDark, width: 1.5)),
                        child: Center(child: Text(count > 9 ? '9+' : '$count', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: ffTheme.primaryDark))),
                      ),
                    );
                  }),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSavingsHero(BuildContext context, AppTheme ffTheme, SavingsSummary savings) {
    final appState = Provider.of<AppState>(context, listen: false);
    // Shared summary (same engine the /savings dashboard uses), so tapping the
    // hero never lands on a screen showing a different number.
    final totalSave = savings.totalAnnualPotential;

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        context.pushNamed('Savings');
      },
      child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusXl),
        boxShadow: ffTheme.shadowLifted,
      ),
      child: Column(
        children: [
          Text(
            'חיסכון פוטנציאלי שנתי',
            style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.75)),
          ),
          const SizedBox(height: 8),
          // Real figure only — when no bill is set we show a dash and prompt the
          // quiz, never a fabricated "potential saving" number. Mirrors the
          // /savings dashboard's honest empty state.
          if (totalSave > 0)
            TweenAnimationBuilder<int>(
              tween: IntTween(begin: 0, end: totalSave),
              duration: const Duration(milliseconds: 1800),
              curve: Curves.easeOutCubic,
              builder: (_, value, __) {
                final disp = value > 1000 ? '₪${(value / 1000).toStringAsFixed(1)}K' : '₪$value';
                return Text(
                  disp,
                  style: ffTheme.displaySmall.copyWith(
                    color: ffTheme.secondary,
                    fontWeight: FontWeight.bold,
                  ),
                );
              },
            )
          else
            Text(
              '₪—',
              style: ffTheme.displaySmall.copyWith(
                color: ffTheme.secondary,
                fontWeight: FontWeight.bold,
              ),
            ),
          const SizedBox(height: 4),
          Text(
            appState.billsPersonalized
                ? 'מחושב לפי החשבונות שלך'
                : 'הערכה — ענו על השאלון לחישוב מדויק',
            style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.75)),
          ),
          const SizedBox(height: 20),
          GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              appState.billsPersonalized ? context.goNamed('Results') : context.goNamed('Quiz');
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
              ),
              child: Text(
                appState.billsPersonalized ? 'חפש חבילות ←' : 'בדקו כמה תחסכו ←',
                style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryDark),
              ),
            ),
          ),
        ],
      ),
      ),
    )
        .animate()
        .fadeIn(duration: 600.ms)
        .scale(begin: const Offset(0.95, 0.95), end: const Offset(1.0, 1.0));
  }

  Widget _buildHotDeal(BuildContext context, AppTheme ffTheme, Plan deal, AppState appState) {
    final bill = appState.currentBill(deal.cat);
    // Real saving only — derived from the user's own bill. When no bill is set
    // the saving is 0 and MiniPlanCard hides the badge (no assumed bill).
    final saving = planSaveYear(deal, bill);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const Text('🔥', style: TextStyle(fontSize: 18)),
                const SizedBox(width: 6),
                Text('עסקה חמה היום', style: ffTheme.titleLarge),
              ],
            ),
          ),
          MiniPlanCard(
            plan: deal,
            savingsPerYear: saving,
            ctaLabel: 'ראה עסקה',
            onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': deal.id}),
          ),
        ],
      ),
    );
  }

  Widget _buildQuizMatch(BuildContext context, AppTheme ffTheme, AppState appState) {
    final cat = appState.quizCat;
    final budget = appState.quizBudget;
    final catInfo = categoryById(cat);
    if (catInfo == null || budget <= 0) return const SizedBox();

    final matched = filteredPlans(
      cat: cat, sort: 'match', filters: [], query: '',
      budget: budget, currentBill: appState.currentBill(cat),
    ).take(1).toList();
    if (matched.isEmpty) return const SizedBox();

    final plan = matched.first;
    final save = planSaveYear(plan, appState.currentBill(cat));

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🎯', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
              Expanded(child: Text('התאמת השאלון — ${catInfo.name} עד ₪$budget', style: ffTheme.titleLarge)),
              GestureDetector(
                onTap: () {
                  appState.setCategory(cat);
                  context.goNamed('Results');
                },
                child: Text('הכל ←', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          MiniPlanCard(
            plan: plan,
            savingsPerYear: save > 0 ? save : null,
            ctaLabel: 'בחר',
            onTap: () {
              appState.viewPlan(plan.id);
              context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id});
            },
          ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.08, end: 0),
        ],
      ),
    );
  }

  Widget _buildTopPick(BuildContext context, AppTheme ffTheme, AppState appState) {
    // Build profile helper
    MatchProfile profileFor(String cat) => MatchProfile.fromAppState(appState, cat);

    // Find the single best match across active categories (bill > 0); fall back to selectedCat
    final activeCats = categories.where((c) => appState.currentBill(c.id) > 0).toList();
    final searchCats = activeCats.isNotEmpty ? activeCats.map((c) => c.id).toList() : [appState.selectedCat];

    PlanMatch? topMatch;
    String? topCatName;
    for (final catId in searchCats) {
      final m = RecommendationEngine.bestMatch(profileFor(catId));
      if (m == null) continue;
      if (topMatch == null || m.annualSaving > topMatch.annualSaving || (m.annualSaving == topMatch.annualSaving && m.score > topMatch.score)) {
        topMatch = m;
        topCatName = categoryById(catId)?.name ?? catId;
      }
    }
    // Only surface the personal pick when it represents a real saving —
    // preserves the prior behaviour of hiding the card otherwise.
    if (topMatch == null || topMatch.annualSaving <= 0) return const SizedBox();

    final match = topMatch;
    final plan = match.plan;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🎯', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
              Text('המלצה אישית ל$topCatName', style: ffTheme.titleLarge),
            ],
          ),
          const SizedBox(height: 10),
          MiniPlanCard(
            plan: plan,
            savingsPerYear: match.annualSaving > 0 ? match.annualSaving : null,
            ctaLabel: 'בחר',
            onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
          ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.08, end: 0),
        ],
      ),
    );
  }

  Widget _buildCategoryGrid(BuildContext context, AppTheme ffTheme, AppState appState, SavingsSummary savings) {
    // Per-category savings from the shared summary — consistent with the home
    // hero, the /savings dashboard and the bills screen.
    final Map<String, int> actualSavings = {};
    final Map<String, bool> hasActual = {};
    for (final cs in savings.categories) {
      if (cs.hasBill) {
        actualSavings[cs.categoryId] = cs.annualSaving;
        hasActual[cs.categoryId] = true;
      }
    }

    // Real catalogue fact for the not-yet-personalised state: the cheapest
    // current price in the category. No fabricated "average saving" numbers.
    int cheapestIn(String catId) {
      final catPlans = plansByCat(catId);
      if (catPlans.isEmpty) return 0;
      return catPlans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('השוואה לפי קטגוריה', style: ffTheme.titleLarge),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.6,
            ),
            itemCount: categories.length,
            itemBuilder: (context, i) {
              final cat = categories[i];
              final isActive = appState.selectedCat == cat.id;
              final isPersonalized = hasActual[cat.id] == true;
              final save = isPersonalized ? actualSavings[cat.id]! : 0;
              final cheapest = cheapestIn(cat.id);
              final savingsText = isPersonalized
                  ? (save > 0 ? 'תחסוך ₪$save בשנה' : 'מחיר תחרותי')
                  : (cheapest > 0 ? 'מסלולים מ-₪$cheapest' : 'השוואת מחירים');
              final savingsColor = isPersonalized && save > 0 ? ffTheme.success : ffTheme.primary;

              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  appState.setCategory(cat.id);
                  context.goNamed('Results');
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isActive ? ffTheme.accent1 : Colors.white,
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    border: Border.all(
                      color: isActive ? ffTheme.primary : ffTheme.alternate,
                      width: isActive ? 2 : 1,
                    ),
                    boxShadow: ffTheme.shadowSoft,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        children: [
                          Text(cat.icon, style: const TextStyle(fontSize: 22)),
                          if (isPersonalized) ...[
                            const Spacer(),
                            Container(
                              width: 6, height: 6,
                              decoration: BoxDecoration(color: ffTheme.success, shape: BoxShape.circle),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(cat.name, style: ffTheme.labelLarge.copyWith(color: ffTheme.primaryText)),
                      const SizedBox(height: 2),
                      Text('${cat.planCount} מסלולים', style: ffTheme.labelSmall),
                      Text(savingsText, style: ffTheme.labelSmall.copyWith(color: savingsColor, fontWeight: isPersonalized ? FontWeight.w700 : FontWeight.w500)),
                    ],
                  ),
                )
                    .animate(delay: (i * 80).ms)
                    .fadeIn()
                    .slideY(begin: 0.2, end: 0),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildAIAdvisor(BuildContext context, AppTheme ffTheme) {
    return Pressable(
      onTap: () {
        HapticFeedback.lightImpact();
        context.pushNamed('AIAdvisor');
      },
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: ffTheme.freshGradient,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          boxShadow: ffTheme.shadowCard,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: ffTheme.secondary,
                      borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    ),
                    child: Text(
                      '✦ חוסך AI',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'שאלו אותנו הכל\nעל מסלולי תקשורת',
                    style: ffTheme.titleMedium.copyWith(color: Colors.white),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'זמין 24/7 · עונה תוך שניות',
                    style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.60)),
                  ),
                ],
              ),
            ),
            Icon(Icons.chat_bubble_rounded, color: ffTheme.secondary, size: 40),
          ],
        ),
      ),
    ).animate().fadeIn(delay: 400.ms);
  }

  Widget _buildCommunityHighlights(BuildContext context, AppTheme ffTheme) {
    final appState = Provider.of<AppState>(context, listen: false);
    // Drive the section from REAL user posts only — no fabricated previews with
    // invented like/reply counts. Consistent with the honestly-empty Community
    // page: until someone actually posts, we show a single "join the discussion"
    // CTA instead of pretending there's a buzzing feed.
    final realPosts = appState.communityPosts
        .map((p) => _CommunityPreview(
              user: (p['author'] as String? ?? 'א')[0],
              channel: p['channel'] as String? ?? 'כללי',
              text: p['text'] as String? ?? '',
            ))
        .where((p) => p.text.isNotEmpty)
        .take(3)
        .toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('💬', style: TextStyle(fontSize: 18)),
              const SizedBox(width: 6),
              Text('קהילה', style: ffTheme.titleLarge),
              const Spacer(),
              GestureDetector(
                onTap: () => context.goNamed('Community'),
                child: Text('הכל ←', style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (realPosts.isEmpty)
            _buildCommunityCta(context, ffTheme)
          else
            ...realPosts.asMap().entries.map((e) {
              final i = e.key;
              final post = e.value;
              return GestureDetector(
                onTap: () => context.goNamed('Community'),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
                    boxShadow: ffTheme.shadowSoft,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: ffTheme.primary,
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            post.user,
                            style: ffTheme.labelLarge.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: ffTheme.accent2,
                                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                                  ),
                                  child: Text(post.channel, style: ffTheme.labelSmall.copyWith(color: const Color(0xFF8A6000), fontSize: 10, fontWeight: FontWeight.w700)),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(color: ffTheme.primary, borderRadius: BorderRadius.circular(6)),
                                  child: Text('הפוסט שלך', style: ffTheme.labelSmall.copyWith(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(post.text, style: ffTheme.bodySmall.copyWith(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                    ],
                  ),
                ).animate(delay: (i * 60).ms).fadeIn(duration: 300.ms).slideX(begin: 0.04, end: 0),
              );
            }),
        ],
      ),
    ).animate().fadeIn(delay: 420.ms);
  }

  Widget _buildCommunityCta(BuildContext context, AppTheme ffTheme) {
    return Pressable(
      onTap: () => context.goNamed('Community'),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ffTheme.accent1,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
          boxShadow: ffTheme.shadowSoft,
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
              child: const Center(child: Text('💬', style: TextStyle(fontSize: 18))),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('הצטרפו לדיון', style: ffTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(
                    'שתפו חוויה או שאלו על מסלולים — ועזרו לאחרים לבחור',
                    style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.arrow_back_rounded, color: ffTheme.primary, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildToolsRow(BuildContext context, AppTheme ffTheme) {
    final tools = [
      const _Tool(icon: '🎯', label: 'ההתאמות שלי', route: 'Matches'),
      const _Tool(icon: '💰', label: 'החיסכון שלי', route: 'Savings'),
      const _Tool(icon: '⏰', label: 'מעקב חידושים', route: 'Renewal'),
      const _Tool(icon: '📍', label: 'בדיקת כיסוי', route: 'Availability'),
      const _Tool(icon: '🧮', label: 'מחשבון מעבר', route: 'SwitchCalc'),
      const _Tool(icon: '📊', label: 'ניהול חשבון', route: 'Bills'),
      const _Tool(icon: '📲', label: 'ניוד מספר', route: 'Porting'),
      const _Tool(icon: '⭐', label: 'דירוגי ספקים', route: 'Ratings'),
      const _Tool(icon: '🤖', label: 'יועץ AI', route: 'AIAdvisor'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 0, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 0, bottom: 12),
            child: Text('כלים שימושיים', style: ffTheme.titleLarge),
          ),
          SizedBox(
            height: 96,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: tools.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                final tool = tools[i];
                return Pressable(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    context.pushNamed(tool.route);
                  },
                  child: Container(
                    width: 110,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                      border: Border.all(color: ffTheme.alternate),
                      boxShadow: ffTheme.shadowSoft,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(tool.icon, style: const TextStyle(fontSize: 26)),
                        const SizedBox(height: 6),
                        Text(
                          tool.label,
                          style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWatchlist(BuildContext context, AppTheme ffTheme, AppState appState) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.notifications_active_rounded, color: ffTheme.warning, size: 18),
              const SizedBox(width: 6),
              Text('מסלולים במעקב', style: ffTheme.titleLarge),
              const Spacer(),
              TextButton(
                onPressed: () => context.pushNamed('Account'),
                child: Text('הכל', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 90,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: appState.watchedPlans.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final plan = planById(appState.watchedPlans[i]);
                if (plan == null) return const SizedBox();
                final better = _betterDealFor(plan, appState);
                return GestureDetector(
                  onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 148,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                          border: Border.all(
                            color: better != null ? ffTheme.primary.withValues(alpha: 0.35) : ffTheme.alternate,
                          ),
                          boxShadow: ffTheme.shadowSoft,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                LogoWidget(provider: plan.provider, size: 24),
                                const SizedBox(width: 6),
                                Expanded(child: Text(plan.provider, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                              ],
                            ),
                            const SizedBox(height: 5),
                            Text('₪${plan.priceText}/${priceUnitShort(plan)}', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary, fontSize: 13, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Container(width: 5, height: 5, decoration: BoxDecoration(color: ffTheme.success, shape: BoxShape.circle)),
                                const SizedBox(width: 4),
                                Text('עוקב', style: ffTheme.labelSmall.copyWith(color: ffTheme.success, fontSize: 10)),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (better != null)
                        Positioned(
                          top: -6,
                          left: -6,
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: ffTheme.secondary,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 1.5),
                              boxShadow: ffTheme.shadowSoft,
                            ),
                            child: const Center(child: Text('💡', style: TextStyle(fontSize: 11))),
                          ),
                        ),
                    ],
                  ),
                ).animate(delay: (i * 50).ms).fadeIn(duration: 250.ms);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentlyViewed(BuildContext context, AppTheme ffTheme, AppState appState) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.history_rounded, color: ffTheme.secondaryText, size: 18),
              const SizedBox(width: 6),
              Text('ראית לאחרונה', style: ffTheme.titleLarge),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 90,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: appState.recentlyViewed.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final plan = planById(appState.recentlyViewed[i]);
                if (plan == null) return const SizedBox();
                return Pressable(
                  onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
                  child: Container(
                    width: 148,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                      border: Border.all(color: ffTheme.alternate),
                      boxShadow: ffTheme.shadowSoft,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            LogoWidget(provider: plan.provider, size: 24),
                            const SizedBox(width: 6),
                            Expanded(child: Text(plan.provider, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Text('₪${plan.priceText}/${priceUnitShort(plan)}', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary, fontSize: 13, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 3),
                        Text(plan.plan, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                ).animate(delay: (i * 40).ms).fadeIn(duration: 200.ms);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBrandStrip(BuildContext context, AppTheme ffTheme) {
    final providers = [
      const _Provider('פלאפון', Color(0xFFE07034), Color(0xFFFFF3EC)),
      const _Provider('סלקום', Color(0xFFCC2244), Color(0xFFFFECF0)),
      const _Provider('פרטנר', Color(0xFF2255CC), Color(0xFFEEF2FF)),
      const _Provider('הוט מובייל', Color(0xFF8B1A1A), Color(0xFFFFECEC)),
      const _Provider('גולן טלקום', Color(0xFF15603E), Color(0xFFE8F5EE)),
      const _Provider('רמי לוי', Color(0xFFD4232A), Color(0xFFFFF0F0)),
      const _Provider('Xphone', Color(0xFF0066CC), Color(0xFFEEF5FF)),
      const _Provider('WeCom', Color(0xFF6B21A8), Color(0xFFF5EEFF)),
      const _Provider('וואלה מובייל', Color(0xFF0077B6), Color(0xFFECF6FF)),
      const _Provider('019 מובייל', Color(0xFF6B35C8), Color(0xFFF3EEFF)),
      const _Provider('yes', Color(0xFF1A3A7A), Color(0xFFEEF0FF)),
      const _Provider('בזק', Color(0xFF007B8A), Color(0xFFECFAFB)),
      const _Provider('HOT', Color(0xFF8B1A1A), Color(0xFFFFECEC)),
      const _Provider('NextTV', Color(0xFFE07034), Color(0xFFFFF3EC)),
      const _Provider('גילת', Color(0xFF1D6FA4), Color(0xFFECF4FF)),
      const _Provider('CCC', Color(0xFF2E7D32), Color(0xFFEDF7EE)),
      const _Provider('STING TV', Color(0xFF1A7A4E), Color(0xFFE8F8EE)),
      const _Provider('Airalo', Color(0xFF00897B), Color(0xFFE0F2F1)),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 0, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('כל הספקים הגדולים', style: ffTheme.titleLarge),
          ),
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: providers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final p = providers[i];
                return Pressable(
                  onTap: () => context.pushNamed(
                    'Provider',
                    pathParameters: {'name': p.name},
                  ),
                  child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: p.bg,
                    borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    border: Border.all(color: p.color.withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    p.name,
                    style: ffTheme.labelMedium.copyWith(
                      color: p.color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Helper data classes ────────────────────────────────────────────────────────

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'בוקר טוב,';
  if (h < 17) return 'צהריים טובים,';
  if (h < 21) return 'ערב טוב,';
  return 'לילה טוב,';
}

class _Tool {
  const _Tool({required this.icon, required this.label, required this.route});
  final String icon;
  final String label;
  final String route;
}

class _Provider {
  const _Provider(this.name, this.color, this.bg);
  final String name;
  final Color color;
  final Color bg;
}

class _CommunityPreview {
  const _CommunityPreview({required this.user, required this.channel, required this.text});
  final String user, channel, text;
}
