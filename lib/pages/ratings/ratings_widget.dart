import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../widgets/app_button.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/app_sheet.dart';
import '../../widgets/pressable.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../widgets/skeleton.dart';
import '../../services/provider_ratings.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';

class RatingsWidget extends StatefulWidget {
  const RatingsWidget({super.key});

  @override
  State<RatingsWidget> createState() => _RatingsWidgetState();
}

class _RatingsWidgetState extends State<RatingsWidget> with SingleTickerProviderStateMixin {
  // Review form state
  String? _selectedProvider;
  final _reviewCtrl = TextEditingController();
  final Map<String, int> _subRatings = {'price': 0, 'service': 0, 'coverage': 0, 'speed': 0};

  // Anchor so the "כתבו ביקורת" FAB, the "ערוך" action in "הדירוגים שלי" and the
  // "דרגו ראשונים" buttons can scroll the composer into view.
  final _formKey = GlobalKey();
  final _scrollCtrl = ScrollController();

  // Leaderboard state
  String _selectedCat = 'הכל';
  String _sortBy = 'rating'; // 'rating' | 'reviews' | 'value'
  late TabController _tabCtrl;

  // First remote load shows skeleton rows instead of a hard empty state.
  bool _loading = true;

  // Set when the most recent remote fetch threw. While nothing remote has
  // loaded yet, the board renders an honest "couldn't load" + retry instead of
  // masquerading as "no ratings yet" (or eating the error silently).
  Object? _error;

  // Live community reviews from the backend (provider → reviews).
  Map<String, List<ReviewInput>> _remoteReviews = {};

