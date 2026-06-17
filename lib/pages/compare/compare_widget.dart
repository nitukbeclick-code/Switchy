import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../services/backend/local_backend.dart';

class CompareWidget extends StatelessWidget {
  const CompareWidget({super.key});

  MatchProfile _profileFor(Plan p, AppState appState) =>
      MatchProfile.fromAppState(appState, p.cat);

  static String _buildShareText(List<Plan> plans, AppState appState) {
    final buf = StringBuffer();
    buf.writeln('📊 השוואת תוכניות — חוסך');
    buf.writeln();

    for (final p in plans) {
      buf.writeln('${p.plan} — ${p.provider}');
      buf.writeln('מחיר: ₪${p.priceText} ${priceUnitLabel(p)}');
      buf.writeln('דירוג: ★${p.rating.toStringAsFixed(1)}');
      for (final entry in p.specs.entries.take(4)) {
        buf.writeln('• ${entry.key}: ${entry.value}');
      }
      buf.writeln();
    }

    if (plans.length >= 2) {
      final prices = plans.map((p) => p.priceValue).toList();
      final cheapest = plans.reduce((a, b) => a.priceValue <= b.priceValue ? a : b);
      final mostExpensive = plans.reduce((a, b) => a.priceValue >= b.priceValue ? a : b);
      final monthlyDiff = (prices.reduce((a, b) => a > b ? a : b) -
          prices.reduce((a, b) => a < b ? a : b));
      final annualDiff = (monthlyDiff * 12).round();
      final shortUnit = priceUnitShort(plans.first);
      buf.writeln('💰 הפרש: ₪${monthlyDiff.toStringAsFixed(monthlyDiff == monthlyDiff.roundToDouble() ? 0 : 1)} ל$shortUnit = ₪$annualDiff בשנה');
      buf.writeln('${cheapest.provider} זול מ-${mostExpensive.provider}');
      buf.writeln();
    }

    buf.write('הורד חוסך: https://chosech.app');
    return buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    // Comparison is fully synchronous: comparePlans is in-memory AppState,
    // planById() is a synchronous catalogue lookup, and the ranking below is a
    // pure computation. The table renders on the first frame, so there is no
    // async loading phase and no skeleton placeholder is needed. The
    // plans.length < 2 branch is the genuine "nothing to compare" empty state
    // (the user picks 2–3 plans from results), not a transient loading flash.
    final ids = appState.comparePlans;
    final plans = ids.map((id) => planById(id)).whereType<Plan>().toList();

    // Compute PlanMatch scores once, keyed by plan id.
    final Map<String, PlanMatch> matchMap = {
      for (final p in plans)
        p.id: RecommendationEngine.scorePlan(p, _profileFor(p, appState)),
    };

    // Winner = highest score; tie-break: higher annualSaving, then lower price.
    String? winnerId;
    if (plans.length >= 2) {
      final winner = plans.reduce((a, b) {
        final ma = matchMap[a.id]!;
        final mb = matchMap[b.id]!;
        final byScore = mb.score.compareTo(ma.score);
        if (byScore != 0) return byScore < 0 ? a : b;
        final bySave = mb.annualSaving.compareTo(ma.annualSaving);
        if (bySave != 0) return bySave < 0 ? a : b;
        return a.price <= b.price ? a : b;
      });
      winnerId = winner.id;
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        foregroundColor: Colors.white,
        title: Text('השוואת מסלולים',
            style: ffTheme.titleLarge.copyWith(color: Colors.white)),
        actions: [
          if (plans.isNotEmpty) ...[
            IconButton(
              icon: const Icon(Icons.copy_rounded, color: Colors.white),
              tooltip: 'העתק',
              onPressed: () async {
                final text = _buildShareText(plans, appState);
                await Clipboard.setData(ClipboardData(text: text));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('הועתק ללוח'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                }
              },
            ),
            IconButton(
              icon: const Icon(Icons.ios_share_rounded, color: Colors.white),
              tooltip: 'שתף השוואה',
              onPressed: () => Share.share(
                _buildShareText(plans, appState),
                subject: 'השוואת תוכניות — חוסך',
              ),
            ),
          ],
          if (ids.isNotEmpty)
            TextButton(
              onPressed: appState.clearCompare,
              child: Text('נקה הכל',
                  style: ffTheme.labelMedium.copyWith(
                      color: Colors.white.withValues(alpha: 0.85))),
            ),
        ],
      ),
      body: plans.length < 2
          ? _EmptyState(ffTheme: ffTheme, hasPlan: plans.length == 1, firstPlan: plans.isEmpty ? null : plans.first)
          : Stack(
              children: [
                _CompareTable(
                  plans: plans,
                  appState: appState,
                  ffTheme: ffTheme,
                  winnerId: winnerId,
                  matchMap: matchMap,
                ),
                // Track both compared plans once on mount.
                for (final p in plans)
                  _PlanViewTracker(planId: p.id, provider: p.provider, category: p.cat),
              ],
            ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.ffTheme, this.hasPlan = false, this.firstPlan});
  final AppTheme ffTheme;
  final bool hasPlan;
  final Plan? firstPlan;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(height: 20),
            Icon(Icons.compare_arrows_rounded, size: 80, color: hasPlan ? ffTheme.primary.withValues(alpha: 0.4) : ffTheme.alternate)
                .animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.7, 0.7)),
            const SizedBox(height: 24),
            Text(hasPlan ? 'מסלול אחד בסל' : 'בחר 2–3 מסלולים מהתוצאות',
                    style: ffTheme.headlineSmall.copyWith(color: ffTheme.secondaryText),
                    textAlign: TextAlign.center)
                .animate().fadeIn(delay: 150.ms),
            const SizedBox(height: 12),
            Text(
              hasPlan ? 'הוסף מסלול נוסף להשוואה — לחץ + בכרטיס מסלול' : 'לחץ על + בכרטיס של כל מסלול\nלהוספה לסל ההשוואה',
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 200.ms),
            if (hasPlan && firstPlan != null) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: ffTheme.secondaryBackground,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
                ),
                child: Row(
                  children: [
                    LogoWidget(provider: firstPlan!.provider, size: 40),
                    const SizedBox(width: 12),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(firstPlan!.provider, style: ffTheme.titleSmall),
                        Text(firstPlan!.plan, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    )),
                    Text('₪${firstPlan!.priceText}', style: ffTheme.titleMedium.copyWith(color: ffTheme.primary)),
                  ],
                ),
              ).animate().fadeIn(delay: 250.ms),
            ],
            const SizedBox(height: 32),
            AppButton(
              text: hasPlan ? 'הוסף מסלול נוסף ←' : 'חזרה לתוצאות',
              onPressed: () async => context.goNamed('Results'),

                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
                height: 52,

            ).animate().fadeIn(delay: 300.ms),
          ],
        ),
      ),
    );
  }
}

