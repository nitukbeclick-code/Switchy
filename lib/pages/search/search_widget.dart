import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/search.dart';
import '../../widgets/empty_state.dart';

/// Global search across every provider and plan in the catalogue.
class SearchWidget extends StatefulWidget {
  const SearchWidget({super.key});

  @override
  State<SearchWidget> createState() => _SearchWidgetState();
}

class _SearchWidgetState extends State<SearchWidget> {
  final _ctrl = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _setQuery(String v) => setState(() => _q = v);

  void _useSuggestion(String v) {
    _ctrl.text = v;
    _ctrl.selection = TextSelection.collapsed(offset: v.length);
    _setQuery(v);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final results = searchEverything(_q);

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
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: ffTheme.background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: ffTheme.alternate),
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, size: 20, color: ffTheme.secondaryText),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  autofocus: true,
                  textDirection: TextDirection.rtl,
                  textInputAction: TextInputAction.search,
                  onChanged: _setQuery,
                  onSubmitted: (v) {
                    final t = v.trim();
                    if (t.isNotEmpty) {
                      Provider.of<AppState>(context, listen: false).addRecentSearch(t);
                    }
                  },
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
                    },
                    child: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
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
      body: _q.trim().isEmpty
          ? _Suggestions(
              ffTheme: ffTheme,
              onPick: _useSuggestion,
              recent: appState.recentSearches,
              onClearRecent: appState.clearRecentSearches,
            )
          : results.isEmpty
              ? const EmptyState(
                  icon: Icons.search_off_rounded,
                  headline: 'לא נמצאו תוצאות',
                  subtitle: 'נסו שם ספק, מסלול או תכונה אחרת',
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    if (results.providers.isNotEmpty) ...[
                      _SectionLabel(text: 'ספקים', count: results.providers.length, ffTheme: ffTheme),
                      const SizedBox(height: 10),
                      SizedBox(
                        height: 96,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: results.providers.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 10),
                          itemBuilder: (context, i) {
                            final name = results.providers[i];
                            return _ProviderChip(
                              name: name,
                              planCount: plansByProvider(name).length,
                              ffTheme: ffTheme,
                              onTap: () {
                                Provider.of<AppState>(context, listen: false).addRecentSearch(_q.trim());
                                context.pushNamed('Provider', pathParameters: {'name': name});
                              },
                            ).animate(delay: (i * 40).ms).fadeIn(duration: 240.ms);
                          },
                        ),
                      ),
                      const SizedBox(height: 20),
                    ],
                    if (results.plans.isNotEmpty) ...[
                      _SectionLabel(text: 'מסלולים', count: results.plans.length, ffTheme: ffTheme),
                      const SizedBox(height: 10),
                      ...results.plans.map((p) => PlanCardWidget(
                            plan: p,
                            currentBill: appState.currentBill(p.cat),
                            compact: true,
                          )),
                    ],
                  ],
                ),
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
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text('$count',
              style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

// ── Provider chip ───────────────────────────────────────────────────────────

class _ProviderChip extends StatelessWidget {
  const _ProviderChip({
    required this.name,
    required this.planCount,
    required this.ffTheme,
    required this.onTap,
  });
  final String name;
  final int planCount;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 110,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ffTheme.alternate),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            LogoWidget(provider: name, size: 38),
            const SizedBox(height: 6),
            Text(name,
                style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            Text('$planCount מסלולים',
                style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10)),
          ],
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
    final providers = allProviders.take(12).toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
      children: [
        if (recent.isNotEmpty) ...[
          Row(
            children: [
              Text('חיפושים אחרונים',
                  style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              GestureDetector(
                onTap: onClearRecent,
                child: Text('נקה',
                    style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: recent
                .map((q) => GestureDetector(
                      onTap: () => onPick(q),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.history_rounded, size: 14, color: ffTheme.secondaryText),
                            const SizedBox(width: 6),
                            Text(q,
                                style: GoogleFonts.assistant(
                                    fontSize: 13, fontWeight: FontWeight.w600, color: ffTheme.primaryText)),
                          ],
                        ),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 24),
        ],
        Text('חיפוש לפי קטגוריה',
            style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: categories
              .map((c) => GestureDetector(
                    onTap: () => onPick(c.name),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: ffTheme.accent1,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(c.icon, style: const TextStyle(fontSize: 15)),
                          const SizedBox(width: 6),
                          Text(c.name,
                              style: GoogleFonts.assistant(
                                  fontSize: 13, fontWeight: FontWeight.w700, color: ffTheme.primary)),
                        ],
                      ),
                    ),
                  ))
              .toList(),
        ),
        const SizedBox(height: 24),
        Text('ספקים פופולריים',
            style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: providers
              .map((p) => GestureDetector(
                    onTap: () => onPick(p),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: ffTheme.alternate),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.north_east_rounded, size: 13, color: ffTheme.secondaryText),
                          const SizedBox(width: 6),
                          Text(p,
                              style: GoogleFonts.assistant(
                                  fontSize: 13, fontWeight: FontWeight.w600, color: ffTheme.primaryText)),
                        ],
                      ),
                    ),
                  ))
              .toList(),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              const Text('🔎', style: TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'אפשר לחפש לפי שם ספק, שם מסלול, או תכונה כמו "5G" או "סיב"',
                  style: ffTheme.bodySmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
