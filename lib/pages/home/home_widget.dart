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
import '../../services/backend/backend.dart' show MeetingStatus;
import '../../services/meeting_slots.dart' show meetingLocalStart;
import '../meeting/meeting_status_card.dart';
import '../../widgets/pressable.dart';
import '../../widgets/app_button.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../widgets/app_sliver_header.dart';
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

  // Cheapest price per category — pure over the static catalogue, so cached
  // across builds (the category grid would otherwise scan all plans for each
  // of the 5 categories on every rebuild).
  static final Map<String, int> _cheapestCache = {};

  // Memo for the savings summary: it runs the recommendation engine over all
  // five categories, but is pure over bills+quiz — recomputing it on every
  // unrelated AppState notify (a like, a watch toggle, a search) is wasted
  // work on the busiest screen. Keyed by the exact inputs.
  String? _savingsKey;
  SavingsSummary? _savingsMemo;

  String _savingsFingerprint(AppState s) =>
      '${s.currentBills}|${s.quizCompleted}|${s.quizBudget}|${s.quizPriority}|'
      '${s.quizLines}|${s.quizCat}|${s.wants5G}|${s.wantsAbroad}|${s.wantsNoCommit}';

  SavingsSummary _savingsFor(AppState s) {
    final key = _savingsFingerprint(s);
    if (key != _savingsKey || _savingsMemo == null) {
      _savingsMemo = computeSavings(s);
      _savingsKey = key;
    }
    return _savingsMemo!;
  }

  /// Pull-to-refresh: drop the memoised derivations so the next build recomputes
  /// the savings summary (and the per-category cheapest scan) from the current
  /// AppState, then re-render. Notifications are derived inline from AppState in
  /// the header builder, so clearing the savings memo + a [setState] is enough to
  /// re-derive every home figure honestly.
  Future<void> _onRefresh() async {
    _savingsKey = null;
    _savingsMemo = null;
    _cheapestCache.clear();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// Whether the booked video meeting deserves a home card: an open request
  /// (pending/confirmed) that hasn't ended, or an actionable no-rep/expired.
  bool _showMeetingCard(AppState s) {
    final m = s.bookedMeeting;
    if (m == null) return false;
    return switch (m.status) {
      MeetingStatus.pending || MeetingStatus.confirmed => meetingLocalStart(m.meetingDate, m.slot)
          .add(const Duration(minutes: 30))
          .isAfter(DateTime.now()),
      MeetingStatus.noRep || MeetingStatus.expired => true,
      MeetingStatus.cancelled || MeetingStatus.completed => false,
    };
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
    // Compute the savings summary once and share it with the hero + grid
    // (each used to recompute it — 5 engine rankings — on every build).
    final savings = _savingsFor(appState);
    // Honour the OS "reduce motion" setting for the overlay entrances (FAB +
    // compare tray): when set, they appear instantly with no fade/slide.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          // ── Main scrollable content ────────────────────────────────────────
          // Calmer single-column home. The order reads top-to-bottom as a
          // hierarchy: header → one hero → one recommendations carousel → one
          // activity row → category browse → renewal alert → a short tools row →
          // AI advisor → (bottom) community + a thin provider line. Every former
          // feature stays reachable; this is regrouping for calm, not deletion.
          RefreshableScroll(
            controller: _scrollController,
            onRefresh: _onRefresh,
            slivers: [
              // ── 1. Header (greeting + search + bell) ───────────────────────
              _buildHeader(context, ffTheme, appState),

              // ── 2. ONE primary hero (single calm CTA, quiet savings sub-line)
              SliverToBoxAdapter(child: _buildHero(context, ffTheme, appState, savings)),

              // ── 3. ONE "המלצות" carousel (top-pick + quiz-match + hot-deal) ─
              SliverToBoxAdapter(child: _buildRecommendations(context, ffTheme, appState)),

              // ── 4. ONE "הפעילות שלך" row (watchlist + recently-viewed) ──────
              if (appState.watchedPlans.isNotEmpty || appState.recentlyViewed.isNotEmpty)
                SliverToBoxAdapter(child: _buildActivity(context, ffTheme, appState)),

              // ── 5. Category grid (browse) ──────────────────────────────────
              SliverToBoxAdapter(child: _buildCategoryGrid(context, ffTheme, appState, savings)),

              // ── 6. Renewal alert (real urgency, calmer) ────────────────────
              _buildRenewalAlert(context, ffTheme, appState),

              // ── Booked video meeting status (actionable, personal) ─────────
              if (_showMeetingCard(appState))
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: MeetingStatusCard(
                      meeting: appState.bookedMeeting!,
                      onPickNewSlot: () => context.pushNamed('Meeting'),
                    ),
                  ),
                ),

              // ── 7. Tools row (demoted to 4 high-value entry points) ────────
              SliverToBoxAdapter(child: _buildToolsRow(context, ffTheme)),

              // ── 8. AI advisor (compact) ────────────────────────────────────
              SliverToBoxAdapter(child: _buildAIAdvisor(context, ffTheme)),

              // ── 9. Community highlights (demoted to the very bottom) ────────
              SliverToBoxAdapter(child: _buildCommunityHighlights(context, ffTheme)),

              // ── Thin provider line (collapsed from the 18-logo strip) ──────
              SliverToBoxAdapter(child: _buildProviderLine(context, ffTheme)),

              // ── Bottom padding for nav + FAB ──────────────────────────────
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),

          // ── Callback FAB ───────────────────────────────────────────────────
          // A genuinely-lifted overlay, so it keeps its lift and earns a short,
          // restrained ENTRANCE (fade + a few px slide-up), reduced-motion-aware.
          Positioned(
            bottom: 24,
            left: 20,
            child: _animateOverlay(
              reduceMotion,
              Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: ffTheme.shadowAccent,
                ),
                child: FloatingActionButton(
                  // Green ACTION — request a callback. Icon-only, so it carries a
                  // tooltip (also surfaced as a semantics label) per the a11y rule.
                  tooltip: 'בקשת שיחה חוזרת',
                  backgroundColor: ffTheme.brandAccent,
                  elevation: 0,
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    context.pushNamed('Callback');
                  },
                  child: const ExcludeSemantics(child: Icon(Icons.phone_rounded, color: Colors.white, size: 26)),
                ),
              ),
            ),
          ),

          // ── Compare tray ───────────────────────────────────────────────────
          // The sticky compare bar is a genuinely-lifted overlay (keeps its
          // lift); it slides up + fades in on appear, reduced-motion-aware.
          if (appState.comparePlans.isNotEmpty)
            Positioned(
              bottom: 24,
              right: 16,
              left: 76,
              child: _animateOverlay(
                reduceMotion,
                Pressable(
                  haptic: false,
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
                      Icon(Icons.compare_arrows_rounded, color: ffTheme.brandAccent, size: 20),
                      const SizedBox(width: 8),
                      Text('השווה ${appState.comparePlans.length} מסלולים', style: ffTheme.titleSmall.copyWith(color: Colors.white)),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(color: ffTheme.brandAccent, borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
                        child: const Text('←', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                      ),
                    ],
                  ),
                ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// A restrained ENTRANCE for the two lifted overlays (the callback FAB and the
  /// sticky compare tray): a short fade in with a few-px upward slide so they
  /// arrive softly instead of popping. Reduced-motion-aware — when the OS asks to
  /// reduce motion the [child] is returned as-is (no fade, no slide).
  Widget _animateOverlay(bool reduceMotion, Widget child) {
    if (reduceMotion) return child;
    return child
        .animate()
        .fadeIn(duration: 260.ms, curve: Curves.easeOut)
        .slideY(begin: 0.2, end: 0, duration: 260.ms, curve: Curves.easeOutCubic);
  }

  // ── Section builders ─────────────────────────────────────────────────────

  Widget _buildRenewalAlert(BuildContext context, AppTheme ffTheme, AppState appState) {
    final r = appState.nextRenewal;
    if (r == null || r.daysUntilRenewal == null || r.daysUntilRenewal! > 30) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final days = r.daysUntilRenewal!;
    final isExpired = days <= 0;
    // Calmer, non-manipulative copy: a factual heads-up, no "act now or the
    // price jumps" pressure line.
    final mainText = isExpired
        ? 'המבצע שלך ב${r.provider} הסתיים'
        : 'המבצע שלך ב${r.provider} מסתיים בעוד $days ימים';

    // Real urgency, calmer surface: a soft amber/red tint, a 1px border (no
    // saturated gradient badge, no drop shadow). Hue still signals urgency
    // (red ≤7 days, amber otherwise) and stays legible in both themes.
    final isUrgent = days <= 7;
    final accent = isUrgent ? const Color(0xFFE53935) : const Color(0xFFFFB300);
    final bgColor = Color.alphaBlend(
        accent.withValues(alpha: ffTheme.dark ? 0.14 : 0.06), ffTheme.cardSurface);
    final textColor = ffTheme.dark
        ? ffTheme.primaryText
        : (isUrgent ? const Color(0xFF7B1E1E) : const Color(0xFF5F4000));
    final borderColor = accent.withValues(alpha: isUrgent ? 0.30 : 0.40);

    return SliverToBoxAdapter(
      child: Pressable(
        haptic: false,
        onTap: () {
          HapticFeedback.lightImpact();
          context.pushNamed('RenewalReport', pathParameters: {'trackedId': r.id});
        },
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(ffTheme.radiusCard),
            border: Border.all(color: borderColor, width: 1),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Icon(Icons.access_time_rounded, size: 20, color: accent),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  mainText,
                  style: ffTheme.titleSmall.copyWith(
                    color: textColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'השווה ←',
                style: ffTheme.labelMedium.copyWith(
                  color: ffTheme.brandAccentText,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Collapsing brand header (the shared [AppSliverHeader]) — the greeting is the
  /// large title that shrinks on scroll, the notification bell rides in the
  /// trailing actions, and the search affordance lives in the expanded
  /// [flexibleChild] as a clearly-a-button pill. Home is a root tab, so there's
  /// nothing to pop: [showBack] is false. Tightened expandedHeight so the header
  /// band reads compact.
  Widget _buildHeader(BuildContext context, AppTheme ffTheme, AppState appState) {
    return AppSliverHeader(
      title: '${_greeting()} ${appState.firstName}',
      showBack: false,
      expandedHeight: 160,
      actions: [_buildNotificationBell(context, ffTheme, appState)],
      flexibleChild: _buildHeaderSearch(context, ffTheme),
    );
  }

  /// The notification bell action: an icon-only [IconButton] (keeps its
  /// `התראות` tooltip / semantics label) with the amber unread badge stacked on
  /// the corner. Tapping it pushes the Notifications route.
  Widget _buildNotificationBell(BuildContext context, AppTheme ffTheme, AppState appState) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 6),
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          IconButton(
            icon: Icon(Icons.notifications_outlined, color: ffTheme.primaryText, size: 22),
            tooltip: 'התראות',
            onPressed: () {
              HapticFeedback.lightImpact();
              context.pushNamed('Notifications');
            },
          ),
          Builder(builder: (context) {
            final count = notificationCount(appState);
            if (count == 0) return const SizedBox.shrink();
            return PositionedDirectional(
              top: 6,
              end: 6,
              // The badge renders a number only visually; expose the count to
              // screen readers so the bell announces "<N> new notifications".
              child: Semantics(
                label: '$count התראות חדשות',
                child: Container(
                  width: 16,
                  height: 16,
                  // Amber VALUE dot — the unread badge pops against the now-white
                  // Geist header and reads as "needs attention" in both themes.
                  // The separating ring follows the header surface so the dot reads
                  // as a discrete badge (was Colors.white on the old green header).
                  decoration: BoxDecoration(color: ffTheme.saving, shape: BoxShape.circle, border: Border.all(color: ffTheme.cardSurface, width: 1.5)),
                  child: Center(child: Text(count > 9 ? '9+' : '$count', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: ffTheme.onSaving))),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  /// A real search affordance — a full-width pill that reads unmistakably as a
  /// button: a leading search icon, the prompt text, and a trailing chevron
  /// (RTL-correct `chevron_left`) pointing into the search screen. Wrapped in a
  /// labelled [Semantics] button; tapping pushes the Search route. Enforces the
  /// minimum 48px tap target.
  Widget _buildHeaderSearch(BuildContext context, AppTheme ffTheme) {
    return Semantics(
      button: true,
      label: 'חיפוש ספק או מסלול',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            HapticFeedback.lightImpact();
            context.pushNamed('Search');
          },
          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
          child: Container(
            constraints: const BoxConstraints(minHeight: kMinTapTarget),
            padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 12, 12),
            decoration: BoxDecoration(
              // Light Geist field on the now-white header: white surface + 1px
              // hairline (was a translucent white pill that vanished on white).
              color: ffTheme.cardSurface,
              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
              border: Border.all(color: ffTheme.lineColor),
            ),
            child: Row(
              children: [
                Icon(Icons.search_rounded, color: ffTheme.secondaryText, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'חפש ספק או מסלול...',
                    style: AppTheme.of(context).bodySmall.copyWith(color: ffTheme.secondaryText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Icon(Icons.chevron_left_rounded, color: ffTheme.secondaryText, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// ONE primary hero with a SINGLE calm CTA. The potential-savings figure is a
  /// quiet sub-line (small label), never a giant numeral — this is the only
  /// potential-savings figure on the browse surfaces. The CTA routes to Results
  /// when bills are set, else the Quiz, with one fixed label per state.
  Widget _buildHero(BuildContext context, AppTheme ffTheme, AppState appState, SavingsSummary savings) {
    // Shared summary (same engine the /savings dashboard uses), so the quiet
    // figure never disagrees with the dashboard. Real value only — when there
    // is nothing computed yet we simply omit the figure (no fabricated number).
    final totalSave = savings.totalAnnualPotential;
    final personalized = appState.billsPersonalized;
    // BROWSE moment (routes to Results / Quiz, never submits a lead) — a calm
    // browse verb per the canonical CRO decision, NOT a savings-pushy promise.
    // Both states use the same honest "compare plans" framing.
    final ctaLabel = personalized ? 'השוו מסלולים ←' : 'חפשו חבילות ←';

    return Pressable(
      // The CTA fires its own lightImpact; keep the card-level press silent.
      haptic: false,
      onTap: () {
        HapticFeedback.lightImpact();
        personalized ? context.pushNamed('Results') : context.pushNamed('Quiz');
      },
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: ffTheme.brandGradient,
          borderRadius: BorderRadius.circular(ffTheme.radiusXl),
          boxShadow: ffTheme.shadowLifted,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              personalized ? 'המסלולים שמתאימים לך' : 'בואו נמצא לך מסלול משתלם',
              style: ffTheme.titleLarge.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            // Quiet potential-savings SUB-LINE (small label, not a hero numeral).
            // Truth-only + de-push: show a ₪ figure ONLY when the user has
            // personalised bills (a REAL saving). A fresh guest gets a neutral,
            // non-pushy line — we never estimate a saving for someone who hasn't
            // entered their bills.
            Text(
              (personalized && totalSave > 0)
                  ? 'חיסכון פוטנציאלי עד ₪$totalSave בשנה — מחושב לפי החשבונות שלך'
                  : 'השוו מחירים והתחילו לחסוך',
              style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.78)),
            ),
            const SizedBox(height: 16),
            // SINGLE calm green ACTION CTA — the only conversion cue on the hero.
            // Routed through the unified [AppButton] (pill variant) so the hero
            // capsule is the same one source of truth as every other CTA. Green
            // brandAccent fill + white w700 label preserves the prior visual; the
            // pill flag rounds it to [radiusPill]. The button fires its own
            // selectionClick haptic, so the wrapping [Semantics] keeps the a11y
            // label and the outer card Pressable stays silent (haptic: false).
            Semantics(
              button: true,
              label: personalized ? 'השוו מסלולים' : 'חפשו חבילות',
              child: AppButton(
                text: ctaLabel,
                color: AppColors.brandAccent,
                pill: true,
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 22),
                textStyle: ffTheme.titleSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                onPressed: () async {
                  personalized ? context.pushNamed('Results') : context.pushNamed('Quiz');
                },
              ),
            ),
          ],
        ),
      ),
    )
        .animate()
        .fadeIn(duration: 400.ms)
        .slideY(begin: 0.06, end: 0, curve: Curves.easeOutCubic);
  }

  /// ONE "המלצות" carousel — merges the former Top-Pick, Quiz-Match and Hot-Deal
  /// sections into a single horizontal scroll of at most 3 lighter cards. Each
  /// card keeps its REAL computed annual saving (passed straight to
  /// [MiniPlanCard], which hides the badge when the saving is 0). No section is
  /// lost: every card still routes to PlanDetail / Results as before.
  Widget _buildRecommendations(BuildContext context, AppTheme ffTheme, AppState appState) {
    final recs = <_Rec>[];

    // 1) Top personal pick across active categories (real annual saving only).
    final activeCats = categories.where((c) => appState.currentBill(c.id) > 0).toList();
    final searchCats = activeCats.isNotEmpty ? activeCats.map((c) => c.id).toList() : [appState.selectedCat];
    PlanMatch? topMatch;
    for (final catId in searchCats) {
      final m = RecommendationEngine.bestMatch(MatchProfile.fromAppState(appState, catId));
      if (m == null) continue;
      if (topMatch == null ||
          m.annualSaving > topMatch.annualSaving ||
          (m.annualSaving == topMatch.annualSaving && m.score > topMatch.score)) {
        topMatch = m;
      }
    }
    if (topMatch != null && topMatch.annualSaving > 0) {
      recs.add(_Rec(
        tag: 'המלצה אישית',
        plan: topMatch.plan,
        saving: topMatch.annualSaving,
        // Opens the plan detail (browse, not convert) — the card's normal
        // primary action, so it reads "פרטים", not a conversion verb.
        cta: 'פרטים',
      ));
    }

    // 2) Quiz match (when the quiz is completed and yields a plan).
    if (appState.quizCompleted) {
      final cat = appState.quizCat;
      final budget = appState.quizBudget;
      if (categoryById(cat) != null && budget > 0) {
        final matched = filteredPlans(
          cat: cat, sort: 'match', filters: [], query: '',
          budget: budget, currentBill: appState.currentBill(cat),
        ).take(1).toList();
        if (matched.isNotEmpty) {
          final plan = matched.first;
          if (!recs.any((r) => r.plan.id == plan.id)) {
            final save = planSaveYear(plan, appState.currentBill(cat));
            recs.add(_Rec(
              tag: 'התאמת השאלון',
              plan: plan,
              saving: save > 0 ? save : 0,
              cta: 'פרטים',
            ));
          }
        }
      }
    }

    // 3) Hot deal on the active category (a real saving derived from the bill).
    final activeCat = appState.selectedCat;
    final deal = hotDeal(appState.currentBill(activeCat), cat: activeCat);
    if (deal != null && !recs.any((r) => r.plan.id == deal.id)) {
      final saving = planSaveYear(deal, appState.currentBill(deal.cat));
      recs.add(_Rec(
        tag: 'עסקה חמה',
        plan: deal,
        saving: saving > 0 ? saving : 0,
        cta: 'פרטים',
      ));
    }

    if (recs.isEmpty) return const SizedBox.shrink();
    final cards = recs.take(3).toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 0, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text('המלצות', style: ffTheme.titleLarge),
          ),
          SizedBox(
            height: 188,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              itemCount: cards.length,
              padding: const EdgeInsetsDirectional.only(end: 16),
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final rec = cards[i];
                return SizedBox(
                  width: 268,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(rec.tag, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Expanded(
                        // Shared-element flight: tapping a recommendation card now
                        // animates the provider logo into the plan-detail hero chip
                        // (target tag 'plan_logo_<id>' in plan_detail_widget.dart),
                        // matching the existing results→detail Hero. The resting
                        // widget is the whole MiniPlanCard, but the [flightShuttleBuilder]
                        // flies ONLY the provider logo (logo→logo, like the results
                        // card) so the transition reads as a calm logo morph, not a
                        // card-warping the size of the detail chip.
                        //
                        // Tags are unique per plan: the carousel dedupes by plan id
                        // (see the `recs.any((r) => r.plan.id == …)` guards above),
                        // and the activity row below renders a bare LogoWidget (no
                        // Hero), so no two heroes share a tag within this route. The
                        // results list lives on a DIFFERENT route, so a plan that also
                        // appears there never collides during a transition.
                        child: _CarouselLogoHero(
                          provider: rec.plan.provider,
                          tag: 'plan_logo_${rec.plan.id}',
                          child: MiniPlanCard(
                            plan: rec.plan,
                            savingsPerYear: rec.saving > 0 ? rec.saving : null,
                            // Curated best-match recommendations — these keep the
                            // saving badge (the de-push only strips it from generic
                            // list rows, which leave isBest false).
                            isBest: true,
                            ctaLabel: rec.cta,
                            onTap: () {
                              appState.viewPlan(rec.plan.id);
                              context.pushNamed('PlanDetail', pathParameters: {'planId': rec.plan.id});
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  /// ONE "הפעילות שלך" row — merges the former Watchlist and Recently-Viewed
  /// sections into a single horizontal scroll. Watched plans come first (and
  /// keep the "better deal available" amber flag); recently-viewed (that aren't
  /// already watched) follow. Both still route to PlanDetail.
  Widget _buildActivity(BuildContext context, AppTheme ffTheme, AppState appState) {
    final watched = appState.watchedPlans;
    final watchedSet = watched.toSet();
    final recent = appState.recentlyViewed.where((id) => !watchedSet.contains(id)).toList();

    final items = <_ActivityItem>[
      for (final id in watched) _ActivityItem(id: id, watched: true),
      for (final id in recent) _ActivityItem(id: id, watched: false),
    ];
    if (items.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 0, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 16),
                child: Text('הפעילות שלך', style: ffTheme.titleLarge),
              ),
              const Spacer(),
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: Semantics(
                  button: true,
                  label: 'הצג את כל המסלולים שבמעקב',
                  child: InkWell(
                    onTap: () => context.pushNamed('Account'),
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                      child: Text('הכל ←', style: ffTheme.labelMedium.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: 90,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              itemCount: items.length,
              padding: const EdgeInsetsDirectional.only(end: 16),
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final item = items[i];
                final plan = planById(item.id);
                if (plan == null) return const SizedBox();
                final better = item.watched ? _betterDealFor(plan, appState) : null;
                return Pressable(
                  onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 148,
                        padding: const EdgeInsets.all(12),
                        // A better-deal card wears a thin amber VALUE ring; the
                        // rest get the standard card hairline.
                        decoration: better != null
                            ? ffTheme.cardDecoration(radius: ffTheme.radiusLg).copyWith(
                                border: Border.all(
                                    color: ffTheme.saving.withValues(alpha: 0.55),
                                    width: 1.5),
                              )
                            : ffTheme.cardDecoration(radius: ffTheme.radiusLg),
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
                            Text('₪${plan.priceText}/${priceUnitShort(plan)}', style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontSize: 13, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                if (item.watched) ...[
                                  // Green active "tracking" cue.
                                  Container(width: 5, height: 5, decoration: BoxDecoration(color: ffTheme.brandAccent, shape: BoxShape.circle)),
                                  const SizedBox(width: 4),
                                  Text('עוקב', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontSize: 10, fontWeight: FontWeight.w700)),
                                ] else
                                  Text(plan.plan, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10), maxLines: 1, overflow: TextOverflow.ellipsis),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (better != null)
                        Positioned(
                          top: -6,
                          left: -6,
                          // Icon-only amber badge — flag its meaning to screen
                          // readers (a cheaper alternative is available).
                          child: Semantics(
                            label: 'נמצאה עסקה משתלמת יותר',
                            child: Container(
                              width: 22,
                              height: 22,
                              decoration: BoxDecoration(
                                // Amber VALUE badge — a cheaper alternative exists.
                                color: ffTheme.saving,
                                shape: BoxShape.circle,
                                border: Border.all(color: ffTheme.cardSurface, width: 1.5),
                                boxShadow: ffTheme.shadowSoft,
                              ),
                              child: Center(child: Icon(Icons.lightbulb_outline_rounded, size: 11, color: ffTheme.onSaving)),
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
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
    // Pure over the static catalogue, so memoise it (each call would otherwise
    // scan all plans, ×5 categories on every home rebuild).
    int cheapestIn(String catId) => _cheapestCache.putIfAbsent(catId, () {
          final catPlans = plansByCat(catId);
          if (catPlans.isEmpty) return 0;
          return catPlans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
        });

    // Tightened band: no extra top padding so the title + grid read as one
    // group; tighter inter-cell spacing and a flatter aspect ratio.
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('השוואה לפי קטגוריה', style: ffTheme.titleLarge),
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 1.85,
            ),
            itemCount: categories.length,
            itemBuilder: (context, i) {
              final cat = categories[i];
              final isActive = appState.selectedCat == cat.id;
              final isPersonalized = hasActual[cat.id] == true;
              final save = isPersonalized ? actualSavings[cat.id]! : 0;
              final cheapest = cheapestIn(cat.id);
              // De-push: a stated FACT ("a ₪X/year saving"), not a second-person
              // command ("you'll save"). Honest comparison framing, never a sell.
              final savingsText = isPersonalized
                  ? (save > 0 ? 'חיסכון של ₪$save בשנה' : 'מחיר תחרותי')
                  : (cheapest > 0 ? 'מסלולים מ-₪$cheapest' : 'השוואת מחירים');
              // Amber = VALUE (personalised saving); neutral ink otherwise.
              final savingsColor = isPersonalized && save > 0 ? ffTheme.savingDark : ffTheme.secondaryText;

              return Pressable(
                haptic: false,
                onTap: () {
                  HapticFeedback.selectionClick();
                  appState.setCategory(cat.id);
                  // Electricity has its own dedicated comparison screen (private
                  // suppliers, indicative pricing) rather than the generic
                  // results list; every other category lands on Results.
                  if (cat.id == 'electricity') {
                    context.pushNamed('Electricity');
                  } else {
                    // Push (not go) so back returns to home.
                    context.pushNamed('Results');
                  }
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    // Active card sits on a subtle green-tinted ground; the rest
                    // on the plain card surface — both theme-aware.
                    color: isActive
                        ? Color.alphaBlend(
                            ffTheme.brandAccent.withValues(alpha: ffTheme.dark ? 0.16 : 0.07),
                            ffTheme.cardSurface)
                        : ffTheme.cardSurface,
                    borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                    border: Border.all(
                      color: isActive
                          ? ffTheme.brandAccent
                          : ffTheme.primary.withValues(alpha: 0.06),
                      width: isActive ? 2 : 1,
                    ),
                    // ONE DEPTH STORY: resting browse cards read as one flat
                    // plane — a hairline + whisper [shadowCard], not a lifted
                    // [shadowMd]. Only sheets/FAB/sticky compare bar lift.
                    boxShadow: ffTheme.shadowCard,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        children: [
                          Icon(categoryIconData(cat.id), size: 20,
                              color: isActive ? ffTheme.brandAccent : ffTheme.primaryText),
                          if (isPersonalized) ...[
                            const Spacer(),
                            // Green active "analysed" dot.
                            Container(
                              width: 6, height: 6,
                              decoration: BoxDecoration(color: ffTheme.brandAccent, shape: BoxShape.circle),
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
                    .animate(delay: (i.clamp(0, 6) * 70).ms)
                    .fadeIn()
                    .slideY(begin: 0.15, end: 0),
              );
            },
          ),
        ],
      ),
    );
  }

  /// Secondary promo — condensed into a single compact band (tighter padding, a
  /// one-line headline and a smaller glyph) so it reads as an entry point, not a
  /// hero. Route + brand tokens + tap target unchanged.
  Widget _buildAIAdvisor(BuildContext context, AppTheme ffTheme) {
    return Pressable(
      onTap: () {
        HapticFeedback.lightImpact();
        context.pushNamed('AIAdvisor');
      },
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        padding: const EdgeInsets.all(14),
        decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                // Green chip glyph — the brand "AI" mark, decorative.
                color: ffTheme.brandAccent,
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
              ),
              child: const Center(
                child: ExcludeSemantics(
                  child: Icon(Icons.chat_bubble_rounded, color: Colors.white, size: 18),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Switchy AI · שאלו אותנו הכל',
                    style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'זמין 24/7 · עונה תוך שניות',
                    style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_left_rounded, color: ffTheme.brandAccent, size: 22),
          ],
        ),
      ),
    );
  }

  Widget _buildCommunityHighlights(BuildContext context, AppTheme ffTheme) {
    final appState = Provider.of<AppState>(context, listen: false);
    // Drive the section from REAL user posts only — no fabricated previews with
    // invented like/reply counts. Consistent with the honestly-empty Community
    // page: until someone actually posts, we show a single "join the discussion"
    // CTA instead of pretending there's a buzzing feed.
    // Secondary section — cap the preview at 2 posts so the bottom band stays
    // compact; the "all ←" link carries the user into the full feed.
    final realPosts = appState.communityPosts
        .map((p) => _CommunityPreview(
              user: (p['author'] as String? ?? 'א')[0],
              channel: p['channel'] as String? ?? 'כללי',
              text: p['text'] as String? ?? '',
            ))
        .where((p) => p.text.isNotEmpty)
        .take(2)
        .toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.chat_bubble_outline_rounded, size: 18, color: ffTheme.primaryText),
              const SizedBox(width: 6),
              Text('קהילה', style: ffTheme.titleLarge),
              const Spacer(),
              // Comfortable hit area for the "see all" link (≥44px tall) rather
              // than a bare text target.
              Semantics(
                button: true,
                label: 'הצג את כל הדיונים בקהילה',
                child: InkWell(
                  onTap: () => context.goNamed('Community'),
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                    child: Text('הכל ←', style: ffTheme.labelMedium.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (realPosts.isEmpty)
            _buildCommunityCta(context, ffTheme)
          else
            ...realPosts.map((post) {
              return Pressable(
                onTap: () => context.goNamed('Community'),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.6)),
                    // ONE DEPTH STORY: flat resting card — hairline + whisper.
                    boxShadow: ffTheme.shadowCard,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          // Green avatar — the community identity accent.
                          gradient: ffTheme.accentGradient,
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            post.user,
                            style: ffTheme.labelMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: ffTheme.saving.withValues(alpha: 0.16),
                                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                                  ),
                                  child: Text(post.channel, style: ffTheme.labelSmall.copyWith(color: ffTheme.savingText, fontSize: 10, fontWeight: FontWeight.w700)),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(color: ffTheme.brandAccent, borderRadius: BorderRadius.circular(ffTheme.radiusXs)),
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
                ),
              );
            }),
        ],
      ),
    );
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
          border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.6)),
          // ONE DEPTH STORY: flat resting card — hairline + whisper.
          boxShadow: ffTheme.shadowCard,
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(gradient: ffTheme.accentGradient, shape: BoxShape.circle),
              child: const Center(child: Icon(Icons.chat_bubble_outline_rounded, size: 18, color: Colors.white)),
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
            Icon(Icons.arrow_back_rounded, color: ffTheme.brandAccent, size: 20),
          ],
        ),
      ),
    );
  }

  /// Tools row — DEMOTED to four high-value entry points (פגישה, מבצעים, יועץ
  /// AI, מחשבון). The rest of the toolbox remains reachable from the bottom nav
  /// and their own routes; it no longer competes for attention on home. No promo
  /// urgency copy.
  Widget _buildToolsRow(BuildContext context, AppTheme ffTheme) {
    const tools = [
      _Tool(icon: Icons.videocam_rounded, label: 'פגישת וידאו', route: 'Meeting'),
      _Tool(icon: Icons.local_fire_department_rounded, label: 'מבצעים', route: 'Deals'),
      _Tool(icon: Icons.smart_toy_rounded, label: 'יועץ AI', route: 'AIAdvisor'),
      _Tool(icon: Icons.calculate_rounded, label: 'מחשבון מעבר', route: 'SwitchCalc'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text('כלים שימושיים', style: ffTheme.titleLarge),
          ),
          Row(
            children: [
              for (var i = 0; i < tools.length; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(
                  child: Pressable(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      context.pushNamed(tools[i].route);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 12),
                      decoration: ffTheme.cardDecoration(),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(tools[i].icon, size: 20, color: ffTheme.primaryText),
                          const SizedBox(height: 6),
                          Text(
                            tools[i].label,
                            style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  /// Provider trust — collapsed from the 18-logo strip to one thin muted line so
  /// it reassures without dominating the bottom of the feed. Tapping it opens the
  /// full provider list (Search), so every provider stays reachable.
  Widget _buildProviderLine(BuildContext context, AppTheme ffTheme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Semantics(
        button: true,
        label: 'הצג את כל הספקים',
        child: InkWell(
          onTap: () {
            HapticFeedback.lightImpact();
            context.pushNamed('Search');
          },
          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.verified_outlined, size: 16, color: ffTheme.secondaryText),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    'משווים בין כל הספקים הגדולים בישראל',
                    style: ffTheme.labelMedium.copyWith(color: ffTheme.secondaryText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(Icons.chevron_left_rounded, size: 18, color: ffTheme.secondaryText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Carousel shared-element logo hero ───────────────────────────────────────────
//
// Wraps a recommendation carousel card in a [Hero] tagged 'plan_logo_<id>' — the
// same scheme the results card (plan_card_widget.dart) and the plan-detail hero
// chip (plan_detail_widget.dart) use — so tapping a card flies the provider logo
// into plan detail. The resting child is the full card, but [flightShuttleBuilder]
// renders ONLY the provider logo mid-flight so the shared element is a clean
// logo→logo morph (matching the results→detail transition), not the whole card
// stretching to the detail chip's size.
//
// Reduced-motion safe: Hero itself is harmless under "reduce motion" (the OS may
// shorten/skip the page transition), and the shuttle only ever paints a static
// [LogoWidget], so there is nothing to crash on. We never recolour the logo, so
// per-provider brand colours are preserved.
class _CarouselLogoHero extends StatelessWidget {
  const _CarouselLogoHero({
    required this.provider,
    required this.tag,
    required this.child,
  });

  final String provider;
  final Object tag;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Hero(
      tag: tag,
      flightShuttleBuilder: (flightContext, animation, direction, fromContext, toContext) {
        // Fly only the provider logo so the carousel→detail flight matches the
        // calm logo morph used by the results list rather than warping the whole
        // card. The logo is never recoloured, so brand colours are preserved.
        return ExcludeSemantics(
          child: Center(
            child: LogoWidget(provider: provider, size: 52),
          ),
        );
      },
      child: child,
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
  final IconData icon;
  final String label;
  final String route;
}

/// One merged-carousel recommendation (top-pick / quiz-match / hot-deal).
class _Rec {
  const _Rec({required this.tag, required this.plan, required this.saving, required this.cta});
  final String tag;
  final Plan plan;
  final int saving;
  final String cta;
}

/// One merged "activity" tile (a watched or recently-viewed plan id).
class _ActivityItem {
  const _ActivityItem({required this.id, required this.watched});
  final String id;
  final bool watched;
}

class _CommunityPreview {
  const _CommunityPreview({required this.user, required this.channel, required this.text});
  final String user, channel, text;
}
