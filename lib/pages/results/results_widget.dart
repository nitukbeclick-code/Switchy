import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../widgets/legal_disclosure.dart';
import '../../widgets/price_text.dart';
import '../../widgets/empty_state.dart';

class ResultsWidget extends StatefulWidget {
  const ResultsWidget({super.key});

  @override
  State<ResultsWidget> createState() => _ResultsWidgetState();
}

class _ResultsWidgetState extends State<ResultsWidget> {
  final _searchController = TextEditingController();
  String _providerFilter = '';
  bool _smartSort = false;

  // Memo for the per-plan recommendation scores: scoring is pure over the
  // (profile, plan list) pair, so a rebuild with identical inputs (e.g. an
  // unrelated AppState notify) reuses the previous map instead of re-ranking
  // the whole catalogue.
  String? _matchKey;
  Map<String, PlanMatch>? _matchMemo;

  static String _profileKey(MatchProfile p) =>
      '${p.category}|${p.currentBill}|${p.budget}|${p.priority}|${p.lines}|'
      '${p.wants5G}|${p.wantsAbroad}|${p.wantsNoCommit}';

  static const _categories = [
    ('cellular', 'סלולר'),
    ('internet', 'אינטרנט'),
    ('tv', 'טלוויזיה'),
    ('triple', 'משולב'),
    ('abroad', 'חו"ל'),
  ];

