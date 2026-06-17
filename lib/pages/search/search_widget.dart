import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/search.dart';
import '../../widgets/empty_state.dart';

/// Global search across every provider and plan in the catalogue.
///
/// Results update instantly as you type, grouped into ספקים / קטגוריות /
/// מסלולים, with the matched text highlighted. With an empty query we show
/// recent searches plus an honest browse-by-category surface built from the
/// REAL catalogue (categories + the genuinely cheapest plan in each) — never
/// invented popularity numbers.
///
/// Filter row below the search bar lets users narrow by category, provider,
/// and budget — all state is local to this widget; no AppState mutations.
class SearchWidget extends StatefulWidget {
  const SearchWidget({super.key});

  @override
  State<SearchWidget> createState() => _SearchWidgetState();
}

// ── Category filter definition ──────────────────────────────────────────────

class _CatChip {
  const _CatChip({required this.id, required this.label});
  final String? id; // null means "הכל"
  final String label;
}

const List<_CatChip> _catChips = [
  _CatChip(id: null, label: 'הכל'),
  _CatChip(id: 'cellular', label: 'סלולר'),
  _CatChip(id: 'internet', label: 'אינטרנט'),
  _CatChip(id: 'tv', label: 'טלוויזיה'),
  _CatChip(id: 'triple', label: 'חבילה'),
  _CatChip(id: 'abroad', label: 'חו"ל'),
];

const double _maxBudget = 500;
const int _maxProviderChips = 5;

class _SearchWidgetState extends State<SearchWidget> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  String _q = '';

  // ── Filter state ───────────────────────────────────────────────────────────
  String? _categoryFilter; // null = הכל
  String? _providerFilter; // null = all providers
  bool _budgetOpen = false; // slider expanded?
  double _maxPrice = _maxBudget; // ₪0–₪500
  bool _showAllProviders = false; // expand "עוד" provider list

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _setQuery(String v) => setState(() => _q = v);

  void _useSuggestion(String v) {
    _ctrl.text = v;
    _ctrl.selection = TextSelection.collapsed(offset: v.length);
    _setQuery(v);
    _focus.requestFocus();
  }

  void _remember() {
    final t = _q.trim();
    if (t.isNotEmpty) {
      Provider.of<AppState>(context, listen: false).addRecentSearch(t);
    }
  }

  // How many active filter dimensions are engaged (for the badge counter).
  int get _activeFilterCount {
    var n = 0;
    if (_categoryFilter != null) n++;
    if (_providerFilter != null) n++;
    if (_budgetOpen && _maxPrice < _maxBudget) n++;
    return n;
  }

  void _clearAllFilters() {
    setState(() {
      _categoryFilter = null;
      _providerFilter = null;
      _maxPrice = _maxBudget;
      _budgetOpen = false;
      _showAllProviders = false;
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final maxPrice = (_budgetOpen && _maxPrice < _maxBudget) ? _maxPrice : null;
    final results = searchEverything(
      _q,
      categoryFilter: _categoryFilter,
      providerFilter: _providerFilter,
      maxPrice: maxPrice,
    );

    final hasFilters = _activeFilterCount > 0;

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        titleSpacing: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_forward_ios_rounded, color: ffTheme.primaryText, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: ffTheme.accent2,
            borderRadius: BorderRadius.circular(ffTheme.radiusSm),
            border: Border.all(color: ffTheme.alternate),
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, size: 20, color: ffTheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  focusNode: _focus,
                  autofocus: true,
                  textDirection: TextDirection.rtl,
                  textInputAction: TextInputAction.search,
                  onChanged: _setQuery,
                  onSubmitted: (_) => _remember(),
                  style: ffTheme.bodyMedium,
                  decoration: InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    hintText: 'ספק, מסלול, או תכונה…',
                    hintStyle: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
                  ),
                ),
              ),
              if (_q.isNotEmpty)
                Semantics(
                  button: true,
                  label: 'נקה חיפוש',
                  child: GestureDetector(
                    onTap: () {
                      _ctrl.clear();
                      _setQuery('');
                      _focus.requestFocus();
                    },
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(end: 2, start: 2),
                      child: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
                    ),
                  ),
                ),
            ],
          ),
        ),
        // Filter icon (with badge) at the end of the AppBar
        actions: [
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 8, end: 4),
            child: Semantics(
              button: true,
              label: hasFilters ? 'מסנן פעיל, $_activeFilterCount מסננים' : 'מסנן',
              child: GestureDetector(
                onTap: hasFilters ? _clearAllFilters : null,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Icon(
                      hasFilters ? Icons.filter_alt_rounded : Icons.filter_alt_outlined,
                      color: hasFilters ? ffTheme.brandAccent : ffTheme.secondaryText,
                      size: 26,
                    ),
                    if (hasFilters)
                      Positioned(
                        top: -4,
                        left: -4,
                        child: Container(
                          width: 16,
                          height: 16,
                          decoration: BoxDecoration(
                            color: ffTheme.brandAccent,
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '$_activeFilterCount',
                            style: GoogleFonts.assistant(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              height: 1,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: ffTheme.alternate),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Filter panel (always visible in search mode) ─────────────────
          _FilterPanel(
            ffTheme: ffTheme,
            selectedCategory: _categoryFilter,
            onCategoryChanged: (id) => setState(() {
              _categoryFilter = id;
              _providerFilter = null; // reset provider when category changes
              _showAllProviders = false;
            }),
            budgetOpen: _budgetOpen,
            maxPrice: _maxPrice,
            onToggleBudget: () => setState(() => _budgetOpen = !_budgetOpen),
            onBudgetChanged: (v) => setState(() => _maxPrice = v),
            activeFilterCount: _activeFilterCount,
          ),

          // ── Provider chips (only when there are plan results and query active)
          if (_q.trim().isNotEmpty && results.plans.isNotEmpty)
            _ProviderFilterRow(
              ffTheme: ffTheme,
              plans: results.plans,
              selectedProvider: _providerFilter,
              showAll: _showAllProviders,
              onProviderChanged: (name) => setState(() => _providerFilter = name),
              onShowAll: () => setState(() => _showAllProviders = true),
            ),

          // ── Body ──────────────────────────────────────────────────────────
          Expanded(
            child: _q.trim().isEmpty
                ? _Suggestions(
                    ffTheme: ffTheme,
                    onPick: _useSuggestion,
                    recent: appState.recentSearches,
                    onClearRecent: appState.clearRecentSearches,
                  )
                : (results.isEmpty
                    ? const EmptyState(
                        icon: Icons.search_off_rounded,
                        headline: 'לא נמצאו תוצאות לסינון זה',
                        subtitle: 'נסו לשנות את המסנן או לחפש שם אחר',
                      )
                    : _ResultsList(
                        results: results,
                        query: _q,
                        ffTheme: ffTheme,
                        appState: appState,
                        onBeforeNavigate: _remember,
                      )),
          ),
        ],
      ),
    );
  }
}

