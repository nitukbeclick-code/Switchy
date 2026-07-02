import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/search.dart';
import '../../services/analytics_service.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/pressable.dart';
import '../../widgets/price_text.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../widgets/section_header.dart';

/// Global search across every provider and plan in the catalogue.
///
/// Results update instantly as you type, grouped into ספקים / קטגוריות /
/// מסלולים, with the matched text highlighted. With an empty query we show
/// recent searches plus an honest browse-by-category surface built from the
/// REAL catalogue (categories + the genuinely cheapest plan in each) — never
/// invented popularity numbers.
class SearchWidget extends StatefulWidget {
  const SearchWidget({super.key});

  @override
  State<SearchWidget> createState() => _SearchWidgetState();
}

class _SearchWidgetState extends State<SearchWidget> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  String _q = '';
  SearchFacets _facets = const SearchFacets();
  // Debounce keystrokes so we don't re-run searchEverything on every character.
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    // Rebuild on focus change so the search field can show a green focus ring.
    _focus.addListener(_onFocusChanged);
  }

  void _onFocusChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focus.removeListener(_onFocusChanged);
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Applies a query value to state immediately (no debounce). Used for clear,
  /// submit and suggestion picks where the result should update at once.
  void _setQuery(String v) {
    _debounce?.cancel();
    setState(() => _q = v);
  }

  /// Debounced handler for live typing — coalesces rapid keystrokes (~300ms)
  /// so the catalogue re-filter runs once the user pauses, not per character.
  void _onTyped(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _q = v);
    });
  }

  void _useSuggestion(String v) {
    _ctrl.text = v;
    _ctrl.selection = TextSelection.collapsed(offset: v.length);
    _setQuery(v);
    _focus.requestFocus();
  }

  /// Pull-to-refresh: searchEverything / the suggestions surface are pure over
  /// the catalogue + AppState, so re-running build on a fresh frame re-derives
  /// them. A microtask defers the setState off the gesture's notification frame.
  Future<void> _refresh() async {
    await Future<void>.delayed(Duration.zero);
    if (mounted) setState(() {});
  }

  void _setFacets(SearchFacets f) => setState(() => _facets = f);

  void _clearFacets() => setState(() => _facets = const SearchFacets());

  void _remember() {
    final t = _q.trim();
    if (t.isNotEmpty) {
      Provider.of<AppState>(context, listen: false).addRecentSearch(t);
      // Funnel beacon for a committed search (submit / before navigating to a
      // result). Fire-and-forget; `q` is a catalogue search term, not PII.
      AnalyticsService.track(AnalyticsEvent.searchQuery, props: {'q': t});
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final raw = searchEverything(_q);
    // Facets narrow only the plan list; provider/category hits are unaffected.
    final results = _facets.isEmpty
        ? raw
        : SearchResults(
            providers: raw.providers,
            categories: raw.categories,
            plans: filtered(raw.plans, _facets),
          );
    final hasQuery = _q.trim().isNotEmpty;
    // The set of plans the active facets *could* have hidden — used to keep the
    // chip bar honest ("0 results" still shows the bar so the user can relax it).
    final filteredEmpty = hasQuery &&
        _facets.isNotEmpty &&
        raw.plans.isNotEmpty &&
        results.plans.isEmpty;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.secondaryBackground,
        elevation: 0,
        titleSpacing: 0,
        // Platform-default back affordance — RTL-mirrored automatically (replaces
        // the previously wrong-direction forward chevron).
        leading: BackButton(
          color: ffTheme.primaryText,
          onPressed: () => context.safePop(),
        ),
        title: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: ffTheme.secondaryBackground,
            borderRadius: BorderRadius.circular(ffTheme.radiusSm),
            border: Border.all(
              color: _focus.hasFocus ? ffTheme.brandAccent : ffTheme.alternate,
              width: _focus.hasFocus ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, size: 20, color: ffTheme.brandAccent),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  focusNode: _focus,
                  autofocus: true,
                  textDirection: TextDirection.rtl,
                  textInputAction: TextInputAction.search,
                  onChanged: _onTyped,
                  onSubmitted: (v) {
                    // Flush any pending debounce so submit reflects the typed
                    // text immediately, then record the committed search.
                    _setQuery(v);
                    _remember();
                  },
                  style: ffTheme.bodyMedium,
                  decoration: InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    hintText: 'ספק, מסלול, או תכונה…',
                    hintStyle: ffTheme.bodyMedium
                        .copyWith(color: ffTheme.secondaryText),
                  ),
                ),
              ),
              if (_q.isNotEmpty)
                Semantics(
                  button: true,
                  label: 'נקה חיפוש',
                  child: Pressable(
                    onTap: () {
                      _ctrl.clear();
                      _setQuery('');
                      _focus.requestFocus();
                    },
                    // A full-height invisible hit zone — the visible glyph stays
                    // 18px, the tap target fills the 44px field.
                    child: SizedBox(
                      width: 40,
                      height: 44,
                      child: Center(
                        child: Icon(Icons.close_rounded,
                            size: 18, color: ffTheme.secondaryText),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: ffTheme.alternate),
        ),
      ),
      body: !hasQuery
          ? _Suggestions(
              ffTheme: ffTheme,
              onPick: _useSuggestion,
              recent: appState.recentSearches,
              onClearRecent: appState.clearRecentSearches,
              onRefresh: _refresh,
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Facet chip bar — narrows the plan results over REAL fields.
                _FacetBar(
                  facets: _facets,
                  ffTheme: ffTheme,
                  onChanged: _setFacets,
                  onClear: _clearFacets,
                ),
                Expanded(
                  child: filteredEmpty
                      ? EmptyState(
                          icon: Icons.filter_alt_off_rounded,
                          headline: 'אין מסלולים שעונים על המסננים',
                          subtitle:
                              'נמצאו ${raw.plans.length} מסלולים עבור "${_q.trim()}" — אבל אף אחד לא עובר את המסננים שבחרתם.',
                          ctaLabel: 'נקו מסננים',
                          onCtaTap: () async => _clearFacets(),
                        )
                      : results.isEmpty
                          ? EmptyState(
                              icon: Icons.search_off_rounded,
                              headline: 'לא נמצאו תוצאות עבור "${_q.trim()}"',
                              subtitle:
                                  'נסו שם ספק, מסלול או תכונה אחרת — למשל "5G", "סיב" או תקציב כמו "50"',
                              ctaLabel: 'נקו את החיפוש',
                              onCtaTap: () async {
                                _ctrl.clear();
                                _setQuery('');
                                _focus.requestFocus();
                              },
                            )
                          : _ResultsList(
                              results: results,
                              query: _q,
                              ffTheme: ffTheme,
                              appState: appState,
                              onBeforeNavigate: _remember,
                              onRefresh: _refresh,
                            ),
                ),
              ],
            ),
    );
  }
}