  static const _sorts = [
    ('smart', 'התאמה חכמה'),
    ('match', 'מומלץ'),
    ('price', 'הכי זול'),
    ('save', 'מקסימום חיסכון'),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// Honest freshness label derived from the global [catalogueSyncedAt] (UTC of
  /// the last successful live catalogue sync). Returns null when we have never
  /// synced this run (still on the bundled snapshot) so the caller HIDES the
  /// badge rather than claiming a freshness we can't back. Truth-only:
  ///   • synced today  → "עודכן היום"
  ///   • 1 day ago     → "עודכן אתמול"
  ///   • N days ago    → "עודכן לפני N ימים"
  static String? _freshnessLabel() {
    final syncedAt = catalogueSyncedAt;
    if (syncedAt == null) return null; // never synced — don't claim freshness
    // Compare calendar days in local time so "today" matches the user's day.
    final now = DateTime.now();
    final syncedLocal = syncedAt.toLocal();
    final today = DateTime(now.year, now.month, now.day);
    final syncedDay =
        DateTime(syncedLocal.year, syncedLocal.month, syncedLocal.day);
    final days = today.difference(syncedDay).inDays;
    if (days <= 0) return 'עודכן היום';
    if (days == 1) return 'עודכן אתמול';
    return 'עודכן לפני $days ימים';
  }

  void _switchCategory(AppState appState, String cat) {
    HapticFeedback.selectionClick();
    setState(() { _providerFilter = ''; });
    appState.setCategory(cat);
    _searchController.clear();
    appState.setSearch('');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Reduced-motion gate: flutter_animate does NOT read disableAnimations by
    // itself, so every transform below (slide/scale) is explicitly dropped —
    // reveals degrade to a plain fade — when the user asked for less motion.
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // Dynamic type: the fixed-height horizontal chip bands scale with the OS
    // text size (the app clamps at 1.3x globally) so large type never clips.
    final textScaler = MediaQuery.textScalerOf(context);
    final appState = Provider.of<AppState>(context);
    final cat = appState.selectedCat;
    final catData = categoryById(cat);
    final bill = appState.currentBill(cat);

    // The header is a permanently-ink band on light; on dark it must become the
    // raised dark surface (ffTheme.primary resolves to off-white INK on dark, so
    // using it as a fill would paint a near-white bar). On-header content reads
    // light in both modes since the band stays dark.
    final headerColor = isDark ? AppColors.darkSurface : ffTheme.primary;
    final onHeader = ffTheme.white;

    // The quiz-budget gate (budget applies only when the quiz was taken for this
    // same category) lives in the factory — matching the filteredPlans budget
    // gate below.
    final profile = MatchProfile.fromAppState(appState, cat);

    final effectiveSort = _smartSort ? 'match' : appState.sortMode;

    // Honest, data-driven catalogue-freshness label (null = hide the badge).
    final freshnessLabel = _freshnessLabel();

    final rawPlans = filteredPlans(
      cat: cat,
      sort: effectiveSort,
      filters: appState.activeFilters,
      query: appState.searchQuery,
      budget: (appState.quizCompleted && appState.quizCat == cat) ? appState.quizBudget : 9999,
      currentBill: bill,
    );
    final filteredByProvider = _providerFilter.isEmpty
        ? rawPlans
        : rawPlans.where((p) => p.provider == _providerFilter).toList();

    // Compute scores once per (profile, plan-list) — see the memo above.
    final memoKey =
        '${_profileKey(profile)}#${filteredByProvider.map((p) => p.id).join(',')}';
    final Map<String, PlanMatch> matchMap;
    if (memoKey == _matchKey && _matchMemo != null) {
      matchMap = _matchMemo!;
    } else {
      matchMap = {
        for (final p in filteredByProvider)
          p.id: RecommendationEngine.scorePlan(p, profile),
      };
      _matchKey = memoKey;
      _matchMemo = matchMap;
    }

    final plans = _smartSort
        ? (List.of(filteredByProvider)
          ..sort((a, b) =>
              (matchMap[b.id]?.score ?? 0).compareTo(matchMap[a.id]?.score ?? 0)))
        : filteredByProvider;

    // A stable signature of the CURRENT result ordering+membership. It changes
    // exactly when the list mutates (sort reorders the ids, a filter / provider /
    // search / category narrows or swaps membership) and stays identical across
    // unrelated rebuilds (an AppState notify that doesn't touch the results). We
    // fold it into each row's flutter_animate key below so the calm fade-rise
    // RE-FIRES when the list changes — without disturbing the CustomScrollView,
    // the linked category scroll, or the smart-sort logic.
    final listSignature =
        '$effectiveSort|$_smartSort|$_providerFilter|${plans.map((p) => p.id).join(',')}';

    final allCatProviders = plansByCat(cat).map((p) => p.provider).toSet().toList();

    final topPlanMatch = plans.isNotEmpty ? matchMap[plans.first.id] : null;
    final topPlan = topPlanMatch?.plan;
    final topSave = topPlan != null ? planSaveYear(topPlan, bill) : 0;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: headerColor,
        foregroundColor: onHeader,
        elevation: 0,
        title: Semantics(
            header: true,
            child: Text(catData?.name ?? 'תוצאות',
                style: ffTheme.titleLarge.copyWith(color: onHeader))),
        actions: [
          IconButton(
            icon: Stack(children: [
              Icon(Icons.tune_rounded, color: onHeader),
              if (appState.activeFilters.isNotEmpty)
                PositionedDirectional(
                  top: 0, end: 0,
                  child: Container(
                    width: 8, height: 8,
                    // Amber attention dot — filters are active. Pops on the ink
                    // header in both themes.
                    decoration: BoxDecoration(
                        color: ffTheme.saving, shape: BoxShape.circle),
                  ),
                ),
            ]),
            tooltip: 'סינון',
            onPressed: () => _showFilters(context, appState, ffTheme),
          ),
        ],
        bottom: PreferredSize(
          // Tighter category band (~40px) — calmer chrome above the results.
          // The band height follows the OS text scale so large type never
          // clips the chips (dynamic-type resilience, no scale clamping).
          preferredSize: Size.fromHeight(textScaler.scale(44)),
          child: Container(
            color: headerColor,
            child: SizedBox(
              height: textScaler.scale(44),
              child: ListView(
                scrollDirection: Axis.horizontal,
                // Vertical inset moved INTO each item (below) so the tap
                // target spans the full 44px band, not just the 32px chip.
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: _categories.map((c) {
                  final active = appState.selectedCat == c.$1;
                  // The budget filter from the quiz silently applies to its own
                  // category only — surface that with a "מהשאלון" badge on the
                  // active chip so users see WHY this view is personalized (and
                  // understand why the budget cap vanishes on other categories).
                  final fromQuiz = appState.quizCompleted &&
                      appState.quizCat == c.$1 &&
                      active;
                  // Active = green ACTION fill (the brand's active-state cue);
                  // inactive = a faint glass chip on the ink header.
                  return Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    // Screen readers hear a proper toggle-button (name comes
                    // from the chip's own Text; selected = the active tab).
                    child: Semantics(
                      button: true,
                      selected: active,
                      child: GestureDetector(
                      // Opaque: the whole 44px-tall item (chip + the vertical
                      // 6px insets moved in from the ListView padding) is
                      // tappable — a full-height touch target, same visuals.
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _switchCategory(appState, c.$1),
                      child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: AnimatedContainer(
                        // Reduced motion: state flips snap instead of easing.
                        duration:
                            reduceMotion ? Duration.zero : ffTheme.motionFast,
                        curve: ffTheme.easeOut,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 5),
                        decoration: BoxDecoration(
                          // Active = green ACTION fill (the only state cue);
                          // inactive is a flat glass chip with NO border, so the
                          // active chip is distinguished by fill, not a double
                          // border outline.
                          color: active
                              ? ffTheme.brandAccent
                              : onHeader.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                          boxShadow: active ? ffTheme.shadowAccent : null,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(categoryIconData(c.$1), size: 14,
                                color: active ? Colors.white : onHeader),
                            const SizedBox(width: 5),
                            Text(
                              c.$2,
                              style: ffTheme.labelMedium.copyWith(
                                color: active ? Colors.white : onHeader,
                                fontWeight:
                                    active ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                            if (fromQuiz) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.22),
                                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.filter_alt_rounded,
                                        size: 10, color: Colors.white),
                                    const SizedBox(width: 3),
                                    Text('מהשאלון',
                                        style: ffTheme.labelSmall.copyWith(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                            height: 1.0)),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              // Search bar
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: TextField(
                    controller: _searchController,
                    onChanged: appState.setSearch,
                    textDirection: TextDirection.rtl,
                    decoration: InputDecoration(
                      hintText: 'חיפוש ספק או חבילה...',
                      filled: true,
                      fillColor: ffTheme.cardSurface,
                      prefixIcon: appState.searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear_rounded),
                              tooltip: 'נקה חיפוש',
                              onPressed: () {
                                _searchController.clear();
                                appState.setSearch('');
                              })
                          : const Icon(Icons.search_rounded),
                      border: OutlineInputBorder(
                        // No exact 14 token — radiusCard (12) is the nearest
                        // content corner (the scale caps content at radiusXl/12).
                        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                    ),
                  ),
                ),
              ),

              // Info row + bill stepper
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Info row
                      Row(
                        children: [
                          // Honest freshness badge — driven by the real last live
                          // sync ([catalogueSyncedAt]). Shows "עודכן היום" only
                          // when the catalogue actually synced today, an honest
                          // relative label otherwise, and is HIDDEN entirely when
                          // we've never synced this run (serving the bundled
                          // snapshot) so we never claim a freshness we can't back.
                          if (freshnessLabel != null)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                // Green "fresh/live" cue — the catalogue is current.
                                color: ffTheme.brandAccent.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                border: Border.all(
                                    color: ffTheme.brandAccent.withValues(alpha: 0.25)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 7,
                                    height: 7,
                                    decoration: BoxDecoration(
                                      color: ffTheme.brandAccent,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 5),
                                  Text(freshnessLabel,
                                      style: ffTheme.labelSmall.copyWith(
                                          color: ffTheme.brandAccentText,
                                          fontWeight: FontWeight.w700)),
                                ],
                              ),
                            ),
                          const Spacer(),
                          Text('${plans.length} מסלולים',
                              style: ffTheme.labelMedium.copyWith(
                                  color: ffTheme.secondaryText,
                                  fontFeatures: const [FontFeature.tabularFigures()])),
                          if (appState.activeFilters.isNotEmpty || _providerFilter.isNotEmpty) ...[
                            const SizedBox(width: 2),
                            // Padded InkWell — a comfortable target with press
                            // feedback instead of a bare 24px text tap. The
                            // visible "נקה" is ambiguous without visual context,
                            // so screen readers get the full action.
                            Semantics(
                              button: true,
                              label: 'נקה את כל הסינונים',
                              excludeSemantics: true,
                              child: Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                                  onTap: () { appState.clearFilters(); setState(() => _providerFilter = ''); },
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                    child: Text('נקה',
                                        style: ffTheme.labelMedium.copyWith(
                                            color: ffTheme.error,
                                            fontWeight: FontWeight.w700)),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),

                      const SizedBox(height: 12),

                      // Bill stepper
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                        decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
                        child: Row(
                          children: [
                            // Flexible + ellipsis: overflow-safe when the OS
                            // text scale is large (the steppers keep priority).
                            Flexible(
                              child: Text('החשבון שלך:',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: ffTheme.bodyMedium
                                      .copyWith(color: ffTheme.secondaryText)),
                            ),
                            const SizedBox(width: 8),
                            Semantics(
                              button: true,
                              label: 'ערוך את החשבון החודשי',
                              child: Material(
                                color: ffTheme.accent1,
                                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                                  onTap: () => _showBillEditor(context, appState, cat, bill, ffTheme),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        // Money token — [PriceText] pins the ₪
                                        // before the digits (stable LTR bidi) in
                                        // the RTL stepper. Style override keeps
                                        // the titleMedium/ink numeral; priceDisplay
                                        // already carries tabular figures.
                                        PriceText('₪$bill',
                                            style: ffTheme.titleMedium
                                                .copyWith(color: ffTheme.primary)),
                                        const SizedBox(width: 4),
                                        Icon(Icons.edit_rounded, size: 12, color: ffTheme.primary),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const Spacer(),
                            _StepButton(
                              icon: Icons.remove,
                              onTap: () =>
                                  appState.setCurrentBill(cat, bill - 10),
                              ffTheme: ffTheme,
                              semanticLabel: 'הפחת ₪10 מהחשבון',
                            ),
                            const SizedBox(width: 8),
                            _StepButton(
                              icon: Icons.add,
                              onTap: () =>
                                  appState.setCurrentBill(cat, bill + 10),
                              ffTheme: ffTheme,
                              semanticLabel: 'הוסף ₪10 לחשבון',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Savings baseline banner — makes the comparison's reference point
              // legible: every "חיסכון של ₪X" figure is computed against THIS bill.
              // When the bill is still the default (not personalized), nudge the
              // user to enter their real bill so the savings reflect reality.
              if (bill > 0)
                SliverToBoxAdapter(
                  child: _buildBaselineBanner(
                      context, appState, ffTheme, cat, bill),
                ),

              // Quick filter chips per category
              SliverToBoxAdapter(
                child: _buildQuickFilters(context, appState, ffTheme, cat),
              ),

              // Provider chips
              SliverToBoxAdapter(
                child: _buildProviderChips(ffTheme, allCatProviders),
              ),

              // Sort chips
              SliverToBoxAdapter(
                child: SizedBox(
                  // Scales with the OS text size so large type never clips.
                  height: textScaler.scale(52),
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    // Vertical inset moved INTO each item so the tap target
                    // spans the full 52px band (>=48px), not just the chip.
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: _sorts.map((s) {
                      final isSmart = s.$1 == 'smart';
                      final active = isSmart
                          ? _smartSort
                          : (!_smartSort && appState.sortMode == s.$1);
                      return Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        // Accessible name comes from the chip's Text; expose
                        // button role + the selected sort state.
                        child: Semantics(
                          button: true,
                          selected: active,
                          child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            if (isSmart) {
                              setState(() => _smartSort = true);
                            } else {
                              setState(() => _smartSort = false);
                              appState.setSortMode(s.$1);
                            }
                          },
                          child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: AnimatedContainer(
                            duration: reduceMotion
                                ? Duration.zero
                                : ffTheme.motionFast,
                            curve: ffTheme.easeOut,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              // Active sort = green ACTION fill (works on both
                              // themes); smart-sort wears the accent gradient +
                              // glow as the AI-pick affordance.
                              color: active
                                  ? (isSmart ? null : ffTheme.brandAccent)
                                  : ffTheme.cardSurface,
                              gradient: active && isSmart ? ffTheme.accentGradient : null,
                              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                              border: Border.all(
                                  color: active
                                      ? ffTheme.brandAccent
                                      : ffTheme.alternate),
                              boxShadow: active ? ffTheme.shadowAccent : null,
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (isSmart) ...[
                                  Icon(Icons.adjust,
                                      size: active ? 13 : 12,
                                      color: active ? Colors.white : ffTheme.brandAccent),
                                  const SizedBox(width: 4),
                                ],
                                Text(
                                  s.$2,
                                  style: ffTheme.labelMedium.copyWith(
                                    color: active ? Colors.white : ffTheme.primaryText,
                                    fontWeight: active
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),

              // Quiz context banner (only for the matching quiz category)
              if (appState.quizCompleted && appState.quizCat == cat)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: ffTheme.accent1,
                        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                        border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.filter_alt_rounded, size: 18, color: ffTheme.primary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              cat == 'cellular' && appState.quizLines > 1
                                  ? 'שאלון: ${appState.quizLines} קווים, עד ₪${appState.quizBudget}'
                                  : 'שאלון: עד ₪${appState.quizBudget}${cat == 'abroad' ? '/חבילה' : '/חודש'}',
                              style: ffTheme.labelMedium.copyWith(color: ffTheme.primary),
                            ),
                          ),
                          Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                              onTap: () => context.pushNamed('Quiz'),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                child: Text('עריכה', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                              ),
                            ),
                          ),
                          IconButton(
                            icon: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
                            tooltip: 'הסתר את סינון השאלון',
                            visualDensity: VisualDensity.compact,
                            onPressed: () => appState.setQuizCompleted(false),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(duration: 250.ms),
                  ),
                ),

              // Quiz nudge — when the user is browsing WITHOUT a quiz for this
              // category, offer the 2-minute path to personalized matches so the
              // funnel always points onward instead of leaving them to scroll.
              if (!(appState.quizCompleted && appState.quizCat == cat) &&
                  plans.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Material(
                      color: ffTheme.brandAccent.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                        onTap: () {
                          HapticFeedback.lightImpact();
                          context.pushNamed('Quiz');
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 10),
                          child: Row(
                            children: [
                              Icon(Icons.auto_awesome_rounded,
                                  size: 18, color: ffTheme.brandAccent),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'ענו על שאלון קצר ונסנן בדיוק לפי הצרכים שלכם',
                                  style: ffTheme.labelMedium
                                      .copyWith(color: ffTheme.brandAccentText),
                                ),
                              ),
                              Text('לשאלון ←',
                                  style: ffTheme.labelSmall.copyWith(
                                      color: ffTheme.brandAccentText,
                                      fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ).animate().fadeIn(duration: 250.ms),
                ),

              // AI banner
              if (topPlan != null && topSave > 0)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                    child: Container(
                      decoration: BoxDecoration(
                        // Const ink→slate wash — a premium dark band that stays
                        // ink in BOTH themes (the theme-aware getters would turn
                        // near-white on dark).
                        gradient: ffTheme.freshGradient,
                        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                        boxShadow: ffTheme.shadowLifted,
                      ),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                          splashColor: Colors.white.withValues(alpha: 0.12),
                          highlightColor: Colors.white.withValues(alpha: 0.06),
                          onTap: () => context.pushNamed('PlanDetail',
                              pathParameters: {'planId': topPlan.id}),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.14),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.auto_awesome_rounded, size: 20, color: Colors.white),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${topPlan.provider} מומלץ לך',
                                        style: ffTheme.titleSmall
                                            .copyWith(color: Colors.white),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        // De-pushed: the descriptive "חיסכון של"
                                        // (honest comparison figure) instead of the
                                        // second-person "תחסוך" hard sell.
                                        'חיסכון של ₪$topSave בשנה',
                                        style: ffTheme.bodySmall.copyWith(
                                            color: ffTheme.savingText,
                                            fontWeight: FontWeight.w800),
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.arrow_forward_ios_rounded,
                                    color: Colors.white.withValues(alpha: 0.7), size: 16),
                              ],
                            ),
                          ),
                        ),
                      ),
                    // Reduced motion KEEPS the fade but DROPS the slide
                    // transform (begin: 0 = no translation).
                    ).animate().fadeIn(duration: 300.ms).slideX(
                        begin: reduceMotion ? 0 : 0.05),
                  ),
                ),

              // No-match / empty state — the shared [EmptyState] (warm honest
              // copy + ONE clear next action), with a "switch category" helper
              // row beneath it as a calm secondary path. Three honest variants:
              //   • search has a query  → clear the search
              //   • filters are active  → clear the filters
              //   • category is just empty (no query, no filters) → no primary
              //     CTA; the category row below is the action.
              if (plans.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(8, 16, 8, 24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (appState.searchQuery.isNotEmpty)
                          EmptyState(
                            icon: Icons.search_off_rounded,
                            headline: 'לא נמצאו תוצאות',
                            subtitle:
                                'לא מצאנו מסלולים שתואמים ל"${appState.searchQuery}".\nנסו מילה אחרת או נקו את החיפוש.',
                            ctaLabel: 'נקו חיפוש',
                            onCtaTap: () async {
                              _searchController.clear();
                              appState.setSearch('');
                            },
                          )
                        else if (appState.activeFilters.isNotEmpty)
                          EmptyState(
                            icon: Icons.filter_alt_off_rounded,
                            headline: 'אין מסלולים בסינון הזה',
                            subtitle:
                                'הסינונים שבחרתם מצמצמים מדי. נקו אותם ותראו שוב את כל המסלולים בקטגוריה.',
                            ctaLabel: 'נקו סינון',
                            onCtaTap: () async => appState.clearFilters(),
                          )
                        else
                          const EmptyState(
                            icon: Icons.search_off_rounded,
                            headline: 'אין מסלולים בקטגוריה הזו',
                            subtitle: 'כרגע אין כאן מסלולים זמינים להצגה.',
                          ),
                        const SizedBox(height: 8),
                        Text('אפשר גם לעבור קטגוריה',
                            style: ffTheme.labelMedium
                                .copyWith(color: ffTheme.secondaryText)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          alignment: WrapAlignment.center,
                          children: _categories
                            .where((c) => c.$1 != cat)
                            .map((c) => Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                boxShadow: ffTheme.shadowSoft,
                              ),
                              child: Material(
                                color: ffTheme.cardSurface,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                  side: BorderSide(color: ffTheme.lineColor),
                                ),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                  onTap: () => _switchCategory(appState, c.$1),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(categoryIconData(c.$1), size: 13, color: ffTheme.primary),
                                        const SizedBox(width: 5),
                                        Text(c.$2, style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            )).toList(),
                        ),
                      ],
                    ),
                  ),
                )
              else
                SliverPadding(
                  // Bottom inset is supplied by the legal-disclosure sliver that
                  // follows (it clears the sticky compare bar), so the list keeps
                  // only a small gap before it.
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final plan = plans[index];
                        final match = matchMap[plan.id];
                        // The engine's top pick wears the in-card "best match"
                        // treatment; the match score renders inside the card —
                        // overlaying badges collided with the header controls.
                        final isTopMatch = _smartSort && index == 0 && match != null && match.scorePct >= 70;
                        final card = PlanCardWidget(
                          plan: plan,
                          currentBill: bill,
                          matchPct: match?.scorePct,
                          bestMatch: isTopMatch || plan.highlight,
                        );
                        // The smart-sort winner gets a confident-but-restrained
                        // reveal: it settles from a hair larger (scale 1.03→1.0)
                        // with the gentle overshoot spring, so the eye lands on
                        // the top pick first. PURPOSE = focal hierarchy, fired
                        // once on reveal (no loop). Every other row keeps the
                        // calm fade+slide. Reduced motion (disableAnimations —
                        // flutter_animate does NOT gate on it by itself) KEEPS
                        // the fade but DROPS the scale/slide transforms, so the
                        // list still resolves cleanly with no movement.
                        // Keying each row's animation by (listSignature, id)
                        // makes flutter_animate mint a fresh Animate whenever the
                        // list mutates (sort/filter/provider/search/category), so
                        // the reveal replays on every list change — and stays put
                        // on unrelated rebuilds (the signature is unchanged).
                        final animKey =
                            ValueKey('$listSignature#${plan.id}');
                        if (isTopMatch) {
                          return card
                              .animate(key: animKey)
                              .fadeIn(duration: 320.ms)
                              .scale(
                                begin: reduceMotion
                                    ? const Offset(1, 1)
                                    : const Offset(1.03, 1.03),
                                end: const Offset(1, 1),
                                duration: 360.ms,
                                curve: ffTheme.spring,
                              );
                        }
                        return card
                            // Cap the stagger so long result lists settle
                            // quickly — the reveal reads premium for the first
                            // few cards, slow past that.
                            .animate(key: animKey, delay: (index.clamp(0, 6) * 60).ms)
                            .fadeIn(duration: 300.ms)
                            .slideX(begin: reduceMotion ? 0 : 0.05);
                      },
                      childCount: plans.length,
                    ),
                  ),
                ),

              // §7b commission disclosure + §17 price caveat — placed beneath the
              // priced results (the price context) so the paid-relationship + the
              // VAT/verify caveat sit next to the prices and the compare CTA.
              if (plans.isNotEmpty)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 140),
                    child: LegalDisclosure(),
                  ),
                ),
            ],
          ),

          // Compare sticky bar
          Positioned(
            bottom: 80,
            left: 16,
            right: 16,
            child: AnimatedSlide(
              offset: appState.comparePlans.isEmpty
                  ? const Offset(0, 2)
                  : Offset.zero,
              // Reduced motion: the bar appears/disappears in place.
              duration: reduceMotion ? Duration.zero : ffTheme.motionMedium,
              curve: ffTheme.emphasized,
              // Perf: the sliding bar repaints on its own layer instead of
              // dirtying the results list beneath it on every frame of the
              // slide.
              child: RepaintBoundary(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  // Green ACTION band — the compare CTA, vivid on both themes.
                  gradient: ffTheme.accentGradient,
                  // No exact 16 token — radiusCard (12) is the nearest content
                  // corner (the scale caps content at radiusXl/12).
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                  boxShadow: ffTheme.shadowAccent,
                ),
                child: Row(
                  children: [
                    Flexible(
                      child: Text(
                        // Plural imperative to match the app's "ענו / בחרו / נסו"
                        // voice (was the singular "השווה").
                        'השוו ${appState.comparePlans.length} מסלולים',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ffTheme.titleSmall.copyWith(color: Colors.white),
                      ),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        context.goNamed('Compare');
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        // Fixed deep-green (#15803D, 5:1 on white) — the pill is
                        // always white, so a theme-aware color would fail in dark.
                        foregroundColor: AppColors.brandAccentDark,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(ffTheme.radiusLg)),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                      ),
                      child: Text('השוואה ←',
                          style: ffTheme.labelMedium.copyWith(
                              color: AppColors.brandAccentDark,
                              fontWeight: FontWeight.w700)),
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

  Widget _buildProviderChips(AppTheme ffTheme, List<String> providers) {
    if (providers.length <= 1) return const SizedBox();
    return SizedBox(
      // Scales with the OS text size so large type never clips the chips.
      height: MediaQuery.textScalerOf(context).scale(44),
      child: ListView(
        scrollDirection: Axis.horizontal,
        // Vertical inset moved INTO each chip so the tap target spans the
        // full 44px band, not just the ~36px pill.
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _providerChip('הכל', ffTheme),
          ...providers.map((p) => _providerChip(p, ffTheme)),
        ],
      ),
    );
  }

  Widget _providerChip(String label, AppTheme ffTheme) {
    final isAll = label == 'הכל';
    final active = isAll ? _providerFilter.isEmpty : _providerFilter == label;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      // Accessible name comes from the chip's Text; expose button role + the
      // selected provider-filter state.
      child: Semantics(
        button: true,
        selected: active,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => setState(() => _providerFilter = isAll ? '' : label),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: AnimatedContainer(
              duration: reduceMotion ? Duration.zero : ffTheme.motionFast,
              curve: ffTheme.easeOut,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: active
                    ? ffTheme.brandAccent.withValues(alpha: 0.12)
                    : ffTheme.cardSurface,
                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                border: Border.all(
                  color: active ? ffTheme.brandAccent : ffTheme.alternate,
                  width: active ? 1.5 : 1,
                ),
              ),
              child: Text(
                label,
                style: ffTheme.labelSmall.copyWith(
                  color: active ? ffTheme.brandAccent : ffTheme.primaryText,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildQuickFilters(BuildContext context, AppState appState, AppTheme ffTheme, String cat) {
    const quickFilters = <String, List<(String, String)>>{
      'cellular': [('5G', '5g'), ('ללא התחייבות', 'nocommit'), ('מחיר קבוע', 'fixed'), ('כולל חו"ל', 'abroad'), ('כשר', 'kosher')],
      'internet': [('סיב אופטי', 'fiber'), ('מחיר קבוע', 'fixed'), ('ללא התחייבות', 'nocommit')],
      'tv': [('ספורט', 'sport'), ('Netflix', 'netflix'), ('סטרימינג', 'streaming')],
      'triple': [('Netflix', 'netflix'), ('ספורט', 'sport'), ('ללא התחייבות', 'nocommit')],
      'abroad': [('eSIM', 'esim'), ('ללא התחייבות', 'nocommit')],
    };
    final chips = quickFilters[cat] ?? const [];
    if (chips.isEmpty) return const SizedBox();

    final hasActiveFilters = appState.activeFilters.isNotEmpty;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return SizedBox(
      // Scales with the OS text size so large type never clips the chips.
      height: MediaQuery.textScalerOf(context).scale(44),
      child: ListView(
        scrollDirection: Axis.horizontal,
        // Vertical inset moved INTO each chip so the tap target spans the
        // full 44px band, not just the ~36px pill.
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          // "נקה" clear button — shown only when any filter is active
          if (hasActiveFilters)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: Semantics(
                button: true,
                // The visible "נקה" is ambiguous out of visual context — give
                // screen readers the full action.
                label: 'נקה את כל הסינונים',
                excludeSemantics: true,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    appState.clearFilters();
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: AnimatedContainer(
                      duration: reduceMotion
                          ? Duration.zero
                          : const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: ffTheme.error,
                        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        border: Border.all(color: ffTheme.error),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.close_rounded, size: 12, color: Colors.white),
                          const SizedBox(width: 4),
                          Text('נקה',
                              style: ffTheme.labelSmall.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ...chips.map((chip) {
            final active = appState.activeFilters.contains(chip.$2);
            return Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              // Accessible name comes from the chip's Text; expose button role
              // + the selected filter state.
              child: Semantics(
                button: true,
                selected: active,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    appState.toggleFilter(chip.$2);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: AnimatedContainer(
                      duration:
                          reduceMotion ? Duration.zero : ffTheme.motionFast,
                      curve: ffTheme.easeOut,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        // Selected filter = green ACTION fill (consistent active cue).
                        color: active ? ffTheme.brandAccent : ffTheme.cardSurface,
                        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        border: Border.all(
                            color: active ? ffTheme.brandAccent : ffTheme.alternate),
                        boxShadow: active ? ffTheme.shadowAccent : null,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (active) ...[
                            const Icon(Icons.check_rounded, size: 12, color: Colors.white),
                            const SizedBox(width: 4),
                          ],
                          Text(chip.$1,
                              style: ffTheme.labelSmall.copyWith(
                                  color: active ? Colors.white : ffTheme.primaryText,
                                  fontWeight: active
                                      ? FontWeight.w700
                                      : FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildBaselineBanner(BuildContext context, AppState appState,
      AppTheme ffTheme, String cat, int bill) {
    // The default (un-personalized) bill is an estimate, not the user's real
    // spend — flag that so the savings figures are read with the right caveat.
    final isDefault = !appState.billsPersonalized;
    final unit = cat == 'abroad' ? '/חבילה' : '/חודש';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: ffTheme.cardSurface,
          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
          border: Border.all(color: ffTheme.alternate),
        ),
        child: Row(
          children: [
            Icon(Icons.calculate_rounded,
                size: 16, color: ffTheme.secondaryText),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(
                TextSpan(
                  style: ffTheme.labelSmall.copyWith(
                      color: ffTheme.secondaryText, height: 1.3),
                  children: [
                    const TextSpan(text: 'החיסכון מחושב מול '),
                    TextSpan(
                      // LTR isolate (U+2066 … U+2069) around the money run so the
                      // ₪+digits+unit keep a stable order inside this RTL Hebrew
                      // sentence (PriceText's bidi technique, applied inline where
                      // a TextSpan can't host a Directionality). Truth-only: the
                      // real ₪$bill$unit is rendered verbatim.
                      text: '\u{2066}₪$bill$unit\u{2069}',
                      style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.primaryText,
                          fontWeight: FontWeight.w700,
                          fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                    if (isDefault)
                      const TextSpan(text: ' (הערכה ברירת מחדל)'),
                  ],
                ),
              ),
            ),
            // When the baseline is still the default, point the user to Bills to
            // enter their real spend; otherwise let them tweak it inline.
            const SizedBox(width: 4),
            Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                onTap: () => isDefault
                    ? context.pushNamed('Bills')
                    : _showBillEditor(context, appState, cat, bill, ffTheme),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  child: Text(
                    isDefault ? 'הזן חשבון אמיתי' : 'עדכון',
                    style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.brandAccentText,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showBillEditor(BuildContext context, AppState appState, String cat, int currentBill, AppTheme ffTheme) {
    final ctrl = TextEditingController(text: currentBill > 0 ? '$currentBill' : '');
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      // The single bottom-sheet top-corner token (was a 24 literal).
      shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(cat == 'abroad' ? 'עדכן תקציב לחבילה' : 'עדכן חשבון חודשי', style: ffTheme.titleLarge),
            const SizedBox(height: 6),
            Text(cat == 'abroad' ? 'הכניסו את התקציב שלכם לחבילת חו"ל' : 'הכניסו את הסכום שאתם משלמים כרגע', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              autofocus: true,
              textDirection: TextDirection.ltr,
              style: ffTheme.displaySmall.copyWith(color: ffTheme.primaryText),
              decoration: InputDecoration(
                prefixText: '₪',
                prefixStyle: ffTheme.displaySmall.copyWith(color: ffTheme.brandAccent),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.brandAccent, width: 2)),
                filled: true, fillColor: ffTheme.accent1,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final v = int.tryParse(ctrl.text);
                  if (v != null && v > 0) appState.setCurrentBill(cat, v);
                  Navigator.pop(ctx);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: ffTheme.brandAccent,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('עדכן', style: ffTheme.titleSmall.copyWith(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    ).then((_) => ctrl.dispose());
  }

  void _showFilters(
      BuildContext context, AppState appState, AppTheme ffTheme) {
    const Map<String, List<(String, String)>> catFilters = {
      'cellular': [('5G', '5g'), ('ללא התחייבות', 'nocommit'), ('מחיר קבוע', 'fixed'), ('כולל חו"ל', 'abroad'), ('כשר', 'kosher')],
      'internet': [('ללא התחייבות', 'nocommit'), ('סיב אופטי', 'fiber'), ('1,000Mb+', '1g'), ('מחיר קבוע', 'fixed')],
      'tv': [('סטרימינג', 'streaming'), ('ספורט', 'sport'), ('Netflix', 'netflix')],
      'triple': [('Netflix', 'netflix'), ('ספורט', 'sport'), ('ללא התחייבות', 'nocommit')],
      'abroad': [('eSIM', 'esim'), ('ללא התחייבות', 'nocommit')],
    };
    showModalBottomSheet(
      context: context,
      // The single bottom-sheet top-corner token (was a 24 literal).
      shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Text('סינון', style: ffTheme.titleLarge),
                const Spacer(),
                TextButton(
                  onPressed: () {
                    appState.clearFilters();
                    Navigator.pop(ctx);
                  },
                  child: Text('נקה הכל',
                      style:
                          ffTheme.bodyMedium.copyWith(color: ffTheme.error)),
                ),
              ]),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final chip in catFilters[appState.selectedCat] ?? [])
                    Builder(builder: (ctx) {
                      final selected = appState.activeFilters.contains(chip.$2);
                      return FilterChip(
                        label: Text(chip.$1),
                        selected: selected,
                        onSelected: (_) {
                          appState.toggleFilter(chip.$2);
                          setModalState(() {});
                        },
                        selectedColor: ffTheme.brandAccent,
                        backgroundColor: ffTheme.accent1,
                        side: BorderSide(color: selected ? ffTheme.brandAccent : ffTheme.alternate),
                        labelStyle: ffTheme.bodyMedium.copyWith(
                            color: selected ? Colors.white : ffTheme.primaryText),
                        checkmarkColor: Colors.white,
                      );
                    }),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ffTheme.brandAccent,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(ffTheme.radiusCard)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text('הצג תוצאות',
                      style:
                          ffTheme.titleSmall.copyWith(color: Colors.white)),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton(
      {required this.icon, required this.onTap, required this.ffTheme, this.semanticLabel});
  final IconData icon;
  final VoidCallback onTap;
  final AppTheme ffTheme;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    // 44×44 tap area around the 32px visual circle + ripple feedback.
    return Semantics(
      button: true,
      label: semanticLabel,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Center(
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  shape: BoxShape.circle,
                  border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
                ),
                child: Icon(icon, size: 18, color: ffTheme.primary),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