// ── Shared column geometry ────────────────────────────────────────────────────
// One width model threaded through every table section (header, metric rows,
// specs, CTA, features) so all columns align by construction. On wide screens
// plan cells are Expanded (fill the width, no horizontal scroll); on narrow
// screens they are a fixed [planW] inside a single shared horizontal scroll.
class _ColGeom {
  const _ColGeom({
    required this.labelW,
    required this.planW,
    required this.isWide,
  });
  final double labelW;
  final double? planW; // null on wide (cells are Expanded)
  final bool isWide;
  final double gap = 10;
}

// ── Compare table ─────────────────────────────────────────────────────────────

class _CompareTable extends StatefulWidget {
  const _CompareTable({
    required this.plans,
    required this.appState,
    required this.ffTheme,
    required this.winnerId,
    required this.matchMap,
  });
  final List<Plan> plans;
  final AppState appState;
  final AppTheme ffTheme;
  final String? winnerId;
  final Map<String, PlanMatch> matchMap;

  @override
  State<_CompareTable> createState() => _CompareTableState();
}

class _CompareTableState extends State<_CompareTable> {
  // One controller for the narrow layout so the whole table scrolls as a unit
  // and the scroll position survives AppState rebuilds (e.g. removing a plan).
  final ScrollController _hScroll = ScrollController();