// ── Facet chip bar ───────────────────────────────────────────────────────────

/// A horizontal row of toggle chips that narrow the plan results over fields the
/// catalogue already holds: 5G, ללא התחייבות, עם דאטה, and a budget threshold.
/// AND-combined; a "נקה" chip resets them. Each chip is a real toggle button
/// with a [Semantics] label and pressed state for screen readers.
class _FacetBar extends StatelessWidget {
  const _FacetBar({
    required this.facets,
    required this.ffTheme,
    required this.onChanged,
    required this.onClear,
  });

  final SearchFacets facets;
  final AppTheme ffTheme;
  final ValueChanged<SearchFacets> onChanged;
  final VoidCallback onClear;

  /// Preset budget thresholds (₪/חודש) the user can cap results at.
  static const List<int> _budgets = [30, 50, 80, 120];

  void _showBudgetSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: ffTheme.secondaryBackground,
      shape: RoundedRectangleBorder(
        // Edge-anchored sheets take the dedicated sheet radius token.
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet)),
      ),
      builder: (sheetCtx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('עד כמה התקציב?',
                    style: ffTheme.titleMedium
                        .copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('הצגת מסלולים במחיר שלא עולה על הסכום שתבחרו',
                    style: ffTheme.bodySmall
                        .copyWith(color: ffTheme.secondaryText)),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final b in _budgets)
                      _SheetChoice(
                        label: 'עד ₪$b',
                        selected: facets.maxPrice == b,
                        ffTheme: ffTheme,
                        onTap: () {
                          onChanged(facets.copyWith(maxPrice: b));
                          Navigator.of(sheetCtx).pop();
                        },
                      ),
                    if (facets.maxPrice != null)
                      _SheetChoice(
                        label: 'ללא הגבלת תקציב',
                        selected: false,
                        ffTheme: ffTheme,
                        onTap: () {
                          onChanged(facets.copyWith(clearMaxPrice: true));
                          Navigator.of(sheetCtx).pop();
                        },
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final budgetLabel =
        facets.maxPrice != null ? 'עד ₪${facets.maxPrice}' : 'תקציב';

    return Container(
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        border: Border(bottom: BorderSide(color: ffTheme.alternate)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _FacetChip(
              label: '5G',
              icon: Icons.network_cell_rounded,
              selected: facets.fiveG,
              ffTheme: ffTheme,
              onTap: () => onChanged(facets.copyWith(fiveG: !facets.fiveG)),
            ),
            const SizedBox(width: 8),
            _FacetChip(
              label: 'ללא התחייבות',
              icon: Icons.lock_open_rounded,
              selected: facets.noCommit,
              ffTheme: ffTheme,
              onTap: () =>
                  onChanged(facets.copyWith(noCommit: !facets.noCommit)),
            ),
            const SizedBox(width: 8),
            _FacetChip(
              label: 'עם דאטה',
              icon: Icons.data_usage_rounded,
              selected: facets.withData,
              ffTheme: ffTheme,
              onTap: () =>
                  onChanged(facets.copyWith(withData: !facets.withData)),
            ),
            const SizedBox(width: 8),
            _FacetChip(
              label: budgetLabel,
              icon: Icons.payments_outlined,
              selected: facets.maxPrice != null,
              trailing: Icons.expand_more_rounded,
              ffTheme: ffTheme,
              onTap: () => _showBudgetSheet(context),
            ),
            if (facets.isNotEmpty) ...[
              const SizedBox(width: 8),
              Semantics(
                button: true,
                label: 'נקה מסננים',
                child: Pressable(
                  onTap: onClear,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                    decoration: BoxDecoration(
                      color: ffTheme.accent2,
                      borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                      border: Border.all(color: ffTheme.alternate),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.close_rounded,
                            size: 15, color: ffTheme.secondaryText),
                        const SizedBox(width: 5),
                        Text('נקה',
                            style: ffTheme.labelMedium.copyWith(
                                color: ffTheme.secondaryText,
                                fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A single toggle chip in the facet bar. Filled green-tint when [selected],
/// glass-outline when not. Exposes a [Semantics] toggle so screen readers
/// announce the pressed state.
class _FacetChip extends StatelessWidget {
  const _FacetChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.ffTheme,
    required this.onTap,
    this.trailing,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final AppTheme ffTheme;
  final VoidCallback onTap;
  final IconData? trailing;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? ffTheme.brandAccentText : ffTheme.primaryText;
    return Semantics(
      button: true,
      toggled: selected,
      label: label,
      child: Pressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration: 160.ms,
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
          decoration: BoxDecoration(
            color: selected
                ? ffTheme.brandAccentTint
                : ffTheme.secondaryBackground,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            border: Border.all(
              color: selected
                  ? ffTheme.brandAccent.withValues(alpha: 0.45)
                  : ffTheme.alternate,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  size: 15,
                  color:
                      selected ? ffTheme.brandAccent : ffTheme.secondaryText),
              const SizedBox(width: 6),
              Text(label,
                  style: ffTheme.labelMedium
                      .copyWith(color: fg, fontWeight: FontWeight.w700)),
              if (trailing != null) ...[
                const SizedBox(width: 2),
                Icon(trailing,
                    size: 16,
                    color:
                        selected ? ffTheme.brandAccent : ffTheme.secondaryText),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A choice chip inside the budget bottom sheet.
class _SheetChoice extends StatelessWidget {
  const _SheetChoice({
    required this.label,
    required this.selected,
    required this.ffTheme,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      toggled: selected,
      label: label,
      child: Pressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          decoration: BoxDecoration(
            color: selected ? ffTheme.brandAccentTint : ffTheme.accent2,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            border: Border.all(
              color: selected
                  ? ffTheme.brandAccent.withValues(alpha: 0.45)
                  : ffTheme.alternate,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Text(label,
              style: ffTheme.labelMedium.copyWith(
                  color:
                      selected ? ffTheme.brandAccentText : ffTheme.primaryText,
                  fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }
}

// ── Staggered reveal helper ──────────────────────────────────────────────────

/// Emil staggered reveal for a result/suggestion entry: fade-in + an 8px settle
/// under ease-out, delayed by [index] within the 30–80ms band. Reduced-motion
/// KEEPS the fade and DROPS the transform (per `MediaQuery.disableAnimations`),
/// so the list still appears cleanly for users who asked for less movement.
Widget _revealEntry(
  BuildContext context,
  Widget child, {
  required int index,
  int step = 40,
  int maxIndex = 6,
}) {
  final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
  final delay = (index.clamp(0, maxIndex) * step).ms;
  if (reduceMotion) {
    return child.animate().fadeIn(delay: delay, duration: 240.ms);
  }
  return child
      .animate(delay: delay)
      .fadeIn(duration: 240.ms, curve: const Cubic(0.22, 1, 0.36, 1))
      .slideY(begin: 0.06, end: 0, duration: 240.ms, curve: const Cubic(0.22, 1, 0.36, 1));
}

// ── Results list ─────────────────────────────────────────────────────────────

class _ResultsList extends StatelessWidget {
  const _ResultsList({
    required this.results,
    required this.query,
    required this.ffTheme,
    required this.appState,
    required this.onBeforeNavigate,
    required this.onRefresh,
  });

  final SearchResults results;
  final String query;
  final AppTheme ffTheme;
  final AppState appState;
  final VoidCallback onBeforeNavigate;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    var i = 0; // running stagger index across all sections

    // Honest total across every section — a quick "how many hits" read so the
    // user knows the search worked before scanning the grouped lists.
    final total = results.categories.length +
        results.providers.length +
        results.plans.length;

    return RefreshableScroll(
      onRefresh: onRefresh,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
      slivers: [
        SliverList(
          delegate: SliverChildListDelegate([
            // Result summary line.
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                total == 1
                    ? 'תוצאה אחת עבור "$query"'
                    : '$total תוצאות עבור "$query"',
                style: ffTheme.bodySmall.copyWith(
                    color: ffTheme.secondaryText, fontWeight: FontWeight.w600),
              ),
            ),

            // Categories — quick jump into a whole catalogue section.
            if (results.categories.isNotEmpty) ...[
              _SectionLabel(
                  text: 'קטגוריות',
                  count: results.categories.length,
                  ffTheme: ffTheme),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: results.categories.map((c) {
                  final widget = _revealEntry(
                    context,
                    _CategoryResultChip(
                      hit: c,
                      query: query,
                      ffTheme: ffTheme,
                      onTap: () {
                        onBeforeNavigate();
                        final app = Provider.of<AppState>(context, listen: false);
                        app.setCategory(c.id);
                        context.pushNamed('Results');
                      },
                    ),
                    index: i,
                    maxIndex: 5,
                  );
                  i++;
                  return widget;
                }).toList(),
              ),
              const SizedBox(height: 20),
            ],

            // Providers — horizontal glass chips.
            if (results.providers.isNotEmpty) ...[
              _SectionLabel(
                  text: 'ספקים',
                  count: results.providers.length,
                  ffTheme: ffTheme),
              const SizedBox(height: 10),
              SizedBox(
                height: 102,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: results.providers.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, idx) {
                    final name = results.providers[idx];
                    final widget = _revealEntry(
                      context,
                      _ProviderChip(
                        name: name,
                        query: query,
                        planCount: plansByProvider(name).length,
                        ffTheme: ffTheme,
                        onTap: () {
                          onBeforeNavigate();
                          context.pushNamed('Provider',
                              pathParameters: {'name': name});
                        },
                      ),
                      index: i,
                      maxIndex: 5,
                    );
                    i++;
                    return widget;
                  },
                ),
              ),
              const SizedBox(height: 20),
            ],

            // Plans — the full ranked list, with the matched term highlighted.
            if (results.plans.isNotEmpty) ...[
              _SectionLabel(
                  text: 'מסלולים',
                  count: results.plans.length,
                  ffTheme: ffTheme),
              const SizedBox(height: 10),
              ...results.plans.map((p) {
                final widget = _revealEntry(
                  context,
                  _HighlightedPlanCard(
                    plan: p,
                    query: query,
                    currentBill: appState.currentBill(p.cat),
                    ffTheme: ffTheme,
                  ),
                  index: i,
                  step: 35,
                  maxIndex: 6,
                );
                i++;
                return widget;
              }),
            ],
          ]),
        ),
      ],
    );
  }
}

// ── Section label ───────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(
      {required this.text, required this.count, required this.ffTheme});
  final String text;
  final int count;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Semantics(
            header: true,
            child: Text(text,
                style:
                    ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800))),
        const SizedBox(width: 8),
        // Result count is DATA, not an active state → neutral chip (surface +
        // hairline + ink), keeping green for actions/savings only.
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            border: Border.all(color: ffTheme.lineColor),
          ),
          child: Text('$count',
              style: ffTheme.labelSmall.copyWith(
                  color: ffTheme.secondaryText, fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}

// ── Highlight helper ─────────────────────────────────────────────────────────

/// Renders [text] with every case-insensitive occurrence of [query] wrapped in
/// a teal-tinted, bold span. RTL-safe (it slices the original string, so glyph
/// order is preserved). Whole-word queries highlight each word independently.
class _Highlighted extends StatelessWidget {
  const _Highlighted({
    required this.text,
    required this.query,
    required this.base,
    required this.highlight,
    this.maxLines,
    this.overflow,
  });

  final String text;
  final String query;
  final TextStyle base;
  final Color highlight;
  final int? maxLines;
  final TextOverflow? overflow;

  List<String> get _terms {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    return q.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toSet().toList();
  }

  @override
  Widget build(BuildContext context) {
    final terms = _terms;
    if (terms.isEmpty) {
      return Text(text, style: base, maxLines: maxLines, overflow: overflow);
    }

    final low = text.toLowerCase();
    final hlStyle = base.copyWith(
      fontWeight: FontWeight.w800,
      // AA-safe green ink for the matched-term emphasis (the fill hue fails
      // 4.5:1 as small text on the pale tint).
      color: AppTheme.of(context).brandAccentText,
      backgroundColor: highlight,
    );

    // Walk the string; at each position match the longest applicable term.
    final spans = <TextSpan>[];
    var i = 0;
    final buf = StringBuffer();
    while (i < text.length) {
      String? hit;
      for (final t in terms) {
        if (t.length <= text.length - i && low.startsWith(t, i)) {
          if (hit == null || t.length > hit.length) hit = t;
        }
      }
      if (hit != null) {
        if (buf.isNotEmpty) {
          spans.add(TextSpan(text: buf.toString(), style: base));
          buf.clear();
        }
        spans.add(
            TextSpan(text: text.substring(i, i + hit.length), style: hlStyle));
        i += hit.length;
      } else {
        buf.write(text[i]);
        i++;
      }
    }
    if (buf.isNotEmpty) spans.add(TextSpan(text: buf.toString(), style: base));

    return Text.rich(
      TextSpan(children: spans),
      style: base,
      maxLines: maxLines,
      overflow: overflow,
      textDirection: TextDirection.rtl,
    );
  }
}

// ── Highlighted plan card (glass wrapper + matched-term ribbon) ───────────────

class _HighlightedPlanCard extends StatelessWidget {
  const _HighlightedPlanCard({
    required this.plan,
    required this.query,
    required this.currentBill,
    required this.ffTheme,
  });

  final Plan plan;
  final String query;
  final int currentBill;
  final AppTheme ffTheme;

  /// The first feature line that contains the query — shown as a "why this
  /// matched" hint when the hit isn't in the provider/plan name.
  String? get _matchedFeature {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return null;
    if (plan.provider.toLowerCase().contains(q) ||
        plan.plan.toLowerCase().contains(q)) {
      return null; // the name already shows the match
    }
    for (final f in plan.feats) {
      if (f.toLowerCase().contains(q)) return f;
    }
    for (final e in plan.specs.entries) {
      if (e.value.toLowerCase().contains(q) ||
          e.key.toLowerCase().contains(q)) {
        return '${e.key}: ${e.value}';
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final feature = _matchedFeature;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PlanCardWidget(
          plan: plan,
          currentBill: currentBill,
          compact: true,
        ),
        if (feature != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12, right: 4, left: 4),
            child: Row(
              children: [
                Icon(Icons.check_circle_outline_rounded,
                    size: 14, color: ffTheme.brandAccent),
                const SizedBox(width: 6),
                Expanded(
                  child: _Highlighted(
                    text: feature,
                    query: query,
                    base: ffTheme.labelSmall
                        .copyWith(color: ffTheme.secondaryText),
                    highlight: ffTheme.brandAccentTint,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ── Category result chip ─────────────────────────────────────────────────────

class _CategoryResultChip extends StatelessWidget {
  const _CategoryResultChip({
    required this.hit,
    required this.query,
    required this.ffTheme,
    required this.onTap,
  });
  final CategoryHit hit;
  final String query;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'קטגוריה ${hit.name}',
      child: Pressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: ffTheme.brandAccentTint,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            border:
                Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.22)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(hit.icon, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              _Highlighted(
                text: hit.name,
                query: query,
                // Type-scale token (was a raw GoogleFonts style) + AA-safe
                // green ink on the tint surface.
                base: ffTheme.labelLarge.copyWith(
                    fontWeight: FontWeight.w700,
                    color: ffTheme.brandAccentText),
                highlight: ffTheme.brandAccentTint,
              ),
              const SizedBox(width: 6),
              Icon(Icons.chevron_left_rounded,
                  size: 18, color: ffTheme.brandAccent),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Provider chip ───────────────────────────────────────────────────────────

class _ProviderChip extends StatelessWidget {
  const _ProviderChip({
    required this.name,
    required this.query,
    required this.planCount,
    required this.ffTheme,
    required this.onTap,
  });
  final String name;
  final String query;
  final int planCount;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'ספק $name, $planCount מסלולים',
      child: Pressable(
        onTap: onTap,
        child: Container(
          width: 116,
          padding: const EdgeInsets.all(10),
          decoration: ffTheme.glassDecoration(radius: ffTheme.radiusMd),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ExcludeSemantics(child: LogoWidget(provider: name, size: 38)),
              const SizedBox(height: 6),
              _Highlighted(
                text: name,
                query: query,
                base: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700),
                highlight: ffTheme.brandAccentTint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text('$planCount מסלולים',
                  style: ffTheme.labelSmall
                      .copyWith(color: ffTheme.secondaryText)),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Empty-query suggestions ─────────────────────────────────────────────────

class _Suggestions extends StatelessWidget {
  const _Suggestions({
    required this.ffTheme,
    required this.onPick,
    required this.recent,
    required this.onClearRecent,
    required this.onRefresh,
  });
  final AppTheme ffTheme;
  final void Function(String) onPick;
  final List<String> recent;
  final VoidCallback onClearRecent;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    // Real catalogue highlights — the genuinely cheapest plan per category.
    // No invented popularity; just honest lowest prices.
    final cheapest = cheapestPerCategory();

    return RefreshableScroll(
      onRefresh: onRefresh,
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
      slivers: [
        SliverList(
          delegate: SliverChildListDelegate([
            if (recent.isNotEmpty) ...[
              // Shared section-header pattern: title + trailing action chip
              // (replaces the bespoke bare-text GestureDetector "נקה" link).
              SectionHeader(
                title: 'חיפושים אחרונים',
                trailingLabel: 'נקה',
                onTrailingTap: onClearRecent,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: recent
                    .map((q) => _PillChip(
                          label: q,
                          icon: Icons.history_rounded,
                          ffTheme: ffTheme,
                          onTap: () => onPick(q),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 24),
            ],

            // Browse by category — real categories.
            Semantics(
                header: true,
                child: Text('עיון לפי קטגוריה',
                    style: ffTheme.titleMedium
                        .copyWith(fontWeight: FontWeight.w800))),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: categories
                  .map((c) => Semantics(
                        button: true,
                        label: 'חיפוש ${c.name}',
                        child: Pressable(
                          onTap: () => onPick(c.name),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: ffTheme.brandAccentTint,
                              borderRadius:
                                  BorderRadius.circular(ffTheme.radiusPill),
                              border: Border.all(
                                  color: ffTheme.brandAccent
                                      .withValues(alpha: 0.22)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(categoryIconData(c.id),
                                    size: 15, color: ffTheme.brandAccent),
                                const SizedBox(width: 6),
                                // Type-scale token + AA-safe green ink (was a
                                // raw GoogleFonts style in the fill hue).
                                Text(c.name,
                                    style: ffTheme.labelLarge.copyWith(
                                        fontWeight: FontWeight.w700,
                                        color: ffTheme.brandAccentText)),
                              ],
                            ),
                          ),
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 24),

            // The cheapest real plan in each category — a useful, honest jump-off.
            if (cheapest.isNotEmpty) ...[
              Semantics(
                  header: true,
                  child: Text('המסלולים הזולים ביותר',
                      style: ffTheme.titleMedium
                          .copyWith(fontWeight: FontWeight.w800))),
              const SizedBox(height: 4),
              Text('המחיר הנמוך ביותר בכל קטגוריה, מתוך הקטלוג',
                  style:
                      ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
              const SizedBox(height: 12),
              ...cheapest.asMap().entries.map((e) => _revealEntry(
                    context,
                    _CheapestRow(
                      plan: e.value,
                      ffTheme: ffTheme,
                    ),
                    index: e.key,
                    step: 30,
                    maxIndex: 5,
                  )),
              const SizedBox(height: 24),
            ],

            // Help card. GEIST: neutral tint surface + hairline (was a decorative
            // green-tinted backdrop) — this is an informational tip, not an
            // active/success state.
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                border: Border.all(color: ffTheme.lineColor),
                boxShadow: ffTheme.shadowXs,
              ),
              child: Row(
                children: [
                  Icon(Icons.lightbulb_outline_rounded,
                      size: 22, color: ffTheme.secondaryText),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'אפשר לחפש לפי שם ספק, שם מסלול, תכונה כמו "5G" או "סיב", או אפילו תקציב כמו "50"',
                      style: ffTheme.bodySmall.copyWith(
                          color: ffTheme.primaryText,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ]),
        ),
      ],
    );
  }
}

// ── A pill chip (recent searches) ────────────────────────────────────────────

class _PillChip extends StatelessWidget {
  const _PillChip({
    required this.label,
    required this.icon,
    required this.ffTheme,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'חיפוש $label',
      child: Pressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: ffTheme.accent2,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            border: Border.all(color: ffTheme.alternate),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: ffTheme.secondaryText),
              const SizedBox(width: 6),
              // Type-scale token (was a raw GoogleFonts style); ink label on
              // the neutral chip surface.
              Text(label,
                  style: ffTheme.labelLarge
                      .copyWith(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Cheapest-per-category row (glass) ────────────────────────────────────────

class _CheapestRow extends StatelessWidget {
  const _CheapestRow({required this.plan, required this.ffTheme});
  final Plan plan;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final catName = categoryById(plan.cat)?.name ?? '';
    return Semantics(
      button: true,
      label:
          '$catName: ${plan.provider}, ${plan.plan}, ₪${plan.priceText} ${priceUnitShort(plan)}',
      child: Pressable(
        onTap: () {
          Provider.of<AppState>(context, listen: false).viewPlan(plan.id);
          context.push('/plan/${plan.id}');
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: ffTheme.glassDecoration(radius: ffTheme.radiusMd),
          child: Row(
            children: [
              ExcludeSemantics(
                  child: LogoWidget(provider: plan.provider, size: 40)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: ffTheme.brandAccentTint,
                            borderRadius:
                                BorderRadius.circular(ffTheme.radiusXs),
                          ),
                          child: Text(catName,
                              style: ffTheme.labelSmall.copyWith(
                                  color: ffTheme.brandAccentText,
                                  fontWeight: FontWeight.w800)),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(plan.provider,
                              style: ffTheme.labelSmall
                                  .copyWith(color: ffTheme.secondaryText),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(plan.plan,
                        style: ffTheme.titleSmall
                            .copyWith(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Price is DATA → ink, via PriceText (bidi-safe + tabular).
                  // Green stays reserved for actions/savings.
                  PriceText('₪${plan.priceText}',
                      style: ffTheme.titleMedium
                          .copyWith(fontWeight: FontWeight.w800)),
                  Text(priceUnitShort(plan),
                      style: ffTheme.labelSmall
                          .copyWith(color: ffTheme.secondaryText)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