  static const _cats = ['הכל', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חבילה', 'חו"ל'];
  static const _catIds = {'סלולר': 'cellular', 'אינטרנט': 'internet', 'טלוויזיה': 'tv', 'חבילה': 'triple', 'חו"ל': 'abroad'};
  // Sub-rating labels come from the shared ProviderRatings helper (single source).
  static const _subLabels = ProviderRatings.subLabels;
  static const _subIcons = {
    'price': Icons.payments_rounded,
    'service': Icons.support_agent_rounded,
    'coverage': Icons.cell_tower_rounded,
    'speed': Icons.speed_rounded,
  };

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: _cats.length, vsync: this);
    _tabCtrl.addListener(() => setState(() => _selectedCat = _cats[_tabCtrl.index]));
    _loadRemoteReviews();
  }

  Future<void> _loadRemoteReviews() async {
    try {
      final all = await appBackend.fetchAllReviews();
      if (!mounted) return;
      final grouped = <String, List<ReviewInput>>{};
      for (final r in all) {
        grouped.putIfAbsent(r.provider, () => []).add(r);
      }
      setState(() {
        _remoteReviews = grouped;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      // Offline / backend-down — keep whatever loaded before; the build only
      // surfaces the error boundary when there is nothing remote to show.
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _reviewCtrl.dispose();
    _tabCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // Every provider in the selected category, even before it has any reviews —
  // the catalogue (which providers exist, in which category) is a real fact, so
  // we list them honestly and only show a star average once REAL reviews exist.
  List<String> get _providersInCat {
    final plans = _selectedCat == 'הכל'
        ? allPlans
        : allPlans.where((p) => p.cat == (_catIds[_selectedCat] ?? '')).toList();
    final seen = <String>{};
    final out = <String>[];
    for (final plan in plans) {
      if (seen.add(plan.provider)) out.add(plan.provider);
    }
    return out;
  }

  // All real reviews for a provider: live community reviews from the backend
  // plus the signed-in user's own review. Per-plan catalogue "reviews" counts
  // were fabricated and are intentionally NOT counted here.
  List<ReviewInput> _realReviews(String provider, AppState appState) {
    final out = <ReviewInput>[..._remoteReviews[provider] ?? const []];
    final own = appState.reviewFor(provider);
    if (own != null) {
      out.add(ReviewInput(
        provider: provider,
        overall: own['overall'] as int? ?? 0,
        subRatings: {
          for (final k in ProviderRatings.subKeys) k: own[k] as int? ?? 0,
        },
        text: own['text'] as String? ?? '',
      ));
    }
    return out;
  }

  int _totalReviews(String provider, AppState appState) =>
      _realReviews(provider, appState).length;

  // Average overall stars across REAL reviews only, or 0 when there are none.
  double _avgStars(String provider, AppState appState) {
    final reviews = _realReviews(provider, appState).where((r) => r.overall > 0).toList();
    if (reviews.isEmpty) return 0;
    return reviews.fold<int>(0, (s, r) => s + r.overall) / reviews.length;
  }

  // Average of one sub-dimension across REAL reviews, or 0 when unrated.
  double _subRatingValue(String provider, String key, AppState appState) {
    final values = _realReviews(provider, appState)
        .map((r) => r.subRatings[key] ?? 0)
        .where((v) => v > 0)
        .toList();
    if (values.isEmpty) return 0;
    return values.reduce((a, b) => a + b) / values.length;
  }

  // Load an existing review into the composer and scroll it into view. Used by
  // the "כתבו ביקורת" FAB (no provider), the provider picker, the "דרגו ראשונים"
  // buttons, and the "ערוך" action in "הדירוגים שלי".
  void _editReview(String provider) {
    final existing = AppState().reviewFor(provider);
    setState(() {
      _selectedProvider = provider;
      if (existing != null) {
        for (final k in ProviderRatings.subKeys) {
          _subRatings[k] = existing[k] as int? ?? 0;
        }
        _reviewCtrl.text = existing['text'] as String? ?? '';
      } else {
        _subRatings.updateAll((_, __) => 0);
        _reviewCtrl.clear();
      }
    });
    _scrollToComposer();
  }

  void _scrollToComposer() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _formKey.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx,
            duration: const Duration(milliseconds: 400), curve: Curves.easeOutCubic, alignment: 0.05);
      }
    });
  }

  // The provider chooser, lifted out of the inline Wrap-of-pills into an AppSheet
  // picker so the composer stays compact and the choice gets a full-height,
  // scrollable list.
  Future<void> _pickProvider() async {
    HapticFeedback.selectionClick();
    final chosen = await AppSheet.show<String>(
      context,
      title: 'בחרו ספק',
      child: _ProviderPicker(
        providers: _providersInCat,
        selected: _selectedProvider,
        hasReviewedProvider: AppState().hasReviewedProvider,
      ),
    );
    if (chosen != null) _editReview(chosen);
  }

  void _submitReview(AppState appState) {
    final provider = _selectedProvider;
    if (provider == null || !_subRatings.values.any((v) => v > 0)) return;
    final rated = _subRatings.values.where((v) => v > 0);
    final overall = rated.fold(0, (a, b) => a + b) ~/ rated.length;
    final wasEditing = appState.hasReviewedProvider(provider);

    final review = ReviewInput(
      provider: provider,
      overall: overall,
      subRatings: Map.of(_subRatings),
      text: _reviewCtrl.text.trim(),
    );
    appState.addReview(
      provider: review.provider,
      overall: review.overall,
      subRatings: review.subRatings,
      text: review.text,
    );
    // Mirror to the backend seam (no-op locally; upsert into provider_reviews
    // once SupabaseBackend is set).
    appBackend.upsertReview(review).catchError((_) {});

    setState(() {
      _selectedProvider = null;
      _subRatings.updateAll((_, __) => 0);
      _reviewCtrl.clear();
    });
    AppSnackBar.success(
        context, wasEditing ? 'הביקורת על $provider עודכנה' : 'תודה! הביקורת על $provider נשמרה');
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final providers = _providersInCat;

    // Only providers with at least one REAL review are ranked with stars; the
    // rest are listed below under an honest "no ratings yet" state.
    final rated = providers.where((p) => _totalReviews(p, appState) > 0).toList();
    final unrated = providers.where((p) => _totalReviews(p, appState) == 0).toList();

    if (_sortBy == 'rating') {
      rated.sort((a, b) => _avgStars(b, appState).compareTo(_avgStars(a, appState)));
    } else if (_sortBy == 'reviews') {
      rated.sort((a, b) => _totalReviews(b, appState).compareTo(_totalReviews(a, appState)));
    } else {
      // value = rating / price ratio (guard against zero price)
      rated.sort((a, b) {
        final pricedA = allPlans.where((p) => p.provider == a && p.price > 0).map((p) => p.price);
        final pricedB = allPlans.where((p) => p.provider == b && p.price > 0).map((p) => p.price);
        final minPriceA = pricedA.isEmpty ? 1 : pricedA.reduce((x, y) => x < y ? x : y);
        final minPriceB = pricedB.isEmpty ? 1 : pricedB.reduce((x, y) => x < y ? x : y);
        return (_avgStars(b, appState) / minPriceB).compareTo(_avgStars(a, appState) / minPriceA);
      });
    }

    return Scaffold(
      backgroundColor: t.background,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          HapticFeedback.selectionClick();
          _scrollToComposer();
        },
        backgroundColor: t.brandAccent,
        // Contrast-aware ink ON the solid-green fill: white on the light
        // green-600, near-black on the lifted dark green-400 (pinned white
        // fell to ~1.7:1 in dark mode).
        foregroundColor: t.onSaving,
        icon: const Icon(Icons.rate_review_rounded),
        label: const Text('כתבו ביקורת'),
      ),
      body: RefreshableScroll(
        controller: _scrollCtrl,
        onRefresh: () async {
          await _loadRemoteReviews();
        },
        slivers: [
          // Pinned ink header + category tabs — unchanged chrome, now the first
          // sliver of the refreshable CustomScrollView.
          SliverAppBar(
            title: const Text('דירוגי ספקים'),
            // Fixed ink header (const token) so the white tab labels keep their
            // contrast in BOTH themes — the theme-aware getter would flip to
            // off-white on dark and strand the white-on-ink TabBar.
            backgroundColor: AppColors.primary,
            foregroundColor: t.white,
            pinned: true,
            floating: true,
            snap: true,
            elevation: 0,
            bottom: TabBar(
              controller: _tabCtrl,
              tabs: _cats.map((c) => Tab(text: c)).toList(),
              indicatorColor: t.brandAccent,
              indicatorWeight: 3,
              indicatorSize: TabBarIndicatorSize.label,
              // The header is CONST ink in both themes (see backgroundColor
              // above), so white-token ink is the correct foreground here.
              labelColor: t.white,
              unselectedLabelColor: t.white.withValues(alpha: 0.6),
              isScrollable: true,
              // Title-scale token (Rubik 13); weight deltas via copyWith.
              labelStyle: t.titleSmall.copyWith(fontWeight: FontWeight.w700, color: t.white),
              unselectedLabelStyle: t.titleSmall.copyWith(fontWeight: FontWeight.w500),
            ),
          ),

          // While the first remote page is in flight, show ghost rows instead of
          // a premature "no ratings" state.
          if (_loading)
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 24),
              sliver: SliverToBoxAdapter(child: _LeaderboardSkeleton()),
            )
          // First load failed with nothing remote cached — an honest "couldn't
          // load" + retry (the Deals-screen error idiom) instead of eating the
          // error and rendering a false "no ratings yet" board. A later refresh
          // failure keeps the already-loaded reviews on screen.
          else if (_error != null && _remoteReviews.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.cloud_off_rounded,
                headline: 'לא הצלחנו לטעון את הדירוגים',
                subtitle: 'בדקו את החיבור ונסו שוב.',
                ctaLabel: 'נסו שוב',
                onCtaTap: () async {
                  // Back to the skeleton rows while the retry runs.
                  setState(() {
                    _loading = true;
                    _error = null;
                  });
                  await _loadRemoteReviews();
                },
              ),
            )
          else ...[
            // Top 3 podium + sort row — fixed leading block above the lazy list.
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (rated.length >= 3) ...[
                      _buildPodium(
                          rated.take(3).map((p) => MapEntry(p, _avgStars(p, appState))).toList(), t),
                      const SizedBox(height: 20),
                    ],
                    // Hero heading — this leaderboard is the page's primary focus.
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        ExcludeSemantics(
                            child: Icon(Icons.leaderboard_rounded, color: t.brandAccent, size: 24)),
                        const SizedBox(width: 8),
                        Expanded(
                          // Section heading — announced so screen-reader users
                          // can jump between the page's sections.
                          child: Semantics(
                            header: true,
                            child: Text('לוח מנצחים',
                                style: t.headlineSmall.copyWith(fontWeight: FontWeight.w800)),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text('הספקים המדורגים ביותר — לפי ביקורות אמיתיות מהקהילה',
                        style: t.bodySmall.copyWith(color: t.secondaryText)),
                    const SizedBox(height: 12),
                    // Sort control on its own line — a SegmentedButton with >=44dp
                    // segments, replacing the cramped inline chip row.
                    _SortControl(
                      value: _sortBy,
                      onChanged: (v) {
                        HapticFeedback.selectionClick();
                        setState(() => _sortBy = v);
                      },
                    ),
                    const SizedBox(height: 12),
                    if (rated.isEmpty)
                      const EmptyState(
                        icon: Icons.reviews_outlined,
                        headline: 'אין עדיין דירוגים',
                        subtitle:
                            'עדיין לא התקבלו ביקורות אמיתיות על ספקים בקטגוריה זו. היו הראשונים לדרג למטה.',
                      ),
                  ],
                ),
              ),
            ),

            // Ranked leaderboard — real reviews only, rendered lazily as a
            // SliverList so long boards build only the visible rows.
            if (rated.isNotEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.builder(
                  itemCount: rated.length,
                  itemBuilder: (context, i) {
                    final provider = rated[i];
                    return _LeaderboardCard(
                      rank: i,
                      provider: provider,
                      avg: _avgStars(provider, appState),
                      totalReviews: _totalReviews(provider, appState),
                      subValues: {
                        for (final key in ProviderRatings.subKeys)
                          key: _subRatingValue(provider, key, appState),
                      },
                      t: t,
                      onTap: () => context.pushNamed('Provider', pathParameters: {'name': provider}),
                    ).animate(delay: (i * 60).ms).fadeIn(duration: 350.ms).slideX(begin: 0.05, end: 0);
                  },
                ),
              ),

            // Providers without real reviews yet — listed honestly, also lazy.
            if (unrated.isNotEmpty) ...[
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: Text('ממתינים לדירוג ראשון',
                      style: t.titleSmall.copyWith(color: t.secondaryText)),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                sliver: SliverList.builder(
                  itemCount: unrated.length,
                  itemBuilder: (context, i) {
                    final provider = unrated[i];
                    return Semantics(
                      button: true,
                      label: 'פתח את עמוד הספק $provider — אין עדיין דירוגים',
                      child: Pressable(
                        onTap: () => context.pushNamed('Provider', pathParameters: {'name': provider}),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: t.glassDecoration(radius: t.radiusMd),
                          child: Row(
                            children: [
                              ExcludeSemantics(child: LogoWidget(provider: provider, size: 34)),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(provider, style: t.titleSmall, overflow: TextOverflow.ellipsis),
                                    Text('אין עדיין דירוגים',
                                        style: t.labelSmall.copyWith(color: t.secondaryText)),
                                  ],
                                ),
                              ),
                              TextButton(
                                onPressed: () => _editReview(provider),
                                style: TextButton.styleFrom(
                                  // AA-safe green for small link text (the
                                  // fill hue only reaches ~3:1 at this size).
                                  foregroundColor: t.brandAccentText,
                                  // No compact density: it shaved the button to
                                  // 40dp despite minimumSize — under the 48dp
                                  // tap-target guideline.
                                  minimumSize: const Size(kMinTapTarget, kMinTapTarget),
                                  tapTargetSize: MaterialTapTargetSize.padded,
                                  textStyle: t.labelSmall.copyWith(fontWeight: FontWeight.w800),
                                ),
                                child: const Text('דרגו ראשונים'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],

            // Secondary-section divider — frames the composer below as a quieter
            // "contribute" area so it reads as clearly subordinate to the
            // leaderboard hero above, not a co-equal focal point.
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
              sliver: SliverToBoxAdapter(
                child: Row(
                  children: [
                    Expanded(child: Divider(color: t.alternate, height: 1)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text('רוצים לתרום ללוח?',
                          style: t.labelSmall.copyWith(
                              color: t.secondaryText, fontWeight: FontWeight.w700)),
                    ),
                    Expanded(child: Divider(color: t.alternate, height: 1)),
                  ],
                ),
              ),
            ),

            // Write-review composer — DEMOTED to a clearly-secondary card (quieter
            // than the hero leaderboard above): a soft surface instead of the loud
            // bento, a compact header, and a tinted accent chip rather than the big
            // gradient block. Still fully built + scroll-reachable (the FAB / edit
            // actions scroll it into view via [_formKey]); its provider picker
            // opens an AppSheet.
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              sliver: SliverToBoxAdapter(
                child: Container(
                  key: _formKey,
                  padding: const EdgeInsets.all(16),
                  decoration: t.glassDecoration(radius: t.radiusCard),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              // The designed VALUE/active tint token — not a
                              // hand-mixed alpha wash (dark-parity built in).
                              color: t.brandAccentTint,
                              borderRadius: BorderRadius.circular(t.radiusSm),
                            ),
                            child: Icon(Icons.rate_review_rounded, color: t.brandAccent, size: 18),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _selectedProvider != null && appState.hasReviewedProvider(_selectedProvider!)
                                  ? 'עריכת הביקורת על $_selectedProvider'
                                  : 'כתיבת ביקורת',
                              style: t.titleSmall.copyWith(fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      Text('בחרו ספק', style: t.labelLarge),
                      const SizedBox(height: 8),
                      // Provider select — opens the AppSheet picker (replaces the
                      // inline Wrap-of-pills). >=48dp tall.
                      Semantics(
                        button: true,
                        label: _selectedProvider == null
                            ? 'בחר ספק'
                            : 'הספק שנבחר: $_selectedProvider, החלפת ספק',
                        child: InkWell(
                          onTap: _pickProvider,
                          borderRadius: BorderRadius.circular(t.radiusMd),
                          child: Container(
                            constraints: const BoxConstraints(minHeight: kMinTapTarget),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color: t.cardSurface.withValues(alpha: 0.6),
                              borderRadius: BorderRadius.circular(t.radiusMd),
                              border: Border.all(
                                  color: _selectedProvider != null ? t.primary : t.alternate,
                                  width: _selectedProvider != null ? 1.5 : 1),
                            ),
                            child: Row(
                              children: [
                                if (_selectedProvider != null) ...[
                                  ExcludeSemantics(child: LogoWidget(provider: _selectedProvider!, size: 28)),
                                  const SizedBox(width: 10),
                                ],
                                Expanded(
                                  child: Text(
                                    _selectedProvider ?? 'בחרו ספק לדירוג',
                                    style: t.bodyMedium.copyWith(
                                      color: _selectedProvider != null ? t.primaryText : t.secondaryText,
                                      fontWeight: _selectedProvider != null ? FontWeight.w700 : FontWeight.w500,
                                    ),
                                  ),
                                ),
                                Icon(Icons.unfold_more_rounded, size: 20, color: t.secondaryText),
                              ],
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: 18),
                      Text('דירוג לפי קטגוריה', style: t.labelLarge),
                      const SizedBox(height: 12),

                      // Multi-dimension star ratings — accessible 44px hit areas.
                      // Semantics label "דרג N מתוך 5 — …" preserved verbatim.
                      ..._subLabels.entries.map((e) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Row(
                              children: [
                                Icon(_subIcons[e.key], size: 16, color: t.sage),
                                const SizedBox(width: 6),
                                SizedBox(width: 46, child: Text(e.value, style: t.labelSmall)),
                                const SizedBox(width: 4),
                                ...List.generate(5, (j) {
                                  final filled = j < (_subRatings[e.key] ?? 0);
                                  return Semantics(
                                    button: true,
                                    selected: filled,
                                    label: 'דרג ${j + 1} מתוך 5 — ${e.value}',
                                    child: InkResponse(
                                      onTap: () {
                                        HapticFeedback.selectionClick();
                                        setState(() => _subRatings[e.key] = j + 1);
                                      },
                                      radius: 22,
                                      // 44px tap target around the 28px glyph (a11y
                                      // minimum) without enlarging the visual star.
                                      child: SizedBox(
                                        width: 44,
                                        height: 44,
                                        child: Center(
                                          child: Icon(
                                            filled ? Icons.star_rounded : Icons.star_outline_rounded,
                                            size: 28,
                                            color: t.warning,
                                          ),
                                        ),
                                      ),
                                    ),
                                  );
                                }),
                                const Spacer(),
                                if ((_subRatings[e.key] ?? 0) > 0)
                                  Text(
                                    _ratingLabel(_subRatings[e.key]!),
                                    style: t.labelSmall.copyWith(color: t.primary, fontWeight: FontWeight.w700),
                                  ),
                              ],
                            ),
                          )),

                      const SizedBox(height: 8),
                      TextField(
                        controller: _reviewCtrl,
                        maxLines: 3,
                        textDirection: TextDirection.rtl,
                        decoration: InputDecoration(
                          hintText: 'ספרו על החוויה שלכם (אופציונלי)...',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(t.radiusSm),
                            borderSide: BorderSide(color: t.alternate),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(t.radiusSm),
                            borderSide: BorderSide(color: t.alternate),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(t.radiusSm),
                            borderSide: BorderSide(color: t.primary, width: 1.5),
                          ),
                          filled: true,
                          fillColor: t.cardSurface.withValues(alpha: 0.6),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Builder(builder: (context) {
                        final canSubmit = _selectedProvider != null && _subRatings.values.any((v) => v > 0);
                        final editing = _selectedProvider != null && appState.hasReviewedProvider(_selectedProvider!);
                        // The shared primary-CTA button (green ACTION fill,
                        // contrast-aware label ink, dimmed while locked)
                        // replaces the hand-rolled gradient ElevatedButton —
                        // whose pinned white label went ~1.7:1 on the lifted
                        // dark-mode green.
                        return AppButton(
                          text: editing ? 'עדכון ביקורת' : 'שליחת ביקורת',
                          icon: Icon(Icons.send_rounded, size: 18, color: t.onSaving),
                          color: AppColors.primary,
                          enabled: canSubmit,
                          width: double.infinity,
                          height: 50,
                          textStyle: t.titleLarge,
                          borderRadius: BorderRadius.circular(t.radiusMd),
                          onPressed: () async {
                            HapticFeedback.mediumImpact();
                            _submitReview(appState);
                          },
                        );
                      }),
                    ],
                  ),
                ).animate().fadeIn(delay: 300.ms),
              ),
            ),

            // "הדירוגים שלי" — the user's own submitted reviews, with edit.
            if (appState.userReviews.isNotEmpty)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: t.cardDecoration(radius: t.radiusCard),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            ExcludeSemantics(
                                child: Icon(Icons.person_rounded, color: t.primary, size: 20)),
                            const SizedBox(width: 8),
                            Semantics(
                                header: true,
                                child: Text('הדירוגים שלי', style: t.titleLarge)),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                  color: t.accent1,
                                  borderRadius: BorderRadius.circular(t.radiusPill),
                                  // Neutral-chip hairline.
                                  border: Border.all(color: t.lineColor)),
                              child: Text('${appState.userReviews.length}',
                                  style: t.labelSmall.copyWith(color: t.primary, fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        ...appState.userReviews.asMap().entries.map((entry) {
                          final r = entry.value;
                          final provider = r['provider'] as String;
                          final overall = r['overall'] as int? ?? 0;
                          final text = r['text'] as String? ?? '';
                          final last = entry.key == appState.userReviews.length - 1;
                          return _MyReviewRow(
                            provider: provider,
                            overall: overall,
                            text: text,
                            subRatings: {for (final k in ProviderRatings.subKeys) k: r[k] as int? ?? 0},
                            showDivider: !last,
                            t: t,
                            onEdit: () => _editReview(provider),
                          );
                        }),
                      ],
                    ),
                  ).animate().fadeIn(delay: 400.ms),
                ),
              ),

            // Live community reviews from the backend.
            if (_remoteReviews.isNotEmpty)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: t.cardDecoration(radius: t.radiusCard),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            ExcludeSemantics(
                                child: Icon(Icons.people_alt_rounded, color: t.primary, size: 20)),
                            const SizedBox(width: 8),
                            Semantics(
                                header: true,
                                child: Text('ביקורות מהקהילה', style: t.titleLarge)),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                  color: t.accent1,
                                  borderRadius: BorderRadius.circular(t.radiusPill),
                                  // Neutral-chip hairline.
                                  border: Border.all(color: t.lineColor)),
                              child: Text('${_remoteReviews.values.fold(0, (s, l) => s + l.length)}',
                                  style: t.labelSmall.copyWith(color: t.primary, fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        ..._remoteReviews.entries.expand((mapEntry) {
                          return mapEntry.value.take(2).map((r) => Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Flexible(
                                          child: Text(mapEntry.key,
                                              style: t.labelMedium.copyWith(
                                                  fontWeight: FontWeight.w700, color: t.primaryText),
                                              overflow: TextOverflow.ellipsis),
                                        ),
                                        const SizedBox(width: 8),
                                        _StarRow(value: r.overall.toDouble(), size: 12, t: t),
                                        const SizedBox(width: 4),
                                        Text(r.overall.toString(),
                                            style: t.labelSmall.copyWith(
                                                fontWeight: FontWeight.w700, color: t.primary)),
                                      ],
                                    ),
                                    if (r.isVerifiedCustomer) ...[
                                      const SizedBox(height: 5),
                                      _VerifiedBadge(t: t),
                                    ],
                                    if (r.text.isNotEmpty) ...[
                                      const SizedBox(height: 5),
                                      Text(r.text, style: t.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                                    ],
                                    const Divider(height: 16),
                                  ],
                                ),
                              ));
                        }),
                      ],
                    ),
                  ).animate().fadeIn(delay: 450.ms),
                ),
              ),

            // Tail spacing so the FAB never covers the last row.
            const SliverToBoxAdapter(child: SizedBox(height: 96)),
          ],
        ],
      ),
    );
  }

  String _ratingLabel(int r) {
    switch (r) {
      case 1: return 'גרוע';
      case 2: return 'בינוני';
      case 3: return 'סביר';
      case 4: return 'טוב';
      case 5: return 'מצוין';
      default: return '';
    }
  }

  Widget _buildPodium(List<MapEntry<String, double>> top, AppTheme t) {
    final avgs = top.map((e) => e.value).toList();

    return ClipRRect(
      borderRadius: BorderRadius.circular(t.radiusCard),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          // Flat ink hero — resting content carries no float under the
          // one-elevation story.
          gradient: t.brandGradient,
          borderRadius: BorderRadius.circular(t.radiusCard),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const ExcludeSemantics(
                    child: Icon(Icons.emoji_events_rounded, color: AppColors.secondary, size: 18)),
                const SizedBox(width: 6),
                Semantics(
                  header: true,
                  child: Text('שלושת המובילים',
                      style: t.titleSmall.copyWith(color: AppColors.secondary, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _PodiumItem(rank: 2, provider: top[1].key, avg: avgs[1], height: 80, t: t),
                const SizedBox(width: 8),
                _PodiumItem(rank: 1, provider: top[0].key, avg: avgs[0], height: 100, t: t),
                const SizedBox(width: 8),
                _PodiumItem(rank: 3, provider: top[2].key, avg: avgs[2], height: 60, t: t),
              ],
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 500.ms);
  }
}

/// The provider chooser body for the composer's picker sheet — a scrollable
/// list of providers (with a "reviewed" check), popping the chosen name.
class _ProviderPicker extends StatelessWidget {
  const _ProviderPicker({
    required this.providers,
    required this.selected,
    required this.hasReviewedProvider,
  });

  final List<String> providers;
  final String? selected;
  final bool Function(String provider) hasReviewedProvider;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.5),
      child: ListView.builder(
        shrinkWrap: true,
        itemCount: providers.length,
        itemBuilder: (context, i) {
          final p = providers[i];
          final active = p == selected;
          final reviewed = hasReviewedProvider(p);
          return Semantics(
            button: true,
            selected: active,
            label: 'בחר ספק $p',
            child: InkWell(
              onTap: () {
                HapticFeedback.selectionClick();
                Navigator.of(context).pop(p);
              },
              borderRadius: BorderRadius.circular(t.radiusMd),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 56),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  child: Row(
                    children: [
                      ExcludeSemantics(child: LogoWidget(provider: p, size: 32)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(p,
                            style: t.bodyLarge.copyWith(
                              color: t.primaryText,
                              fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis),
                      ),
                      if (reviewed)
                        Padding(
                          padding: const EdgeInsetsDirectional.only(end: 6),
                          child: Icon(Icons.check_circle_rounded, size: 18, color: t.tertiary),
                        ),
                      if (active) Icon(Icons.radio_button_checked_rounded, size: 20, color: t.primary),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// The sort control: a SegmentedButton on its own line, each segment a >=44dp
/// tap target. Replaces the cramped inline `_SortChip` row.
class _SortControl extends StatelessWidget {
  const _SortControl({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SizedBox(
      width: double.infinity,
      child: SegmentedButton<String>(
        showSelectedIcon: false,
        segments: const [
          ButtonSegment(value: 'rating', label: Text('דירוג'), icon: Icon(Icons.star_rounded, size: 16)),
          ButtonSegment(value: 'reviews', label: Text('ביקורות'), icon: Icon(Icons.reviews_rounded, size: 16)),
          ButtonSegment(value: 'value', label: Text('מחיר-ערך'), icon: Icon(Icons.savings_rounded, size: 16)),
        ],
        selected: {value},
        onSelectionChanged: (s) => onChanged(s.first),
        style: ButtonStyle(
          // Keep each segment a comfortable, >=44dp tap target.
          minimumSize: const WidgetStatePropertyAll(Size(0, kMinTapTarget)),
          tapTargetSize: MaterialTapTargetSize.padded,
          textStyle: WidgetStatePropertyAll(t.labelSmall.copyWith(fontWeight: FontWeight.w700)),
          // ONE chip language: ACTIVE = green tint bg + AA green ink + green
          // hairline; resting = surface + hairline + muted ink. (The old
          // black-filled selected segment broke the no-solid-ink-chips rule.)
          backgroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected) ? t.brandAccentTint : t.cardSurface,
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected) ? t.brandAccentText : t.secondaryText,
          ),
          side: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected)
                ? BorderSide(color: t.brandAccent)
                : BorderSide(color: t.alternate),
          ),
        ),
      ),
    );
  }
}

/// Four ghost leaderboard rows shown while the first remote review page loads.
class _LeaderboardSkeleton extends StatelessWidget {
  const _LeaderboardSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 120, child: Text('לוח מנצחים', style: t.titleLarge)),
        const SizedBox(height: 16),
        ...List.generate(
          4,
          (_) => Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: t.cardSurface,
              borderRadius: BorderRadius.circular(t.radiusMd),
              border: Border.all(color: t.alternate.withValues(alpha: 0.4)),
            ),
            // The shared theme-aware shimmer (RTL sweep, dark-parity tones,
            // reduced-motion safe) — replaces the raw light-only hex shimmer
            // that glared on the dark card.
            child: const SkeletonShimmer(
              child: Row(
                children: [
                  SkeletonBox(width: 30, height: 30, radius: 15),
                  SizedBox(width: 10),
                  SkeletonBox(width: 38, height: 38, radius: 10),
                  SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(width: 110, height: 13),
                        SizedBox(height: 7),
                        SkeletonBox(width: 64, height: 10),
                      ],
                    ),
                  ),
                  SizedBox(width: 10),
                  SkeletonBox(width: 28, height: 22),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// One leaderboard row: rank pill, logo, name + stars, review count, and the
/// real sub-dimension bars (only for dimensions backed by a real review).
class _LeaderboardCard extends StatelessWidget {
  const _LeaderboardCard({
    required this.rank,
    required this.provider,
    required this.avg,
    required this.totalReviews,
    required this.subValues,
    required this.t,
    required this.onTap,
  });

  final int rank;
  final String provider;
  final double avg;
  final int totalReviews;
  final Map<String, double> subValues;
  final AppTheme t;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isTop = rank == 0;
    final bars = <Widget>[];
    for (final key in ProviderRatings.subKeys) {
      final v = subValues[key] ?? 0;
      if (v <= 0) continue;
      bars.add(const SizedBox(height: 6));
      bars.add(_SubBar(label: ProviderRatings.subLabels[key]!, value: v / 5, t: t));
    }

    return Semantics(
      button: true,
      label: 'מקום ${rank + 1}: $provider, דירוג ${avg.toStringAsFixed(1)} מתוך 5, $totalReviews ביקורות',
      // Pressable adds the subtle scale-down tactile press on a list row that
      // navigates — cheap (one AnimatedScale) and reduced-motion-aware.
      child: Pressable(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: t.glassDecoration().copyWith(
                // Gold ring for the #1 spot; the rest keep the theme-aware
                // hairline (correct on light AND dark).
                border: Border.all(color: isTop ? t.saving : t.alternate, width: isTop ? 2 : 1),
              ),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: isTop
                          ? t.secondary
                          : rank == 1
                              ? t.accent2
                              : rank == 2
                                  ? t.accent4
                                  : t.background,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      // Title-scale token (Rubik 13); w800 + tabular via copyWith.
                      child: Text('${rank + 1}',
                          style: t.titleSmall.copyWith(
                              fontWeight: FontWeight.w800,
                              fontFeatures: const [FontFeature.tabularFigures()])),
                    ),
                  ),
                  const SizedBox(width: 10),
                  ExcludeSemantics(child: LogoWidget(provider: provider, size: 38)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(provider, style: t.titleSmall, overflow: TextOverflow.ellipsis),
                        Row(
                          children: [
                            _StarRow(value: avg, size: 13, t: t),
                            const SizedBox(width: 4),
                            Text(avg.toStringAsFixed(1), style: t.labelSmall.copyWith(fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('$totalReviews', style: t.titleSmall.copyWith(color: t.primary)),
                      Text(totalReviews == 1 ? 'ביקורת' : 'ביקורות', style: t.labelSmall),
                    ],
                  ),
                  const SizedBox(width: 6),
                  Icon(Icons.arrow_forward_ios_rounded, size: 14, color: t.secondaryText),
                ],
              ),
              if (bars.isNotEmpty) ...[const SizedBox(height: 6), ...bars],
            ],
          ),
        ),
      ),
    );
  }
}