  // Canonical spec key order; any extra keys are appended alphabetically.
  static const _canonicalSpecOrder = [
    'נתונים', 'דקות', 'SMS', 'מהירות', 'ערוצים', 'ממירים', 'VOD', 'חו"ל',
  ];

  @override
  void dispose() {
    _hScroll.dispose();
    super.dispose();
  }

  /// Returns spec keys present in at least one plan, in canonical order first,
  /// then remaining keys sorted alphabetically.
  List<String> _specKeyUnion(List<Plan> plans) {
    final allKeys = <String>{};
    for (final p in plans) {
      allKeys.addAll(p.specs.keys);
    }
    if (allKeys.isEmpty) return const [];

    final result = <String>[];
    for (final k in _canonicalSpecOrder) {
      if (allKeys.contains(k)) result.add(k);
    }
    final remaining = allKeys.difference(result.toSet()).toList()..sort();
    result.addAll(remaining);
    return result;
  }

  /// Plan indices that "win" a comparable row — the single cheapest price, or
  /// every ✓ on a boolean feature row. Empty when not comparable or tied, so we
  /// never paint a false "best". The 'חיסכון שנתי' row keeps its own treatment.
  Set<int> _bestIndices(_Row row, List<Plan> plans) {
    switch (row.label) {
      case 'מחיר':
        final min = plans.map((p) => p.priceValue).reduce((a, b) => a < b ? a : b);
        final winners = [
          for (var i = 0; i < plans.length; i++)
            if (plans[i].priceValue == min) i
        ];
        return winners.length == 1 ? winners.toSet() : const <int>{};
      case '5G':
      case 'ללא התחייבות':
      case 'חו"ל':
        return {
          for (var i = 0; i < row.values.length; i++)
            if (row.values[i] == '✓') i
        };
      default:
        return const <int>{};
    }
  }