// ── Filter panel — category chips + budget slider ────────────────────────────

class _FilterPanel extends StatelessWidget {
  const _FilterPanel({
    required this.ffTheme,
    required this.selectedCategory,
    required this.onCategoryChanged,
    required this.budgetOpen,
    required this.maxPrice,
    required this.onToggleBudget,
    required this.onBudgetChanged,
    required this.activeFilterCount,
  });

  final AppTheme ffTheme;
  final String? selectedCategory;
  final void Function(String?) onCategoryChanged;
  final bool budgetOpen;
  final double maxPrice;
  final VoidCallback onToggleBudget;
  final void Function(double) onBudgetChanged;
  final int activeFilterCount;

  @override
  Widget build(BuildContext context) {
    final budgetActive = budgetOpen && maxPrice < _maxBudget;
    return Container(
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Category chips row ─────────────────────────────────────────
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: Row(
              children: [
                // Budget toggle chip (sits at the start)
                Padding(
                  padding: const EdgeInsetsDirectional.only(start: 8),
                  child: _FilterChip(
                    label: budgetOpen
                        ? (budgetActive ? 'תקציב: עד ₪${maxPrice.round()}' : 'תקציב')
                        : 'תקציב',
                    icon: Icons.tune_rounded,
                    selected: budgetOpen,
                    ffTheme: ffTheme,
                    onTap: onToggleBudget,
                  ),
                ),
                // Category chips
                ..._catChips.map((c) => Padding(
                      padding: const EdgeInsetsDirectional.only(start: 8),
                      child: _FilterChip(
                        label: c.label,
                        selected: selectedCategory == c.id,
                        ffTheme: ffTheme,
                        onTap: () => onCategoryChanged(c.id),
                      ),
                    )),
              ],
            ),
          ),
          // ── Budget slider (collapsible) ────────────────────────────────
          if (budgetOpen)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.savings_outlined, size: 14, color: ffTheme.brandAccent),
                      const SizedBox(width: 6),
                      Text(
                        maxPrice >= _maxBudget
                            ? 'כל התקציבים'
                            : 'עד ₪${maxPrice.round()} לחודש',
                        style: ffTheme.labelSmall.copyWith(
                          color: maxPrice < _maxBudget
                              ? ffTheme.brandAccent
                              : ffTheme.secondaryText,
                          fontWeight: FontWeight.w700,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                  SliderTheme(
                    data: SliderThemeData(
                      activeTrackColor: ffTheme.brandAccent,
                      inactiveTrackColor: ffTheme.brandAccentTint,
                      thumbColor: ffTheme.brandAccent,
                      overlayColor: ffTheme.brandAccent.withValues(alpha: 0.12),
                      trackHeight: 3,
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                    ),
                    child: Slider(
                      value: maxPrice,
                      min: 0,
                      max: _maxBudget,
                      divisions: 50,
                      onChanged: onBudgetChanged,
                    ),
                  ),
                ],
              ),
            ),
          Container(height: 1, color: ffTheme.lineColor),
        ],
      ),
    );
  }
}