/// A single row in "הדירוגים שלי": provider, overall stars, optional text, and
/// an "ערוך" action that loads the review back into the form.
class _MyReviewRow extends StatelessWidget {
  const _MyReviewRow({
    required this.provider,
    required this.overall,
    required this.text,
    required this.subRatings,
    required this.showDivider,
    required this.t,
    required this.onEdit,
  });

  final String provider;
  final int overall;
  final String text;
  final Map<String, int> subRatings;
  final bool showDivider;
  final AppTheme t;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final rated = subRatings.entries.where((e) => e.value > 0).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ExcludeSemantics(child: LogoWidget(provider: provider, size: 28)),
              const SizedBox(width: 8),
              Text(provider, style: t.labelMedium.copyWith(fontWeight: FontWeight.w700, color: t.primaryText)),
              const SizedBox(width: 8),
              _StarRow(value: overall.toDouble(), size: 14, t: t),
              const Spacer(),
              TextButton.icon(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_rounded, size: 15),
                label: const Text('ערוך'),
                style: TextButton.styleFrom(
                  foregroundColor: t.primary,
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  textStyle: t.labelSmall.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          if (rated.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: rated
                  .map((e) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: t.accent1, borderRadius: BorderRadius.circular(t.radiusPill)),
                        child: Text('${ProviderRatings.subLabels[e.key]} ${e.value}',
                            style: t.labelSmall.copyWith(color: t.primary, fontWeight: FontWeight.w700)),
                      ))
                  .toList(),
            ),
          ],
          if (text.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(text, style: t.bodySmall, maxLines: 3, overflow: TextOverflow.ellipsis),
          ],
          if (showDivider) const Divider(height: 20),
        ],
      ),
    );
  }
}