  @override
  Widget build(BuildContext context) {
    final plans = widget.plans;
    final appState = widget.appState;
    final ffTheme = widget.ffTheme;
    final winnerId = widget.winnerId;
    final matchMap = widget.matchMap;

    final mixedCats = plans.map((p) => p.cat).toSet().length > 1;
    final specKeys = _specKeyUnion(plans);

    final rows = <_Row>[
      _Row('מחיר', plans.map((p) => '₪${p.priceText}/${priceUnitShort(p)}').toList()),
      _Row('לאחר מבצע',
          plans.map((p) => p.hasPromo ? '₪${p.after}' : 'קבוע').toList()),
      _Row('התחייבות',
          plans.map((p) => p.commitmentLabel).toList()),
      _Row('חיסכון שנתי',
          plans.map((p) {
            final bill = appState.currentBill(p.cat);
            return bill > 0 ? '₪${planSaveYear(p, bill)}' : '—';
          }).toList(),
          isHighlight: true),
      _Row('רשת', plans.map((p) => p.netLabel).toList()),
      _Row('ללא התחייבות',
          plans.map((p) => p.noCommit ? '✓' : '—').toList()),
      _Row('5G', plans.map((p) => p.is5G ? '✓' : '—').toList()),
      _Row('חו"ל', plans.map((p) => p.hasAbroad ? '✓' : '—').toList()),
    ];

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Winner summary card (full width) ──────────────────────────────
          _WinnerSummaryCard(
            plans: plans,
            winnerId: winnerId,
            appState: appState,
            ffTheme: ffTheme,
            matchMap: matchMap,
          ),

          // ── Responsive comparison table ───────────────────────────────────
          LayoutBuilder(builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 760;
            final geom = _ColGeom(
              labelW: isWide ? 120 : 104,
              planW: isWide ? null : 132,
              isWide: isWide,
            );
            final table = _buildTable(geom, rows, specKeys);
            if (isWide) {
              return Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1160),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: table,
                  ),
                ),
              );
            }
            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              controller: _hScroll,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: table,
              ),
            );
          }),

          // ── Annual savings banner (full width) ────────────────────────────
          if (plans.length >= 2)
            _AnnualSavingsBanner(plans: plans, ffTheme: ffTheme),

          // Mixed-category notice (full width)
          if (mixedCats)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: ffTheme.warning.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ffTheme.warning.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline_rounded, size: 16, color: ffTheme.warning),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'אתה משווה מסלולים מקטגוריות שונות',
                        style: ffTheme.labelSmall.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  /// The whole tabular content as one Column — every section shares [geom] so
  /// columns line up across header / metrics / specs / CTA / features.
  Widget _buildTable(_ColGeom geom, List<_Row> rows, List<String> specKeys) {
    final plans = widget.plans;
    final ffTheme = widget.ffTheme;
    final winnerId = widget.winnerId;

    Widget planCell(Widget child) => geom.isWide
        ? Expanded(child: child)
        : SizedBox(width: geom.planW, child: child);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),

        // Header row (plan cards)
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            SizedBox(width: geom.labelW),
            ...plans.map((p) => planCell(
                  Padding(
                    padding: EdgeInsetsDirectional.only(start: geom.gap),
                    child: _PlanHeader(
                      plan: p,
                      isWinner: p.id == winnerId,
                      ffTheme: ffTheme,
                      appState: widget.appState,
                      match: widget.matchMap[p.id],
                    ),
                  ),
                )),
          ],
        ),
        const SizedBox(height: 12),

        // Metric rows
        ...rows.asMap().entries.map((e) => _RowWidget(
              row: e.value,
              plans: plans,
              winnerId: winnerId,
              ffTheme: ffTheme,
              isAlt: e.key.isOdd,
              geom: geom,
              best: e.value.isHighlight ? const <int>{} : _bestIndices(e.value, plans),
            )),

        // Spec rows (מפרט)
        if (specKeys.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(0, 8, 0, 6),
            child: Row(
              children: [
                Icon(Icons.tune_rounded, size: 14, color: ffTheme.secondaryText),
                const SizedBox(width: 6),
                Text(
                  'מפרט',
                  style: ffTheme.labelSmall.copyWith(
                    color: ffTheme.secondaryText,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          ...specKeys.asMap().entries.map((e) {
            final idx = e.key;
            final key = e.value;
            final specRow = _Row(
              key,
              plans.map((p) => p.specs[key] ?? '—').toList(),
            );
            final isAlt = (rows.length + idx).isOdd;
            return _RowWidget(
              row: specRow,
              plans: plans,
              winnerId: winnerId,
              ffTheme: ffTheme,
              isAlt: isAlt,
              geom: geom,
              best: const <int>{},
            );
          }),
        ],

        const SizedBox(height: 16),

        // CTA row
        Row(
          children: [
            SizedBox(width: geom.labelW),
            ...plans.map((p) => planCell(
                  Padding(
                    padding: EdgeInsetsDirectional.only(start: geom.gap),
                    child: ElevatedButton(
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        context.pushNamed('Lead', pathParameters: {'planId': p.id}, queryParameters: {'source': 'compare'});
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: p.id == winnerId
                            ? ffTheme.primary
                            : ffTheme.secondaryBackground,
                        foregroundColor: p.id == winnerId
                            ? Colors.white
                            : ffTheme.primaryText,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(
                              color: p.id == winnerId
                                  ? ffTheme.primary
                                  : ffTheme.alternate),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        'בחר ←',
                        style: ffTheme.titleSmall.copyWith(
                            color: p.id == winnerId
                                ? Colors.white
                                : ffTheme.primaryText),
                      ),
                    ),
                  ),
                )),
          ],
        ),

        // Features comparison
        if (plans.any((p) => p.feats.isNotEmpty)) ...[
          const SizedBox(height: 16),
          Divider(color: ffTheme.alternate),
          const SizedBox(height: 8),
          Text('מה כלול בכל מסלול', style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: geom.labelW),
              ...plans.map((p) => planCell(
                    Padding(
                      padding: EdgeInsetsDirectional.only(start: geom.gap),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: p.feats.map((f) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.check_rounded, size: 14, color: p.id == winnerId ? ffTheme.primary : ffTheme.secondaryText),
                              const SizedBox(width: 4),
                              Expanded(child: Text(f, style: ffTheme.labelSmall.copyWith(
                                color: p.id == winnerId ? ffTheme.primaryText : ffTheme.secondaryText,
                              ))),
                            ],
                          ),
                        )).toList(),
                      ),
                    ),
                  )),
            ],
          ),
        ],
      ],
    );
  }
}