// ── Reusable filter chip ─────────────────────────────────────────────────────

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.ffTheme,
    required this.onTap,
    this.icon,
  });

  final String label;
  final bool selected;
  final AppTheme ffTheme;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      selected: selected,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? ffTheme.brandAccent : ffTheme.accent2,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            border: Border.all(
              color: selected ? ffTheme.brandAccent : ffTheme.lineColor,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(
                  icon,
                  size: 13,
                  color: selected ? Colors.white : ffTheme.secondaryText,
                ),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: GoogleFonts.assistant(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : ffTheme.primaryText,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Provider filter chips row ────────────────────────────────────────────────

class _ProviderFilterRow extends StatelessWidget {
  const _ProviderFilterRow({
    required this.ffTheme,
    required this.plans,
    required this.selectedProvider,
    required this.showAll,
    required this.onProviderChanged,
    required this.onShowAll,
  });

  final AppTheme ffTheme;
  final List<Plan> plans;
  final String? selectedProvider;
  final bool showAll;
  final void Function(String?) onProviderChanged;
  final VoidCallback onShowAll;

  /// Unique provider names, ordered by how many matching plans they have.
  List<String> get _providers {
    final counts = <String, int>{};
    for (final p in plans) {
      counts[p.provider] = (counts[p.provider] ?? 0) + 1;
    }
    final sorted = counts.keys.toList()
      ..sort((a, b) => counts[b]!.compareTo(counts[a]!));
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    final providers = _providers;
    final hasMore = providers.length > _maxProviderChips && !showAll;
    final visible = showAll ? providers : providers.take(_maxProviderChips).toList();

    return Container(
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
            child: Row(
              children: [
                // "כל הספקים" chip
                Padding(
                  padding: const EdgeInsetsDirectional.only(start: 8),
                  child: _FilterChip(
                    label: 'כל הספקים',
                    selected: selectedProvider == null,
                    ffTheme: ffTheme,
                    onTap: () => onProviderChanged(null),
                  ),
                ),
                ...visible.map((name) => Padding(
                      padding: const EdgeInsetsDirectional.only(start: 8),
                      child: _FilterChip(
                        label: name,
                        selected: selectedProvider == name,
                        ffTheme: ffTheme,
                        onTap: () => onProviderChanged(
                          selectedProvider == name ? null : name,
                        ),
                      ),
                    )),
                if (hasMore)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: 8),
                    child: Semantics(
                      button: true,
                      label: 'הצג עוד ספקים',
                      child: GestureDetector(
                        onTap: onShowAll,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: ffTheme.brandAccentTint,
                            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                            border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3)),
                          ),
                          child: Text(
                            'עוד +${providers.length - _maxProviderChips}',
                            style: GoogleFonts.assistant(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: ffTheme.brandAccent,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Container(height: 1, color: ffTheme.lineColor),
        ],
      ),
    );
  }
}

// ── Results list ─────────────────────────────────────────────────────────────

class _ResultsList extends StatelessWidget {
  const _ResultsList({
    required this.results,
    required this.query,
    required this.ffTheme,
    required this.appState,
    required this.onBeforeNavigate,
  });

  final SearchResults results;
  final String query;
  final AppTheme ffTheme;
  final AppState appState;
  final VoidCallback onBeforeNavigate;

  @override
  Widget build(BuildContext context) {
    var i = 0; // running stagger index across all sections

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
      children: [
        // Categories — quick jump into a whole catalogue section.
        if (results.categories.isNotEmpty) ...[
          _SectionLabel(text: 'קטגוריות', count: results.categories.length, ffTheme: ffTheme),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: results.categories.map((c) {
              final widget = _CategoryResultChip(
                hit: c,
                query: query,
                ffTheme: ffTheme,
                onTap: () {
                  onBeforeNavigate();
                  final app = Provider.of<AppState>(context, listen: false);
                  app.setCategory(c.id);
                  context.pushNamed('Results');
                },
              ).animate(delay: (i * 60).ms).fadeIn(duration: 220.ms).slideY(begin: 0.08);
              i++;
              return widget;
            }).toList(),
          ),
          const SizedBox(height: 20),
        ],

        // Providers — horizontal glass chips.
        if (results.providers.isNotEmpty) ...[
          _SectionLabel(text: 'ספקים', count: results.providers.length, ffTheme: ffTheme),
          const SizedBox(height: 10),
          SizedBox(
            height: 102,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: results.providers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (context, idx) {
                final name = results.providers[idx];
                final widget = _ProviderChip(
                  name: name,
                  query: query,
                  planCount: plansByProvider(name).length,
                  ffTheme: ffTheme,
                  onTap: () {
                    onBeforeNavigate();
                    context.pushNamed('Provider', pathParameters: {'name': name});
                  },
                ).animate(delay: (i * 60).ms).fadeIn(duration: 220.ms).slideY(begin: 0.08);
                i++;
                return widget;
              },
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Plans — the full ranked list, with the matched term highlighted.
        if (results.plans.isNotEmpty) ...[
          _SectionLabel(text: 'מסלולים', count: results.plans.length, ffTheme: ffTheme),
          const SizedBox(height: 10),
          ...results.plans.map((p) {
            final widget = _HighlightedPlanCard(
              plan: p,
              query: query,
              currentBill: appState.currentBill(p.cat),
              ffTheme: ffTheme,
            ).animate(delay: (i * 60).ms).fadeIn(duration: 220.ms).slideY(begin: 0.08);
            i++;
            return widget;
          }),
        ],
      ],
    );
  }
}

// ── Section label ───────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text, required this.count, required this.ffTheme});
  final String text;
  final int count;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(text, style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
          ),
          child: Text('$count',
              style: ffTheme.labelSmall.copyWith(
                  color: ffTheme.primary,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()])),
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
      color: AppColors.primary,
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
        spans.add(TextSpan(text: text.substring(i, i + hit.length), style: hlStyle));
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
    if (plan.provider.toLowerCase().contains(q) || plan.plan.toLowerCase().contains(q)) {
      return null; // the name already shows the match
    }
    for (final f in plan.feats) {
      if (f.toLowerCase().contains(q)) return f;
    }
    for (final e in plan.specs.entries) {
      if (e.value.toLowerCase().contains(q) || e.key.toLowerCase().contains(q)) {
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
            padding: const EdgeInsetsDirectional.only(bottom: 12, end: 4, start: 4),
            child: Row(
              children: [
                Icon(Icons.check_circle_outline_rounded, size: 14, color: ffTheme.tertiary),
                const SizedBox(width: 6),
                Expanded(
                  child: _Highlighted(
                    text: feature,
                    query: query,
                    base: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                    highlight: ffTheme.secondary.withValues(alpha: 0.35),
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
      child: _PressScale(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(categoryIconData(hit.id), size: 16, color: ffTheme.primary),
              const SizedBox(width: 8),
              Flexible(
                child: _Highlighted(
                  text: hit.name,
                  query: query,
                  base: GoogleFonts.assistant(
                      fontSize: 14, fontWeight: FontWeight.w700, color: ffTheme.primary),
                  highlight: ffTheme.secondary.withValues(alpha: 0.4),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.chevron_left_rounded, size: 18, color: ffTheme.primary),
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
      child: _PressScale(
        onTap: onTap,
        child: Container(
          width: 116,
          padding: const EdgeInsets.all(10),
          decoration: ffTheme.glassDecoration(radius: ffTheme.radiusMd),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ExcludeSemantics(child: LogoWidget(provider: name, size: 38)),
              const SizedBox(height: 8),
              _Highlighted(
                text: name,
                query: query,
                base: ffTheme.labelSmall
                    .copyWith(fontSize: 12.5, fontWeight: FontWeight.w800, height: 1.1),
                highlight: ffTheme.secondary.withValues(alpha: 0.4),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 1),
              Text('$planCount מסלולים',
                  style: ffTheme.labelSmall.copyWith(
                      color: ffTheme.secondaryText,
                      fontSize: 10,
                      fontFeatures: const [FontFeature.tabularFigures()])),
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
  });
  final AppTheme ffTheme;
  final void Function(String) onPick;
  final List<String> recent;
  final VoidCallback onClearRecent;

  @override
  Widget build(BuildContext context) {
    // Real catalogue highlights — the genuinely cheapest plan per category.
    // No invented popularity; just honest lowest prices.
    final cheapest = cheapestPerCategory();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
      children: [
        if (recent.isNotEmpty) ...[
          Row(
            children: [
              Text('חיפושים אחרונים',
                  style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              Semantics(
                button: true,
                label: 'נקה חיפושים אחרונים',
                child: GestureDetector(
                  onTap: onClearRecent,
                  child: Text('נקה',
                      style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                ),
              ),
            ],
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
        Text('עיון לפי קטגוריה',
            style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: categories
              .map((c) => Semantics(
                    button: true,
                    label: 'חיפוש ${c.name}',
                    child: GestureDetector(
                      onTap: () => onPick(c.name),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                          border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(categoryIconData(c.id), size: 15, color: ffTheme.primary),
                            const SizedBox(width: 6),
                            Text(c.name,
                                style: GoogleFonts.assistant(
                                    fontSize: 13, fontWeight: FontWeight.w700, color: ffTheme.primary)),
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
          Text('המסלולים הזולים ביותר',
              style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('המחיר הנמוך ביותר בכל קטגוריה, מתוך הקטלוג',
              style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
          const SizedBox(height: 12),
          ...cheapest.asMap().entries.map((e) => _CheapestRow(
                plan: e.value,
                ffTheme: ffTheme,
              ).animate(delay: (e.key.clamp(0, 5) * 30).ms).fadeIn(duration: 240.ms).slideY(begin: 0.1)),
          const SizedBox(height: 24),
        ],

        // Help card.
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, size: 22, color: ffTheme.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'אפשר לחפש לפי שם ספק, שם מסלול, תכונה כמו "5G" או "סיב", או אפילו תקציב כמו "50"',
                  style: ffTheme.bodySmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
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
      child: GestureDetector(
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
              Text(label,
                  style: GoogleFonts.assistant(
                      fontSize: 13, fontWeight: FontWeight.w600, color: ffTheme.primaryText)),
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
      label: '$catName: ${plan.provider}, ${plan.plan}, ₪${plan.priceText} ${priceUnitShort(plan)}',
      child: _PressScale(
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
              ExcludeSemantics(child: LogoWidget(provider: plan.provider, size: 40)),
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
                            color: ffTheme.accent1,
                            borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                          ),
                          child: Text(catName,
                              style: ffTheme.labelSmall
                                  .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(plan.provider,
                              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(plan.plan,
                        style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('₪${plan.priceText}',
                      style: ffTheme.titleMedium.copyWith(
                          color: ffTheme.primary,
                          fontWeight: FontWeight.w800,
                          height: 1.1,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  Text(priceUnitShort(plan),
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Press-feedback wrapper (visual only — keeps onTap + Semantics intact) ─────

/// Wraps a tappable surface with a subtle 0.97 scale-down on press, so glass
/// cards acknowledge touch. Replaces a bare [GestureDetector]; [onTap] fires on
/// release exactly as before.
class _PressScale extends StatefulWidget {
  const _PressScale({required this.onTap, required this.child});
  final VoidCallback onTap;
  final Widget child;

  @override
  State<_PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<_PressScale> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      child: AnimatedScale(
        scale: _down ? 0.97 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