/// Five stars rendering an exact 0..5 [value] with half-star support.
class _StarRow extends StatelessWidget {
  const _StarRow({required this.value, required this.size, required this.t});
  final double value;
  final double size;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(5, (j) {
          final icon = j < value.floor()
              ? Icons.star_rounded
              : j < value
                  ? Icons.star_half_rounded
                  : Icons.star_outline_rounded;
          return Icon(icon, size: size, color: t.warning);
        }),
      ),
    );
  }
}

class _PodiumItem extends StatelessWidget {
  const _PodiumItem({required this.rank, required this.provider, required this.avg, required this.height, required this.t});
  final int rank;
  final String provider;
  final double avg;
  final double height;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    // The podium rides on the PERMANENTLY-dark ink hero (brandGradient is ink
    // in BOTH themes), so its steps + step-ink resolve through the LIGHT token
    // set — the theme-aware getters flipped to dark slate fills with black
    // text in dark mode (invisible). Monochrome neutral ramp, no hex medals.
    const lt = AppTheme.light;
    final medalColor = rank == 1
        ? lt.secondary
        : rank == 2
            ? lt.lineColor
            : lt.alternate;
    final rankLabel = rank == 1 ? 'מקום ראשון' : rank == 2 ? 'מקום שני' : 'מקום שלישי';
    return Semantics(
      button: true,
      label: '$rankLabel — $provider, דירוג ${avg.toStringAsFixed(1)}',
      child: Pressable(
        onTap: () => context.pushNamed('Provider', pathParameters: {'name': provider}),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            ExcludeSemantics(
              child: Icon(Icons.emoji_events_rounded,
                  size: 22,
                  color: rank == 1
                      ? t.saving
                      : t.white.withValues(alpha: rank == 2 ? 0.7 : 0.54)),
            ),
            const SizedBox(height: 4),
            ExcludeSemantics(
              child: Container(
                padding: const EdgeInsets.all(3),
                // Light card-token disc behind the provider logo (logos are
                // drawn for light surfaces) — on the always-dark hero.
                decoration: BoxDecoration(
                    color: lt.secondaryBackground, shape: BoxShape.circle),
                child: LogoWidget(provider: provider, size: 34),
              ),
            ),
            const SizedBox(height: 4),
            Text(avg.toStringAsFixed(1),
                // Numeral on the ink hero: title-scale token + tabular figures;
                // white-token ink (the hero stays ink in both themes).
                style: t.titleSmall.copyWith(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: t.white,
                    fontFeatures: const [FontFeature.tabularFigures()])),
            const SizedBox(height: 4),
            Container(
              width: 80,
              height: height,
              decoration: BoxDecoration(
                color: medalColor,
                borderRadius: BorderRadius.vertical(top: Radius.circular(t.radiusSm)),
              ),
              child: Center(
                child: Text(
                  provider.length > 6 ? provider.substring(0, 6) : provider,
                  // Light-ink on the light step so it stays readable in BOTH
                  // themes (the theme getter went black-on-slate in dark).
                  style: lt.titleSmall.copyWith(
                      fontSize: 10, fontWeight: FontWeight.w700, color: lt.primaryDark),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubBar extends StatelessWidget {
  const _SubBar({required this.label, required this.value, required this.t});
  final String label;
  final double value;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(width: 44, child: Text(label, style: t.labelSmall)),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: value.clamp(0.0, 1.0)),
              duration: t.motionMedium,
              curve: t.easeOut,
              builder: (context, v, _) => LinearProgressIndicator(
                value: v,
                backgroundColor: t.alternate.withValues(alpha: 0.12),
                valueColor: AlwaysStoppedAnimation(t.brandAccent),
                minHeight: 6,
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text((value * 5).toStringAsFixed(1), style: t.labelSmall.copyWith(fontWeight: FontWeight.w700)),
      ],
    );
  }
}

/// Green trust badge shown next to a review whose author was verified as a real
/// customer (`ReviewInput.isVerifiedCustomer`). Uses the ACTION (green) accent.
class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge({required this.t});
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'לקוח מאומת',
      child: Container(
        padding: const EdgeInsetsDirectional.only(start: 6, end: 8, top: 3, bottom: 3),
        decoration: BoxDecoration(
          // The designed green tint token + green hairline — the ACTIVE/VALUE
          // chip language (was a hand-mixed alpha wash).
          color: t.brandAccentTint,
          borderRadius: BorderRadius.circular(t.radiusPill),
          border: Border.all(color: t.brandAccent.withValues(alpha: 0.30)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.verified_rounded, size: 13, color: t.brandAccent),
            const SizedBox(width: 4),
            Text('לקוח מאומת',
                style: t.labelSmall.copyWith(
                  // AA-safe green for tiny text (the fill hue is ~3:1 here).
                  color: t.brandAccentText,
                  fontWeight: FontWeight.w800,
                  fontSize: 10.5,
                )),
          ],
        ),
      ),
    );
  }
}