// ── Winner summary card ────────────────────────────────────────────────────────

class _WinnerSummaryCard extends StatelessWidget {
  const _WinnerSummaryCard({
    required this.plans,
    required this.winnerId,
    required this.appState,
    required this.ffTheme,
    required this.matchMap,
  });
  final List<Plan> plans;
  final String? winnerId;
  final AppState appState;
  final AppTheme ffTheme;
  final Map<String, PlanMatch> matchMap;

  @override
  Widget build(BuildContext context) {
    final winner = plans.firstWhere((p) => p.id == winnerId, orElse: () => plans.first);
    final winnerBill = appState.currentBill(winner.cat);
    final winnerSave = winnerBill > 0 ? planSaveYear(winner, winnerBill) : 0;
    final maxPrice = plans.map((p) => p.price).reduce((a, b) => a > b ? a : b).toDouble();
    final winnerMatch = matchMap[winner.id];

    // Derive comparative superlatives that are TRUE for the winner.
    final superlatives = <String>[];
    final minPrice = plans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    if (winner.price == minPrice && plans.where((p) => p.price == minPrice).length == 1) {
      superlatives.add('המחיר הזול ביותר');
    }

    final maxSaving = plans.map((p) => planSaveYear(p, appState.currentBill(p.cat))).reduce((a, b) => a > b ? a : b);
    if (maxSaving > 0 && winnerSave == maxSaving && plans.where((p) => planSaveYear(p, appState.currentBill(p.cat)) == maxSaving).length == 1) {
      superlatives.add('החיסכון הגדול ביותר');
    }

    // Top 2–3 reasons from the engine.
    final topReasons = winnerMatch != null ? winnerMatch.reasons.take(3).toList() : <String>[];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Champion banner
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [ffTheme.primaryDark, ffTheme.primary],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(color: ffTheme.primary.withValues(alpha: 0.3), blurRadius: 14, offset: const Offset(0, 4))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // The win state wears the VALUE accent (amber), not grey.
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(color: ffTheme.saving, borderRadius: BorderRadius.circular(ffTheme.radiusPill)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.emoji_events_rounded, size: 13, color: Color(0xFF3A2900)),
                          const SizedBox(width: 4),
                          Text('ההמלצה שלנו', style: ffTheme.labelSmall.copyWith(color: const Color(0xFF3A2900), fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ),
                    const Spacer(),
                    if (winnerSave > 0)
                      Text('חיסכון ₪$winnerSave/שנה',
                          style: GoogleFonts.rubik(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: ffTheme.saving,
                              fontFeatures: const [FontFeature.tabularFigures()])),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
                      child: LogoWidget(provider: winner.provider, size: 40),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(winner.provider, style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                          Text(winner.plan, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('₪${winner.priceText}', style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1)),
                        Text(priceUnitLabel(winner), style: GoogleFonts.assistant(fontSize: 11, color: Colors.white60)),
                      ],
                    ),
                  ],
                ),

                // ── "Why winner wins" explanation block ───────────────────
                if (topReasons.isNotEmpty || superlatives.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'למה ${winner.provider} מנצח?',
                          style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: ffTheme.secondary),
                        ),
                        const SizedBox(height: 8),
                        // Engine reasons
                        ...topReasons.map((r) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.check_circle_rounded, size: 15, color: ffTheme.secondary),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(r, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        )),
                        // Comparative superlatives
                        ...superlatives.take(2).map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.star_rounded, size: 15, color: ffTheme.secondary),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(s, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        )),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    context.pushNamed('Lead', pathParameters: {'planId': winner.id}, queryParameters: {'source': 'compare'});
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ffTheme.secondary,
                    foregroundColor: ffTheme.primaryDark,
                    minimumSize: const Size(double.infinity, 44),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: Text('בחר מסלול זה ←', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1, end: 0),

          const SizedBox(height: 16),

          // Price bars comparison
          Text('השוואת מחירים', style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          ...plans.map((p) {
            final fraction = maxPrice > 0 ? p.price / maxPrice : 0.0;
            final isWinner = p.id == winnerId;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 80,
                    child: Text(p.provider, style: ffTheme.labelSmall.copyWith(
                      color: isWinner ? ffTheme.primary : ffTheme.secondaryText,
                      fontWeight: isWinner ? FontWeight.w700 : FontWeight.w500,
                    ), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: fraction,
                        // Track stays a pale glass tint; winner is full ink, the
                        // rest slate — a clean two-step ramp, no colour.
                        backgroundColor: ffTheme.accent2,
                        valueColor: AlwaysStoppedAnimation(isWinner ? ffTheme.primary : ffTheme.tertiary),
                        minHeight: isWinner ? 10 : 8,
                      ),
                    ).animate(delay: 200.ms).slideX(begin: -0.3, end: 0, duration: 400.ms),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 56,
                    child: Text('₪${p.priceText}', style: ffTheme.labelSmall.copyWith(
                      color: isWinner ? ffTheme.primary : ffTheme.primaryText,
                      fontWeight: isWinner ? FontWeight.w800 : FontWeight.w600,
                    ), textAlign: TextAlign.end),
                  ),
                  if (isWinner)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 4),
                      child: Icon(Icons.star_rounded, size: 14, color: ffTheme.secondary),
                    )
                  else
                    const SizedBox(width: 18),
                ],
              ),
            );
          }),

          const SizedBox(height: 4),
          Divider(color: ffTheme.alternate),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ── Plan header ────────────────────────────────────────────────────────────────

class _PlanHeader extends StatelessWidget {
  const _PlanHeader({
    required this.plan,
    required this.isWinner,
    required this.ffTheme,
    required this.appState,
    this.match,
  });
  final Plan plan;
  final bool isWinner;
  final AppTheme ffTheme;
  final AppState appState;
  final PlanMatch? match;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'פתח את פרטי המסלול ${plan.plan} של ${plan.provider}',
      child: GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id});
      },
      child: Container(
      // Width comes from the parent (Expanded on wide / SizedBox(planW) on narrow);
      // the leading gap comes from the parent Padding — keeps every column aligned.
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isWinner ? ffTheme.accent1 : ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isWinner ? ffTheme.primary : ffTheme.alternate,
          width: isWinner ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          if (isWinner)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.emoji_events_rounded,
                      size: 13, color: ffTheme.primaryDark),
                  const SizedBox(width: 4),
                  Text('זוכה',
                      style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.primaryDark,
                          fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          LogoWidget(provider: plan.provider, size: 44),
          const SizedBox(height: 6),
          Text(plan.provider,
              style: ffTheme.labelSmall
                  .copyWith(fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
          // Match score badge
          if (match != null) ...[
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                // Winner: ink chip + white text. Others: light-grey chip + dark
                // text (never grey-on-dark — keeps the % legible).
                color: isWinner ? ffTheme.primary : ffTheme.secondary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${match!.scorePct}% התאמה',
                style: ffTheme.labelSmall.copyWith(
                  color: isWinner ? Colors.white : ffTheme.primaryText,
                  fontWeight: isWinner ? FontWeight.w700 : FontWeight.w600,
                  fontSize: isWinner ? null : 10,
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
          const SizedBox(height: 4),
          Semantics(
            button: true,
            label: 'הסר מהשוואה',
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                HapticFeedback.selectionClick();
                appState.toggleCompare(plan.id);
              },
              child: ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
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
      ),
    );
  }
}

class _Row {
  const _Row(this.label, this.values, {this.isHighlight = false});
  final String label;
  final List<String> values;
  final bool isHighlight;
}

class _RowWidget extends StatelessWidget {
  const _RowWidget({
    required this.row,
    required this.plans,
    required this.winnerId,
    required this.ffTheme,
    required this.isAlt,
    required this.geom,
    this.best = const <int>{},
  });
  final _Row row;
  final List<Plan> plans;
  final String? winnerId;
  final AppTheme ffTheme;
  final bool isAlt;
  final _ColGeom geom;
  final Set<int> best;

  @override
  Widget build(BuildContext context) {
    final align = geom.isWide ? TextAlign.end : TextAlign.center;
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: isAlt ? ffTheme.accent1.withValues(alpha: 0.5) : ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          SizedBox(
            width: geom.labelW,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
              child: Text(row.label,
                  style: ffTheme.bodySmall
                      .copyWith(color: ffTheme.secondaryText)),
            ),
          ),
          ...row.values.asMap().entries.map((e) {
            final idx = e.key;
            final v = e.value;
            final plan = plans[idx];
            final isWinner = plan.id == winnerId;
            final isBest = best.contains(idx);

            Color textColor = ffTheme.primaryText;
            if (v == '✓') textColor = ffTheme.primary;
            if (v == '—') textColor = ffTheme.secondaryText;
            if (row.isHighlight && isWinner) textColor = ffTheme.primary;

            final inner = row.isHighlight
                ? Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: isWinner
                          ? ffTheme.secondary
                          : ffTheme.background,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      v,
                      style: ffTheme.labelSmall.copyWith(
                        color: isWinner
                            ? ffTheme.primaryDark
                            : ffTheme.secondaryText,
                        fontWeight: isWinner
                            ? FontWeight.w700
                            : FontWeight.w500,
                      ),
                      textAlign: align,
                    ),
                  )
                : Text(
                    v,
                    style: ffTheme.bodySmall.copyWith(
                      color: isBest ? ffTheme.primaryText : textColor,
                      fontWeight: isBest ? FontWeight.w800 : FontWeight.w600,
                    ),
                    textAlign: align,
                  );

            final cell = Padding(
              padding: EdgeInsetsDirectional.only(start: geom.gap),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                decoration: isBest
                    ? BoxDecoration(
                        color: ffTheme.saving.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      )
                    : null,
                child: inner,
              ),
            );
            return geom.isWide
                ? Expanded(child: cell)
                : SizedBox(width: geom.planW, child: cell);
          }),
        ],
      ),
    );
  }
}

// ── Annual savings banner ──────────────────────────────────────────────────────

class _AnnualSavingsBanner extends StatelessWidget {
  const _AnnualSavingsBanner({required this.plans, required this.ffTheme});
  final List<Plan> plans;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final cheapest = plans.reduce((a, b) => a.priceValue <= b.priceValue ? a : b);
    final mostExpensive = plans.reduce((a, b) => a.priceValue >= b.priceValue ? a : b);
    final monthlyDiff = mostExpensive.priceValue - cheapest.priceValue;
    final annualDiff = (monthlyDiff * 12).round();

    if (annualDiff == 0) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: ffTheme.saving,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: ffTheme.saving.withValues(alpha: 0.35),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            const Text('💰', style: TextStyle(fontSize: 22)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'הפרש שנתי: ₪$annualDiff בשנה בין ${cheapest.provider} ל-${mostExpensive.provider}',
                style: ffTheme.titleSmall.copyWith(
                  color: const Color(0xFF3A2900),
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.15, end: 0),
    );
  }
}

// ── Plan-view analytics tracker (zero-size, fires once on mount) ───────────────

class _PlanViewTracker extends StatefulWidget {
  const _PlanViewTracker({
    required this.planId,
    required this.provider,
    required this.category,
  });
  final String planId;
  final String provider;
  final String category;
  @override
  State<_PlanViewTracker> createState() => _PlanViewTrackerState();
}

class _PlanViewTrackerState extends State<_PlanViewTracker> {
  @override
  void initState() {
    super.initState();
    appBackend
        .trackPlanView(
          planId: widget.planId,
          provider: widget.provider,
          category: widget.category,
        )
        .catchError((_) {});
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
